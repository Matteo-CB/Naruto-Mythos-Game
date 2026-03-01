'use client';

import { useState, useEffect, useMemo, useRef, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ReplayBoard } from '@/components/replay/ReplayBoard';
import { PlaybackControls } from '@/components/replay/PlaybackControls';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter, getIdCounter, setIdCounter } from '@/lib/engine/utils/id';
import type { GameState, GamePhase, GameAction, PlayerID } from '@/lib/engine/types';

interface ReplayLogEntry {
  turn: number;
  phase: GamePhase;
  player?: 'player1' | 'player2';
  action: string;
  details: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  timestamp: number;
}

interface MissionResult {
  name_fr: string;
  rank: string;
  basePoints: number;
  rankBonus: number;
  wonBy: 'player1' | 'player2' | null;
}

interface GameData {
  id: string;
  player1: { username: string } | null;
  player2: { username: string } | null;
  isAiGame: boolean;
  aiDifficulty: string | null;
  winnerId: string | null;
  player1Id: string | null;
  player2Id: string | null;
  player1Score: number;
  player2Score: number;
  eloChange: number | null;
  completedAt: string | null;
  gameState: {
    log: ReplayLogEntry[];
    playerNames: { player1: string; player2: string };
    finalMissions?: MissionResult[];
    // Visual replay data (new games only)
    initialState?: GameState;
    actionHistory?: Array<{ player: PlayerID; action: GameAction }>;
  } | null;
}

