'use client';

import { useEffect } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import dynamic from 'next/dynamic';

// Dynamically import GameBoard to avoid SSR issues with Framer Motion
const GameBoard = dynamic(
  () => import('@/components/game/GameBoard').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888] text-lg">...</p>
      </div>
    ),
  },
);

export default function GamePage() {
  const router = useRouter();
  const t = useTranslations('common');
  const gameState = useGameStore((s) => s.gameState);
  const visibleState = useGameStore((s) => s.visibleState);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const updateOnlineState = useGameStore((s) => s.updateOnlineState);
  const endOnlineGame = useGameStore((s) => s.endOnlineGame);

  // Socket state for online game syncing
  const socketVisibleState = useSocketStore((s) => s.visibleState);
  const socketGameStarted = useSocketStore((s) => s.gameStarted);
  const socketGameEnded = useSocketStore((s) => s.gameEnded);
  const socketGameResult = useSocketStore((s) => s.gameResult);

  // For AI games, gameState must exist; for online games, visibleState must exist
  const hasActiveGame = gameState || (isOnlineGame && visibleState);

  useEffect(() => {
    if (!hasActiveGame) {
      router.push('/');
    }
  }, [hasActiveGame, router]);

  // Sync socket state updates to gameStore for online games
  useEffect(() => {
    if (isOnlineGame && socketGameStarted && socketVisibleState) {
      updateOnlineState(socketVisibleState);
    }
  }, [isOnlineGame, socketGameStarted, socketVisibleState, updateOnlineState]);

  // Handle game ended for online games
  useEffect(() => {
    if (isOnlineGame && socketGameEnded && socketGameResult) {
      endOnlineGame(socketGameResult.winner);
    }
  }, [isOnlineGame, socketGameEnded, socketGameResult, endOnlineGame]);

  if (!hasActiveGame) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888]">{t('loading')}</p>
      </div>
    );
  }

  return <GameBoard />;
}
