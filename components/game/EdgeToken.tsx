'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { PlayerID } from '@/lib/engine/types';

interface EdgeTokenProps {
  holder: PlayerID;
  myPlayer: PlayerID;
}

export function EdgeToken({ holder, myPlayer }: EdgeTokenProps) {
  const t = useTranslations();
  const isPlayerHolding = holder === myPlayer;

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: '#888888' }}
      >
        {t('game.edge')}
      </span>
      <motion.div
        layout
        className="flex items-center justify-center rounded-full"
        style={{
          width: '42px',
          height: '42px',
          backgroundColor: isPlayerHolding ? '#c4a35a' : '#b33e3e',
          border: '2px solid rgba(255, 255, 255, 0.1)',
        }}
        animate={{
          boxShadow: isPlayerHolding
            ? '0 0 16px rgba(196, 163, 90, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 0 16px rgba(179, 62, 62, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <motion.span
          className="text-xs font-bold"
          style={{ color: '#0a0a0a' }}
          animate={{ rotate: isPlayerHolding ? 0 : 180 }}
          transition={{ duration: 0.6 }}
        >
          E
        </motion.span>
      </motion.div>
      <motion.span
        key={holder}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs"
        style={{ color: isPlayerHolding ? '#c4a35a' : '#b33e3e' }}
      >
        {isPlayerHolding ? t('game.you') : t('game.opponent')}
      </motion.span>
    </div>
  );
}
