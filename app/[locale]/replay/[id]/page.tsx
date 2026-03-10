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
import { useSettingsStore } from '@/stores/settingsStore';
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

// ----- Share Button -----

function ShareButton({ gameId }: { gameId: string }) {
  const t = useTranslations('replay');
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;

    // Try native share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('title'),
          url,
        });
        return;
      } catch {
        // User cancelled or not supported, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="px-4 py-2 text-sm font-medium tracking-wider uppercase transition-colors cursor-pointer rounded"
      style={{
        backgroundColor: copied ? 'rgba(62,139,62,0.15)' : '#141414',
        border: copied ? '1px solid rgba(62,139,62,0.4)' : '1px solid #262626',
        color: copied ? '#4a9e4a' : '#888888',
      }}
    >
      {copied ? t('linkCopied') : t('share')}
    </button>
  );
}

// ----- Match Stats Summary -----

function MatchStats({
  game,
  playerNames,
  missions,
  backgroundUrl,
}: {
  game: GameData;
  playerNames: { player1: string; player2: string };
  missions: MissionResult[];
  backgroundUrl?: string;
}) {
  const t = useTranslations('replay');
  const p1Won = game.winnerId === game.player1Id;
  const p2Won = game.winnerId === game.player2Id;

  const p1Missions = missions.filter(m => m.wonBy === 'player1').length;
  const p2Missions = missions.filter(m => m.wonBy === 'player2').length;

  // Score bar: visual ratio of P1 vs P2 score
  const totalScore = game.player1Score + game.player2Score;
  const p1Pct = totalScore > 0 ? (game.player1Score / totalScore) * 100 : 50;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        backgroundColor: '#101018',
        border: '1px solid #1e1e28',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Background from user settings */}
      {backgroundUrl && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }} />
        </>
      )}

      <div className="relative z-10">
        {/* Score header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-center gap-8 sm:gap-12">
            {/* Player 1 */}
            <div className="flex flex-col items-center gap-1.5 min-w-[110px]">
              <span
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: p1Won ? '#c4a35a' : '#999' }}
              >
                {playerNames.player1}
              </span>
              <span
                className="text-5xl font-bold tabular-nums"
                style={{
                  color: '#c4a35a',
                  fontFamily: "'NJNaruto', Arial, sans-serif",
                  textShadow: p1Won ? '0 0 16px rgba(196,163,90,0.35)' : 'none',
                }}
              >
                {game.player1Score}
              </span>
              <div className="flex items-center gap-2">
                {p1Won && (
                  <span
                    className="text-[9px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'rgba(196,163,90,0.15)',
                      color: '#c4a35a',
                      border: '1px solid rgba(196,163,90,0.3)',
                    }}
                  >
                    {t('winner')}
                  </span>
                )}
                <span
                  className="text-[9px] tabular-nums px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(196,163,90,0.08)',
                    color: '#c4a35a',
                    border: '1px solid rgba(196,163,90,0.15)',
                  }}
                >
                  {p1Missions}/{missions.length}
                </span>
              </div>
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-lg font-bold uppercase"
                style={{ color: '#2a2a34', fontFamily: "'NJNaruto', Arial, sans-serif" }}
              >
                {t('vsLabel')}
              </span>
            </div>

            {/* Player 2 */}
            <div className="flex flex-col items-center gap-1.5 min-w-[110px]">
              <span
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: p2Won ? '#b33e3e' : '#999' }}
              >
                {playerNames.player2}
              </span>
              <span
                className="text-5xl font-bold tabular-nums"
                style={{
                  color: '#b33e3e',
                  fontFamily: "'NJNaruto', Arial, sans-serif",
                  textShadow: p2Won ? '0 0 16px rgba(179,62,62,0.35)' : 'none',
                }}
              >
                {game.player2Score}
              </span>
              <div className="flex items-center gap-2">
                {p2Won && (
                  <span
                    className="text-[9px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'rgba(179,62,62,0.15)',
                      color: '#b33e3e',
                      border: '1px solid rgba(179,62,62,0.3)',
                    }}
                  >
                    {t('winner')}
                  </span>
                )}
                <span
                  className="text-[9px] tabular-nums px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(179,62,62,0.08)',
                    color: '#b33e3e',
                    border: '1px solid rgba(179,62,62,0.15)',
                  }}
                >
                  {p2Missions}/{missions.length}
                </span>
              </div>
            </div>
          </div>

          {/* Score comparison bar */}
          {totalScore > 0 && (
            <div className="mt-4 mx-auto" style={{ maxWidth: '320px' }}>
              <div className="flex h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1a1a24' }}>
                <div
                  className="h-full rounded-l-full"
                  style={{
                    width: `${p1Pct}%`,
                    backgroundColor: '#c4a35a',
                    transition: 'width 0.5s ease',
                  }}
                />
                <div
                  className="h-full rounded-r-full"
                  style={{
                    width: `${100 - p1Pct}%`,
                    backgroundColor: '#b33e3e',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Game type + date + ELO */}
        <div
          className="flex items-center justify-center gap-4 flex-wrap px-4 py-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              color: '#666',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {game.isAiGame ? t('aiGame', { difficulty: game.aiDifficulty ?? 'medium' }) : t('onlineGame')}
          </span>
          {game.eloChange != null && game.eloChange !== 0 && (
            <span
              className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded"
              style={{
                backgroundColor: game.eloChange > 0 ? 'rgba(62,139,62,0.1)' : 'rgba(179,62,62,0.1)',
                color: game.eloChange > 0 ? '#4a9e4a' : '#b33e3e',
                border: `1px solid ${game.eloChange > 0 ? 'rgba(62,139,62,0.25)' : 'rgba(179,62,62,0.25)'}`,
              }}
            >
              ELO {game.eloChange > 0 ? '+' : ''}{game.eloChange}
            </span>
          )}
          {game.completedAt && (
            <span className="text-[10px]" style={{ color: '#555' }}>
              {new Date(game.completedAt).toLocaleDateString()} {new Date(game.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Mission results grid */}
        {missions.length > 0 && (
          <div
            className="px-4 py-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {missions.map((mission, i) => {
                const rankColor = { D: '#3E8B3E', C: '#5A7ABB', B: '#9B59B6', A: '#C4A35A' }[mission.rank] ?? '#888';
                const wonColor = mission.wonBy === 'player1' ? '#c4a35a' : mission.wonBy === 'player2' ? '#b33e3e' : null;

                return (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-3 text-center"
                    style={{
                      backgroundColor: backgroundUrl ? 'rgba(10,10,14,0.6)' : '#0a0a0e',
                      border: `1px solid ${wonColor ? `${wonColor}35` : '#1e1e28'}`,
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1.5">
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${rankColor}20`,
                          color: rankColor,
                          fontFamily: "'NJNaruto', Arial, sans-serif",
                        }}
                      >
                        {mission.rank}
                      </span>
                      <span
                        className="text-[10px] font-bold tabular-nums"
                        style={{ color: rankColor, fontFamily: "'NJNaruto', Arial, sans-serif" }}
                      >
                        {mission.basePoints + mission.rankBonus} pts
                      </span>
                    </div>
                    <p className="text-[10px] font-medium truncate mb-1.5" style={{ color: '#c0c0c0' }}>
                      {mission.name_fr}
                    </p>
                    {mission.wonBy ? (
                      <p className="text-[10px] font-bold" style={{ color: wonColor! }}>
                        {playerNames[mission.wonBy]}
                      </p>
                    ) : (
                      <p className="text-[9px]" style={{ color: '#444' }}>-</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: '#101018',
        border: '1px solid #1e1e28',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888' }}>
          {tr('eventTimeline')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopAutoPlay : () => { setVisibleCount(0); setIsPlaying(true); }}
            className="px-3 py-1 text-[10px] font-bold rounded cursor-pointer"
            style={{
              backgroundColor: isPlaying ? 'rgba(179,62,62,0.1)' : 'rgba(62,139,62,0.1)',
              border: `1px solid ${isPlaying ? 'rgba(179,62,62,0.3)' : 'rgba(62,139,62,0.3)'}`,
              color: isPlaying ? '#b33e3e' : '#4a9e4a',
            }}
          >
            {isPlaying ? tr('pause') : tr('autoPlay')}
          </button>
          <button
            onClick={() => {
              const order: Array<'slow' | 'normal' | 'fast'> = ['slow', 'normal', 'fast'];
              setSpeed(order[(order.indexOf(speed) + 1) % 3]);
            }}
            className="px-2 py-1 text-[10px] rounded cursor-pointer"
            style={{ backgroundColor: '#16161e', border: '1px solid #2a2a34', color: '#888' }}
          >
            {speed === 'slow' ? '0.5x' : speed === 'normal' ? '1x' : '2x'}
          </button>
        </div>
      </div>

      {/* Turn filters */}
      <div className="flex gap-1 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <button
          onClick={() => setSelectedTurn(null)}
          className="px-2.5 py-1 text-[10px] font-bold rounded cursor-pointer"
          style={{
            backgroundColor: selectedTurn === null ? '#c4a35a' : '#16161e',
            color: selectedTurn === null ? '#0a0a0a' : '#666',
            border: selectedTurn === null ? '1px solid #c4a35a' : '1px solid #2a2a34',
          }}
        >
          {tr('allTurns')}
        </button>
        {turns.map((turn) => (
          <button
            key={turn}
            onClick={() => setSelectedTurn(turn)}
            className="px-2.5 py-1 text-[10px] font-bold rounded cursor-pointer"
            style={{
              backgroundColor: selectedTurn === turn ? '#c4a35a' : '#16161e',
              color: selectedTurn === turn ? '#0a0a0a' : '#666',
              border: selectedTurn === turn ? '1px solid #c4a35a' : '1px solid #2a2a34',
              fontFamily: "'NJNaruto', Arial, sans-serif",
            }}
          >
            T{turn}
          </button>
        ))}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: '400px' }}
      >
        {displayEntries.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm" style={{ color: '#333' }}>{tr('noLog')}</span>
          </div>
        ) : (
          displayEntries.map((entry, i) => {
            const playerColor = entry.player === 'player1' ? '#c4a35a' : entry.player === 'player2' ? '#b33e3e' : undefined;
            const displayName = entry.player ? playerNames[entry.player] : null;
            return (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex items-start gap-2 px-4 py-1.5 text-xs"
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                  backgroundColor: entry.player ? `${playerColor}05` : 'transparent',
                }}
              >
                <span className="shrink-0 tabular-nums text-[10px]" style={{ color: '#444', minWidth: '32px' }}>
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span
                  className="shrink-0 rounded px-1 py-0.5 text-[9px] uppercase font-bold"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#555', minWidth: '50px', textAlign: 'center' }}
                >
                  T{entry.turn} {formatPhase(entry.phase)}
                </span>
                {entry.player && (
                  <span className="shrink-0 font-bold text-[10px]" style={{ color: playerColor }}>
                    {displayName}
                  </span>
                )}
                <span className="text-[11px]" style={{ color: '#c0c0c0' }}>
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
  backgroundUrl,
}: {
  initialState: GameState;
  actionHistory: Array<{ player: PlayerID; action: GameAction }>;
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
  backgroundUrl?: string;
}) {
  const tr = useTranslations('replay');
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const [currentStep, setCurrentStep] = useState(0);
  const [showLog, setShowLog] = useState(false);

  const states = useMemo(() => {
    resetIdCounter();

    const turn1Start: GameState = { ...initialState, phase: 'start' as GamePhase };
    const result: GameState[] = [turn1Start, initialState];
    let current = initialState;

    function remapAction(action: GameAction, state: GameState): GameAction {
      if (action.type === 'SELECT_TARGET') {
        const origId = action.pendingActionId;
        const found = state.pendingActions.find((p) => p.id === origId);
        if (!found && state.pendingActions.length > 0) {
          const remapped = state.pendingActions[0];
          return { ...action, pendingActionId: remapped.id };
        }
        return action;
      }
      if (action.type === 'DECLINE_OPTIONAL_EFFECT') {
        const origId = action.pendingEffectId;
        const found = state.pendingEffects.find((e) => e.id === origId);
        if (!found && state.pendingEffects.length > 0) {
          const remapped = state.pendingEffects.find((e) => e.isOptional || !e.isMandatory) ?? state.pendingEffects[0];
          return { ...action, pendingEffectId: remapped.id };
        }
        return action;
      }
      if (action.type === 'REVEAL_CHARACTER') {
        const mission = state.activeMissions[action.missionIndex];
        if (mission) {
          const origId = action.characterInstanceId;
          const allChars = [...mission.player1Characters, ...mission.player2Characters];
          const found = allChars.find((c) => c.instanceId === origId);
          if (!found) {
            const playerChars = state.activePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
            const hiddenChars = playerChars.filter((c) => c.isHidden);
            if (hiddenChars.length === 1) {
              return { ...action, characterInstanceId: hiddenChars[0].instanceId };
            }
            if (hiddenChars.length > 0) {
              return { ...action, characterInstanceId: hiddenChars[0].instanceId };
            }
          }
        }
        return action;
      }
      if (action.type === 'UPGRADE_CHARACTER') {
        const mission = state.activeMissions[action.missionIndex];
        if (mission) {
          const origId = action.targetInstanceId;
          const allChars = [...mission.player1Characters, ...mission.player2Characters];
          const found = allChars.find((c) => c.instanceId === origId);
          if (!found) {
            const card = state[state.activePlayer].hand[action.cardIndex];
            if (card) {
              const playerChars = state.activePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
              const sameNameChars = playerChars.filter((c) =>
                !c.isHidden && c.card.name_fr === card.name_fr && (c.card.chakra ?? 0) < (card.chakra ?? 0)
              );
              if (sameNameChars.length > 0) {
                return { ...action, targetInstanceId: sameNameChars[0].instanceId };
              }
            }
          }
        }
        return action;
      }
      return action;
    }

    for (const { player, action } of actionHistory) {
      const prevTurn = current.turn;
      const counterBefore = getIdCounter();
      const remappedAction = remapAction(action, current);
      try {
        const next = GameEngine.applyAction(current, player, remappedAction);
        current = next;
      } catch {
        setIdCounter(counterBefore);
        continue;
      }

      if (current.turn !== prevTurn && current.phase === 'action') {
        result.push({ ...current, phase: 'start' as GamePhase });
      }
      result.push(current);
    }

    // Recovery loop
    let recovery = 0;
    while (current.phase !== 'gameOver' && recovery < 120) {
      let advanced: GameState | null = null;
      try {
        if (current.pendingEffects.length > 0 && current.pendingActions.length === 0) {
          current = { ...current, pendingEffects: [] };
        }

        if (current.phase === 'action') {
          if (current.player1.hasPassed && current.player2.hasPassed) {
            for (const p of ['player1', 'player2'] as PlayerID[]) {
              try {
                const attempt = GameEngine.applyAction(current, p, { type: 'PASS' });
                if (attempt.phase !== current.phase || attempt.turn !== current.turn) {
                  advanced = attempt;
                  break;
                }
              } catch { /* try next */ }
            }
            if (!advanced) {
              try {
                const forced: GameState = { ...current, phase: 'mission' as GamePhase, missionScoredThisTurn: false };
                advanced = GameEngine.applyAction(forced, current.edgeHolder, { type: 'ADVANCE_PHASE' });
              } catch { /* fallthrough */ }
            }
          }
          if (!advanced) break;

        } else if ((current.phase === 'mission' || current.phase === 'end') && current.pendingActions.length > 0) {
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
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });

        } else if (current.phase === 'end' && current.pendingActions.length === 0) {
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });

        } else {
          break;
        }
      } catch {
        try {
          advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });
        } catch {
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

      const madeProgress = advanced.phase !== current.phase ||
        advanced.turn !== current.turn ||
        advanced.pendingActions.length !== current.pendingActions.length ||
        advanced.pendingEffects.length !== current.pendingEffects.length ||
        Boolean(advanced.missionScoringComplete) !== Boolean(current.missionScoringComplete);
      if (!madeProgress) break;

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

  const actionLabel = useMemo(() => {
    const state = states[currentStep];
    if (!state) return '';
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
      setCurrentStep((prev) => Math.min(states.length - 1, prev + 1));
    } else {
      setCurrentStep(Math.max(0, Math.min(states.length - 1, step)));
    }
  }, [states.length]);

  const currentState = states[currentStep];
  if (!currentState) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Visual board */}
      <ReplayBoard state={currentState} playerNames={playerNames} locale={locale} backgroundUrl={backgroundUrl} />

      {/* Playback controls */}
      <PlaybackControls
        currentStep={currentStep}
        totalSteps={states.length}
        onStepChange={handleStepChange}
        turnStarts={turnStarts}
        actionLabel={actionLabel}
      />

      {/* Toggle log */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowLog(!showLog)}
          className="self-start px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded cursor-pointer"
          style={{
            backgroundColor: showLog ? '#c4a35a' : '#16161e',
            color: showLog ? '#0a0a0a' : '#666',
            border: `1px solid ${showLog ? '#c4a35a' : '#2a2a34'}`,
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
  const gameBackgroundUrl = useSettingsStore((s) => s.gameBackgroundUrl);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);

  // Fetch user's background preference
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 rounded-full"
            style={{
              border: '2px solid #2a2a34',
              borderTopColor: '#c4a35a',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p className="text-xs" style={{ color: '#555' }}>{tr('loading')}</p>
        </div>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#b33e3e' }}>{error}</p>
        <Link
          href="/"
          className="px-4 py-2 text-sm rounded"
          style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888' }}
        >
          {tr('back')}
        </Link>
      </main>
    );
  }

  if (!game.gameState) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#555' }}>{tr('noLog')}</p>
        <Link
          href="/"
          className="px-4 py-2 text-sm rounded"
          style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888' }}
        >
          {tr('back')}
        </Link>
      </main>
    );
  }

  const playerNames = game.gameState.playerNames ?? { player1: t('game.anim.player1'), player2: t('game.anim.player2') };
  const missions = game.gameState.finalMissions ?? [];
  const log = game.gameState.log ?? [];
  const hasVisualReplay = !!game.gameState.initialState && !!game.gameState.actionHistory && game.gameState.actionHistory.length > 0;

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />

      <div className="max-w-4xl mx-auto relative z-10 flex-1 px-4 py-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-xl font-bold uppercase tracking-wider"
              style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
            >
              {tr('title')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton gameId={id} />
            <LanguageSwitcher />
            <Link
              href="/"
              className="px-4 py-2 text-sm rounded"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888' }}
            >
              {tr('back')}
            </Link>
          </div>
        </div>

        {/* Match summary with scores and missions */}
        <div className="mb-6">
          <MatchStats game={game} playerNames={playerNames} missions={missions} backgroundUrl={gameBackgroundUrl} />
        </div>

        {/* Visual Replay or Text-only fallback */}
        {hasVisualReplay ? (
          <VisualReplay
            initialState={game.gameState.initialState!}
            actionHistory={game.gameState.actionHistory!}
            log={log}
            playerNames={playerNames}
            backgroundUrl={gameBackgroundUrl}
          />
        ) : (
          <TextTimeline log={log} playerNames={playerNames} />
        )}
      </div>
    </main>
  );
}
