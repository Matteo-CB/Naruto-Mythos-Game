'use client';

import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type { GameLogEntry, GamePhase } from '@/lib/engine/types';

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

function LogEntry({ entry, formatPhase, playerDisplayNames }: {
  entry: GameLogEntry;
  formatPhase: (phase: GamePhase) => string;
  playerDisplayNames: { player1: string; player2: string };
}) {
  const t = useTranslations();
  const playerColor = entry.player === 'player1' ? '#c4a35a' : '#b33e3e';
  const displayName = entry.player ? playerDisplayNames[entry.player] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2 px-3 py-1.5 text-xs"
      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
    >
      <span className="shrink-0 tabular-nums" style={{ color: '#555555' }}>
        {formatTimestamp(entry.timestamp)}
      </span>
      <span
        className="shrink-0 rounded px-1 py-0.5 text-[10px] uppercase font-medium"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          color: '#777777',
        }}
      >
        T{entry.turn} {formatPhase(entry.phase)}
      </span>
      {entry.player && (
        <span className="shrink-0 font-medium" style={{ color: playerColor }}>
          {displayName}
        </span>
      )}
      <span className="font-body" style={{ color: '#e0e0e0' }}>
        {entry.messageKey ? t(entry.messageKey, entry.messageParams ?? {}) : (entry.details || entry.action)}
      </span>
    </motion.div>
  );
}

export function GameLog() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const showGameLog = useUIStore((s) => s.showGameLog);
  const toggleGameLog = useUIStore((s) => s.toggleGameLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  const log = visibleState?.log ?? [];

  const formatPhase = (phase: GamePhase): string => {
    const key = phaseTranslationKeys[phase];
    return key ? t(key) : phase;
  };

  useEffect(() => {
    if (scrollRef.current && showGameLog) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log.length, showGameLog]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={toggleGameLog}
        className="fixed bottom-4 right-4 z-40 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer"
        style={{
          backgroundColor: 'rgba(10, 10, 14, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(8px)',
          color: '#888888',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
        }}
      >
        {showGameLog ? t('common.cancel') : t('game.log.title')}
      </button>

      {/* Log panel */}
      <AnimatePresence>
        {showGameLog && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 z-30 h-full flex flex-col"
            style={{
              width: '340px',
              backgroundColor: 'rgba(8, 8, 12, 0.92)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <span
                className="text-sm font-medium uppercase tracking-wider"
                style={{ color: '#e0e0e0' }}
              >
                {t('game.log.title')}
              </span>
              <button
                onClick={toggleGameLog}
                className="text-xs px-2 py-1 rounded-md cursor-pointer"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#888888',
                }}
              >
                {t('common.cancel')}
              </button>
            </div>

            {/* Entries */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto"
            >
              {log.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-sm" style={{ color: '#555555' }}>
                    {t('game.log.empty')}
                  </span>
                </div>
              ) : (
                log.map((entry, i) => (
                  <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} formatPhase={formatPhase} playerDisplayNames={playerDisplayNames} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
