'use client';

/**
 * TrainingCoachPanel - Real-time coaching panel.
 *
 * Shown ONLY in Training mode (isTrainingMode = true).
 * Positioned as a side overlay on the game board.
 */

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
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
import { getCardName } from '@/lib/utils/cardLocale';
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

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function buildQuickAdvice(state: GameState, t: TranslateFn, locale: string): CoachAdvice {
  const player = 'player1';
  const sanitized = AIPlayer.sanitizeStateForAI(state, player);
  const validActions = GameEngine.getValidActions(sanitized, player);

  const winProb = estimateWinProbability(state, player);
  const loc = locale as 'en' | 'fr';

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
      note = t('coach.mission.free', { rank: mission.rank, pts: pointValue });
    } else if (myPower === 0 && oppPower === 0) {
      status = 'tied'; recommendation = 'attack';
      note = t('coach.mission.tiedZero');
    } else if (myPower > oppPower * 1.4) {
      status = 'dominating'; recommendation = 'monitor'; myWinProbability = 0.88;
      note = t('coach.mission.dominating', { my: myPower, opp: oppPower, pts: pointValue });
    } else if (myPower > oppPower) {
      status = 'winning'; recommendation = 'secure'; myWinProbability = 0.68;
      note = t('coach.mission.winning', { my: myPower, opp: oppPower });
    } else if (myPower === oppPower && myPower > 0) {
      status = 'tied'; recommendation = 'attack'; myWinProbability = 0.5;
      note = t('coach.mission.tied', { my: myPower });
    } else if (oppPower > myPower * 1.4 && oppChars.length >= 2) {
      status = 'losing'; recommendation = pointValue >= 5 ? 'defend' : 'abandon';
      myWinProbability = 0.15;
      note = pointValue < 5
        ? t('coach.mission.losingAbandon', { opp: oppPower, my: myPower })
        : t('coach.mission.losing', { my: myPower, opp: oppPower, diff: oppPower - myPower + 1 });
    } else {
      status = 'losing'; recommendation = 'defend'; myWinProbability = 0.3;
      note = t('coach.mission.losing', { my: myPower, opp: oppPower, diff: oppPower - myPower + 1 });
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
      explanation: describeAction(stat.action, sanitized, stat.winRate, t, locale),
      advantage: t('coach.action.simulations', { visits: stat.visits, winRate: `${(stat.winRate * 100).toFixed(0)}%` }),
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
      cardName: getCardName(card, loc),
      rating: Math.min(10, Math.max(0, Math.round(rating * 10) / 10)),
      bestMissionIndex: null as number | null,
      reason: !canAfford
        ? t('coach.hand.notEnoughChakra', { cost: chakra })
        : `${t('coach.hand.power', { power })}${hasAmbush ? ' + AMBUSH' : ''}${hasScore ? ' + SCORE' : ''}`,
    };
  });

  // Warnings
  const warnings: string[] = [];
  const oppHidden = state.activeMissions.reduce(
    (s, m) => s + m.player2Characters.filter(c => c.isHidden).length, 0
  );
  if (oppHidden > 0) warnings.push(t('coach.warn.hiddenEnemies', { count: oppHidden }));
  if (state.player2.chakra >= 6) warnings.push(t('coach.warn.oppChakra', { chakra: state.player2.chakra }));
  if (myState.missionPoints < state.player2.missionPoints && state.turn >= 3)
    warnings.push(t('coach.warn.behind', { diff: state.player2.missionPoints - myState.missionPoints, turn: state.turn }));

  // Tips
  const tips: string[] = [];
  const bestMission = missionAnalysis.find(m => m.status === 'empty' || m.status === 'tied');
  if (bestMission) tips.push(t('coach.tip.missionOpen', { rank: bestMission.rank, pts: bestMission.pointValue }));
  const ambushCard = myState.hand.find(c => c.effects?.some(e => e.type === 'AMBUSH'));
  if (ambushCard) tips.push(t('coach.tip.ambushCard', { card: getCardName(ambushCard, loc) }));

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

function describeAction(action: any, state: GameState, winRate: number, t: TranslateFn, locale: string): string {
  const pct = `${(winRate * 100).toFixed(0)}%`;
  const loc = locale as 'en' | 'fr';
  switch (action.type) {
    case 'PLAY_CHARACTER': {
      const card = state.player1.hand[action.cardIndex];
      const mission = state.activeMissions[action.missionIndex];
      return t('coach.action.play', { card: card ? getCardName(card, loc) : '?', power: card?.power ?? 0, rank: mission?.rank ?? '?', pct });
    }
    case 'PLAY_HIDDEN': {
      const card = state.player1.hand[action.cardIndex];
      const mission = state.activeMissions[action.missionIndex];
      return t('coach.action.hide', { card: card ? getCardName(card, loc) : '?', rank: mission?.rank ?? '?', pct });
    }
    case 'REVEAL_CHARACTER': {
      const mission = state.activeMissions[action.missionIndex];
      return t('coach.action.reveal', { rank: mission?.rank ?? '?', pct });
    }
    case 'UPGRADE_CHARACTER': {
      const card = state.player1.hand[action.cardIndex];
      return t('coach.action.upgrade', { card: card ? getCardName(card, loc) : '?', pct });
    }
    case 'PASS':
      return t('coach.action.pass', { pct });
    default:
      return `${action.type} - ${pct}`;
  }
}

