'use client';

/**
 * TrainingCoachPanel - Panneau de coaching en temps réel.
 *
 * Affiché UNIQUEMENT en mode Entraînement (isTrainingMode = true).
 * Se place en overlay latéral sur le plateau de jeu.
 *
 * Contenu :
 *  - Indicateur de qualité du dernier coup (Excellent / Erreur / etc.)
 *  - Barre de probabilité de victoire (animée)
 *  - Statut par mission (domination / gagné / égalité / perdu)
 *  - Meilleure action recommandée
 *  - Notes des cartes en main (0-10)
 *  - Avertissements et conseils
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/stores/gameStore';
import {
  useTrainingStore,
  classifyMove,
  MOVE_QUALITY_COLORS,
  MOVE_QUALITY_LABELS,
  type MoveQuality,
} from '@/stores/trainingStore';
import { BoardEvaluator } from '@/lib/ai/evaluation/BoardEvaluator';
import { AIPlayer } from '@/lib/ai/AIPlayer';
import { FeatureExtractor } from '@/lib/ai/neural/FeatureExtractor';
import { NeuralEvaluator } from '@/lib/ai/neural/NeuralEvaluator';
import { NeuralISMCTS } from '@/lib/ai/neural/NeuralISMCTS';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CoachAdvice, MissionCoachAnalysis } from '@/lib/ai/coaching/CoachTypes';
import type { GameState } from '@/lib/engine/types';

// ─── Fast ISMCTS for coaching (fewer sims = faster response) ─────────────────

const coachMCTS = new NeuralISMCTS({
  simulations: 80,
  maxDepth: 4,
  explorationC: 1.41,
  evaluator: NeuralEvaluator.getInstance(),
  maxBranching: 8,
  useBatchedEval: false,
});

// ─── Win probability from current state ──────────────────────────────────────

function estimateWinProbability(state: GameState, player: 'player1'): number {
  try {
    const sanitized = AIPlayer.sanitizeStateForAI(state, player);
    const evaluator = NeuralEvaluator.getInstance();
    if (evaluator.isReady()) {
      const features = FeatureExtractor.extract(sanitized, player);
      // evaluateSync returns 0.5 for now - use heuristic fallback
    }
    const raw = BoardEvaluator.evaluate(state, player);
    return 1 / (1 + Math.exp(-raw / 60));
  } catch {
    return 0.5;
  }
}

// ─── Build quick coach advice without full ISMCTS ────────────────────────────

function buildQuickAdvice(state: GameState): CoachAdvice {
  const player = 'player1';
  const opponent = 'player2';
  const sanitized = AIPlayer.sanitizeStateForAI(state, player);
  const validActions = GameEngine.getValidActions(sanitized, player);

  const winProb = estimateWinProbability(state, player);

  // Mission analysis
  const missionAnalysis: MissionCoachAnalysis[] = state.activeMissions.map((mission, idx) => {
    const myChars = mission.player1Characters;
    const oppChars = mission.player2Characters;
    const myPower = myChars.reduce((s, c) => s + (c.isHidden ? 0 : (c.card.power ?? 0) + c.powerTokens), 0);
    const oppPower = oppChars.reduce((s, c) => s + (c.isHidden ? 0 : (c.card.power ?? 0) + c.powerTokens), 0);
    const pointValue = mission.basePoints + mission.rankBonus;

    let status: MissionCoachAnalysis['status'] = 'empty';
    let recommendation: MissionCoachAnalysis['recommendation'] = 'attack';
    let myWinProbability = 0.5;
    let note = '';

    if (myChars.length === 0 && oppChars.length === 0) {
      status = 'empty'; recommendation = 'attack';
      note = `Mission ${mission.rank} libre - ${pointValue} pts à prendre`;
    } else if (myPower === 0 && oppPower === 0) {
      status = 'tied'; recommendation = 'attack';
      note = `Égalité à 0 - jeton Avantage décisif`;
    } else if (myPower > oppPower * 1.4) {
      status = 'dominating'; recommendation = 'monitor'; myWinProbability = 0.88;
      note = `Tu domines (${myPower} vs ${oppPower}) - ${pointValue} pts assurés`;
    } else if (myPower > oppPower) {
      status = 'winning'; recommendation = 'secure'; myWinProbability = 0.68;
      note = `Tu mènes (${myPower} vs ${oppPower}) - consolide`;
    } else if (myPower === oppPower && myPower > 0) {
      status = 'tied'; recommendation = 'attack'; myWinProbability = 0.5;
      note = `Égalité (${myPower} chacun) - avantage au jeton`;
    } else if (oppPower > myPower * 1.4 && oppChars.length >= 2) {
      status = 'losing'; recommendation = pointValue >= 5 ? 'defend' : 'abandon';
      myWinProbability = 0.15;
      note = `Adversaire dominant (${oppPower} vs ${myPower})${pointValue < 5 ? ' - envisage d\'abandonner' : ''}`;
    } else {
      status = 'losing'; recommendation = 'defend'; myWinProbability = 0.3;
      note = `Tu es derrière (${myPower} vs ${oppPower}) - +${oppPower - myPower + 1} force nécessaire`;
    }

    return { missionIndex: idx, rank: mission.rank, myWinProbability, myPower, opponentPower: oppPower, pointValue, status, recommendation, note };
  });

  // Quick action ranking using ISMCTS stats
  const actionStats = validActions.length > 0 && validActions.length <= 15
    ? coachMCTS.getActionStats(sanitized, player, validActions, 80)
    : [];

  const actionRankings = actionStats
    .sort((a, b) => b.winRate - a.winRate)
    .map(stat => ({
      action: stat.action,
      winRateGain: stat.winRate - winProb,
      explanation: describeAction(stat.action, sanitized, stat.winRate),
      advantage: `${stat.visits} simulations - ${(stat.winRate * 100).toFixed(0)}% victoire`,
    }));

  // Hand ratings
  const myState = state.player1;
  const handRatings = myState.hand.map((card, i) => {
    const power = card.power ?? 0;
    const chakra = card.chakra ?? 0;
    const hasAmbush = card.effects?.some(e => e.type === 'AMBUSH') ?? false;
    const hasScore = card.effects?.some(e => e.type === 'SCORE') ?? false;
    const canAfford = chakra <= myState.chakra;

    let rating = 5 + power * 0.5;
    if (hasScore) rating += 1;
    if (hasAmbush) rating += 0.5;
    if (!canAfford) rating = Math.min(rating, 2);

    return {
      cardIndex: i,
      cardName: card.name_fr,
      rating: Math.min(10, Math.max(0, Math.round(rating * 10) / 10)),
      bestMissionIndex: null as number | null,
      reason: !canAfford
        ? `Pas assez de chakra (${chakra} requis)`
        : `${power} force${hasAmbush ? ' + AMBUSH' : ''}${hasScore ? ' + SCORE' : ''}`,
    };
  });

  // Warnings
  const warnings: string[] = [];
  const oppHidden = state.activeMissions.reduce(
    (s, m) => s + m.player2Characters.filter(c => c.isHidden).length, 0
  );
  if (oppHidden > 0) warnings.push(`${oppHidden} personnage(s) caché(s) adverses - attention aux AMBUSH`);
  if (state.player2.chakra >= 6) warnings.push(`Adversaire a ${state.player2.chakra} chakra - peut jouer une grosse carte`);
  if (myState.missionPoints < state.player2.missionPoints && state.turn >= 3)
    warnings.push(`Retard de ${state.player2.missionPoints - myState.missionPoints} pts au tour ${state.turn}/4`);

  // Tips
  const tips: string[] = [];
  const bestMission = missionAnalysis.find(m => m.status === 'empty' || m.status === 'tied');
  if (bestMission) tips.push(`Mission ${bestMission.rank} (${bestMission.pointValue} pts) à saisir`);
  const ambushCard = myState.hand.find(c => c.effects?.some(e => e.type === 'AMBUSH'));
  if (ambushCard) tips.push(`${ambushCard.name_fr} a un effet AMBUSH - joue-la cachée`);

  return {
    winProbability: winProb,
    boardAssessment: winProb >= 0.6 ? 'winning' : winProb >= 0.5 ? 'slightly_ahead' : winProb >= 0.4 ? 'even' : 'losing',
    missionAnalysis,
    bestAction: actionRankings[0] ?? null,
    actionRankings,
    handRatings,
    warnings,
    tips: tips.slice(0, 3),
    simulationsUsed: 80,
    neuralNetUsed: NeuralEvaluator.getInstance().isReady(),
  };
}

function describeAction(action: any, state: GameState, winRate: number): string {
  const pct = `${(winRate * 100).toFixed(0)}%`;
  switch (action.type) {
    case 'PLAY_CHARACTER': {
      const card = state.player1.hand[action.cardIndex];
      const mission = state.activeMissions[action.missionIndex];
      return `Jouer ${card?.name_fr ?? '?'} (${card?.power ?? 0} force) sur Mission ${mission?.rank ?? '?'} - ${pct}`;
    }
    case 'PLAY_HIDDEN': {
      const card = state.player1.hand[action.cardIndex];
      const mission = state.activeMissions[action.missionIndex];
      return `Cacher ${card?.name_fr ?? '?'} sur Mission ${mission?.rank ?? '?'} - ${pct}`;
    }
    case 'REVEAL_CHARACTER': {
      const mission = state.activeMissions[action.missionIndex];
      return `Révéler personnage caché sur Mission ${mission?.rank ?? '?'} - ${pct}`;
    }
    case 'UPGRADE_CHARACTER': {
      const card = state.player1.hand[action.cardIndex];
      return `Améliorer vers ${card?.name_fr ?? '?'} - ${pct}`;
    }
    case 'PASS':
      return `Passer - ${pct}`;
    default:
      return `${action.type} - ${pct}`;
  }
}

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<MissionCoachAnalysis['status'], string> = {
  dominating: '#4ade80',
  winning:    '#86efac',
  tied:       '#c4a35a',
  losing:     '#f97316',
  empty:      '#444444',
};

const BOARD_LABELS: Record<CoachAdvice['boardAssessment'], { fr: string; color: string }> = {
  winning:         { fr: 'Position gagnante', color: '#4ade80' },
  slightly_ahead:  { fr: 'Légèrement en avance', color: '#86efac' },
  even:            { fr: 'Position équilibrée', color: '#c4a35a' },
  slightly_behind: { fr: 'Légèrement derrière', color: '#f97316' },
  losing:          { fr: 'Position difficile', color: '#ef4444' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrainingCoachPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const humanPlayer = useGameStore((s) => s.humanPlayer);
  const {
    isTrainingMode,
    isPanelOpen,
    isAnalysing,
    coachAdvice,
    lastMoveQuality,
    lastMoveDelta,
    togglePanel,
    setAdvice,
    setAnalysing,
    setLastMoveQuality,
  } = useTrainingStore();

  const prevWinProbRef = useRef<number | null>(null);
  const prevStateRef = useRef<GameState | null>(null);
  const analyseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAnalysis = useCallback(async (state: GameState) => {
    if (isAnalysing) return;
    setAnalysing(true);

    try {
      const advice = buildQuickAdvice(state);

      // Compare to previous win probability to assess last move quality
      if (prevWinProbRef.current !== null && prevStateRef.current !== null) {
        // Was it the player's turn in the previous state?
        if (prevStateRef.current.activePlayer === humanPlayer) {
          const delta = advice.winProbability - prevWinProbRef.current;
          const quality = classifyMove(delta);
          setLastMoveQuality(quality, delta);
        }
      }

      prevWinProbRef.current = advice.winProbability;
      setAdvice(advice);
    } catch (err) {
      console.error('[TrainingCoach] Analysis error:', err);
      setAnalysing(false);
    }
  }, [humanPlayer, isAnalysing, setAdvice, setAnalysing, setLastMoveQuality]);

  // Watch for game state changes and trigger analysis
  useEffect(() => {
    if (!isTrainingMode || !gameState) return;
    if (gameState.phase === 'gameOver') return;

    // Save previous state for comparison
    const prev = prevStateRef.current;
    prevStateRef.current = gameState;

    // Debounce to avoid running mid-animation
    if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    analyseTimeoutRef.current = setTimeout(() => {
      runAnalysis(gameState);
    }, 300);

    return () => {
      if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    };
  }, [gameState, isTrainingMode, runAnalysis]);

  if (!isTrainingMode) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={togglePanel}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center"
        style={{
          backgroundColor: '#141414',
          border: '1px solid #262626',
          borderRight: 'none',
          width: 28,
          height: 72,
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
          color: '#888',
          fontSize: 11,
          writingMode: 'vertical-rl',
          letterSpacing: 1,
        }}
        title={isPanelOpen ? 'Fermer le coach' : 'Ouvrir le coach'}
      >
        {isPanelOpen ? 'FERMER' : 'COACH'}
      </button>

      {/* Sliding panel */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 z-40 overflow-y-auto"
            style={{
              width: 280,
              backgroundColor: '#0d0d0d',
              borderLeft: '1px solid #1e1e1e',
              paddingBottom: 20,
            }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1e1e1e' }}
            >
              <p className="text-xs font-medium uppercase tracking-widest text-[#c4a35a]">
                Coach IA
              </p>
              {isAnalysing && (
                <span className="text-[10px] text-[#555] animate-pulse">Analyse...</span>
              )}
            </div>

            {/* Move Quality Indicator */}
            <AnimatePresence>
              {lastMoveQuality && lastMoveDelta !== null && (
                <motion.div
                  key={lastMoveQuality}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 mt-3 px-3 py-2.5"
                  style={{
                    backgroundColor: MOVE_QUALITY_COLORS[lastMoveQuality] + '18',
                    border: `1px solid ${MOVE_QUALITY_COLORS[lastMoveQuality]}44`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MOVE_QUALITY_COLORS[lastMoveQuality] }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: MOVE_QUALITY_COLORS[lastMoveQuality] }}
                    >
                      {MOVE_QUALITY_LABELS[lastMoveQuality].fr}
                    </span>
                    <span className="text-xs text-[#555] ml-auto">
                      {lastMoveDelta >= 0 ? '+' : ''}{(lastMoveDelta * 100).toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {coachAdvice ? (
              <div className="px-3 space-y-4 mt-3">

                {/* Win Probability */}
                <WinProbBar
                  probability={coachAdvice.winProbability}
                  assessment={coachAdvice.boardAssessment}
                />

                {/* Mission Status */}
                <section>
                  <SectionTitle>Missions</SectionTitle>
                  <div className="space-y-1.5">
                    {coachAdvice.missionAnalysis.map(m => (
                      <MissionRow key={m.missionIndex} mission={m} />
                    ))}
                  </div>
                </section>

                {/* Best Recommended Action */}
                {coachAdvice.bestAction && (
                  <section>
                    <SectionTitle>Meilleur coup</SectionTitle>
                    <div
                      className="px-3 py-2.5 text-xs text-[#c0c0c0]"
                      style={{ backgroundColor: '#161616', border: '1px solid #2a2a2a' }}
                    >
                      {coachAdvice.bestAction.explanation}
                    </div>
                  </section>
                )}

                {/* Hand Card Ratings */}
                {coachAdvice.handRatings.length > 0 && (
                  <section>
                    <SectionTitle>Cartes en main</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.handRatings.map(r => (
                        <CardRatingRow key={r.cardIndex} rating={r} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Warnings */}
                {coachAdvice.warnings.length > 0 && (
                  <section>
                    <SectionTitle>Attention</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="text-xs px-2.5 py-1.5"
                          style={{
                            backgroundColor: '#1a0f0f',
                            border: '1px solid #3a1a1a',
                            color: '#f97316',
                          }}
                        >
                          {w}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Tips */}
                {coachAdvice.tips.length > 0 && (
                  <section>
                    <SectionTitle>Conseils</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.tips.map((tip, i) => (
                        <div
                          key={i}
                          className="text-xs px-2.5 py-1.5"
                          style={{
                            backgroundColor: '#0f1a0f',
                            border: '1px solid #1a3a1a',
                            color: '#86efac',
                          }}
                        >
                          {tip}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Footer */}
                <p className="text-[10px] text-[#333] text-center pt-2">
                  {coachAdvice.neuralNetUsed ? 'Réseau de neurones actif' : 'Mode heuristique'} - {coachAdvice.simulationsUsed} sims
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-xs text-[#444]">En attente d&apos;une partie...</p>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-[#444] mb-1.5">{children}</p>
  );
}

function WinProbBar({ probability, assessment }: {
  probability: number;
  assessment: CoachAdvice['boardAssessment'];
}) {
  const { fr: label, color } = BOARD_LABELS[assessment];
  const pct = Math.round(probability * 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color }}>{label}</span>
        <span className="text-xs font-mono text-[#888]">{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#1e1e1e' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: '50%' }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#333]">Défaite</span>
        <span className="text-[10px] text-[#333]">Victoire</span>
      </div>
    </div>
  );
}

function MissionRow({ mission }: { mission: MissionCoachAnalysis }) {
  const color = STATUS_COLORS[mission.status];
  const pct = Math.round(mission.myWinProbability * 100);

  return (
    <div className="flex items-center gap-2">
      {/* Rank badge */}
      <span
        className="text-[10px] font-bold w-5 h-5 flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
      >
        {mission.rank}
      </span>

      {/* Mini bar */}
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e1e1e' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>

      {/* Power */}
      <span className="text-[10px] font-mono text-[#555] w-10 text-right">
        {mission.myPower}v{mission.opponentPower}
      </span>

      {/* Points */}
      <span className="text-[10px] text-[#444] w-6 text-right">{mission.pointValue}p</span>
    </div>
  );
}

function CardRatingRow({ rating }: { rating: { cardIndex: number; cardName: string; rating: number; reason: string } }) {
  const r = rating.rating;
  const color = r >= 7 ? '#4ade80' : r >= 5 ? '#c4a35a' : r >= 3 ? '#f97316' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
      {/* Rating bar (0-10) */}
      <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: '#1e1e1e' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${r * 10}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono flex-shrink-0" style={{ color, width: 22 }}>
        {r.toFixed(0)}/10
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-[#c0c0c0] truncate">{rating.cardName}</p>
        <p className="text-[10px] text-[#444] truncate">{rating.reason}</p>
      </div>
    </div>
  );
}
