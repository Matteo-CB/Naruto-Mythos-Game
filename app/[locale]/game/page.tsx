'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import dynamic from 'next/dynamic';
import { LandscapeBlocker } from '@/components/LandscapeBlocker';
import { ScaledGameRoot } from '@/components/game/ScaledGameRoot';
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

  
  const hasActiveGame = gameState || (isOnlineGame && visibleState) || isSpectating;

  
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
    const sealed = useSocketStore.getState().isSealedRoom;
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
    router.push(sealed ? '/play/sealed' : '/play/online');
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
  const opponentDisconnected = useSocketStore((s) => s.opponentDisconnected);
  const opponentDisconnectDeadline = useSocketStore((s) => s.opponentDisconnectDeadline);

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
      <ScaledGameRoot>
        <GameBoard />
      </ScaledGameRoot>
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
