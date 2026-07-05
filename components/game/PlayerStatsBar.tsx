'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { ChessClockDisplay } from '@/components/game/ChessClockDisplay';
import { useGameScale } from './GameScaleContext';
import { CountryFlag } from '@/components/CountryFlag';
import { usePlayerFlag } from '@/lib/hooks/usePlayerFlags';

export const PlayerStatsBar = React.memo(function PlayerStatsBar() {
  const t = useTranslations();
  const dims = useGameScale();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const myPlayerId = visibleState?.myPlayer;
  const flagCode = usePlayerFlag(myPlayerId ? playerDisplayNames[myPlayerId] : null);

  if (!visibleState) return null;

  const {
    turn,
    phase,
    edgeHolder,
    myPlayer,
    myState,
  } = visibleState;

  const hasEdge = edgeHolder === myPlayer;
  const playerName = myPlayer === 'player1' ? playerDisplayNames.player1 : playerDisplayNames.player2;

  const phaseKeys: Record<string, string> = {
    setup: 'game.phase.start',
    mulligan: 'game.phase.mulligan',
    start: 'game.phase.start',
    action: 'game.phase.action',
    mission: 'game.phase.mission',
    end: 'game.phase.end',
    gameOver: 'game.phase.gameOver',
  };

  return (
    <div
      className="font-display flex items-center gap-2 px-3 py-1 w-full"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.85)',
      }}
    >
      
      <span className="font-semibold shrink-0 flex items-center gap-1.5" style={{ fontSize: dims.isMobile ? '14px' : '12px', color: '#c4a35a' }}>
        <CountryFlag code={flagCode} size={dims.isMobile ? 16 : 14} />
        {playerName}
      </span>

      <div className="flex items-center gap-1 shrink-0" title={t('game.edge')}>
        <div
          style={{
            width: dims.isMobile ? 10 : 8,
            height: dims.isMobile ? 10 : 8,
            transform: 'rotate(45deg)',
            backgroundColor: hasEdge ? '#c4a35a' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: hasEdge ? '0 0 6px rgba(196, 163, 90, 0.6)' : 'none',
          }}
        />
        <span style={{ fontSize: dims.isMobile ? '12px' : '10px', color: hasEdge ? '#c4a35a' : '#555555' }}>
          {t('game.edge')}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span style={{ fontSize: dims.isMobile ? '12px' : '10px', color: '#888888' }}>
          {t('game.turnLabel')}
        </span>
        <span className="font-bold tabular-nums" style={{ fontSize: dims.isMobile ? '15px' : '12px', color: '#c4a35a' }}>
          {turn}
        </span>
        <span style={{ fontSize: dims.isMobile ? '12px' : '10px', color: '#555555' }}>/4</span>
        <span
          className="px-1.5 py-0.5"
          style={{
            fontSize: dims.isMobile ? '12px' : '10px',
            backgroundColor: 'rgba(196, 163, 90, 0.12)',
            color: '#c4a35a',
          }}
        >
          {phaseKeys[phase] ? t(phaseKeys[phase]) : phase}
        </span>
      </div>

      <div className="flex-1" />

      <StatPill label={t('game.chakra')} value={myState.chakra} color="#c4a35a" isMobile={dims.isMobile} />

      <StatPill label={t('game.score')} value={myState.missionPoints} color="#e0e0e0" accent="#c4a35a" isMobile={dims.isMobile} />

      <ChessClockDisplay player={myPlayer} isOpponent={false} />
    </div>
  );
});

function StatPill({ label, value, color, isMobile }: { label: string; value: number; color: string; accent?: string; isMobile?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 sm:gap-2 px-1.5 sm:px-2 shrink-0">
      <span
        className="uppercase font-bold whitespace-nowrap"
        style={{
          color: '#666666',
          letterSpacing: '0.22em',
          fontSize: isMobile ? '11px' : 'clamp(8px, 1vw, 10px)',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <motion.span
        key={value}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="tabular-nums font-bold leading-none"
        style={{
          color,
          fontSize: isMobile ? '20px' : 'clamp(14px, 1.6vw, 18px)',
          letterSpacing: '-0.01em',
          textShadow: `0 1px 3px rgba(0,0,0,0.8), 0 0 10px ${color}55`,
        }}
      >
        {value}
      </motion.span>
    </div>
  );
}