const phaseTranslationKeys: Record<string, string> = {
  setup: 'game.phase.start',
  mulligan: 'game.phase.mulligan',
  start: 'game.phase.start',
  action: 'game.phase.action',
  mission: 'game.phase.mission',
  end: 'game.phase.end',
  gameOver: 'game.phase.gameOver',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const mins = date.getMinutes().toString().padStart(2, '0');
  const secs = date.getSeconds().toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// ----- Text Timeline Component (fallback for old games) -----

function TextTimeline({
  log,
  playerNames,
}: {
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
}) {
  const t = useTranslations();
  const tr = useTranslations('replay');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [visibleCount, setVisibleCount] = useState(log.length);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SPEEDS = { slow: 1500, normal: 800, fast: 300 };

  const filteredLog = selectedTurn === null ? log : log.filter((e) => e.turn === selectedTurn);
  const turns = [...new Set(log.map((e) => e.turn))].sort((a, b) => a - b);

  const stopAutoPlay = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setVisibleCount((prev) => {
          if (prev >= filteredLog.length) { stopAutoPlay(); return filteredLog.length; }
          return prev + 1;
        });
      }, SPEEDS[speed]);
    }
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [isPlaying, speed, filteredLog.length, stopAutoPlay]);

  useEffect(() => {
    if (scrollRef.current && isPlaying) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleCount, isPlaying]);

  useEffect(() => { setVisibleCount(filteredLog.length); stopAutoPlay(); }, [selectedTurn, filteredLog.length, stopAutoPlay]);

  const formatPhase = (phase: GamePhase): string => {
    const key = phaseTranslationKeys[phase];
    return key ? t(key) : phase;
  };

  const displayEntries = filteredLog.slice(0, visibleCount);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
          {tr('eventTimeline')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopAutoPlay : () => { setVisibleCount(0); setIsPlaying(true); }}
            className="px-3 py-1 text-xs rounded cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: isPlaying ? '#b33e3e' : '#4a9e4a' }}
          >
            {isPlaying ? tr('pause') : tr('autoPlay')}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value as 'slow' | 'normal' | 'fast')}
            className="text-xs rounded px-2 py-1 cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888888' }}
          >
            <option value="slow">{tr('slow')}</option>
            <option value="normal">{tr('normal')}</option>
            <option value="fast">{tr('fast')}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setSelectedTurn(null)}
          className="px-3 py-1 text-xs rounded cursor-pointer"
          style={{
            backgroundColor: selectedTurn === null ? '#c4a35a' : '#1a1a2e',
            color: selectedTurn === null ? '#0a0a0a' : '#888888',
            border: `1px solid ${selectedTurn === null ? '#c4a35a' : '#333'}`,
          }}
        >
          {tr('allTurns')}
        </button>
        {turns.map((turn) => (
          <button
            key={turn}
            onClick={() => setSelectedTurn(turn)}
            className="px-3 py-1 text-xs rounded cursor-pointer"
            style={{
              backgroundColor: selectedTurn === turn ? '#c4a35a' : '#1a1a2e',
              color: selectedTurn === turn ? '#0a0a0a' : '#888888',
              border: `1px solid ${selectedTurn === turn ? '#c4a35a' : '#333'}`,
            }}
          >
            {tr('turnLabel', { turn })}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="rounded-lg overflow-y-auto"
        style={{ backgroundColor: '#0e0e12', border: '1px solid #262626', maxHeight: '500px' }}
      >
        {displayEntries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm" style={{ color: '#555555' }}>{tr('noLog')}</span>
          </div>
        ) : (
          displayEntries.map((entry, i) => {
            const playerColor = entry.player === 'player1' ? '#c4a35a' : entry.player === 'player2' ? '#b33e3e' : undefined;
            const displayName = entry.player ? playerNames[entry.player] : null;
            return (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex items-start gap-2 px-3 py-1.5 text-xs"
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
              >
                <span className="shrink-0 tabular-nums" style={{ color: '#555555' }}>{formatTimestamp(entry.timestamp)}</span>
                <span className="shrink-0 rounded px-1 py-0.5 text-[10px] uppercase font-medium" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#777777' }}>
                  T{entry.turn} {formatPhase(entry.phase)}
                </span>
                {entry.player && <span className="shrink-0 font-medium" style={{ color: playerColor }}>{displayName}</span>}
                <span style={{ color: '#e0e0e0' }}>
                  {entry.messageKey ? t(entry.messageKey, entry.messageParams ?? {}) : (entry.details || entry.action)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ----- Visual Replay Component -----

function VisualReplay({
  initialState,
  actionHistory,
  log,
  playerNames,
}: {
  initialState: GameState;
  actionHistory: Array<{ player: PlayerID; action: GameAction }>;
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
}) {
  const tr = useTranslations('replay');
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const [currentStep, setCurrentStep] = useState(0);
  const [showLog, setShowLog] = useState(false);

  // Pre-compute all game states from initial state + action history.
  // transitionToStartPhase() bundles the entire Start Phase (reveal mission, grant
  // chakra, draw cards) + transition to action phase in one atomic call, so those
  // transitions never appear as separate states in the action history. We inject
  // synthetic "start" phase snapshots whenever a turn boundary is crossed so the
  // replay UI shows each turn's Start Phase properly.
  const states = useMemo(() => {
    // Reset the instance ID counter so deterministic IDs match the original game.
    resetIdCounter();

    // The initial state is already in action phase (Start Phase for Turn 1 was
    // consumed during the mulligan→start transition). Insert a synthetic Turn 1
    // "start" state so the replay begins with "Turn 1 — Start Phase".
    const turn1Start: GameState = { ...initialState, phase: 'start' as GamePhase };
    const result: GameState[] = [turn1Start, initialState];
    let current = initialState;

    // ---- Main loop: apply each recorded action ----
    for (const { player, action } of actionHistory) {
      const prevTurn = current.turn;
      const counterBefore = getIdCounter();
      try {
        const next = GameEngine.applyAction(current, player, action);
        // Always use the result — even if the action had "no visible effect",
        // the ID counter has advanced and we must stay in sync.
        current = next;
      } catch {
        // Action threw — restore counter to prevent desync, keep current state
        setIdCounter(counterBefore);
        continue;
      }

      // If turn changed, inject a synthetic start-phase snapshot
      if (current.turn !== prevTurn && current.phase === 'action') {
        result.push({ ...current, phase: 'start' as GamePhase });
      }
      result.push(current);
    }

    // ---- Recovery loop: advance stuck states after actionHistory is exhausted ----
    // Handles: auto-resolve pending effects, force phase transitions,
    // clean up stale state, and advance through remaining turns.
    let recovery = 0;
    while (current.phase !== 'gameOver' && recovery < 120) {
      let advanced: GameState | null = null;
      try {
        // --- Clean up stale pendingEffects without matching pendingActions ---
        if (current.pendingEffects.length > 0 && current.pendingActions.length === 0) {
          current = { ...current, pendingEffects: [] };
        }

        if (current.phase === 'action') {
          if (current.player1.hasPassed && current.player2.hasPassed) {
            // Both passed — try PASS to trigger mission phase transition
            for (const p of ['player1', 'player2'] as PlayerID[]) {
              try {
                const attempt = GameEngine.applyAction(current, p, { type: 'PASS' });
                if (attempt.phase !== current.phase || attempt.turn !== current.turn) {
                  advanced = attempt;
                  break;
                }
              } catch { /* try next */ }
            }
            // If PASS didn't advance, force mission phase + ADVANCE_PHASE
            if (!advanced) {
              try {
                const forced: GameState = { ...current, phase: 'mission' as GamePhase, missionScoredThisTurn: false };
                advanced = GameEngine.applyAction(forced, current.edgeHolder, { type: 'ADVANCE_PHASE' });
              } catch { /* fallthrough */ }
            }
          }
          // Not both passed — can't simulate player decisions; break
          if (!advanced) break;

        } else if ((current.phase === 'mission' || current.phase === 'end') && current.pendingActions.length > 0) {
          // Resolve pending actions (SCORE effects, Rock Lee moves, Akamaru returns)
          const pending = current.pendingActions[0];
          const effect = current.pendingEffects.find((e) => e.id === pending.sourceEffectId);
          const isOptional = effect?.isOptional || pending.minSelections === 0 || pending.options.length === 0;

          if (isOptional) {
            advanced = GameEngine.applyAction(current, pending.player, {
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pending.sourceEffectId ?? pending.id,
            });
          } else if (pending.options.length > 0) {
            advanced = GameEngine.applyAction(current, pending.player, {
              type: 'SELECT_TARGET',
              pendingActionId: pending.id,
              selectedTargets: [pending.options[0]],
            });
          }

          // If the action didn't resolve the pending, force-remove it
          if (!advanced || advanced.pendingActions.length === current.pendingActions.length) {
            const cleaned = advanced ?? current;
            advanced = {
              ...cleaned,
              pendingActions: cleaned.pendingActions.filter((p) => p.id !== pending.id),
              pendingEffects: pending.sourceEffectId
                ? cleaned.pendingEffects.filter((e) => e.id !== pending.sourceEffectId)
                : cleaned.pendingEffects,
            };
          }

        } else if (current.phase === 'mission' && current.pendingActions.length === 0) {
          // Mission phase done — advance to end phase
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });

        } else if (current.phase === 'end' && current.pendingActions.length === 0) {
          // End phase done — advance to next turn or game over
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });

        } else {
          break;
        }
      } catch {
        // Last resort: force ADVANCE_PHASE
        try {
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });
        } catch {
          // If even that fails, try forcing the phase transition directly
          if (current.phase === 'mission') {
            advanced = {
              ...current,
              phase: 'end' as GamePhase,
              pendingActions: [],
              pendingEffects: [],
              missionScoringComplete: undefined,
            };
          } else if (current.phase === 'end') {
            if (current.turn > 4) {
              advanced = { ...current, phase: 'gameOver' as GamePhase, pendingActions: [], pendingEffects: [] };
            } else {
              // Force next turn — we lose the start phase details but at least the replay continues
              advanced = {
                ...current,
                phase: 'action' as GamePhase,
                turn: (current.turn + 1) as 1 | 2 | 3 | 4,
                pendingActions: [],
                pendingEffects: [],
                player1: { ...current.player1, hasPassed: false },
                player2: { ...current.player2, hasPassed: false },
              };
            }
          } else {
            break;
          }
        }
      }

      if (!advanced) break;

      // Detect progress — must change phase, turn, pending count, or missionScoringComplete
      const madeProgress = advanced.phase !== current.phase ||
        advanced.turn !== current.turn ||
        advanced.pendingActions.length !== current.pendingActions.length ||
        advanced.pendingEffects.length !== current.pendingEffects.length ||
        Boolean(advanced.missionScoringComplete) !== Boolean(current.missionScoringComplete);
      if (!madeProgress) break;

      // Inject start-phase snapshot for turn changes
      if (advanced.turn !== current.turn && advanced.phase === 'action') {
        result.push({ ...advanced, phase: 'start' as GamePhase });
      }

      current = advanced;
      result.push(current);
      recovery++;
    }

    if (current.phase !== 'gameOver') {
      console.warn('[Replay] Could not reach gameOver. Final state:', {
        turn: current.turn, phase: current.phase,
        pendingActions: current.pendingActions.length,
        pendingEffects: current.pendingEffects.length,
        p1Passed: current.player1.hasPassed,
        p2Passed: current.player2.hasPassed,
      });
    }

    return result;
  }, [initialState, actionHistory]);

  // Compute turn start indices for quick navigation
  const turnStarts = useMemo(() => {
    const starts: Array<{ turn: number; step: number }> = [];
    const seenTurns = new Set<number>();
    for (let i = 0; i < states.length; i++) {
      const turn = states[i].turn;
      if (!seenTurns.has(turn)) {
        seenTurns.add(turn);
        starts.push({ turn, step: i });
      }
    }
    return starts;
  }, [states]);

  // Build action label from the log entry closest to this step
  const actionLabel = useMemo(() => {
    const state = states[currentStep];
    if (!state) return '';
    // Find the log entry that was added at this step
    // The log grows as actions are applied; compare log lengths
    if (currentStep === 0) return tr('start');
    const prevLogLen = states[currentStep - 1]?.log?.length ?? 0;
    const curLogLen = state.log?.length ?? 0;
    if (curLogLen > prevLogLen) {
      const newEntry = state.log[prevLogLen];
      if (newEntry) {
        if (newEntry.messageKey) {
          try { return t(newEntry.messageKey, newEntry.messageParams ?? {}); } catch { /* fallback */ }
        }
        return newEntry.details || newEntry.action;
      }
    }
    return '';
  }, [currentStep, states, t, tr]);

  const handleStepChange = useCallback((step: number) => {
    if (step === -1) {
      // Advance by one (used by auto-play)
      setCurrentStep((prev) => Math.min(states.length - 1, prev + 1));
    } else {
      setCurrentStep(Math.max(0, Math.min(states.length - 1, step)));
    }
  }, [states.length]);

  const currentState = states[currentStep];
  if (!currentState) return null;

  return (
    <div>
      {/* Visual board */}
      <div className="mb-4">
        <ReplayBoard state={currentState} playerNames={playerNames} locale={locale} />
      </div>

      {/* Playback controls */}
      <div className="mb-4">
        <PlaybackControls
          currentStep={currentStep}
          totalSteps={states.length}
          onStepChange={handleStepChange}
          turnStarts={turnStarts}
          actionLabel={actionLabel}
        />
      </div>

      {/* Toggle log */}
      <div>
        <button
          onClick={() => setShowLog(!showLog)}
          className="px-3 py-1.5 text-xs rounded cursor-pointer mb-3"
          style={{
            backgroundColor: showLog ? '#c4a35a' : '#1a1a2e',
            color: showLog ? '#0a0a0a' : '#888',
            border: `1px solid ${showLog ? '#c4a35a' : '#333'}`,
          }}
        >
          {tr('eventTimeline')}
        </button>
        {showLog && <TextTimeline log={log} playerNames={playerNames} />}
      </div>
    </div>
  );
}

// ----- Main Page -----

export default function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const tr = useTranslations('replay');

  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/game/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: GameData) => {
        setGame(data);
        setLoading(false);
      })
      .catch(() => {
        setError(tr('notFound'));
        setLoading(false);
      });
  }, [id, tr]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#888888' }}>{tr('loading')}</p>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#b33e3e' }}>{error}</p>
        <Link href="/" style={{ color: '#888888' }}>{tr('back')}</Link>
      </main>
    );
  }

  if (!game.gameState) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#888888' }}>{tr('noLog')}</p>
        <Link href="/" style={{ color: '#888888' }}>{tr('back')}</Link>
      </main>
    );
  }

  const playerNames = game.gameState.playerNames ?? { player1: 'Player 1', player2: 'Player 2' };
  const p1Name = playerNames.player1;
  const p2Name = playerNames.player2;
  const p1Won = game.winnerId === game.player1Id;
  const missions = game.gameState.finalMissions ?? [];
  const log = game.gameState.log ?? [];

  // Determine if visual replay is available
  const hasVisualReplay = !!game.gameState.initialState && !!game.gameState.actionHistory && game.gameState.actionHistory.length > 0;

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />

      <div className="max-w-4xl mx-auto relative z-10 flex-1 px-4 py-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e0e0e0' }}>
              {tr('title')}
            </h1>
            {game.completedAt && (
              <p className="text-xs mt-1" style={{ color: '#555555' }}>
                {new Date(game.completedAt).toLocaleDateString()} - {new Date(game.completedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/"
              className="px-4 py-2 text-sm"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {tr('back')}
            </Link>
          </div>
        </div>

        {/* Match Summary */}
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
        >
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium" style={{ color: p1Won ? '#c4a35a' : '#e0e0e0' }}>{p1Name}</span>
              <span className="text-3xl font-bold tabular-nums" style={{ color: '#c4a35a' }}>{game.player1Score}</span>
            </div>
            <span className="text-lg font-bold" style={{ color: '#333333' }}>{tr('vsLabel')}</span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium" style={{ color: !p1Won ? '#c4a35a' : '#e0e0e0' }}>{p2Name}</span>
              <span className="text-3xl font-bold tabular-nums" style={{ color: '#b33e3e' }}>{game.player2Score}</span>
            </div>
          </div>
          <div className="flex justify-center">
            <span className="text-xs" style={{ color: '#555555' }}>
              {game.isAiGame ? tr('aiGame', { difficulty: game.aiDifficulty ?? 'medium' }) : tr('onlineGame')}
            </span>
          </div>
        </div>

        {/* Mission Results (for all games) */}
        {missions.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: '#888888' }}>
              {tr('missionSummary')}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {missions.map((mission, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3 text-center"
                  style={{
                    backgroundColor: '#141414',
                    border: `1px solid ${mission.wonBy ? (mission.wonBy === 'player1' ? '#c4a35a30' : '#b33e3e30') : '#262626'}`,
                  }}
                >
                  <p className="text-xs font-medium truncate" style={{ color: '#e0e0e0' }}>{mission.name_fr}</p>
                  <p className="text-[10px] mt-1" style={{ color: '#555555' }}>
                    {tr('rank', { rank: mission.rank })} - {tr('points', { points: mission.basePoints + mission.rankBonus })}
                  </p>
                  {mission.wonBy && (
                    <p className="text-[10px] font-medium mt-1" style={{ color: mission.wonBy === 'player1' ? '#c4a35a' : '#b33e3e' }}>
                      {playerNames[mission.wonBy]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visual Replay or Text-only fallback */}
        {hasVisualReplay ? (
          <VisualReplay
            initialState={game.gameState.initialState!}
            actionHistory={game.gameState.actionHistory!}
            log={log}
            playerNames={playerNames}
          />
        ) : (
          <TextTimeline log={log} playerNames={playerNames} />
        )}
      </div>
    </main>
  );
}
