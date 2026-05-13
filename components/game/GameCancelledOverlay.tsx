'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';

interface GameCancelledOverlayProps {
  onAcknowledge: () => void;
}

export const GameCancelledOverlay = React.memo(function GameCancelledOverlay({ onAcknowledge }: GameCancelledOverlayProps) {
  const t = useTranslations('game.end');
  const gameCancelled = useSocketStore((s) => s.gameCancelled);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (gameCancelled && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [gameCancelled]);

  useEffect(() => {
    if (!gameCancelled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onAcknowledge();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameCancelled, onAcknowledge]);

  if (!gameCancelled) return null;

  const message =
    gameCancelled.reason === 'mulligan-idle'
      ? t('cancelledMulliganIdle')
      : t('cancelledGeneric');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="game-cancelled"
    >
      <motion.div
        initial={{ scale: 0.92, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          backgroundColor: '#0a0a0a',
          border: '2px solid #c4a35a',
          padding: '28px 32px',
          maxWidth: 460,
          width: '100%',
          color: '#e8e8e8',
        }}
      >
        <div
          style={{
            color: '#c4a35a',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {t('cancelledTitle')}
        </div>
        <div style={{ fontSize: 16, marginTop: 12, lineHeight: 1.4 }}>{message}</div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            ref={buttonRef}
            type="button"
            onClick={onAcknowledge}
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.12)',
              border: '1px solid #c4a35a',
              color: '#c4a35a',
              padding: '8px 18px',
              fontSize: 13,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('cancelledAcknowledge')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});
