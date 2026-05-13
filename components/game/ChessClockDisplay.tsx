'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
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
      animate: { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] },
      transition: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' },
    };
  }
  if (remainingMs <= RED_AT_MS) {
    return {
      animate: { scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] },
      transition: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
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

export const ChessClockDisplay = React.memo(function ChessClockDisplay({ player, isOpponent }: ChessClockDisplayProps) {
  const chessClock = useSocketStore((s) => s.chessClock);
  const { isMobile } = useGameScale();
  const [remaining, setRemaining] = useState<number>(() => computeChessClockRemainingMs(chessClock, player));
  const playedWarningSoundRef = useRef<boolean>(false);
  const urgentLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!chessClock) {
      setRemaining(0);
      return;
    }
    const update = () => {
      setRemaining(computeChessClockRemainingMs(chessClock, player));
    };
    update();
    const id = setInterval(update, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [chessClock, player]);

  useEffect(() => {
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
        playSound('clockWarning');
      }
      return;
    }
    if (urgentLoopRef.current) return;
    playSound('clockUrgent');
    urgentLoopRef.current = setInterval(() => {
      playSound('clockUrgent');
    }, 1000);
  }, [chessClock?.active, player, remaining]);

  useEffect(() => () => {
    if (urgentLoopRef.current) clearInterval(urgentLoopRef.current);
  }, []);

  if (!chessClock) return null;

  const isActive = chessClock.active === player;
  const idleWarningUsed = chessClock[player].idleWarningUsed;
  const color = colorForRemaining(remaining, isOpponent);
  const pulse = pulseAnimForRemaining(remaining);

  const padX = isMobile ? 6 : 8;
  const padY = isMobile ? 2 : 3;
  const fontSize = isMobile ? 12 : 14;
  const labelFont = isMobile ? 8 : 9;
  const minW = isMobile ? 50 : 64;

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderLeft: isActive
      ? '2px solid #c4a35a'
      : '2px solid rgba(255, 255, 255, 0.08)',
    boxShadow: isActive ? '0 0 8px rgba(196, 163, 90, 0.7)' : 'none',
    padding: `${padY}px ${padX}px`,
    minWidth: minW,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  const labelStyle: React.CSSProperties = {
    color: '#666666',
    fontSize: labelFont,
    letterSpacing: '0.05em',
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
      <span style={labelStyle}>{isMobile ? '' : 'TIME'}</span>
      {pulse ? (
        <motion.span style={valueStyle} animate={pulse.animate} transition={pulse.transition}>
          {formatRemaining(remaining)}
        </motion.span>
      ) : (
        <span style={valueStyle}>{formatRemaining(remaining)}</span>
      )}
      {idleWarningUsed && (
        <span
          title="Idle warning used"
          aria-label="idle-warning-used"
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
