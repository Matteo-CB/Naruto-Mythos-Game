'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { PlayerID } from '@/lib/engine/types';
import { useBoardPalette } from './BoardPaletteContext';

interface EdgeTokenProps {
  holder: PlayerID;
  myPlayer: PlayerID;
  lockedFor?: PlayerID | null;
}

export function EdgeToken({ holder, myPlayer, lockedFor = null }: EdgeTokenProps) {
  const t = useTranslations();
  const palette = useBoardPalette();
  const isPlayerHolding = holder === myPlayer;
  const accentColor = isPlayerHolding ? palette.me.primary : palette.opponent.primary;
  const isLocked = lockedFor != null && lockedFor === holder;

  return (
    <div data-anchor="edge" className="flex flex-col items-center gap-1">
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: '#888888' }}
      >
        {t('game.edge')}
      </span>
      <motion.div
        layout
        className="flex items-center justify-center"
        style={{
          width: '36px',
          height: '36px',
          transform: 'rotate(45deg)',
          backgroundColor: accentColor,
          border: isLocked ? '2px solid rgba(255, 255, 255, 0.5)' : '2px solid rgba(255, 255, 255, 0.1)',
        }}
        animate={
          isLocked
            ? { boxShadow: [
                `0 0 10px ${accentColor}80, 0 2px 8px rgba(0,0,0,0.3)`,
                `0 0 26px ${accentColor}, 0 0 6px #ffffffcc, 0 2px 8px rgba(0,0,0,0.3)`,
                `0 0 10px ${accentColor}80, 0 2px 8px rgba(0,0,0,0.3)`,
              ] }
            : { boxShadow: `0 0 16px ${accentColor}80, 0 2px 8px rgba(0, 0, 0, 0.3)` }
        }
        transition={
          isLocked
            ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 200, damping: 20 }
        }
      >
        <motion.span
          className="text-xs font-bold"
          style={{
            color: '#0a0a0a',
            transform: 'rotate(-45deg)',
          }}
          animate={{ opacity: isLocked ? [0.85, 1, 0.85] : [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: isLocked ? 1.1 : 2 }}
        >
          E
        </motion.span>
      </motion.div>
      <motion.span
        key={holder}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs"
        style={{ color: accentColor }}
      >
        {isPlayerHolding ? t('game.you') : t('game.opponent')}
      </motion.span>
      {isLocked && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          className="text-[10px] uppercase tracking-widest"
          style={{ color: accentColor }}
        >
          {t('game.edgeLocked')}
        </motion.span>
      )}
    </div>
  );
}
