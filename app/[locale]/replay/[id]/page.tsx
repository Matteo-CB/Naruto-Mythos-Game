'use client';

import { useState, useEffect, useMemo, useRef, useCallback, use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { ReplayBoard } from '@/components/replay/ReplayBoard';
import { PlaybackControls } from '@/components/replay/PlaybackControls';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter, getIdCounter, setIdCounter } from '@/lib/engine/utils/id';
import { useSettingsStore } from '@/stores/settingsStore';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword } from '@/lib/utils/cardLocale';
import { PanelFrame } from '@/components/game/PopupPrimitives';
import { useSession } from 'next-auth/react';
import type { GameState, GamePhase, GameAction, PlayerID, CharacterCard, MissionCard } from '@/lib/engine/types';

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

const rarityColorMap: Record<string, string> = {
  C: '#888888', UC: '#3e8b3e', R: '#c4a35a', RA: '#c4a35a',
  S: '#b33e3e', SV: '#b33e3e', M: '#6a6abb', L: '#e0c040', MMS: '#c4a35a',
};

const effectTypeColorMap: Record<string, string> = {
  MAIN: '#c4a35a', AMBUSH: '#b33e3e', UPGRADE: '#3e8b3e', SCORE: '#6a6abb',
};

const rankColorMap: Record<string, string> = {
  D: '#3e8b3e', C: '#c4a35a', B: '#b37e3e', A: '#b33e3e',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const mins = date.getMinutes().toString().padStart(2, '0');
  const secs = date.getSeconds().toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

// ----- Card Preview Panel (right-side, matches GameBoard CardPreviewContent) -----

function ReplayCardPreview({
  card,
  missionContext,
  onClose,
  locale,
}: {
  card: CharacterCard | MissionCard;
  missionContext: { rank: string; basePoints: number; rankBonus: number } | null;
  onClose: () => void;
  locale: string;
}) {
  const t = useTranslations();
  const isCharacter = card.card_type === 'character';
  const isMission = card.card_type === 'mission';
  const imagePath = normalizeImagePath(card.image_file);
  const rarityColor = rarityColorMap[card.rarity] ?? '#888888';

  return (
    <div
      className="overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.95)',
        border: isMission
          ? `1px solid ${rankColorMap[missionContext?.rank ?? ''] ?? 'rgba(196, 163, 90, 0.15)'}40`
          : '1px solid rgba(255, 255, 255, 0.08)',
        borderLeft: isMission
          ? `3px solid ${rankColorMap[missionContext?.rank ?? ''] ?? 'rgba(196, 163, 90, 0.3)'}`
          : '3px solid rgba(196, 163, 90, 0.25)',
        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.8)',
        maxHeight: 'calc(100vh - 32px)',
      }}
    >
      {/* Card image */}
      {imagePath ? (
        <div
          className="w-full shrink-0 flex items-center justify-center"
          style={{ backgroundColor: '#0a0a0c', height: isCharacter ? '200px' : '140px' }}
        >
          <img
            src={imagePath}
            alt={getCardName(card, locale as 'en' | 'fr')}
            draggable={false}
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
          />
        </div>
      ) : (
        <div
          className="w-full shrink-0 flex items-center justify-center"
          style={{ backgroundColor: '#1a1a1a', height: isCharacter ? '200px' : '140px' }}
        >
          <span className="text-xs" style={{ color: '#555555' }}>{t('card.noImage')}</span>
        </div>
      )}

      {/* Card details (scrollable) */}
      <div className="p-3.5 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '380px' }}>
        {/* Type + Rarity */}
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] px-1.5 py-0.5 font-bold uppercase tracking-wider"
            style={{
              backgroundColor: isMission ? 'rgba(196, 163, 90, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              color: isMission ? '#c4a35a' : '#888888',
              borderLeft: `2px solid ${isMission ? 'rgba(196, 163, 90, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
            }}
          >
            {isMission ? t('card.mission') : t('card.character')}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 shrink-0 font-bold"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderLeft: `2px solid ${rarityColor}`, color: rarityColor }}
          >
            {card.rarity}
          </span>
        </div>

        {/* Name */}
        <span className="text-sm font-bold leading-tight" style={{ color: '#e0e0e0' }}>
          {getCardName(card, locale as 'en' | 'fr')}
        </span>

        {/* Title */}
        {(card.title_fr || card.title_en) && (
          <span className="text-xs" style={{ color: '#999999' }}>
            {getCardTitle(card, locale as 'en' | 'fr')}
          </span>
        )}

        {/* Mission rank + points */}
        {isMission && missionContext && (
          <div
            className="flex flex-col gap-1.5 p-2.5 mt-0.5"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderLeft: `3px solid ${rankColorMap[missionContext.rank] ?? '#555'}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: '#aaaaaa' }}>{t('card.rank')}</span>
              <span
                className="text-sm font-bold px-2 py-0.5"
                style={{ color: rankColorMap[missionContext.rank] ?? '#888', backgroundColor: `${rankColorMap[missionContext.rank] ?? '#888'}15` }}
              >
                {missionContext.rank}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#888888' }}>{t('game.board.base')}</span>
              <span className="text-xs tabular-nums" style={{ color: '#aaaaaa' }}>{missionContext.basePoints} {t('game.board.pts')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#888888' }}>{t('card.rankBonus')}</span>
              <span className="text-xs tabular-nums" style={{ color: '#aaaaaa' }}>+{missionContext.rankBonus} {t('game.board.pts')}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 mt-0.5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span className="text-xs font-bold" style={{ color: '#c4a35a' }}>{t('card.totalPoints')}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: '#c4a35a' }}>
                {missionContext.basePoints + missionContext.rankBonus} {t('game.board.pts')}
              </span>
            </div>
          </div>
        )}

        {/* Chakra + Power (character) */}
        {isCharacter && (
          <div
            className="flex items-center gap-4 p-2 mt-0.5"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid rgba(196, 163, 90, 0.3)' }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>{t('collection.details.cost')}</span>
              <span className="text-base font-bold" style={{ color: '#c4a35a' }}>{(card as CharacterCard).chakra}</span>
            </div>
            <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>{t('collection.details.power')}</span>
              <span className="text-base font-bold" style={{ color: '#e0e0e0' }}>{(card as CharacterCard).power}</span>
            </div>
          </div>
        )}

        {/* Keywords */}
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {card.keywords.map((kw) => (
              <span
                key={kw}
                className="text-[10px] px-1.5 py-0.5"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', color: '#999999', borderLeft: '2px solid rgba(255, 255, 255, 0.08)' }}
              >
                {getCardKeyword(kw, locale as 'en' | 'fr')}
              </span>
            ))}
          </div>
        )}

        {/* Group */}
        {card.group && (
          <span className="text-[10px]" style={{ color: '#777777' }}>
            {t('collection.details.group')}: {getCardGroup(card.group, locale as 'en' | 'fr')}
          </span>
        )}

        {/* Card ID */}
        <span className="text-[9px]" style={{ color: '#444444' }}>{card.id}</span>

        {/* Effects */}
        <div className="mt-0.5 flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#888888' }}>{t('card.effects')}</span>
          {card.effects && card.effects.length > 0 ? (
            card.effects.map((effect, i) => {
              const raFallbackId = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
              const frDescs = effectDescriptionsFr[card.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
              const enDescs = effectDescriptionsEn[card.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
              const description = locale === 'fr'
                ? (frDescs?.[i] ?? enDescs?.[i] ?? effect.description)
                : (enDescs?.[i] ?? effect.description);
              return (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 p-2"
                  style={{
                    backgroundColor: `${effectTypeColorMap[effect.type] ?? '#888888'}08`,
                    borderLeft: `3px solid ${effectTypeColorMap[effect.type] ?? '#888888'}`,
                  }}
                >
                  <span className="text-[10px] font-bold uppercase" style={{ color: effectTypeColorMap[effect.type] ?? '#888888' }}>
                    {t(`card.effectTypes.${effect.type}` as 'card.effectTypes.MAIN' | 'card.effectTypes.UPGRADE' | 'card.effectTypes.AMBUSH' | 'card.effectTypes.SCORE')}
                  </span>
                  <span className="font-body text-[11px] leading-snug" style={{ color: '#aaaaaa' }}>{description}</span>
                </div>
              );
            })
          ) : (
            <span className="text-[10px]" style={{ color: '#555555' }}>{t('card.noEffects')}</span>
          )}
        </div>
      </div>

      {/* Close button */}
      <div className="flex items-center justify-end px-3 py-2 shrink-0" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}>
        <button
          onClick={onClose}
          className="text-[11px] font-bold px-2.5 py-1 cursor-pointer"
          style={{ backgroundColor: 'rgba(179, 62, 62, 0.12)', color: '#b33e3e', borderLeft: '2px solid rgba(179, 62, 62, 0.5)' }}
        >
          X
        </button>
      </div>
    </div>
  );
}

