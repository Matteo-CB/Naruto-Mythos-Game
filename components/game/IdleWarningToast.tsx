'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocketStore, computeChessClockIdleMs } from '@/lib/socket/client';

const TICK_INTERVAL_MS = 250;

export const IdleWarningToast = React.memo(function IdleWarningToast() {
  const t = useTranslations('game.clock');
  const chessClock = useSocketStore((s) => s.chessClock);
  const playerRole = useSocketStore((s) => s.playerRole);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  let shouldShow = false;
  let countdown = '';
  let warningUsed = false;

  if (chessClock && playerRole && chessClock.active === playerRole) {
    const idleMs = computeChessClockIdleMs(chessClock, playerRole, now);
    if (idleMs >= chessClock.idleToastAtMs) {
      shouldShow = true;
      const remainingMs = Math.max(0, chessClock.idleLimitMs - idleMs);
      const seconds = Math.ceil(remainingMs / 1000);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      countdown = `${m}:${s.toString().padStart(2, '0')}`;
      warningUsed = chessClock[playerRole].idleWarningUsed;
    }
  }

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="idle-warning-toast"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9000,
            pointerEvents: 'none',
            backgroundColor: 'rgba(179, 62, 62, 0.18)',
            padding: '10px 16px',
            color: '#e0e0e0',
            fontSize: 13,
            letterSpacing: '0.02em',
            maxWidth: 420,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          }}
          role="alert"
        >
          <div style={{ fontWeight: 700, color: '#b33e3e', fontSize: 11, letterSpacing: '0.08em' }}>
            {warningUsed ? t('idleSecondTitle') : t('idleWarningTitle')}
          </div>
          <div style={{ marginTop: 4 }}>
            {warningUsed
              ? t('idleSecondMessage', { seconds: countdown })
              : t('idleWarningMessage', { seconds: countdown })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
