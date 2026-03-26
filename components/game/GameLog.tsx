'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSocketStore } from '@/lib/socket/client';
import type { GameLogEntry, GamePhase } from '@/lib/engine/types';

/**
 * When locale is 'en', swap _en variants into base keys for i18n interpolation.
 * E.g. { card: 'NARUTO UZUMAKI', card_en: 'NARUTO UZUMAKI', title: 'Jeune Ninja', title_en: 'Young Ninja' }
 * becomes { card: 'NARUTO UZUMAKI', title: 'Young Ninja', ... } in English.
 */
function localizeParams(
  params: Record<string, string | number> | undefined,
  locale: string,
): Record<string, string | number> | undefined {
  if (!params || locale !== 'en') return params;
  const result = { ...params };
  const enSuffix = '_en';
  for (const key of Object.keys(result)) {
    if (key.endsWith(enSuffix)) {
      const baseKey = key.slice(0, -enSuffix.length);
      if (baseKey in result) {
        result[baseKey] = result[key];
      }
    }
  }
  return result;
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

const LogEntry = React.memo(function LogEntry({ entry, formatPhase, playerDisplayNames, locale }: {
  entry: GameLogEntry;
  formatPhase: (phase: GamePhase) => string;
  playerDisplayNames: { player1: string; player2: string };
  locale: string;
}) {
  const t = useTranslations();
  const playerColor = entry.player === 'player1' ? '#c4a35a' : '#b33e3e';
  const displayName = entry.player ? playerDisplayNames[entry.player] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2 px-3 py-1.5 text-xs font-body"
      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}
    >
      <span className="shrink-0 tabular-nums" style={{ color: '#555555' }}>
        {formatTimestamp(entry.timestamp)}
      </span>
      <span
        className="shrink-0 px-1 py-0.5 text-[10px] uppercase font-medium"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          color: '#777777',
          borderLeft: '2px solid rgba(196, 163, 90, 0.2)',
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
        {entry.messageKey ? t(entry.messageKey, localizeParams(entry.messageParams, locale) ?? {}) : (entry.details || entry.action)}
      </span>
    </motion.div>
  );
});

export function GameLog() {
  const t = useTranslations();
  const locale = useLocale();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const showGameLog = useUIStore((s) => s.showGameLog);
  const toggleGameLog = useUIStore((s) => s.toggleGameLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSpectating = useSocketStore((s) => s.isSpectating);

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
      {!showGameLog && (
        <button
          onClick={toggleGameLog}
          className={`fixed ${isSpectating ? 'top-16' : 'top-10'} right-4 z-40 px-3 py-2 text-xs font-medium cursor-pointer uppercase tracking-wider`}
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.9)',
            borderLeft: '3px solid rgba(196, 163, 90, 0.3)',
            color: '#888888',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
        >
          {t('game.log.title')}
        </button>
      )}

      {/* Log panel */}
      <AnimatePresence>
        {showGameLog && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed ${isSpectating ? 'top-9' : 'top-7'} right-0 z-30 flex flex-col`}
            style={{
              height: isSpectating ? 'calc(100% - 36px)' : 'calc(100% - 56px)',
              width: '320px',
              backgroundColor: 'rgba(8, 8, 12, 0.97)',
              borderLeft: '3px solid rgba(196, 163, 90, 0.15)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <span
                className="text-sm font-medium uppercase tracking-wider"
                style={{ color: '#c4a35a' }}
              >
                {t('game.log.title')}
              </span>
              <button
                onClick={toggleGameLog}
                className="text-xs px-3 py-1 cursor-pointer uppercase tracking-wider font-bold"
                style={{
                  backgroundColor: 'rgba(179, 62, 62, 0.15)',
                  border: 'none',
                  borderLeft: '2px solid rgba(179, 62, 62, 0.4)',
                  color: '#b33e3e',
                }}
              >
                X
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
                  <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} formatPhase={formatPhase} playerDisplayNames={playerDisplayNames} locale={locale} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
