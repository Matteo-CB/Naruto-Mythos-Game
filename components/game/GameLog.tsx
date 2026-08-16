'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSocketStore } from '@/lib/socket/client';
import type { GameLogEntry, GamePhase } from '@/lib/engine/types';
import { localizeMessageParams as localizeParams } from '@/lib/i18n/localizeMessageParams';
import { useGameScale } from './GameScaleContext';
import { useBoardPalette } from './BoardPaletteContext';

const EMPTY_LOG: GameLogEntry[] = [];

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

const LogEntry = React.memo(function LogEntry({ entry, formatPhase, playerDisplayNames, locale, isMobile, myPlayer }: {
  entry: GameLogEntry;
  formatPhase: (phase: GamePhase) => string;
  playerDisplayNames: { player1: string; player2: string };
  locale: string;
  isMobile: boolean;
  myPlayer: 'player1' | 'player2';
}) {
  const t = useTranslations();
  const palette = useBoardPalette();
  const playerColor = entry.player === myPlayer ? palette.me.primary : palette.opponent.primary;
  const displayName = entry.player ? playerDisplayNames[entry.player] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col gap-1.5 px-4 font-body ${isMobile ? 'py-2' : 'py-3'}`}
      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}
    >

      <div className="flex items-center gap-2.5 text-[11px]">
        <span
          className="shrink-0 px-1.5 py-0.5 uppercase font-bold"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.10)',
            color: '#888888',
            letterSpacing: '0.12em',
            fontSize: isMobile ? '10.5px' : '8.5px',
          }}
        >
          T{entry.turn} {formatPhase(entry.phase)}
        </span>
        {entry.player && (
          <span
            className="shrink-0 font-bold uppercase"
            style={{ color: playerColor, fontSize: isMobile ? '12px' : '10px', letterSpacing: '0.12em' }}
          >
            {displayName}
          </span>
        )}
      </div>

      <div
        className="leading-relaxed"
        style={{ fontSize: isMobile ? '15px' : '13px', color: '#e8e8e8', paddingLeft: 2 }}
      >
        {entry.messageKey ? t(entry.messageKey, localizeParams(entry.messageParams, locale) ?? {}) : (entry.details || entry.action)}
      </div>
    </motion.div>
  );
});

export function GameLog() {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const log = useGameStore((s) => s.visibleState?.log ?? EMPTY_LOG);
  const myPlayer = useGameStore((s) => s.visibleState?.myPlayer ?? 'player1');
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const showGameLog = useUIStore((s) => s.showGameLog);
  const toggleGameLog = useUIStore((s) => s.toggleGameLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);

  const baseTopPx = isSpectating ? 36 : 0;
  const sandboxOffsetPx = isSandboxMode ? 40 : 0;
  const statsBarPx = 44;
  const toggleTopPx = baseTopPx + sandboxOffsetPx + statsBarPx + 8;
  const panelTopPx = baseTopPx;

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
      
      {!showGameLog && (
        <button
          onClick={toggleGameLog}
          className={`fixed right-4 z-40 font-medium cursor-pointer uppercase tracking-wider ${dims.isMobile ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'}`}
          style={{
            top: toggleTopPx,
            backgroundColor: 'rgba(196, 163, 90, 0.10)',
            color: '#c4a35a',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
        >
          {t('game.log.title')}
        </button>
      )}

      <AnimatePresence>
        {showGameLog && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 z-30 flex flex-col"
            style={{
              top: panelTopPx,
              height: `calc(100% - ${panelTopPx}px)`,
              width: dims.isMobile ? 'min(420px, 55%)' : 'min(320px, calc(100vw - 8px))',
              backgroundColor: 'rgba(8, 8, 12, 0.97)',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
            }}
          >
            
            <div
              className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <button
                onClick={toggleGameLog}
                aria-label={t('common.close')}
                className={`cursor-pointer uppercase tracking-wider font-bold shrink-0 ${dims.isMobile ? 'text-sm px-4 py-1.5' : 'text-xs px-3 py-1'}`}
                style={{
                  backgroundColor: 'rgba(179, 62, 62, 0.18)',
                  border: 'none',
                  color: '#b33e3e',
                }}
              >
                X
              </button>
              <span
                className="text-sm font-medium uppercase tracking-wider"
                style={{ color: '#c4a35a' }}
              >
                {t('game.log.title')}
              </span>
            </div>

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
                log.slice(-120).map((entry, i) => (
                  <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} formatPhase={formatPhase} playerDisplayNames={playerDisplayNames} locale={locale} isMobile={dims.isMobile} myPlayer={myPlayer} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
