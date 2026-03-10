'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import dynamic from 'next/dynamic';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { TrainingCoachPanel } from '@/components/game/TrainingCoachPanel';

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
  const socketConnected = useSocketStore((s) => s.connected);
  const socketError = useSocketStore((s) => s.error);
  const socketErrorKey = useSocketStore((s) => s.errorKey);
  const socketErrorParams = useSocketStore((s) => s.errorParams);
  const socketClearError = useSocketStore((s) => s.clearError);

  // For AI games, gameState must exist; for online games, visibleState must exist
  const hasActiveGame = gameState || (isOnlineGame && visibleState);

  // Delay redirect to give Zustand time to propagate state from startOnlineGame
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasActiveGame) {
      // Give a brief delay before redirecting - state may be propagating
      redirectTimerRef.current = setTimeout(() => {
        if (!useGameStore.getState().visibleState && !useGameStore.getState().gameState) {
          router.push('/');
        }
      }, 500);
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [hasActiveGame, router]);

  // Sync socket state updates to gameStore for online games
  useEffect(() => {
    if (isOnlineGame && socketGameStarted && socketVisibleState) {
      console.log('[GamePage] Syncing socket state to gameStore, phase:', socketVisibleState.phase,
        'hand:', socketVisibleState.myState?.hand?.length ?? 0);
      updateOnlineState(socketVisibleState);
    }
  }, [isOnlineGame, socketGameStarted, socketVisibleState, updateOnlineState]);

  // Handle game ended for online games
  useEffect(() => {
    if (isOnlineGame && socketGameEnded && socketGameResult) {
      endOnlineGame(socketGameResult.winner);
    }
  }, [isOnlineGame, socketGameEnded, socketGameResult, endOnlineGame]);

  // Handle rematch restart - reset gameOver so the board shows again
  const rematchState = useSocketStore((s) => s.rematchState);
  const gameOver = useGameStore((s) => s.gameOver);
  useEffect(() => {
    if (isOnlineGame && rematchState === 'accepted' && gameOver) {
      useGameStore.setState({
        gameOver: false,
        winner: null,
        pendingTargetSelection: null,
        animationQueue: [],
        isAnimating: false,
        replayInitialState: null,
      });
      // Reset rematchState so this doesn't re-trigger
      useSocketStore.setState({ rematchState: 'none' });
    }
  }, [isOnlineGame, rematchState, gameOver]);

  // Bridge socket game:error to gameStore actionError for online games
  useEffect(() => {
    if (isOnlineGame && socketError) {
      useGameStore.setState({
        actionError: socketError,
        actionErrorKey: socketErrorKey,
        actionErrorParams: socketErrorParams,
        isProcessing: false,
      });
      socketClearError();
      // Auto-clear error after 4 seconds (same as AI mode)
      const timer = setTimeout(() => {
        const store = useGameStore.getState();
        if (store.actionError) {
          useGameStore.setState({ actionError: null, actionErrorKey: null, actionErrorParams: null });
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnlineGame, socketError, socketErrorKey, socketErrorParams, socketClearError]);

  // Show connection lost banner for online games
  const showConnectionLost = isOnlineGame && !socketConnected && hasActiveGame;

  if (!hasActiveGame) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888]">{t('loading')}</p>
      </div>
    );
  }

  return (
    <>
      <GameBoard />
      <TrainingCoachPanel />
      <LandscapeBlocker />
      {showConnectionLost && (
        <div
          className="fixed top-0 left-0 right-0 z-50 text-center py-2 text-xs font-medium"
          style={{
            backgroundColor: 'rgba(179, 62, 62, 0.9)',
            color: '#e0e0e0',
          }}
        >
          {socketErrorKey ? t(socketErrorKey) : socketError || t('game.error.connectionLost')}
        </div>
      )}
    </>
  );
}
