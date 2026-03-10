'use client';

/**
 * TrainingCoachPanel - Real-time coaching panel for training mode.
 * Uses the strongest local coach (MCTS + neural evaluator when available).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getCoach } from '@/lib/ai/coaching/Coach';
import type { CoachAdvice, MissionCoachAnalysis } from '@/lib/ai/coaching/CoachTypes';
import type { GameAction, GameState } from '@/lib/engine/types';
import { useGameStore } from '@/stores/gameStore';
import {
  classifyMove,
  MOVE_QUALITY_COLORS,
  MOVE_QUALITY_LABELS,
  useTrainingStore,
} from '@/stores/trainingStore';

interface DecisionSnapshot {
  actionHistoryLen: number;
  bestWinRate: number;
  actionWinRateByKey: Map<string, number>;
}

function actionKey(action: GameAction): string {
  switch (action.type) {
    case 'PLAY_CHARACTER':
      return `PC-${action.cardIndex}-${action.missionIndex}`;
    case 'PLAY_HIDDEN':
      return `PH-${action.cardIndex}-${action.missionIndex}`;
    case 'REVEAL_CHARACTER':
      return `RC-${action.missionIndex}-${action.characterInstanceId}`;
    case 'UPGRADE_CHARACTER':
      return `UC-${action.cardIndex}-${action.missionIndex}-${action.targetInstanceId}`;
    case 'PASS':
      return 'PASS';
    case 'MULLIGAN':
      return `MUL-${action.doMulligan}`;
    case 'SELECT_TARGET':
      return `ST-${action.pendingActionId}-${[...action.selectedTargets].sort().join(',')}`;
    case 'DECLINE_OPTIONAL_EFFECT':
      return `DOE-${action.pendingEffectId}`;
    case 'FORFEIT':
      return `FF-${action.reason}`;
    case 'ADVANCE_PHASE':
      return 'AP';
    default:
      return JSON.stringify(action);
  }
}

function buildDecisionSnapshot(advice: CoachAdvice, actionHistoryLen: number): DecisionSnapshot | null {
  if (advice.actionRankings.length === 0) return null;

  const actionWinRateByKey = new Map<string, number>();
  let bestWinRate = Number.NEGATIVE_INFINITY;

  for (const rank of advice.actionRankings) {
    const winRate = Math.max(0, Math.min(1, advice.winProbability + rank.winRateGain));
    actionWinRateByKey.set(actionKey(rank.action), winRate);
    if (winRate > bestWinRate) bestWinRate = winRate;
  }

  if (!Number.isFinite(bestWinRate)) return null;

  return {
    actionHistoryLen,
    bestWinRate,
    actionWinRateByKey,
  };
}

const STATUS_COLORS: Record<MissionCoachAnalysis['status'], string> = {
  dominating: '#4ade80',
  winning: '#86efac',
  tied: '#c4a35a',
  losing: '#f97316',
  empty: '#444444',
};

const BOARD_LABELS: Record<CoachAdvice['boardAssessment'], { fr: string; color: string }> = {
  winning: { fr: 'Position gagnante', color: '#4ade80' },
  slightly_ahead: { fr: 'Legerement en avance', color: '#86efac' },
  even: { fr: 'Position equilibree', color: '#c4a35a' },
  slightly_behind: { fr: 'Legerement derriere', color: '#f97316' },
  losing: { fr: 'Position difficile', color: '#ef4444' },
};

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

  const decisionSnapshotRef = useRef<DecisionSnapshot | null>(null);
  const lastRatedActionIndexRef = useRef<number>(-1);
  const analyseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysingRef = useRef(false);

  const runAnalysis = useCallback(async (state: GameState) => {
    if (analysingRef.current) return;

    analysingRef.current = true;
    setAnalysing(true);

    try {
      const advice = await getCoach().analyse(state, humanPlayer);
      const actionHistory = state.actionHistory ?? [];

      // Score the move that was actually played compared to the previous best line.
      const snapshot = decisionSnapshotRef.current;
      if (snapshot) {
        if (actionHistory.length < snapshot.actionHistoryLen) {
          decisionSnapshotRef.current = null;
          lastRatedActionIndexRef.current = -1;
        } else if (actionHistory.length > snapshot.actionHistoryLen) {
          const startIndex = Math.max(snapshot.actionHistoryLen, lastRatedActionIndexRef.current + 1);
          for (let i = startIndex; i < actionHistory.length; i++) {
            const entry = actionHistory[i];
            if (entry.player !== humanPlayer) continue;

            const playedWinRate = snapshot.actionWinRateByKey.get(actionKey(entry.action));
            if (playedWinRate === undefined) continue;

            const deltaVsBest = playedWinRate - snapshot.bestWinRate;
            setLastMoveQuality(classifyMove(deltaVsBest), deltaVsBest);
            lastRatedActionIndexRef.current = i;
          }
        }
      }

      setAdvice(advice);

      if (state.phase !== 'gameOver' && state.activePlayer === humanPlayer) {
        decisionSnapshotRef.current = buildDecisionSnapshot(advice, actionHistory.length);
      } else if (state.phase === 'gameOver') {
        decisionSnapshotRef.current = null;
      }
    } catch (err) {
      console.error('[TrainingCoach] Analysis error:', err);
      setAnalysing(false);
    } finally {
      analysingRef.current = false;
    }
  }, [humanPlayer, setAdvice, setAnalysing, setLastMoveQuality]);

  useEffect(() => {
    if (!isTrainingMode || !gameState) return;
    if (gameState.phase === 'gameOver') return;

    if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    analyseTimeoutRef.current = setTimeout(() => {
      void runAnalysis(gameState);
    }, 280);

    return () => {
      if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
    };
  }, [gameState, isTrainingMode, runAnalysis]);

  useEffect(() => {
    if (isTrainingMode) return;
    decisionSnapshotRef.current = null;
    lastRatedActionIndexRef.current = -1;
    if (analyseTimeoutRef.current) clearTimeout(analyseTimeoutRef.current);
  }, [isTrainingMode]);

  if (!isTrainingMode) return null;

  return (
    <>
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
            <div
              className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid #1e1e1e' }}
            >
              <p className="text-xs font-medium uppercase tracking-widest text-[#c4a35a]">Coach IA</p>
              {isAnalysing && (
                <span className="text-[10px] text-[#555] animate-pulse">Analyse...</span>
              )}
            </div>

            <AnimatePresence>
              {lastMoveQuality && lastMoveDelta !== null && (
                <motion.div
                  key={lastMoveQuality}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 mt-3 px-3 py-2.5"
                  style={{
                    backgroundColor: `${MOVE_QUALITY_COLORS[lastMoveQuality]}18`,
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
                      {lastMoveDelta >= 0 ? '+' : ''}
                      {(lastMoveDelta * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-[#666] mt-1">Ecart vs meilleur coup</p>
                </motion.div>
              )}
            </AnimatePresence>

            {coachAdvice ? (
              <div className="px-3 space-y-4 mt-3">
                <WinProbBar
                  probability={coachAdvice.winProbability}
                  assessment={coachAdvice.boardAssessment}
                />

                <section>
                  <SectionTitle>Missions</SectionTitle>
                  <div className="space-y-1.5">
                    {coachAdvice.missionAnalysis.map((m) => (
                      <MissionRow key={m.missionIndex} mission={m} />
                    ))}
                  </div>
                </section>

                {coachAdvice.bestAction && (
                  <section>
                    <SectionTitle>Meilleur coup</SectionTitle>
                    <div
                      className="px-3 py-2.5 text-xs text-[#c0c0c0] space-y-1"
                      style={{ backgroundColor: '#161616', border: '1px solid #2a2a2a' }}
                    >
                      <p>{coachAdvice.bestAction.explanation}</p>
                      <p className="text-[10px] text-[#666]">{coachAdvice.bestAction.advantage}</p>
                    </div>
                  </section>
                )}

                {coachAdvice.handRatings.length > 0 && (
                  <section>
                    <SectionTitle>Cartes en main</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.handRatings.map((r) => (
                        <CardRatingRow key={r.cardIndex} rating={r} />
                      ))}
                    </div>
                  </section>
                )}

                {coachAdvice.warnings.length > 0 && (
                  <section>
                    <SectionTitle>Attention</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.warnings.map((warning, index) => (
                        <div
                          key={index}
                          className="text-xs px-2.5 py-1.5"
                          style={{
                            backgroundColor: '#1a0f0f',
                            border: '1px solid #3a1a1a',
                            color: '#f97316',
                          }}
                        >
                          {warning}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {coachAdvice.tips.length > 0 && (
                  <section>
                    <SectionTitle>Conseils</SectionTitle>
                    <div className="space-y-1">
                      {coachAdvice.tips.map((tip, index) => (
                        <div
                          key={index}
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

                <p className="text-[10px] text-[#333] text-center pt-2">
                  {coachAdvice.neuralNetUsed ? 'Reseau de neurones actif' : 'Mode heuristique'} -{' '}
                  {coachAdvice.simulationsUsed} sims
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-[10px] uppercase tracking-widest text-[#444] mb-1.5">{children}</p>;
}

function WinProbBar(
  { probability, assessment }: { probability: number; assessment: CoachAdvice['boardAssessment'] }
) {
  const { fr: label, color } = BOARD_LABELS[assessment];
  const pct = Math.round(probability * 100);
  const oppPct = 100 - pct;

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
        <span className="text-[10px] text-[#333]">Adversaire {oppPct}%</span>
        <span className="text-[10px] text-[#333]">Toi {pct}%</span>
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
        style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
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

function CardRatingRow(
  { rating }: { rating: { cardIndex: number; cardName: string; rating: number; reason: string } }
) {
  const cardScore = rating.rating;
  const color = cardScore >= 7 ? '#4ade80' : cardScore >= 5 ? '#c4a35a' : cardScore >= 3 ? '#f97316' : '#ef4444';

  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: '#1e1e1e' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${cardScore * 10}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono flex-shrink-0" style={{ color, width: 22 }}>
        {cardScore.toFixed(0)}/10
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-[#c0c0c0] truncate">{rating.cardName}</p>
        <p className="text-[10px] text-[#444] truncate">{rating.reason}</p>
      </div>
    </div>
  );
}