// ----- Share Button -----

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
        borderLeft: copied ? '3px solid rgba(62,139,62,0.4)' : '3px solid rgba(255,255,255,0.1)',
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

// ----- Score Overlay (top-right) -----

function ScoreOverlay({
  game,
  playerNames,
}: {
  game: GameData;
  playerNames: { player1: string; player2: string };
}) {
  const t = useTranslations('replay');
  const p1Won = game.winnerId === game.player1Id;
  const p2Won = game.winnerId === game.player2Id;

  return (
    <PanelFrame accentColor="rgba(196, 163, 90, 0.3)" padding="10px 16px">
      <div
        className="flex items-center gap-4"
        style={{ backgroundColor: 'rgba(10, 10, 18, 0.88)', backdropFilter: 'blur(12px)' }}
      >
        {/* P1 */}
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

        {/* P2 */}
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

// ----- Text Timeline Component (fullscreen overlay) -----

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

  // When syncing with visual replay, determine which log entries correspond to currentStep
  const syncedLogLength = useMemo(() => {
    if (currentStep == null || !states || states.length === 0) return null;
    const state = states[currentStep];
    if (!state) return null;
    return state.log?.length ?? 0;
  }, [currentStep, states]);

  // Newly highlighted entry indices (entries added in the current step)
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

  // Sync visibleCount with currentStep when provided
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

  // Auto-scroll to highlighted entries
  useEffect(() => {
    if (highlightRef.current && scrollRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (scrollRef.current && isPlaying) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleCount, isPlaying, highlightedIndices]);

  useEffect(() => {
    if (syncedLogLength == null) {
      // Only reset when NOT synced with visual replay
      setVisibleCount(filteredLog.length);
      stopAutoPlay();
    }
  }, [selectedTurn, filteredLog.length, stopAutoPlay, syncedLogLength]);

  const formatPhase = (phase: GamePhase): string => {
    const key = phaseTranslationKeys[phase];
    return key ? t(key) : phase;
  };

  // When synced with visual replay, show all entries but dim future ones.
  // When not synced (standalone auto-play), slice as before.
  const displayEntries = syncedLogLength != null ? filteredLog : filteredLog.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Semi-transparent backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Side panel sliding from left */}
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
        {/* Header */}
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
                borderLeft: isPlaying ? '3px solid rgba(179,62,62,0.5)' : '3px solid rgba(62,139,62,0.5)',
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
                borderLeft: '2px solid rgba(255,255,255,0.08)',
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
              style={{ backgroundColor: 'rgba(179,62,62,0.12)', borderLeft: '2px solid rgba(179,62,62,0.5)', color: '#b33e3e' }}
            >
              X
            </button>
          </div>
        </div>

        {/* Turn filters */}
        <div className="flex gap-1 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <button
            onClick={() => setSelectedTurn(null)}
            className="px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: selectedTurn === null ? 'rgba(196,163,90,0.15)' : 'rgba(255,255,255,0.03)',
              color: selectedTurn === null ? '#c4a35a' : '#666',
              borderLeft: selectedTurn === null ? '3px solid #c4a35a' : '3px solid rgba(255,255,255,0.08)',
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
                borderLeft: selectedTurn === turn ? '3px solid #c4a35a' : '3px solid rgba(255,255,255,0.08)',
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>T{turn}</span>
            </button>
          ))}
        </div>

        {/* Log entries */}
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
              // When synced, entries beyond the current step's log length are future entries
              const isFuture = syncedLogLength != null && i >= syncedLogLength;
              // Assign the highlightRef to the last highlighted entry for auto-scroll
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
                    borderLeft: isHighlighted ? '3px solid rgba(196, 163, 90, 0.6)' : '3px solid transparent',
                    opacity: isFuture ? 0.25 : 1,
                    transition: 'background-color 0.3s ease, opacity 0.3s ease',
                  }}
                >
                  <span className="shrink-0 tabular-nums text-[10px]" style={{ color: '#444', minWidth: '32px' }}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span
                    className="shrink-0 px-1 py-0.5 text-[9px] uppercase font-bold"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#555', borderLeft: '2px solid rgba(255,255,255,0.06)', minWidth: '50px', textAlign: 'center' }}
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

