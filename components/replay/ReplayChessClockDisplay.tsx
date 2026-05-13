'use client';

import React from 'react';
import type { ChessClockState } from '@/lib/timing/chessClock';
import { snapshotForBroadcast } from '@/lib/timing/chessClock';

interface ReplayChessClockDisplayProps {
  snapshot: ChessClockState | null;
  player: 'player1' | 'player2';
  isOpponent: boolean;
}

const ORANGE_AT_MS = 60_000;
const RED_AT_MS = 30_000;
const HARD_RED_AT_MS = 10_000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function colorForRemaining(remainingMs: number, isOpponent: boolean): string {
  if (remainingMs <= HARD_RED_AT_MS) return '#b33e3e';
  if (remainingMs <= RED_AT_MS) return '#b33e3e';
  if (remainingMs <= ORANGE_AT_MS) return '#cc7a30';
  return isOpponent ? '#cccccc' : '#e0e0e0';
}

export const ReplayChessClockDisplay = React.memo(function ReplayChessClockDisplay({
  snapshot,
  player,
  isOpponent,
}: ReplayChessClockDisplayProps) {
  if (!snapshot) return null;

  const anchorNow = snapshot.activeStartedAt ?? 0;
  const snap = snapshotForBroadcast(snapshot, anchorNow);
  const remaining = Math.max(0, snap[player].remainingMs);
  const isActive = snapshot.active === player;
  const idleWarningUsed = snapshot[player].idleWarningUsed;
  const color = colorForRemaining(remaining, isOpponent);

  return (
    <div
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderLeft: isActive ? '2px solid #c4a35a' : '2px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isActive ? '0 0 6px rgba(196, 163, 90, 0.55)' : 'none',
        padding: '2px 7px',
        minWidth: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
      aria-label={isActive ? 'replay-chess-clock-active' : 'replay-chess-clock'}
    >
      <span
        style={{
          color,
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {formatRemaining(remaining)}
      </span>
      {idleWarningUsed && (
        <span
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

export const __ReplayChessClockTestables = {
  formatRemaining,
  colorForRemaining,
  ORANGE_AT_MS,
  RED_AT_MS,
  HARD_RED_AT_MS,
};
