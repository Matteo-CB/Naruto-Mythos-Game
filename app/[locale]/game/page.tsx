'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import dynamic from 'next/dynamic';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { ScaledGameRoot } from '@/components/game/ScaledGameRoot';
import { GameScaleProvider } from '@/components/game/GameScaleContext';
import { IdleWarningToast } from '@/components/game/IdleWarningToast';
import { GameCancelledOverlay } from '@/components/game/GameCancelledOverlay';

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
      setIsMobile((touch && (w < 1024 || h < 600)) || h < 500);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return isMobile;
}
const TrainingCoachPanel = dynamic(
  () => import('@/components/game/TrainingCoachPanel').then((mod) => mod.TrainingCoachPanel),
  { ssr: false },
);
import { BanNotification } from '@/components/BanNotification';

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

const RESYNC_LABEL_KEY = 'connection.resyncing';

function OpponentDisconnectBanner() {
  const t = useTranslations('game');
  const forfeitAt = useSocketStore((s) => s.opponentForfeitAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!forfeitAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [forfeitAt]);

  let label = t('opponentDisconnectedShort');
  if (forfeitAt) {
    const totalSec = Math.max(0, Math.ceil((forfeitAt - now) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    label = t('opponentDisconnectedCountdown', { time: `${m}:${s.toString().padStart(2, '0')}` });
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 text-center py-2.5 text-xs font-medium tabular-nums pointer-events-none"
      style={{ backgroundColor: 'rgba(196, 163, 90, 0.95)', color: '#0a0a0a' }}
    >
      {label}
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();
  const t = useTranslations('common');
  const tGame = useTranslations('game');
  const isMobileViewport = useIsMobileViewport();
  const gameState = useGameStore((s) => s.gameState);
  const visibleState = useGameStore((s) => s.visibleState);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const updateOnlineState = useGameStore((s) => s.updateOnlineState);
  const endOnlineGame = useGameStore((s) => s.endOnlineGame);

  const socketVisibleState = useSocketStore((s) => s.visibleState);
  const socketGameStarted = useSocketStore((s) => s.gameStarted);
  const socketGameEnded = useSocketStore((s) => s.gameEnded);
  const socketGameResult = useSocketStore((s) => s.gameResult);
  const socketGameCancelled = useSocketStore((s) => s.gameCancelled);
  const socketConnected = useSocketStore((s) => s.connected);
  const socketError = useSocketStore((s) => s.error);
  const socketErrorKey = useSocketStore((s) => s.errorKey);
  const socketErrorParams = useSocketStore((s) => s.errorParams);
  const socketClearError = useSocketStore((s) => s.clearError);
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const socketPlayerRole = useSocketStore((s) => s.playerRole);
  const socketPlayerNames = useSocketStore((s) => s.playerNames);
  const connectionPhase = useSocketStore((s) => s.connectionPhase);
  const startOnlineGame = useGameStore((s) => s.startOnlineGame);

  const hasActiveGame = gameState || (isOnlineGame && visibleState) || isSpectating;

  const adoptedOnlineGameRef = useRef(false);
  useEffect(() => {
    if (isOnlineGame || isSpectating || gameState) return;
    if (adoptedOnlineGameRef.current) return;
    if (!socketGameStarted || !socketVisibleState || !socketPlayerRole || !socketPlayerNames) return;
    adoptedOnlineGameRef.current = true;
    const myName = socketPlayerRole === 'player1' ? socketPlayerNames.player1 : socketPlayerNames.player2;
    const oppName = socketPlayerRole === 'player1' ? socketPlayerNames.player2 : socketPlayerNames.player1;
    startOnlineGame(socketVisibleState, socketPlayerRole, myName, oppName);
  }, [isOnlineGame, isSpectating, gameState, socketGameStarted, socketVisibleState, socketPlayerRole, socketPlayerNames, startOnlineGame]);

  const acknowledgeGameCancelled = useCallback(() => {
    useSocketStore.setState({ gameCancelled: null });
    useGameStore.setState({ gameState: null, visibleState: null, gameOver: false, isOnlineGame: false });
    router.push('/play/online');
  }, [router]);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasActiveGame) {
      
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

  useEffect(() => {
    return () => {
      const ss = useSocketStore.getState();
      if (ss.isSpectating) {
        ss.leaveSpectating();
        useGameStore.setState({ visibleState: null, gameState: null });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevSpectatingRef = useRef(isSpectating);
  useEffect(() => {
    if (prevSpectatingRef.current && !isSpectating) {
      
      useGameStore.setState({ visibleState: null, gameState: null });
      router.push('/play/online');
    }
    prevSpectatingRef.current = isSpectating;
  }, [isSpectating, router]);

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

  useEffect(() => {
    syncSpectatorState();
  }, [isSpectating, socketVisibleState, syncSpectatorState]);

  useEffect(() => {
    if (!isSpectating) return;
    const unsub = useSocketStore.subscribe((state) => {
      if (state.isSpectating && state.visibleState) {
        syncSpectatorState();
      }
    });
    return unsub;
  }, [isSpectating, syncSpectatorState]);

  useEffect(() => {
    if (!isSpectating || !socketError) return;
    useSocketStore.getState().leaveSpectating();
    const timer = setTimeout(() => router.push('/'), 1000);
    return () => clearTimeout(timer);
  }, [isSpectating, socketError, router]);

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

    const timer = setTimeout(() => {
      spectateRetryRef.current += 1;
      if (spectateRetryRef.current > 15) {
        
        useSocketStore.getState().leaveSpectating();
        router.push('/');
        return;
      }
      useSocketStore.getState().requestSpectateState();
    }, spectateRetryRef.current === 0 ? 300 : 2000);
    return () => clearTimeout(timer);
  }, [isSpectating, visibleState, socketVisibleState, router, syncSpectatorState]);

  useEffect(() => {
    if (isOnlineGame && socketGameStarted && socketVisibleState && !isSpectating) {
      console.log('[GamePage] Syncing socket state to gameStore, phase:', socketVisibleState.phase,
        'hand:', socketVisibleState.myState?.hand?.length ?? 0);
      updateOnlineState(socketVisibleState);
    }
  }, [isOnlineGame, socketGameStarted, socketVisibleState, updateOnlineState, isSpectating]);

  useEffect(() => {
    if (isOnlineGame && socketGameEnded && socketGameResult) {
      endOnlineGame(socketGameResult.winner);
    }
  }, [isOnlineGame, socketGameEnded, socketGameResult, endOnlineGame]);

  const rematchRoomCode = useSocketStore((s) => s.rematchRoomCode);
  useEffect(() => {
    if (!rematchRoomCode) return;
    const ss = useSocketStore.getState();
    const sealed = ss.isSealedRoom;
    const evolving = ss.currentRoomGameMode === 'evolving';
    useSocketStore.setState({ rematchRoomCode: null, rematchState: 'none' });
    useGameStore.setState({
      gameState: null,
      visibleState: null,
      isOnlineGame: false,
      isProcessing: false,
      gameOver: false,
      winner: null,
      replayInitialState: null,
      animationQueue: [],
      isAnimating: false,
      pendingTargetSelection: null,
      actionError: null,
      sealedDeckCardIds: null,
      sealedDeckMissionIds: null,
    });
    router.push((sealed ? '/play/sealed' : evolving ? '/play/online?mode=evolving' : '/play/online') as '/play/online');
  }, [rematchRoomCode, router]);

  useEffect(() => {
    if (isOnlineGame && socketError) {
      useGameStore.setState({
        actionError: socketError,
        actionErrorKey: socketErrorKey,
        actionErrorParams: socketErrorParams,
        isProcessing: false,
      });
      socketClearError();
      
      const sock = useSocketStore.getState().socket;
      if (sock) sock.emit('game:request-state');
      
      const timer = setTimeout(() => {
        const store = useGameStore.getState();
        if (store.actionError) {
          useGameStore.setState({ actionError: null, actionErrorKey: null, actionErrorParams: null });
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnlineGame, socketError, socketErrorKey, socketErrorParams, socketClearError]);

  const showConnectionLost = isOnlineGame && !socketConnected && hasActiveGame;
  const showResyncing = isOnlineGame && socketConnected && !!hasActiveGame && connectionPhase === 'resyncing';
  const rejoinErrorSuffix = socketErrorKey && socketErrorKey.startsWith('game.error.rejoin')
    ? socketErrorKey.replace('game.', '')
    : null;
  const resyncLabel = rejoinErrorSuffix && tGame.has(rejoinErrorSuffix)
    ? tGame(rejoinErrorSuffix)
    : t.has(RESYNC_LABEL_KEY) ? t(RESYNC_LABEL_KEY) : t('connection.reconnecting');
  const opponentDisconnected = useSocketStore((s) => s.opponentDisconnected);

  if (!hasActiveGame) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888]">{t('loading')}</p>
      </div>
    );
  }

  if (isSpectating && !visibleState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888]">{t('loading')}</p>
      </div>
    );
  }

  return (
    <>
      {isMobileViewport ? (
        <ScaledGameRoot>
          <GameBoard />
        </ScaledGameRoot>
      ) : (
        <GameScaleProvider>
          <GameBoard />
        </GameScaleProvider>
      )}
      <TrainingCoachPanel />
      <LandscapeBlocker />
      <BanNotification />
      {showConnectionLost && (
        <div
          className="fixed top-0 left-0 right-0 z-50 text-center py-2 text-xs font-medium pointer-events-none"
          style={{
            backgroundColor: 'rgba(179, 62, 62, 0.9)',
            color: '#e0e0e0',
          }}
        >
          {socketErrorKey && tGame.has(socketErrorKey.replace('game.', ''))
            ? tGame(socketErrorKey.replace('game.', ''))
            : socketError || tGame('error.connectionLost')}
        </div>
      )}
      {showResyncing && !showConnectionLost && (
        <div
          className="fixed top-0 left-0 right-0 z-50 text-center py-2 text-xs font-medium pointer-events-none"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.9)',
            color: '#0a0a0a',
          }}
        >
          {resyncLabel}
        </div>
      )}
      {isOnlineGame && opponentDisconnected && (
        <OpponentDisconnectBanner />
      )}
      {isOnlineGame && <IdleWarningToast />}
      {isOnlineGame && socketGameCancelled && (
        <GameCancelledOverlay onAcknowledge={acknowledgeGameCancelled} />
      )}
    </>
  );
}
