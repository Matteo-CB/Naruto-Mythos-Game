'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSocketStore, computeChessClockRemainingMs } from '@/lib/socket/client';
import { useGameScale } from '@/components/game/GameScaleContext';
import { playSound } from '@/lib/sound/SoundManager';

interface ChessClockDisplayProps {
  player: 'player1' | 'player2';
  isOpponent: boolean;
}

const ORANGE_AT_MS = 60_000;
const RED_AT_MS = 30_000;
const HARD_RED_AT_MS = 10_000;
const TICK_INTERVAL_MS = 100;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mm = m < 10 ? `${m}` : `${m}`;
  return `${mm}:${s.toString().padStart(2, '0')}`;
}

function colorForRemaining(remainingMs: number, isOpponent: boolean): string {
  if (remainingMs <= HARD_RED_AT_MS) return '#b33e3e';
  if (remainingMs <= RED_AT_MS) return '#b33e3e';
  if (remainingMs <= ORANGE_AT_MS) return '#cc7a30';
  return isOpponent ? '#cccccc' : '#e0e0e0';
}

interface PulseSpec {
  animate: { scale?: number[]; opacity?: number[] };
  transition: { duration: number; repeat: number; ease: 'easeInOut' };
}

function pulseAnimForRemaining(remainingMs: number): PulseSpec | null {
  if (remainingMs <= HARD_RED_AT_MS) {
    return {
      animate: { scale: [1, 1.18, 1], opacity: [0.8, 1, 0.8] },
      transition: { duration: 0.45, repeat: Infinity, ease: 'easeInOut' },
    };
  }
  if (remainingMs <= RED_AT_MS) {
    return {
      animate: { scale: [1, 1.1, 1], opacity: [0.85, 1, 0.85] },
      transition: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' },
    };
  }
  if (remainingMs <= ORANGE_AT_MS) {
    return {
      animate: { opacity: [0.85, 1, 0.85] },
      transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
    };
  }
  return null;
}

function lowTimeEmphasis(remainingMs: number): { glow: string; bg: string | null; sizeBoost: number } {
  if (remainingMs <= HARD_RED_AT_MS) {
    return { glow: '0 0 20px rgba(179,62,62,0.7), 0 0 6px rgba(179,62,62,0.5)', bg: 'rgba(179,62,62,0.2)', sizeBoost: 5 };
  }
  if (remainingMs <= RED_AT_MS) {
    return { glow: '0 0 14px rgba(179,62,62,0.5)', bg: 'rgba(179,62,62,0.14)', sizeBoost: 3 };
  }
  if (remainingMs <= ORANGE_AT_MS) {
    return { glow: 'none', bg: 'rgba(204,122,48,0.12)', sizeBoost: 0 };
  }
  return { glow: 'none', bg: null, sizeBoost: 0 };
}

export const ChessClockDisplay = React.memo(function ChessClockDisplay({ player, isOpponent }: ChessClockDisplayProps) {
  const t = useTranslations('game.clock');
  const chessClock = useSocketStore((s) => s.chessClock);
  const playerRole = useSocketStore((s) => s.playerRole);
  const { isMobile } = useGameScale();
  const [remaining, setRemaining] = useState<number>(() => computeChessClockRemainingMs(chessClock, player));
  const playedWarningSoundRef = useRef<boolean>(false);
  const urgentLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const soundsEnabledForThisInstance = playerRole === player;

  useEffect(() => {
    if (!chessClock) {
      setRemaining(0);
      return;
    }
    const update = () => {
      const ms = computeChessClockRemainingMs(chessClock, player);
      setRemaining((prev) => {
        const sameSecond = Math.ceil(ms / 1000) === Math.ceil(prev / 1000);
        const sameTier =
          (ms <= HARD_RED_AT_MS) === (prev <= HARD_RED_AT_MS) &&
          (ms <= RED_AT_MS) === (prev <= RED_AT_MS) &&
          (ms <= ORANGE_AT_MS) === (prev <= ORANGE_AT_MS);
        return sameSecond && sameTier ? prev : ms;
      });
    };
    update();
    const id = setInterval(update, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [chessClock, player]);

  useEffect(() => {
    if (!soundsEnabledForThisInstance) {
      playedWarningSoundRef.current = false;
      if (urgentLoopRef.current) {
        clearInterval(urgentLoopRef.current);
        urgentLoopRef.current = null;
      }
      return;
    }
    const isActive = chessClock?.active === player;
    if (!isActive) {
      playedWarningSoundRef.current = false;
      if (urgentLoopRef.current) {
        clearInterval(urgentLoopRef.current);
        urgentLoopRef.current = null;
      }
      return;
    }
    if (remaining > RED_AT_MS) {
      playedWarningSoundRef.current = false;
      if (urgentLoopRef.current) {
        clearInterval(urgentLoopRef.current);
        urgentLoopRef.current = null;
      }
      return;
    }
    if (remaining > HARD_RED_AT_MS) {
      if (urgentLoopRef.current) {
        clearInterval(urgentLoopRef.current);
        urgentLoopRef.current = null;
      }
      if (!playedWarningSoundRef.current) {
        playedWarningSoundRef.current = true;
        playSound('roomJoin');
      }
      return;
    }
    if (urgentLoopRef.current) return;
    playSound('clockUrgent');
    urgentLoopRef.current = setInterval(() => {
      playSound('clockUrgent');
    }, 1000);
  }, [chessClock?.active, player, remaining, soundsEnabledForThisInstance]);

  useEffect(() => () => {
    if (urgentLoopRef.current) clearInterval(urgentLoopRef.current);
  }, []);

  if (!chessClock) return null;

  const isActive = chessClock.active === player;
  const idleWarningUsed = chessClock[player].idleWarningUsed;
  const color = colorForRemaining(remaining, isOpponent);
  const pulse = pulseAnimForRemaining(remaining);
  const emphasis = lowTimeEmphasis(remaining);

  const padX = isMobile ? 6 : 8;
  const padY = isMobile ? 2 : 3;
  const fontSize = (isMobile ? 13 : 14) + emphasis.sizeBoost;
  const minW = isMobile ? 56 : 68;

  const containerStyle: React.CSSProperties = {
    backgroundColor: emphasis.bg ?? (isActive ? 'rgba(196, 163, 90, 0.10)' : 'transparent'),
    boxShadow: emphasis.glow,
    padding: `${padY}px ${padX}px`,
    minWidth: minW,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };

  const valueStyle: React.CSSProperties = {
    color,
    fontSize,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  };

  return (
    <div style={containerStyle} aria-label={isActive ? 'chess-clock-active' : 'chess-clock'}>
      {pulse ? (
        <motion.span style={valueStyle} animate={pulse.animate} transition={pulse.transition}>
          {formatRemaining(remaining)}
        </motion.span>
      ) : (
        <span style={valueStyle}>{formatRemaining(remaining)}</span>
      )}
      {idleWarningUsed && (
        <span
          aria-label="idle-warning-used"
          title={t('firstWarningUsed')}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            backgroundColor: '#b33e3e',
            transform: 'rotate(45deg)',
            marginLeft: 2,
          }}
        />
      )}
    </div>
  );
});

export const __ChessClockTestables = {
  formatRemaining,
  colorForRemaining,
  pulseAnimForRemaining,
  ORANGE_AT_MS,
  RED_AT_MS,
  HARD_RED_AT_MS,
};
