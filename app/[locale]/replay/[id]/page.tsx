'use client';

import { useState, useEffect, useMemo, useRef, useCallback, use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { ReplayGameHost } from '@/components/replay/ReplayGameHost';
import { PlaybackControls } from '@/components/replay/PlaybackControls';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter, getIdCounter, setIdCounter } from '@/lib/engine/utils/id';
import { useSettingsStore } from '@/stores/settingsStore';
import { PanelFrame } from '@/components/game/PopupPrimitives';
import { useSession } from 'next-auth/react';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import type { GameState, GamePhase, GameAction, PlayerID, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { ChessClockState } from '@/lib/timing/chessClock';

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
  wonBy: 'player1' | 'player2' | 'draw' | null;
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
    actionHistory?: Array<{ player: PlayerID; action: GameAction; createdIds?: string[] }>;
    stateSnapshots?: GameState[] | null;
    snapshotLogLengths?: number[] | null;
    clockSnapshots?: ChessClockState[] | null;
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

function ShareButton({ gameId }: { gameId: string }) {
  const t = useTranslations('replay');
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: t('title'), url });
        return;
      } catch { /* fall through */ }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
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
      className="px-3 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors cursor-pointer"
      style={{
        transform: 'skewX(-3deg)',
        backgroundColor: copied ? 'rgba(62,139,62,0.15)' : 'rgba(10, 10, 18, 0.88)',
        color: copied ? '#4a9e4a' : '#888888',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
        {copied ? t('linkCopied') : t('share')}
      </span>
    </button>
  );
}

function ScoreOverlay({
  game,
  playerNames,
  isEndOfReplay = false,
}: {
  game: GameData;
  playerNames: { player1: string; player2: string };
  isEndOfReplay?: boolean;
}) {
  const t = useTranslations('replay');
  const p1Won = game.winnerId === game.player1Id;
  const p2Won = game.winnerId === game.player2Id;

  if (isEndOfReplay) {
    return (
      <PanelFrame accentColor="rgba(196, 163, 90, 0.4)" padding="24px 40px">
        <div className="flex flex-col items-center gap-3">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.3em]"
            style={{ color: '#666' }}
          >
            {t('replayComplete')}
          </span>
          <div
            className="flex items-center gap-6"
            style={{ backgroundColor: 'rgba(10, 10, 18, 0.88)' }}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: p1Won ? '#c4a35a' : '#777' }}>
                {playerNames.player1}
              </span>
              <span
                className="text-3xl font-bold tabular-nums"
                style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
              >
                {game.player1Score}
              </span>
            </div>

            <span className="text-sm" style={{ color: '#444' }}>-</span>

            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: p2Won ? '#b33e3e' : '#777' }}>
                {playerNames.player2}
              </span>
              <span
                className="text-3xl font-bold tabular-nums"
                style={{ color: '#b33e3e', fontFamily: "'NJNaruto', Arial, sans-serif" }}
              >
                {game.player2Score}
              </span>
            </div>
          </div>
        </div>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame accentColor="rgba(196, 163, 90, 0.3)" padding="10px 16px">
      <div
        className="flex items-center gap-4"
        style={{ backgroundColor: 'rgba(10, 10, 18, 0.88)', backdropFilter: 'blur(12px)' }}
      >
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: p1Won ? '#c4a35a' : '#777' }}>
            {playerNames.player1}
          </span>
          <span
            className="text-lg font-bold tabular-nums"
            style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {game.player1Score}
          </span>
        </div>

        <span className="text-[10px]" style={{ color: '#333' }}>-</span>

        <div className="flex items-center gap-2">
          <span
            className="text-lg font-bold tabular-nums"
            style={{ color: '#b33e3e', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {game.player2Score}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: p2Won ? '#b33e3e' : '#777' }}>
            {playerNames.player2}
          </span>
        </div>
      </div>
    </PanelFrame>
  );
}

