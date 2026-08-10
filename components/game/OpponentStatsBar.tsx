'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { ChessClockDisplay } from '@/components/game/ChessClockDisplay';
import { useGameScale } from './GameScaleContext';
import { CountryFlag } from '@/components/CountryFlag';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { usePlayerFlag } from '@/lib/hooks/usePlayerFlags';
import { useSettingsStore } from '@/stores/settingsStore';
import { ManualGuess } from './ManualGuess';
import { useBoardPalette } from './BoardPaletteContext';
import { ChakraIcon, CHAKRA_COLOR } from '@/components/icons/GameIcons';

export const OpponentStatsBar = React.memo(function OpponentStatsBar() {
  const t = useTranslations();
  const dims = useGameScale();
  const opponent = useBoardPalette().opponent;
  const manualPowerMode = useSettingsStore((s) => s.manualPowerMode);
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const oppPlayerId = visibleState ? (visibleState.myPlayer === 'player1' ? 'player2' : 'player1') : null;
  const flagCode = usePlayerFlag(oppPlayerId ? playerDisplayNames[oppPlayerId] : null);

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
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);

  return (
    <div
      className="font-display flex items-center gap-2 px-3 py-1 w-full"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.85)',
      }}
    >

      <span className="font-semibold shrink-0 flex items-center gap-1.5" style={{ fontSize: dims.isMobile ? '14px' : '12px', color: opponent.primary }}>
        <CountryFlag code={flagCode} size={dims.isMobile ? 16 : 14} />
        <PlayerNameLink username={opponentName} newTab disabled={!isOnlineGame} />
      </span>

      <div className="flex items-center gap-1 shrink-0" title={t('game.edge')}>
        <div
          style={{
            width: dims.isMobile ? 10 : 8,
            height: dims.isMobile ? 10 : 8,
            transform: 'rotate(45deg)',
            backgroundColor: hasEdge ? opponent.primary : 'rgba(255, 255, 255, 0.1)',
            boxShadow: hasEdge ? `0 0 6px ${opponent.tint(0.6)}` : 'none',
          }}
        />
        <span style={{ fontSize: dims.isMobile ? '12px' : '10px', color: hasEdge ? opponent.primary : '#555555' }}>
          {t('game.board.edge')}
        </span>
      </div>

      {isOpponentTurn && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="px-1.5 py-0.5 shrink-0"
          style={{
            fontSize: dims.isMobile ? '12px' : '10px',
            backgroundColor: opponent.tint(0.16),
            color: opponent.primary,
          }}
        >
          {t('game.opponentTurn')}
        </motion.span>
      )}

      <div className="flex-1" />

      <StatPill
        label={t('game.chakra')}
        icon={<ChakraIcon size={dims.isMobile ? 14 : 12} color={CHAKRA_COLOR} style={{ verticalAlign: 'middle', marginRight: '3px' }} />}
        value={opponentState.chakra}
        color={opponent.primary}
        isMobile={dims.isMobile}
        manual={manualPowerMode}
      />

      <StatPill label={t('game.score')} value={opponentState.missionPoints} color="#e0e0e0" isMobile={dims.isMobile} manual={manualPowerMode} />

      <ChessClockDisplay player={opponentPlayer} isOpponent={true} />
    </div>
  );
});

function StatPill({ label, value, color, isMobile, manual, icon }: { label: string; value: number; color: string; isMobile?: boolean; manual?: boolean; icon?: React.ReactNode }) {
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
        {icon}
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
        {manual ? <ManualGuess actual={value} color={color} /> : value}
      </motion.span>
    </div>
  );
}
