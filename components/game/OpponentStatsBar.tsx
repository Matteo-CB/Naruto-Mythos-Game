'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { ChessClockDisplay } from '@/components/game/ChessClockDisplay';

export const OpponentStatsBar = React.memo(function OpponentStatsBar() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);

  if (!visibleState) return null;

  const {
    edgeHolder,
    myPlayer,
    opponentState,
    activePlayer,
  } = visibleState;

  const opponentPlayer = myPlayer === 'player1' ? 'player2' : 'player1';
  const hasEdge = edgeHolder === opponentPlayer;
  const isOpponentTurn = activePlayer === opponentPlayer;
  const opponentName = opponentPlayer === 'player1' ? playerDisplayNames.player1 : playerDisplayNames.player2;

  return (
    <div
      className="font-display flex items-center gap-2 px-3 py-1 w-full"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.85)',
      }}
    >
      
      <span className="text-xs font-semibold shrink-0" style={{ color: '#b33e3e' }}>
        {opponentName}
      </span>

      <div className="flex items-center gap-1 shrink-0" title={t('game.edge')}>
        <div
          style={{
            width: 8,
            height: 8,
            transform: 'rotate(45deg)',
            backgroundColor: hasEdge ? '#b33e3e' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: hasEdge ? '0 0 6px rgba(179, 62, 62, 0.6)' : 'none',
          }}
        />
        <span className="text-[10px]" style={{ color: hasEdge ? '#b33e3e' : '#555555' }}>
          {t('game.board.edge')}
        </span>
      </div>

      {isOpponentTurn && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-[10px] px-1.5 py-0.5 shrink-0"
          style={{
            backgroundColor: 'rgba(179, 62, 62, 0.16)',
            color: '#b33e3e',
          }}
        >
          {t('game.opponentTurn')}
        </motion.span>
      )}

      <div className="flex-1" />

      <StatPill label={t('game.chakra')} value={opponentState.chakra} color="#b33e3e" />

      <StatPill label={t('game.score')} value={opponentState.missionPoints} color="#e0e0e0" accent="#b33e3e" />

      <ChessClockDisplay player={opponentPlayer} isOpponent={true} />
    </div>
  );
});

function StatPill({ label, value, color }: { label: string; value: number; color: string; accent?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 sm:gap-2 px-1.5 sm:px-2 shrink-0">
      <span
        className="uppercase font-bold whitespace-nowrap"
        style={{
          color: '#666666',
          letterSpacing: '0.22em',
          fontSize: 'clamp(8px, 1vw, 10px)',
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
          fontSize: 'clamp(14px, 1.6vw, 18px)',
          letterSpacing: '-0.01em',
          textShadow: `0 1px 3px rgba(0,0,0,0.8), 0 0 10px ${color}55`,
        }}
      >
        {value}
      </motion.span>
    </div>
  );
}