function TextTimeline({
  log,
  playerNames,
  onClose,
  currentStep,
  states,
}: {
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
  onClose: () => void;
  currentStep?: number;
  states?: GameState[];
}) {
  const t = useTranslations();
  const tr = useTranslations('replay');
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [visibleCount, setVisibleCount] = useState(log.length);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SPEEDS = { slow: 1500, normal: 800, fast: 300 };

  const filteredLog = selectedTurn === null ? log : log.filter((e) => e.turn === selectedTurn);
  const turns = [...new Set(log.map((e) => e.turn))].sort((a, b) => a - b);

  const syncedLogLength = useMemo(() => {
    if (currentStep == null || !states || states.length === 0) return null;
    const state = states[currentStep];
    if (!state) return null;
    return state.log?.length ?? 0;
  }, [currentStep, states]);

  const highlightedIndices = useMemo(() => {
    if (currentStep == null || !states || states.length === 0 || syncedLogLength == null) return new Set<number>();
    const prevLogLen = currentStep > 0 ? (states[currentStep - 1]?.log?.length ?? 0) : 0;
    const indices = new Set<number>();
    for (let i = prevLogLen; i < syncedLogLength; i++) {
      indices.add(i);
    }
    return indices;
  }, [currentStep, states, syncedLogLength]);

  const stopAutoPlay = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (syncedLogLength != null) {
      setVisibleCount(syncedLogLength);
    }
  }, [syncedLogLength]);

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
    if (highlightRef.current && scrollRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (scrollRef.current && isPlaying) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleCount, isPlaying, highlightedIndices]);

  useEffect(() => {
    if (syncedLogLength == null) {
      
      setVisibleCount(filteredLog.length);
      stopAutoPlay();
    }
  }, [selectedTurn, filteredLog.length, stopAutoPlay, syncedLogLength]);

  const formatPhase = (phase: GamePhase): string => {
    const key = phaseTranslationKeys[phase];
    return key ? t(key) : phase;
  };

  const displayEntries = syncedLogLength != null ? filteredLog : filteredLog.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      <motion.div
        initial={{ x: -340 }}
        animate={{ x: 0 }}
        exit={{ x: -340 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="absolute inset-y-0 left-0 flex flex-col overflow-hidden"
        style={{
          width: '340px',
          backgroundColor: 'rgba(8, 8, 14, 0.95)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(12px)',
        }}
      >
        
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888' }}>
            {tr('eventTimeline')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={isPlaying ? stopAutoPlay : () => { setVisibleCount(0); setIsPlaying(true); }}
              className="px-3 py-1 text-[10px] font-bold cursor-pointer"
              style={{
                transform: 'skewX(-3deg)',
                backgroundColor: isPlaying ? 'rgba(179,62,62,0.1)' : 'rgba(62,139,62,0.1)',
                color: isPlaying ? '#b33e3e' : '#4a9e4a',
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
                {isPlaying ? tr('pause') : tr('autoPlay')}
              </span>
            </button>
            <button
              onClick={() => {
                const order: Array<'slow' | 'normal' | 'fast'> = ['slow', 'normal', 'fast'];
                setSpeed(order[(order.indexOf(speed) + 1) % 3]);
              }}
              className="px-2 py-1 text-[10px] cursor-pointer"
              style={{
                transform: 'skewX(-3deg)',
                backgroundColor: 'rgba(255,255,255,0.03)',
                color: '#888',
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
                {speed === 'slow' ? '0.5x' : speed === 'normal' ? '1x' : '2x'}
              </span>
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 text-[10px] cursor-pointer"
              style={{ backgroundColor: 'rgba(179,62,62,0.12)', color: '#b33e3e' }}
            >
              X
            </button>
          </div>
        </div>

        <div className="flex gap-1 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <button
            onClick={() => setSelectedTurn(null)}
            className="px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: selectedTurn === null ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
              color: selectedTurn === null ? '#c4a35a' : '#666',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('allTurns')}</span>
          </button>
          {turns.map((turn) => (
            <button
              key={turn}
              onClick={() => setSelectedTurn(turn)}
              className="px-2.5 py-1 text-[10px] font-bold cursor-pointer"
              style={{
                transform: 'skewX(-3deg)',
                backgroundColor: selectedTurn === turn ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
                color: selectedTurn === turn ? '#c4a35a' : '#666',
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>T{turn}</span>
            </button>
          ))}
        </div>

        <div ref={scrollRef} className="overflow-y-auto flex-1">
          {displayEntries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: '#333' }}>{tr('noLog')}</span>
            </div>
          ) : (
            displayEntries.map((entry, i) => {
              const playerColor = entry.player === 'player1' ? '#c4a35a' : entry.player === 'player2' ? '#b33e3e' : undefined;
              const displayName = entry.player ? playerNames[entry.player] : null;
              const isHighlighted = highlightedIndices.has(i);
              
              const isFuture = syncedLogLength != null && i >= syncedLogLength;
              
              const isLastHighlighted = isHighlighted && !highlightedIndices.has(i + 1);
              return (
                <div
                  key={`${entry.timestamp}-${i}`}
                  ref={isLastHighlighted ? highlightRef : undefined}
                  className="flex items-start gap-2 px-4 py-1.5 text-xs"
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                    backgroundColor: isHighlighted
                      ? 'rgba(196, 163, 90, 0.12)'
                      : entry.player
                        ? `${playerColor}05`
                        : 'transparent',
                    opacity: isFuture ? 0.25 : 1,
                    transition: 'background-color 0.3s ease, opacity 0.3s ease',
                  }}
                >
                  <span className="shrink-0 tabular-nums text-[10px]" style={{ color: '#444', minWidth: '32px' }}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span
                    className="shrink-0 px-1 py-0.5 text-[9px] uppercase font-bold"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#555', minWidth: '50px', textAlign: 'center' }}
                  >
                    T{entry.turn} {formatPhase(entry.phase)}
                  </span>
                  {entry.player && (
                    <span className="shrink-0 font-bold text-[10px]" style={{ color: playerColor }}>
                      {displayName}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: isHighlighted ? '#e0d0a0' : '#c0c0c0' }}>
                    {entry.messageKey ? t(entry.messageKey, entry.messageParams ?? {}) : (entry.details || entry.action)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

function VisualReplay({
  initialState,
  actionHistory,
  log,
  playerNames,
  backgroundUrl,
  game,
  defaultViewAs,
  stateSnapshots,
  snapshotLogLengths,
  clockSnapshots,
}: {
  initialState: GameState;
  actionHistory: Array<{ player: PlayerID; action: GameAction; createdIds?: string[] }>;
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
  backgroundUrl?: string;
  game: GameData;
  defaultViewAs?: PlayerID;
  stateSnapshots?: GameState[] | null;
  snapshotLogLengths?: number[] | null;
  clockSnapshots?: ChessClockState[] | null;
}) {
  const tr = useTranslations('replay');
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const [currentStep, setCurrentStep] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [controlsHot, setControlsHot] = useState(true);
  const [viewAs, setViewAs] = useState<PlayerID>(defaultViewAs ?? 'player1');

  const states = useMemo(() => {
    if (stateSnapshots && stateSnapshots.length > 0) {
      const fullLog = log;
      const lengths = snapshotLogLengths ?? [];
      const result: GameState[] = [initialState];
      for (let i = 0; i < stateSnapshots.length; i++) {
        const snap = stateSnapshots[i];
        const len = lengths[i] ?? fullLog.length;
        result.push({
          ...snap,
          log: fullLog.slice(0, len) as unknown as GameState['log'],
        });
      }
      return result;
    }

    resetIdCounter();

    const turn1Start: GameState = { ...initialState, phase: 'start' as GamePhase };
    const result: GameState[] = [turn1Start, initialState];
    let current = initialState;

    const idMap = new Map<string, string>();

    function collectCharIds(st: GameState): Set<string> {
      const ids = new Set<string>();
      for (const m of st.activeMissions) {
        for (const c of [...m.player1Characters, ...m.player2Characters]) {
          ids.add(c.instanceId);
        }
      }
      return ids;
    }

    function updateIdMap(prev: GameState, next: GameState, origAction: GameAction, origCreatedIds?: string[]) {
      const prevIds = collectCharIds(prev);
      const nextIds = collectCharIds(next);

      const replayNewIds: string[] = [];
      for (const id of nextIds) {
        if (!prevIds.has(id)) replayNewIds.push(id);
      }

      if (origCreatedIds && origCreatedIds.length > 0 && replayNewIds.length > 0) {
        for (let i = 0; i < origCreatedIds.length && i < replayNewIds.length; i++) {
          idMap.set(origCreatedIds[i], replayNewIds[i]);
        }
      }

      for (const newId of replayNewIds) {
        if (!idMap.has(newId)) {
          idMap.set(newId, newId);
        }
      }
    }

    function mapId(id: string): string {
      return idMap.get(id) ?? id;
    }

    function remapAction(action: GameAction, state: GameState): GameAction {
      if (action.type === 'SELECT_TARGET') {
        const origId = action.pendingActionId;
        
        let pending = state.pendingActions.find((p) => p.id === origId);
        let remapped = action;
        if (!pending && state.pendingActions.length > 0) {
          
          pending = state.pendingActions[0];
          remapped = { ...remapped, pendingActionId: pending.id };
        }
        
        if (pending && remapped.selectedTargets.length > 0) {
          const validOptions = new Set(pending.options);
          const mappedTargets = remapped.selectedTargets.map((t) => {
            if (validOptions.has(t)) return t;
            const mapped = mapId(t);
            if (validOptions.has(mapped)) return mapped;
            return t;
          });
          remapped = { ...remapped, selectedTargets: mappedTargets };
          
          const stillInvalid = remapped.selectedTargets.some((t) => !validOptions.has(t));
          if (stillInvalid && pending.options.length > 0) {
            const fallbackTargets = remapped.selectedTargets.map((t, i) => {
              if (validOptions.has(t)) return t;
              return pending!.options[Math.min(i, pending!.options.length - 1)];
            });
            remapped = { ...remapped, selectedTargets: fallbackTargets };
          }
        }
        return remapped;
      }
      if (action.type === 'DECLINE_OPTIONAL_EFFECT') {
        const origId = action.pendingEffectId;
        const found = state.pendingEffects.find((e) => e.id === origId);
        if (!found && state.pendingEffects.length > 0) {
          const remappedEff = state.pendingEffects.find((e) => e.isOptional || !e.isMandatory) ?? state.pendingEffects[0];
          return { ...action, pendingEffectId: remappedEff.id };
        }
        return action;
      }
      if (action.type === 'REVEAL_CHARACTER') {
        const mission = state.activeMissions[action.missionIndex];
        if (mission) {
          const origId = action.characterInstanceId;
          const mappedId = mapId(origId);
          const allChars = [...mission.player1Characters, ...mission.player2Characters];
          
          const found = allChars.find((c) => c.instanceId === mappedId) || allChars.find((c) => c.instanceId === origId);
          if (found) {
            return { ...action, characterInstanceId: found.instanceId };
          }
          
          const playerChars = state.activePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
          const hiddenChars = playerChars.filter((c) => c.isHidden);
          if (hiddenChars.length > 0) {
            
            idMap.set(origId, hiddenChars[0].instanceId);
            return { ...action, characterInstanceId: hiddenChars[0].instanceId };
          }
        }
        return action;
      }
      if (action.type === 'UPGRADE_CHARACTER') {
        const mission = state.activeMissions[action.missionIndex];
        if (mission) {
          const origId = action.targetInstanceId;
          const mappedId = mapId(origId);
          const allChars = [...mission.player1Characters, ...mission.player2Characters];
          const found = allChars.find((c) => c.instanceId === mappedId) || allChars.find((c) => c.instanceId === origId);
          if (found) {
            return { ...action, targetInstanceId: found.instanceId };
          }
          const card = state[state.activePlayer].hand[action.cardIndex];
          if (card) {
            const playerChars = state.activePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
            const sameNameChars = playerChars.filter((c) =>
              !c.isHidden && c.card.name_fr === card.name_fr && (c.card.chakra ?? 0) < (card.chakra ?? 0)
            );
            if (sameNameChars.length > 0) {
              idMap.set(origId, sameNameChars[0].instanceId);
              return { ...action, targetInstanceId: sameNameChars[0].instanceId };
            }
          }
        }
        return action;
      }
      if (action.type === 'REORDER_EFFECTS') {
        
        const origId = action.selectedEffectId;
        const found = state.pendingEffects.find((e) => e.id === origId);
        if (!found && state.pendingEffects.length > 0) {
          
          return { ...action, selectedEffectId: state.pendingEffects[0].id };
        }
        return action;
      }
      return action;
    }

    function autoResolvePending(st: GameState): GameState | null {
      
      if (st.pendingEffects.length >= 2 && st.pendingActions.length >= 2) {
        const uniqueSources = new Set(st.pendingEffects.filter((e) => !e.resolved).map((e) => e.sourceInstanceId));
        if (uniqueSources.size >= 2) {
          try {
            return GameEngine.applyAction(st, st.activePlayer, {
              type: 'REORDER_EFFECTS',
              selectedEffectId: st.pendingEffects[0].id,
            });
          } catch { /* fallthrough */ }
        }
      }
      if (st.pendingActions.length > 0) {
        const pa = st.pendingActions[0];
        const pe = st.pendingEffects.find((e) => e.id === pa.sourceEffectId);

        const isConfirmPopup = pe?.isOptional && pa.options.length === 1 &&
          pe.targetSelectionType?.includes('CONFIRM');

        if (isConfirmPopup) {
          try {
            return GameEngine.applyAction(st, pa.player, {
              type: 'SELECT_TARGET',
              pendingActionId: pa.id,
              selectedTargets: [pa.options[0]],
            });
          } catch { /* fallthrough to decline */ }
        }

        const isOpt = pe?.isOptional || pa.minSelections === 0 || pa.options.length === 0;
        try {
          if (pa.options.length > 0) {
            
            return GameEngine.applyAction(st, pa.player, {
              type: 'SELECT_TARGET',
              pendingActionId: pa.id,
              selectedTargets: [pa.options[0]],
            });
          } else if (isOpt && pe) {
            return GameEngine.applyAction(st, pa.player, {
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pe.id,
            });
          }
        } catch { /* fallthrough */ }
        
        return {
          ...st,
          pendingActions: st.pendingActions.filter((p) => p.id !== pa.id),
          pendingEffects: pa.sourceEffectId
            ? st.pendingEffects.filter((e) => e.id !== pa.sourceEffectId)
            : st.pendingEffects,
        };
      }
      if (st.pendingEffects.length > 0) {
        return { ...st, pendingEffects: [] };
      }
      return null;
    }

    for (const { player, action, createdIds } of actionHistory) {
      const prevTurn = current.turn;
      const counterBefore = getIdCounter();
      const remappedAction = remapAction(action, current);
      try {
        const next = GameEngine.applyAction(current, player, remappedAction);
        
        if (remappedAction.type === 'SELECT_TARGET' && current.pendingActions.length > 0) {
          const prevPendingIds = current.pendingActions.map((p) => p.id).join(',');
          const nextPendingIds = next.pendingActions.map((p) => p.id).join(',');
          if (prevPendingIds === nextPendingIds && next.phase === current.phase) {
            
            setIdCounter(counterBefore);
            const resolved = autoResolvePending(current);
            if (resolved) {
              current = resolved;
              result.push(current);
            }
            continue;
          }
        }
        
        updateIdMap(current, next, action, createdIds);
        current = next;
      } catch {
        setIdCounter(counterBefore);
        
        if (current.pendingActions.length > 0 || current.pendingEffects.length > 0) {
          const resolved = autoResolvePending(current);
          if (resolved) {
            current = resolved;
            result.push(current);
          }
        }
        continue;
      }

      if (current.turn !== prevTurn && current.phase === 'action') {
        result.push({ ...current, phase: 'start' as GamePhase });
      }
      result.push(current);
    }

    let recovery = 0;
    while (current.phase !== 'gameOver' && recovery < 500) {
      let advanced: GameState | null = null;
      try {
        
        if (current.pendingEffects.length > 0 && current.pendingActions.length === 0) {
          current = { ...current, pendingEffects: [] };
        }

        if (current.pendingActions.length > 0) {
          advanced = autoResolvePending(current);
        } else if (current.phase === 'action') {
          
          if (!current.player1.hasPassed || !current.player2.hasPassed) {
            
            let st = current;
            for (const p of ['player1', 'player2'] as PlayerID[]) {
              if (!st[p].hasPassed) {
                try {
                  st = GameEngine.applyAction(st, p, { type: 'PASS' });
                } catch {
                  st = { ...st, [p]: { ...st[p], hasPassed: true } };
                }
              }
            }
            advanced = st;
          } else {
            
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
                const forced: GameState = { ...current, phase: 'mission' as GamePhase };
                advanced = GameEngine.applyAction(forced, current.edgeHolder, { type: 'ADVANCE_PHASE' });
              } catch {
                
                advanced = {
                  ...current,
                  phase: 'mission' as GamePhase,
                  pendingActions: [],
                  pendingEffects: [],
                  
                };
              }
            }
          }
        } else if (current.phase === 'mission') {
          try {
            advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });
          } catch {
            advanced = {
              ...current,
              phase: 'end' as GamePhase,
              pendingActions: [],
              pendingEffects: [],
              missionScoringComplete: undefined,
            };
          }
        } else if (current.phase === 'end') {
          try {
            advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });
          } catch {
            if (current.turn >= 4) {
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
          }
        } else if (current.phase === 'start') {
          try {
            advanced = GameEngine.applyAction(current, current.edgeHolder, { type: 'ADVANCE_PHASE' });
          } catch {
            advanced = {
              ...current,
              phase: 'action' as GamePhase,
              pendingActions: [],
              pendingEffects: [],
              player1: { ...current.player1, hasPassed: false },
              player2: { ...current.player2, hasPassed: false },
            };
          }
        } else {
          break;
        }
      } catch {
        
        if (current.phase === 'action') {
          advanced = {
            ...current,
            phase: 'mission' as GamePhase,
            pendingActions: [],
            pendingEffects: [],
            
            player1: { ...current.player1, hasPassed: true },
            player2: { ...current.player2, hasPassed: true },
          };
        } else if (current.phase === 'mission') {
          advanced = {
            ...current,
            phase: 'end' as GamePhase,
            pendingActions: [],
            pendingEffects: [],
            missionScoringComplete: undefined,
          };
        } else if (current.phase === 'end') {
          if (current.turn >= 4) {
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

      if (!advanced) break;

      const scoreChanged = advanced.player1.missionPoints !== current.player1.missionPoints ||
        advanced.player2.missionPoints !== current.player2.missionPoints;
      const logChanged = advanced.log.length !== current.log.length;
      const madeProgress = advanced.phase !== current.phase ||
        advanced.turn !== current.turn ||
        advanced.pendingActions.length !== current.pendingActions.length ||
        advanced.pendingEffects.length !== current.pendingEffects.length ||
        Boolean(advanced.missionScoringComplete) !== Boolean(current.missionScoringComplete) ||
        advanced.player1.hasPassed !== current.player1.hasPassed ||
        advanced.player2.hasPassed !== current.player2.hasPassed ||
        scoreChanged ||
        logChanged;
      if (!madeProgress) break;

      if (advanced.turn !== current.turn && advanced.phase === 'action') {
        result.push({ ...advanced, phase: 'start' as GamePhase });
      }

      current = advanced;
      result.push(current);
      recovery++;
    }

    if (current.phase !== 'gameOver') {
      console.warn('[Replay] Recovery could not reach gameOver naturally, forcing. Final state:', {
        turn: current.turn, phase: current.phase,
        pendingActions: current.pendingActions.length,
        pendingEffects: current.pendingEffects.length,
        p1Passed: current.player1.hasPassed,
        p2Passed: current.player2.hasPassed,
      });
      const gameOverState: GameState = { ...current, phase: 'gameOver' as GamePhase, pendingActions: [], pendingEffects: [] };
      result.push(gameOverState);
    }

    return result;
  }, [initialState, actionHistory, stateSnapshots, snapshotLogLengths, log]);

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
    <div
      className="w-screen flex flex-col overflow-hidden no-select"
      style={{
        height: '100dvh',
        backgroundColor: '#0a0a0a',
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        overscrollBehavior: 'none',
      }}
    >
      <LandscapeBlocker />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: backgroundUrl ? 'rgba(0, 0, 0, 0.35)' : 'transparent' }}
      />

      <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
        <Link
          href="/"
          className="px-3 py-1 text-[10px] font-medium"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: 'rgba(10, 10, 18, 0.88)',
            backdropFilter: 'blur(12px)',
            color: '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('back')}</span>
        </Link>
        <ShareButton gameId={game.id} />
        <button
          onClick={() => setShowLog(!showLog)}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: showLog ? 'rgba(196,163,90,0.15)' : 'rgba(10, 10, 18, 0.88)',
            backdropFilter: 'blur(12px)',
            color: showLog ? '#c4a35a' : '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('eventTimeline')}</span>
        </button>
        <button
          onClick={() => setViewAs(viewAs === 'player1' ? 'player2' : 'player1')}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: 'rgba(10, 10, 18, 0.88)',
            backdropFilter: 'blur(12px)',
            color: '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
            {tr('switchPerspective', { player: playerNames[viewAs === 'player1' ? 'player2' : 'player1'] })}
          </span>
        </button>
      </div>

      {currentStep >= states.length - 1 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <ScoreOverlay game={game} playerNames={playerNames} isEndOfReplay />
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-10">
        <ReplayGameHost state={currentState} viewAs={viewAs} playerNames={playerNames} />
      </div>

      <div
        className="absolute inset-x-0 z-20 flex justify-center pointer-events-none"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          opacity: controlsHot ? 1 : 0.55,
          transition: 'opacity 0.25s ease',
        }}
        onPointerEnter={() => setControlsHot(true)}
        onPointerLeave={() => setControlsHot(false)}
        onPointerDown={() => setControlsHot(true)}
      >
        <PlaybackControls
          currentStep={currentStep}
          totalSteps={states.length}
          onStepChange={handleStepChange}
          turnStarts={turnStarts}
          actionLabel={actionLabel}
        />
      </div>

      <AnimatePresence>
        {showLog && <TextTimeline log={log} playerNames={playerNames} onClose={() => setShowLog(false)} currentStep={currentStep} states={states} />}
      </AnimatePresence>
    </div>
  );
}

function TextOnlyReplay({
  log,
  playerNames,
  game,
}: {
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
  game: GameData;
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
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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
      className="w-screen flex flex-col"
      style={{ height: '100dvh', backgroundColor: '#0a0a0a', overscrollBehavior: 'none' }}
    >
      
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1e1e28' }}>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-1 text-[10px]"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: '#141414',
              color: '#888',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('back')}</span>
          </Link>
          <h1
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {tr('title')}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tabular-nums" style={{ color: '#c4a35a', fontFamily: "'NJNaruto'" }}>
            {game.player1Score}
          </span>
          <span className="text-[10px]" style={{ color: '#333' }}>-</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: '#b33e3e', fontFamily: "'NJNaruto'" }}>
            {game.player2Score}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={isPlaying ? stopAutoPlay : () => { setVisibleCount(0); setIsPlaying(true); }}
          className="px-3 py-1 text-[10px] font-bold cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: isPlaying ? 'rgba(179,62,62,0.1)' : 'rgba(62,139,62,0.1)',
            color: isPlaying ? '#b33e3e' : '#4a9e4a',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
            {isPlaying ? tr('pause') : tr('autoPlay')}
          </span>
        </button>
        <button
          onClick={() => {
            const order: Array<'slow' | 'normal' | 'fast'> = ['slow', 'normal', 'fast'];
            setSpeed(order[(order.indexOf(speed) + 1) % 3]);
          }}
          className="px-2 py-1 text-[10px] cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            color: '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
            {speed === 'slow' ? '0.5x' : speed === 'normal' ? '1x' : '2x'}
          </span>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setSelectedTurn(null)}
          className="px-2.5 py-1 text-[10px] font-bold cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: selectedTurn === null ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
            color: selectedTurn === null ? '#c4a35a' : '#666',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('allTurns')}</span>
        </button>
        {turns.map((turn) => (
          <button
            key={turn}
            onClick={() => setSelectedTurn(turn)}
            className="px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: selectedTurn === turn ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
              color: selectedTurn === turn ? '#c4a35a' : '#666',
              fontFamily: "'NJNaruto', Arial, sans-serif",
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>T{turn}</span>
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                  className="shrink-0 px-1 py-0.5 text-[9px] uppercase font-bold"
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

export default function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const tr = useTranslations('replay');

  const { data: session } = useSession();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const gameBackgroundUrl = useSettingsStore((s) => s.gameBackgroundUrl);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);

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
      <main className="w-screen flex items-center justify-center" style={{ height: '100dvh', backgroundColor: '#0a0a0a' }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-3 h-3"
            style={{
              border: '2px solid #2a2a34',
              borderTopColor: '#c4a35a',
              transform: 'rotate(45deg)',
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
      <main className="w-screen flex flex-col items-center justify-center gap-4" style={{ height: '100dvh', backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#b33e3e' }}>{error}</p>
        <Link
          href="/"
          className="px-4 py-2 text-sm"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: '#141414',
            color: '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('back')}</span>
        </Link>
      </main>
    );
  }

  if (!game.gameState) {
    return (
      <main className="w-screen flex flex-col items-center justify-center gap-4" style={{ height: '100dvh', backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#555' }}>{tr('noLog')}</p>
        <Link
          href="/"
          className="px-4 py-2 text-sm"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: '#141414',
            color: '#888',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>{tr('back')}</span>
        </Link>
      </main>
    );
  }

  const playerNames = game.gameState.playerNames ?? { player1: t('game.anim.player1'), player2: t('game.anim.player2') };
  const log = game.gameState.log ?? [];
  const hasVisualReplay = !!game.gameState.initialState && !!game.gameState.actionHistory && game.gameState.actionHistory.length > 0;

  const userId = session?.user?.id;
  const defaultViewAs: PlayerID | undefined = userId
    ? userId === game.player2Id ? 'player2' : 'player1'
    : undefined;

  if (hasVisualReplay) {
    return (
      <VisualReplay
        initialState={game.gameState.initialState!}
        actionHistory={game.gameState.actionHistory!}
        log={log}
        playerNames={playerNames}
        backgroundUrl={gameBackgroundUrl}
        game={game}
        defaultViewAs={defaultViewAs}
        stateSnapshots={game.gameState.stateSnapshots ?? null}
        snapshotLogLengths={game.gameState.snapshotLogLengths ?? null}
        clockSnapshots={game.gameState.clockSnapshots ?? null}
      />
    );
  }

  return (
    <TextOnlyReplay
      log={log}
      playerNames={playerNames}
      game={game}
    />
  );
}
