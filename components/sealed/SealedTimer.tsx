'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface SealedTimerProps {
  totalSeconds: number; // 900 for 15 min
  onTimeUp: () => void;
  paused?: boolean;
}

// Web Audio API beep generator
function playBeep(frequency: number, duration: number, volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;

    // Fade out
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch {
    // Audio not available
  }
}

function playAlertSound(level: 'info' | 'warning' | 'critical') {
  switch (level) {
    case 'info':
      playBeep(660, 0.3, 0.15);
      break;
    case 'warning':
      playBeep(880, 0.4, 0.25);
      setTimeout(() => playBeep(880, 0.4, 0.25), 500);
      break;
    case 'critical':
      playBeep(1100, 0.3, 0.35);
      setTimeout(() => playBeep(1100, 0.3, 0.35), 300);
      setTimeout(() => playBeep(1100, 0.3, 0.35), 600);
      break;
  }
}

export function SealedTimer({ totalSeconds, onTimeUp, paused = false }: SealedTimerProps) {
  const t = useTranslations('sealed');
  const [remaining, setRemaining] = useState(totalSeconds);
  const alertedRef = useRef<Set<number>>(new Set());
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (paused || remaining <= 0) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          onTimeUpRef.current();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [paused, remaining]);

  // Sound alerts at specific times
  const checkAlerts = useCallback(() => {
    const alerts: Array<{ time: number; level: 'info' | 'warning' | 'critical' }> = [
      { time: 600, level: 'info' },     // 10:00
      { time: 300, level: 'warning' },   // 5:00
      { time: 60, level: 'critical' },   // 1:00
    ];

    for (const alert of alerts) {
      if (remaining === alert.time && !alertedRef.current.has(alert.time)) {
        alertedRef.current.add(alert.time);
        playAlertSound(alert.level);
      }
    }
  }, [remaining]);

  useEffect(() => {
    checkAlerts();
  }, [checkAlerts]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const isWarning = remaining <= 300 && remaining > 60;
  const isCritical = remaining <= 60;
  const isExpired = remaining <= 0;

  const textColor = isExpired
    ? '#b33e3e'
    : isCritical
      ? '#ff4444'
      : isWarning
        ? '#e67e22'
        : '#e0e0e0';

  return (
    <motion.div
      className="flex items-center gap-2"
      animate={isCritical && !isExpired ? { scale: [1, 1.05, 1] } : {}}
      transition={isCritical ? { duration: 1, repeat: Infinity } : {}}
    >
      <span
        className="text-2xl font-bold tabular-nums tracking-wider"
        style={{ color: textColor }}
      >
        {isExpired ? t('timeExpired') : timeStr}
      </span>
      {isWarning && !isCritical && (
        <span className="text-xs font-medium" style={{ color: '#e67e22' }}>
          {t('timeWarning')}
        </span>
      )}
      {isCritical && !isExpired && (
        <motion.span
          className="text-xs font-medium"
          style={{ color: '#ff4444' }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        >
          {t('timeCritical')}
        </motion.span>
      )}
    </motion.div>
  );
}
