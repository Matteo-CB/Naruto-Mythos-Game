'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import dynamic from 'next/dynamic';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
const TrainingCoachPanel = dynamic(
  () => import('@/components/game/TrainingCoachPanel').then((mod) => mod.TrainingCoachPanel),
  { ssr: false },
);
import { BanNotification } from '@/components/BanNotification';

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

function OpponentDisconnectBanner({ deadline }: { deadline: number | null }) {
  const t = useTranslations('game');
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const mins = Math.floor(left / 60000);
      const secs = Math.floor((left % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 text-center py-2.5 text-xs font-medium"
      style={{ backgroundColor: 'rgba(196, 163, 90, 0.95)', color: '#0a0a0a' }}
    >
      {t('opponentDisconnected', { time: remaining })}
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();
  const t = useTranslations('common');
  const tGame = useTranslations('game');
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
  const isSpectating = useSocketStore((s) => s.isSpectating);

  // For AI games, gameState must exist; for online/spectator, visibleState must exist
  const hasActiveGame = gameState || (isOnlineGame && visibleState) || isSpectating;

  // Delay redirect to give Zustand time to propagate state from startOnlineGame
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasActiveGame) {
      // Give a brief delay before redirecting - state may be propagating
      redirectTimerRef.current = setTimeout(() => {
        const gs = useGameStore.getState();
        const ss = useSocketStore.getState();
        if (!gs.visibleState && !gs.gameState && !ss.isSpectating) {
          router.push('/');
        }
      }, 5000);
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [hasActiveGame, router]);

  // Clean up spectator state when unmounting (e.g., navigating back to lobby)
  useEffect(() => {
    return () => {
      const ss = useSocketStore.getState();
      if (ss.isSpectating) {
        ss.leaveSpectating();
        useGameStore.setState({ visibleState: null, gameState: null });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When spectator clicks "Leave", isSpectating goes false — navigate + clear gameStore
  const prevSpectatingRef = useRef(isSpectating);
  useEffect(() => {
    if (prevSpectatingRef.current && !isSpectating) {
      // Just left spectating — clear gameStore and redirect
      useGameStore.setState({ visibleState: null, gameState: null });
      router.push('/play/online');
    }
    prevSpectatingRef.current = isSpectating;
  }, [isSpectating, router]);

  // Sync spectator state to gameStore — runs on mount AND on every socket update
  const syncSpectatorState = useCallback(() => {
    const socketState = useSocketStore.getState();
    if (socketState.isSpectating && socketState.visibleState) {
      useGameStore.setState({
        gameState: null,
        visibleState: socketState.visibleState,
        humanPlayer: 'player1',
        isOnlineGame: false,
        isAIGame: false,
        isHotseatGame: false,
        isSandboxMode: false,
        gameOver: false,
        isProcessing: false,
        playerDisplayNames: socketState.playerNames ? {
          player1: socketState.playerNames.player1,
          player2: socketState.playerNames.player2,
        } : { player1: 'Player 1', player2: 'Player 2' },
      });
    }
  }, []);

  // Sync on reactive state change
  useEffect(() => {
    syncSpectatorState();
  }, [isSpectating, socketVisibleState, syncSpectatorState]);

  // Also subscribe to socket store for spectator updates (catches state that arrived before mount)
  useEffect(() => {
    if (!isSpectating) return;
    const unsub = useSocketStore.subscribe((state) => {
      if (state.isSpectating && state.visibleState) {
        syncSpectatorState();
      }
    });
    return unsub;
  }, [isSpectating, syncSpectatorState]);

  // Spectator error — clean up and redirect home
  useEffect(() => {
    if (!isSpectating || !socketError) return;
    useSocketStore.getState().leaveSpectating();
    const timer = setTimeout(() => router.push('/'), 1000);
    return () => clearTimeout(timer);
  }, [isSpectating, socketError, router]);

  // Spectator fallback: if we somehow land here without state, keep requesting
  const spectateRetryRef = useRef(0);
  useEffect(() => {
    if (!isSpectating || visibleState) {
      spectateRetryRef.current = 0;
      return;
    }
    if (socketVisibleState) {
      syncSpectatorState();
      return;
    }
    // Request state from server every 2s (the online page should have waited,
    // but handle edge cases like page refresh during spectating)
    const timer = setTimeout(() => {
      spectateRetryRef.current += 1;
      if (spectateRetryRef.current > 15) {
        // After 30s, give up
        useSocketStore.getState().leaveSpectating();
        router.push('/');
        return;
      }
      useSocketStore.getState().requestSpectateState();
    }, spectateRetryRef.current === 0 ? 300 : 2000);
    return () => clearTimeout(timer);
  }, [isSpectating, visibleState, socketVisibleState, router, syncSpectatorState]);

  // Sync socket state updates to gameStore for online games (NOT spectators)
  useEffect(() => {
    if (isOnlineGame && socketGameStarted && socketVisibleState && !isSpectating) {
      console.log('[GamePage] Syncing socket state to gameStore, phase:', socketVisibleState.phase,
        'hand:', socketVisibleState.myState?.hand?.length ?? 0);
      updateOnlineState(socketVisibleState);
    }
  }, [isOnlineGame, socketGameStarted, socketVisibleState, updateOnlineState, isSpectating]);

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
      // Force state resync after error so board shows correct state
      const sock = useSocketStore.getState().socket;
      if (sock) sock.emit('game:request-state');
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
  const opponentDisconnected = useSocketStore((s) => s.opponentDisconnected);
  const opponentDisconnectDeadline = useSocketStore((s) => s.opponentDisconnectDeadline);

  if (!hasActiveGame) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888]">{t('loading')}</p>
      </div>
    );
  }

  // Spectator joined but state hasn't synced to gameStore yet — show loading
  if (isSpectating && !visibleState) {
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
      <BanNotification />
      {showConnectionLost && (
        <div
          className="fixed top-0 left-0 right-0 z-50 text-center py-2 text-xs font-medium"
          style={{
            backgroundColor: 'rgba(179, 62, 62, 0.9)',
            color: '#e0e0e0',
          }}
        >
          {socketErrorKey ? tGame(socketErrorKey.replace('game.', '')) : socketError || tGame('error.connectionLost')}
        </div>
      )}
      {isOnlineGame && opponentDisconnected && (
        <OpponentDisconnectBanner deadline={opponentDisconnectDeadline} />
      )}
    </>
  );
}