// ─── Board assessment colors ─────────────────────────────────────────────────

const BOARD_KEYS: Record<CoachAdvice['boardAssessment'], string> = {
  winning:         'coach.board.winning',
  slightly_ahead:  'coach.board.slightlyAhead',
  even:            'coach.board.even',
  slightly_behind: 'coach.board.slightlyBehind',
  losing:          'coach.board.losing',
};

const BOARD_COLORS: Record<CoachAdvice['boardAssessment'], string> = {
  winning:         '#4ade80',
  slightly_ahead:  '#86efac',
  even:            '#c4a35a',
  slightly_behind: '#f97316',
  losing:          '#ef4444',
};

// ─── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<MissionCoachAnalysis['status'], string> = {
  dominating: '#4ade80',
  winning:    '#86efac',
  tied:       '#c4a35a',
  losing:     '#f97316',
  empty:      '#444444',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrainingCoachPanel() {
  const t = useTranslations();
  const locale = useLocale();
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
      const advice = buildQuickAdvice(state, t, locale);

      // Compare to previous win probability to assess last move quality
      if (prevWinProbRef.current !== null && prevStateRef.current !== null) {
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
  }, [humanPlayer, isAnalysing, setAdvice, setAnalysing, setLastMoveQuality, t, locale]);

  useEffect(() => {
    if (!isTrainingMode || !gameState) return;
    if (gameState.phase === 'gameOver') return;

    prevStateRef.current = gameState;

    if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    analyseTimeoutRef.current = setTimeout(() => {
      runAnalysis(gameState);
    }, 300);

    return () => {
      if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    };
  }, [gameState, isTrainingMode, runAnalysis]);

  if (!isTrainingMode) return null;

  const loc = locale as 'en' | 'fr';
  const qualityLabel = lastMoveQuality ? MOVE_QUALITY_LABELS[lastMoveQuality][loc] : '';

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
        title={isPanelOpen ? t('coach.toggleClose') : t('coach.toggleOpen')}
      >
        {isPanelOpen ? t('coach.close') : t('coach.open')}
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
                {t('coach.title')}
              </p>
              {isAnalysing && (
                <span className="text-[10px] text-[#555] animate-pulse">{t('coach.analysing')}</span>
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
                      {qualityLabel}
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
                  <SectionTitle>{t('coach.missions')}</SectionTitle>
                  <div className="space-y-1.5">
                    {coachAdvice.missionAnalysis.map(m => (
                      <MissionRow key={m.missionIndex} mission={m} />
                    ))}
                  </div>
                </section>

                {/* Best Recommended Action */}
                {coachAdvice.bestAction && (
                  <section>
                    <SectionTitle>{t('coach.bestMove')}</SectionTitle>
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
                    <SectionTitle>{t('coach.handCards')}</SectionTitle>
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
                    <SectionTitle>{t('coach.warnings')}</SectionTitle>
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
                    <SectionTitle>{t('coach.tips')}</SectionTitle>
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
                  {coachAdvice.neuralNetUsed ? t('coach.neuralActive') : t('coach.heuristicMode')} - {t('coach.sims', { count: coachAdvice.simulationsUsed })}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-xs text-[#444]">{t('coach.waiting')}</p>
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
  const t = useTranslations();
  const color = BOARD_COLORS[assessment];
  const label = t(BOARD_KEYS[assessment]);
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
        <span className="text-[10px] text-[#333]">{t('coach.defeat')}</span>
        <span className="text-[10px] text-[#333]">{t('coach.victory')}</span>
      </div>
    </div>
  );
}

function MissionRow({ mission }: { mission: MissionCoachAnalysis }) {
  const color = STATUS_COLORS[mission.status];
  const pct = Math.round(mission.myWinProbability * 100);

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-bold w-5 h-5 flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
      >
        {mission.rank}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e1e1e' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[10px] font-mono text-[#555] w-10 text-right">
        {mission.myPower}v{mission.opponentPower}
      </span>
      <span className="text-[10px] text-[#444] w-6 text-right">{mission.pointValue}p</span>
    </div>
  );
}

function CardRatingRow({ rating }: { rating: { cardIndex: number; cardName: string; rating: number; reason: string } }) {
  const r = rating.rating;
  const color = r >= 7 ? '#4ade80' : r >= 5 ? '#c4a35a' : r >= 3 ? '#f97316' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
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
