'use client';

import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { useGameScale } from './GameScaleContext';
import { HoloSurface } from '@/components/HoloSurface';

export function SpectatorBanner() {
  const t = useTranslations('spectator');
  const dims = useGameScale();
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const playerNames = useSocketStore((s) => s.playerNames);
  const spectatorCount = useSocketStore((s) => s.spectatorCount);
  const leaveSpectating = useSocketStore((s) => s.leaveSpectating);
  const isEvolving = useSocketStore((s) => s.currentRoomIsEvolving);
  const holoHue = useSocketStore((s) => s.currentRoomHoloHue);

  if (!isSpectating) return null;

  const inner = (
    <div
      className="flex items-center justify-center gap-2 py-1.5 px-2 sm:px-3 w-full flex-wrap"
      style={{
        backgroundColor: isEvolving ? 'rgba(10, 10, 14, 0.65)' : 'rgba(17, 17, 17, 0.95)',
        boxShadow: 'inset 0 -1px 0 rgba(196, 163, 90, 0.18)',
        position: 'relative',
        zIndex: 1,
        minHeight: 32,
      }}
    >
      <span className="text-[10px] uppercase font-bold tracking-wider shrink-0" style={{ color: '#c4a35a' }}>
        {t('banner')}
      </span>

      {isEvolving && (
        <span
          className="text-[9px] uppercase font-bold shrink-0"
          style={{ color: '#c4a35a', letterSpacing: '0.22em' }}
        >
          {t('evolvingTag')}
        </span>
      )}

      {playerNames && (
        <span className="text-[11px] truncate min-w-0 max-w-[50vw] sm:max-w-none" style={{ color: '#e0e0e0' }}>
          <PlayerNameLink username={playerNames.player1} newTab />
          <span className="mx-1.5 text-[9px]" style={{ color: '#555' }}>{t('vs')}</span>
          <PlayerNameLink username={playerNames.player2} newTab />
        </span>
      )}

      <span className="text-[9px] shrink-0 hidden xs:inline sm:inline" style={{ color: '#666' }}>
        {t('spectators', { count: spectatorCount })}
      </span>

      <button
        onClick={leaveSpectating}
        className="text-[9px] uppercase font-bold px-2 py-1 cursor-pointer no-select shrink-0"
        style={{
          backgroundColor: 'rgba(179, 62, 62, 0.1)',
          color: '#b33e3e',
          letterSpacing: '0.14em',
          minHeight: 28,
        }}
      >
        {t('leaveSpectate')}
      </button>
    </div>
  );

  if (isEvolving && holoHue != null) {
    return (
      <HoloSurface
        hue={holoHue}
        intensity="subtle"
        motion="idle"
        className="fixed top-0 left-0 right-0 z-50 overflow-hidden"
      >
        {inner}
      </HoloSurface>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {inner}
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
      color: '#c4a35a',
    }}>
      {t('spectators', { count: spectatorCount })}
    </span>
  );
}

function useGameStore_isOnline() {
  try {
    const { useGameStore } = require('@/stores/gameStore');
    return useGameStore((s: { isOnlineGame: boolean }) => s.isOnlineGame);
  } catch {
    return false;
  }
}