// ----- Visual Replay Component (fullscreen) -----

function VisualReplay({
  initialState,
  actionHistory,
  log,
  playerNames,
  backgroundUrl,
  game,
  defaultViewAs,
}: {
  initialState: GameState;
  actionHistory: Array<{ player: PlayerID; action: GameAction }>;
  log: ReplayLogEntry[];
  playerNames: { player1: string; player2: string };
  backgroundUrl?: string;
  game: GameData;
  defaultViewAs?: PlayerID;
}) {
  const tr = useTranslations('replay');
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const [currentStep, setCurrentStep] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [viewAs, setViewAs] = useState<PlayerID>(defaultViewAs ?? 'player1');
  const [previewCard, setPreviewCard] = useState<CharacterCard | MissionCard | null>(null);
  const [previewMissionContext, setPreviewMissionContext] = useState<{ rank: string; basePoints: number; rankBonus: number } | null>(null);

  const handleCardClick = useCallback((card: CharacterCard | MissionCard, missionCtx?: { rank: string; basePoints: number; rankBonus: number }) => {
    setPreviewCard(prev => (prev as CharacterCard | MissionCard | null)?.id === card.id ? null : card);
    setPreviewMissionContext(missionCtx ?? null);
  }, []);

  const states = useMemo(() => {
    resetIdCounter();

    const turn1Start: GameState = { ...initialState, phase: 'start' as GamePhase };
    const result: GameState[] = [turn1Start, initialState];
    let current = initialState;

    // Track instanceId mapping: original (from recording) → current (during replay)
    // This handles ID drift caused by deepClone regenerating IDs in applyAction.
    const idMap = new Map<string, string>();

    // Collect all character instanceIds from a state
    function collectCharIds(st: GameState): Set<string> {
      const ids = new Set<string>();
      for (const m of st.activeMissions) {
        for (const c of [...m.player1Characters, ...m.player2Characters]) {
          ids.add(c.instanceId);
        }
      }
      return ids;
    }

    // After each applyAction, detect new characters and update the ID map.
    // Compare previous and next mission characters to find newly added instanceIds.
    function updateIdMap(prev: GameState, next: GameState, origAction: GameAction) {
      const prevIds = collectCharIds(prev);
      const nextIds = collectCharIds(next);

      // Collect all new character instanceIds (in next but not in prev)
      const newCharIds: string[] = [];
      for (const id of nextIds) {
        if (!prevIds.has(id)) {
          newCharIds.push(id);
        }
      }

      // For each new character, register it in the idMap so future actions can
      // find characters by their current instanceId. This is critical for
      // PLAY_HIDDEN characters whose IDs are generated by generateInstanceId()
      // during applyAction — subsequent REVEAL_CHARACTER actions reference
      // these IDs and need them to be tracked.
      for (const newId of newCharIds) {
        // Map newId -> newId (self-mapping) so mapId() recognizes it as valid
        if (!idMap.has(newId)) {
          idMap.set(newId, newId);
        }
      }

      // Also map original action IDs to the new IDs when we can correlate them.
      // For PLAY_CHARACTER/PLAY_HIDDEN, the action doesn't carry the resulting
      // instanceId, but when there's exactly one new character we can confidently
      // associate it with the action's intent.
      if (
        (origAction.type === 'PLAY_CHARACTER' || origAction.type === 'PLAY_HIDDEN') &&
        newCharIds.length === 1
      ) {
        // Find the new character in the next state to get its details
        for (const m of next.activeMissions) {
          for (const c of [...m.player1Characters, ...m.player2Characters]) {
            if (c.instanceId === newCharIds[0]) {
              // Record mapping so future actions referencing this character work
              idMap.set(c.instanceId, c.instanceId);
              break;
            }
          }
        }
      }
    }

    // Remap an ID through the idMap, falling back to original if no mapping exists
    function mapId(id: string): string {
      return idMap.get(id) ?? id;
    }

    function remapAction(action: GameAction, state: GameState): GameAction {
      if (action.type === 'SELECT_TARGET') {
        const origId = action.pendingActionId;
        // Try direct match first, then mapped match
        let pending = state.pendingActions.find((p) => p.id === origId);
        let remapped = action;
        if (!pending && state.pendingActions.length > 0) {
          // Try to match by type similarity — find the first pending with matching sourceEffectId type
          pending = state.pendingActions[0];
          remapped = { ...remapped, pendingActionId: pending.id };
        }
        // Remap selectedTargets: first try idMap, then fall back to valid options
        if (pending && remapped.selectedTargets.length > 0) {
          const validOptions = new Set(pending.options);
          const mappedTargets = remapped.selectedTargets.map((t) => {
            if (validOptions.has(t)) return t;
            const mapped = mapId(t);
            if (validOptions.has(mapped)) return mapped;
            return t;
          });
          remapped = { ...remapped, selectedTargets: mappedTargets };
          // If still not valid, fall back to first available option
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
          // Try mapped ID first, then original
          const found = allChars.find((c) => c.instanceId === mappedId) || allChars.find((c) => c.instanceId === origId);
          if (found) {
            return { ...action, characterInstanceId: found.instanceId };
          }
          // Fall back to first hidden character owned by active player
          const playerChars = state.activePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
          const hiddenChars = playerChars.filter((c) => c.isHidden);
          if (hiddenChars.length > 0) {
            // Map the original ID to the found hidden char for future actions
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
        // Remap selectedEffectId to matching pending effect in replay state
        const origId = action.selectedEffectId;
        const found = state.pendingEffects.find((e) => e.id === origId);
        if (!found && state.pendingEffects.length > 0) {
          // Fall back to first unresolved pending effect
          return { ...action, selectedEffectId: state.pendingEffects[0].id };
        }
        return action;
      }
      return action;
    }

    // Auto-resolve a single pending action/effect — returns new state or null if stuck
    function autoResolvePending(st: GameState): GameState | null {
      // Handle simultaneous effects from different source cards — auto-pick first
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

        // Detect CONFIRM popups: optional effects with exactly 1 valid target.
        // In the real game, players almost always confirm these.
        // Auto-CONFIRM (select the single target) instead of declining to preserve effects.
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
            // Try selecting first valid option (covers both mandatory and optional with targets)
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
        // Force-remove if engine can't handle it
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

    // Main replay loop
    for (const { player, action } of actionHistory) {
      const prevTurn = current.turn;
      const counterBefore = getIdCounter();
      const remappedAction = remapAction(action, current);
      try {
        const next = GameEngine.applyAction(current, player, remappedAction);
        // Detect stalled SELECT_TARGET — compare pending IDs not just count
        if (remappedAction.type === 'SELECT_TARGET' && current.pendingActions.length > 0) {
          const prevPendingIds = current.pendingActions.map((p) => p.id).join(',');
          const nextPendingIds = next.pendingActions.map((p) => p.id).join(',');
          if (prevPendingIds === nextPendingIds && next.phase === current.phase) {
            // The target selection didn't resolve — auto-resolve the stuck pending instead
            setIdCounter(counterBefore);
            const resolved = autoResolvePending(current);
            if (resolved) {
              current = resolved;
              result.push(current);
            }
            continue;
          }
        }
        // Track ID changes between states
        updateIdMap(current, next, action);
        current = next;
      } catch {
        setIdCounter(counterBefore);
        // If we have stuck pending state, auto-resolve it before continuing
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

    // Recovery loop — advance state to gameOver after actionHistory is exhausted
    let recovery = 0;
    while (current.phase !== 'gameOver' && recovery < 500) {
      let advanced: GameState | null = null;
      try {
        // Clear orphan pending effects (no matching pending actions)
        if (current.pendingEffects.length > 0 && current.pendingActions.length === 0) {
          current = { ...current, pendingEffects: [] };
        }

        // Handle pending actions in ANY phase
        if (current.pendingActions.length > 0) {
          advanced = autoResolvePending(current);
        } else if (current.phase === 'action') {
          // No pending actions — need to advance past action phase
          if (!current.player1.hasPassed || !current.player2.hasPassed) {
            // Force-pass whoever hasn't passed
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
            // Both passed — transition to mission phase
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
              } catch {
                // Force transition to mission phase
                advanced = {
                  ...current,
                  phase: 'mission' as GamePhase,
                  pendingActions: [],
                  pendingEffects: [],
                  missionScoredThisTurn: false,
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
        // Last-resort force-advance
        if (current.phase === 'action') {
          advanced = {
            ...current,
            phase: 'mission' as GamePhase,
            pendingActions: [],
            pendingEffects: [],
            missionScoredThisTurn: false,
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

    // Last resort: if still not at gameOver, force it
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
      onClick={() => previewCard && setPreviewCard(null)}
    >
      {/* Background overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: backgroundUrl ? 'rgba(0, 0, 0, 0.35)' : 'transparent' }}
      />

      {/* Top-left: back + share + log buttons */}
      <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
        <Link
          href="/"
          className="px-3 py-1 text-[10px] font-medium"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: 'rgba(10, 10, 18, 0.88)',
            backdropFilter: 'blur(12px)',
            borderLeft: '3px solid rgba(255,255,255,0.15)',
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
            borderLeft: showLog ? '3px solid rgba(196,163,90,0.6)' : '3px solid rgba(255,255,255,0.08)',
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
            borderLeft: '3px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
            {tr('switchPerspective', { player: playerNames[viewAs === 'player1' ? 'player2' : 'player1'] })}
          </span>
        </button>
      </div>

      {/* Top-right: score overlay — only show at end of replay */}
      {currentStep >= states.length - 1 && (
        <div className="absolute top-2 right-2 z-30">
          <ScoreOverlay game={game} playerNames={playerNames} />
        </div>
      )}

      {/* Board fills everything above controls */}
      <div className="flex-1 min-h-0 relative z-10">
        <ReplayBoard state={currentState} playerNames={playerNames} locale={locale} backgroundUrl={backgroundUrl} viewAs={viewAs} onCardClick={handleCardClick} />
      </div>

      {/* Playback controls docked at bottom */}
      <div className="shrink-0 relative z-20">
        <PlaybackControls
          currentStep={currentStep}
          totalSteps={states.length}
          onStepChange={handleStepChange}
          turnStarts={turnStarts}
          actionLabel={actionLabel}
        />
      </div>

      {/* Card preview panel (right side) */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed z-40"
            style={{ right: '16px', top: '60px', width: '280px', maxHeight: 'calc(100vh - 80px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ReplayCardPreview
              card={previewCard}
              missionContext={previewMissionContext}
              onClose={() => setPreviewCard(null)}
              locale={locale}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log side panel */}
      <AnimatePresence>
        {showLog && <TextTimeline log={log} playerNames={playerNames} onClose={() => setShowLog(false)} currentStep={currentStep} states={states} />}
      </AnimatePresence>
    </div>
  );
}

// ----- Text-only Replay (fallback, also fullscreen) -----

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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1e1e28' }}>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-1 text-[10px]"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: '#141414',
              borderLeft: '3px solid rgba(255,255,255,0.15)',
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

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={isPlaying ? stopAutoPlay : () => { setVisibleCount(0); setIsPlaying(true); }}
          className="px-3 py-1 text-[10px] font-bold cursor-pointer"
          style={{
            transform: 'skewX(-3deg)',
            backgroundColor: isPlaying ? 'rgba(179,62,62,0.1)' : 'rgba(62,139,62,0.1)',
            borderLeft: isPlaying ? '3px solid rgba(179,62,62,0.5)' : '3px solid rgba(62,139,62,0.5)',
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
            borderLeft: '2px solid rgba(255,255,255,0.08)',
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
            borderLeft: selectedTurn === null ? '3px solid #c4a35a' : '3px solid rgba(255,255,255,0.08)',
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
              borderLeft: selectedTurn === turn ? '3px solid #c4a35a' : '3px solid rgba(255,255,255,0.08)',
              fontFamily: "'NJNaruto', Arial, sans-serif",
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>T{turn}</span>
          </button>
        ))}
      </div>

      {/* Log entries */}
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
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#555', borderLeft: '2px solid rgba(255,255,255,0.06)', minWidth: '50px', textAlign: 'center' }}
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

// ----- Main Page -----

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
            borderLeft: '3px solid rgba(255,255,255,0.15)',
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
            borderLeft: '3px solid rgba(255,255,255,0.15)',
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

  // Auto-detect which player the viewer is
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
