'use client';

import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { useGameScale } from './GameScaleContext';

export function SpectatorBanner() {
  const t = useTranslations('spectator');
  const dims = useGameScale();
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const playerNames = useSocketStore((s) => s.playerNames);
  const spectatorCount = useSocketStore((s) => s.spectatorCount);
  const leaveSpectating = useSocketStore((s) => s.leaveSpectating);

  if (!isSpectating) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-1.5 px-3"
      style={{
        backgroundColor: 'rgba(17, 17, 17, 0.95)',
        borderBottom: '1px solid rgba(196, 163, 90, 0.2)',
      }}
    >
      <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: '#c4a35a' }}>
        {t('banner')}
      </span>

      {playerNames && (
        <span className="text-[11px]" style={{ color: '#e0e0e0' }}>
          {playerNames.player1}
          <span className="mx-1.5 text-[9px]" style={{ color: '#555' }}>{t('vs')}</span>
          {playerNames.player2}
        </span>
      )}

      <span className="text-[9px]" style={{ color: '#666' }}>
        {t('spectators', { count: spectatorCount })}
      </span>

      <button
        onClick={leaveSpectating}
        className="text-[9px] uppercase font-bold px-2 py-0.5 cursor-pointer ml-2"
        style={{
          backgroundColor: 'rgba(179, 62, 62, 0.1)',
          border: '1px solid rgba(179, 62, 62, 0.3)',
          color: '#b33e3e',
        }}
      >
        {t('leaveSpectate')}
      </button>
    </div>
  );
}

export function SpectatorCount() {
  const t = useTranslations('spectator');
  const spectatorCount = useSocketStore((s) => s.spectatorCount);
  const isOnlineGame = useGameStore_isOnline();

  if (!isOnlineGame || spectatorCount === 0) return null;

  return (
    <span className="text-[9px] px-1.5 py-0.5" style={{
      backgroundColor: 'rgba(196,163,90,0.08)',
      border: '1px solid rgba(196,163,90,0.15)',
      color: '#c4a35a',
    }}>
      {t('spectators', { count: spectatorCount })}
    </span>
  );
}

function useGameStore_isOnline() {
  // Avoid circular import — inline selector
  try {
    const { useGameStore } = require('@/stores/gameStore');
    return useGameStore((s: { isOnlineGame: boolean }) => s.isOnlineGame);
  } catch {
    return false;
  }
}
