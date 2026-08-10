'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import GameBoard from '@/components/game/GameBoard';
import { GameScaleProvider } from '@/components/game/GameScaleContext';
import { postTileMessage } from '@/lib/spectate/tileMessages';

export default function SpectateTilePage() {
  const params = useParams();
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode : '';
  const t = useTranslations('spectator');
  const { data: session, status } = useSession();

  const connect = useSocketStore((s) => s.connect);
  const connected = useSocketStore((s) => s.connected);
  const spectateGame = useSocketStore((s) => s.spectateGame);
  const leaveSpectating = useSocketStore((s) => s.leaveSpectating);
  const isSpectating = useSocketStore((s) => s.isSpectating);
  const socketVisibleState = useSocketStore((s) => s.visibleState);
  const spectateErrorKey = useSocketStore((s) => s.spectateErrorKey);

  const [joined, setJoined] = useState(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    if (!connected) {
      connect(session.user.id, session.user.name ?? 'Spectator');
    }
  }, [status, session, connected, connect]);

  useEffect(() => {
    if (!connected || joinedRef.current || !roomCode) return;
    if (!session?.user?.id) return;
    joinedRef.current = true;
    setJoined(true);
    spectateGame(roomCode, session.user.id, session.user.name ?? 'Spectator');
  }, [connected, roomCode, session, spectateGame]);

  useEffect(() => () => {
    if (joinedRef.current) leaveSpectating();
    useGameStore.getState().resetGame();
  }, [leaveSpectating]);

  const syncBoard = useCallback(() => {
    const socketState = useSocketStore.getState();
    if (!socketState.isSpectating || !socketState.visibleState) return;
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
      playerDisplayNames: socketState.playerNames
        ? { player1: socketState.playerNames.player1, player2: socketState.playerNames.player2 }
        : { player1: 'Player 1', player2: 'Player 2' },
    });
  }, []);

  useEffect(() => {
    syncBoard();
    const unsub = useSocketStore.subscribe(() => syncBoard());
    return unsub;
  }, [socketVisibleState, syncBoard]);

  useEffect(() => {
    if (!spectateErrorKey) return;
    postTileMessage({ kind: 'error', roomCode, errorKey: spectateErrorKey });
  }, [spectateErrorKey, roomCode]);

  useEffect(() => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;
    const onEnded = (data: { roomCode?: string }) => {
      if (data?.roomCode && data.roomCode !== roomCode) return;
      postTileMessage({ kind: 'ended', roomCode });
    };
    socket.on('spectate:match-ended', onEnded);
    return () => { socket.off('spectate:match-ended', onEnded); };
  }, [roomCode, connected]);

  if (status === 'loading') {
    return <TileMessage text={t('loading')} />;
  }

  if (status !== 'authenticated') {
    return <TileMessage text={t('signInToWatch')} />;
  }

  if (spectateErrorKey) {
    const key = spectateErrorKey.replace('spectate.', '');
    return <TileMessage text={t.has(key) ? t(key) : t('errorNotFound')} />;
  }

  if (!joined || !isSpectating || !socketVisibleState) {
    return <TileMessage text={t('connecting')} />;
  }

  return (
    <GameScaleProvider>
      <GameBoard />
    </GameScaleProvider>
  );
}

function TileMessage({ text }: { text: string }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a] px-4 text-center">
      <p className="text-[13px] tracking-[0.08em] text-[#8a8a8a]">{text}</p>
    </div>
  );
}
