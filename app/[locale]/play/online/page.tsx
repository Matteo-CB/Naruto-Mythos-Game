'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

type GameMode = 'casual' | 'ranked' | 'draft';
type View = 'browse' | 'private';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

export default function PlayOnlinePage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>('browse');
  const [selectedMode, setSelectedMode] = useState<GameMode>('casual');
  const [joinCode, setJoinCode] = useState('');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deckSelected, setDeckSelected] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);

  const {
    connected,
    roomCode,
    playerRole,
    opponentJoined,
    gameStarted,
    visibleState,
    error,
    publicRooms,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    selectDeck,
    requestRoomList,
    clearError,
  } = useSocketStore();

  const startOnlineGame = useGameStore((s) => s.startOnlineGame);

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const characters = mod.getPlayableCharacters();
      const missions = mod.getPlayableMissions();
      setCards({ characters, missions });
    });
  }, []);

  // Connect and request room list on mount
  const connectAndFetch = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      requestRoomList();
    } catch {
      // Error set in socket store
    }
  }, [session?.user?.id, connected, connect, requestRoomList]);

  useEffect(() => {
    if (session?.user?.id) {
      connectAndFetch();
    }
  }, [session?.user?.id, connectAndFetch]);

  useEffect(() => {
    return () => {
      if (!useSocketStore.getState().gameStarted) {
        disconnect();
      }
    };
  }, [disconnect]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // When game starts: initialize gameStore with online state and navigate to /game
  const playerNames = useSocketStore((s) => s.playerNames);
  const gameInitRef = useRef(false);
  useEffect(() => {
    if (gameStarted && visibleState && playerRole && !gameInitRef.current) {
      gameInitRef.current = true;
      const myName = session?.user?.name ?? undefined;
      const oppName = playerNames
        ? (playerRole === 'player1' ? playerNames.player2 : playerNames.player1)
        : undefined;
      startOnlineGame(visibleState, playerRole, myName, oppName);
      router.push('/game');
    }
  }, [gameStarted, visibleState, playerRole, startOnlineGame, router, session, playerNames]);

  // Auto-join room from match invite (via ?room= query param)
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && session?.user?.id && !connected) {
      connect(session.user.id);
      setView('private');
      setShowJoinInput(true);
      setJoinCode(roomParam);
    }
  }, [searchParams, session, connected, connect]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && connected && session?.user?.id && !roomCode) {
      joinRoom(roomParam, session.user.id);
    }
  }, [searchParams, connected, session, roomCode, joinRoom]);

  if (!session?.user) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen relative flex-col"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <CloudBackground />
        <DecorativeIcons />
        <CardBackgroundDecor variant="playOnline" />
        <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-6 max-w-md w-full text-center relative z-10">
          <h1
            className="text-2xl font-bold tracking-wider uppercase"
            style={{ color: '#c4a35a' }}
          >
            {t('online.title')}
          </h1>
          <p className="text-sm" style={{ color: '#888888' }}>
            {t('online.signInRequired')}
          </p>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
            >
              {t('common.signIn')}
            </Link>
            <Link
              href="/"
              className="px-6 py-2.5 text-sm"
              style={{
                backgroundColor: '#141414',
                border: '1px solid #262626',
                color: '#888888',
              }}
            >
              {t('common.back')}
            </Link>
          </div>
        </div>
        </div>
        <Footer />
      </main>
    );
  }

  const handleCreatePublicRoom = async () => {
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      const isDraft = selectedMode === 'draft';
      createRoom(session.user.id, false, selectedMode === 'ranked', isDraft, selectedMode, session.user.name ?? undefined);
    } catch {
      // Error set in socket store
    }
  };

  const handleCreatePrivateRoom = async () => {
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      createRoom(session.user.id, true, false, false, 'casual', session.user.name ?? undefined);
    } catch {
      // Error set in socket store
    }
  };

  const handleJoinRoom = async (code?: string) => {
    const codeToJoin = code || joinCode.trim().toUpperCase();
    if (!codeToJoin) return;
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      joinRoom(codeToJoin, session.user.id);
    } catch {
      // Error set in socket store
    }
  };

  const handleDeckSelect = (deck: ResolvedDeck) => {
    selectDeck(deck.characters, deck.missions);
    setDeckSelected(true);
  };

  // Filter rooms by selected mode
  const filteredRooms = publicRooms.filter((r) => r.gameMode === selectedMode);

  // Show deck selector once in a room and opponent has joined
  const showDeckSelector = roomCode && opponentJoined && !deckSelected && cards;

  const modeStyle = (mode: GameMode) => ({
    backgroundColor: selectedMode === mode ? '#1a1a1a' : '#0a0a0a',
    borderBottom: selectedMode === mode ? '2px solid #c4a35a' : '2px solid transparent',
    color: selectedMode === mode ? '#e0e0e0' : '#555555',
  });

  return (
    <main
      id="main-content"
      className="flex min-h-screen relative flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="playOnline" />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 max-w-lg w-full relative z-10">
        <h1
          className="text-2xl font-bold tracking-wider uppercase"
          style={{ color: '#c4a35a' }}
        >
          {t('online.title')}
        </h1>

        <p className="text-xs" style={{ color: '#555555' }}>
          {t('online.signedInAs', { name: session.user.name })}
        </p>

        {error && (
          <div
            className="w-full rounded px-4 py-2 text-xs"
            style={{ backgroundColor: '#1a0a0a', border: '1px solid #b33e3e', color: '#b33e3e' }}
          >
            {error}
          </div>
        )}

        {/* Deck selector (shown after opponent joins) */}
        {showDeckSelector && (
          <div
            className="w-full rounded-lg p-6"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <DeckSelector
              onSelect={handleDeckSelect}
              allCharacters={cards.characters}
              allMissions={cards.missions}
            />
          </div>
        )}

        {deckSelected && (
          <p className="text-xs" style={{ color: '#c4a35a' }}>
            {t('online.waitingForOpponent')}
          </p>
        )}

        {/* Main UI (hide once deck selection is shown) */}
        {!showDeckSelector && !deckSelected && (
          <>
            {/* Browse / Private toggle */}
            <div
              className="flex w-full rounded-lg overflow-hidden"
              style={{ border: '1px solid #262626' }}
            >
              <button
                onClick={() => setView('browse')}
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: view === 'browse' ? '#141414' : '#0a0a0a',
                  borderRight: '1px solid #262626',
                  color: view === 'browse' ? '#e0e0e0' : '#555555',
                }}
              >
                {t('online.publicRooms')}
              </button>
              <button
                onClick={() => setView('private')}
                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: view === 'private' ? '#141414' : '#0a0a0a',
                  color: view === 'private' ? '#e0e0e0' : '#555555',
                }}
              >
                {t('online.privateRoom')}
              </button>
            </div>

            {view === 'browse' && !roomCode && (
              <>
                {/* Game mode tabs */}
                <div className="flex w-full">
                  {(['casual', 'ranked', 'draft'] as GameMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSelectedMode(mode)}
                      className="flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
                      style={modeStyle(mode)}
                    >
                      {t(`online.mode.${mode}`)}
                    </button>
                  ))}
                </div>

                <p className="text-xs" style={{ color: '#555555' }}>
                  {t(`online.modeDesc.${selectedMode}`)}
                </p>

                {/* Room list */}
                <div
                  className="w-full rounded-lg overflow-hidden"
                  style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                >
                  {filteredRooms.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-xs" style={{ color: '#555555' }}>
                        {t('online.noRooms')}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {filteredRooms.map((room) => (
                        <div
                          key={room.code}
                          className="flex items-center justify-between px-4 py-3"
                          style={{ borderBottom: '1px solid #1e1e1e' }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium" style={{ color: '#e0e0e0' }}>
                              {room.hostName}
                            </span>
                            <span className="text-xs" style={{ color: '#555555' }}>
                              {formatTimeAgo(room.createdAt, t)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleJoinRoom(room.code)}
                            className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
                            style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                          >
                            {t('online.join')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Create public room button */}
                <button
                  onClick={handleCreatePublicRoom}
                  className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                  style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                >
                  {t('online.createPublicRoom')}
                </button>
              </>
            )}

            {view === 'browse' && roomCode && (
              <div
                className="w-full rounded-lg p-6"
                style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
              >
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-xs" style={{ color: '#888888' }}>
                    {t('online.roomCreated')}
                  </p>
                  <p
                    className="text-3xl font-bold tracking-[0.3em]"
                    style={{ color: '#c4a35a' }}
                  >
                    {roomCode}
                  </p>
                  <p className="text-xs" style={{ color: '#555555' }}>
                    {opponentJoined
                      ? t('online.opponentJoined')
                      : t('online.waitingForOpponent')}
                  </p>
                </div>
              </div>
            )}

            {view === 'private' && (
              <div
                className="w-full rounded-lg p-6"
                style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
              >
                {roomCode ? (
                  <div className="flex flex-col gap-4 items-center">
                    <p className="text-xs" style={{ color: '#888888' }}>
                      {t('online.roomCreated')}
                    </p>
                    <p
                      className="text-3xl font-bold tracking-[0.3em]"
                      style={{ color: '#c4a35a' }}
                    >
                      {roomCode}
                    </p>
                    <p className="text-xs" style={{ color: '#555555' }}>
                      {opponentJoined
                        ? t('online.opponentJoined')
                        : t('online.waitingForOpponent')}
                    </p>
                  </div>
                ) : showJoinInput ? (
                  <div className="flex flex-col gap-4 items-center">
                    <p className="text-xs" style={{ color: '#888888' }}>
                      {t('online.enterCode')}
                    </p>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                      maxLength={6}
                      placeholder="ABCD12"
                      className="w-full text-center text-2xl font-bold tracking-[0.3em] rounded py-3 outline-none uppercase"
                      style={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #262626',
                        color: '#e0e0e0',
                      }}
                    />
                    <button
                      onClick={() => handleJoinRoom()}
                      disabled={joinCode.length < 6}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                      style={{
                        backgroundColor: joinCode.length < 6 ? '#333333' : '#c4a35a',
                        color: '#0a0a0a',
                      }}
                    >
                      {t('online.joinRoom')}
                    </button>
                    <button
                      onClick={() => setShowJoinInput(false)}
                      className="text-xs underline"
                      style={{ color: '#888888' }}
                    >
                      {t('common.back')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleCreatePrivateRoom}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >
                      {t('online.createPrivateRoom')}
                    </button>
                    <button
                      onClick={() => setShowJoinInput(true)}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                      style={{
                        backgroundColor: '#141414',
                        border: '1px solid #262626',
                        color: '#e0e0e0',
                      }}
                    >
                      {t('online.joinRoom')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Link
          href="/"
          className="px-6 py-2 text-sm transition-colors"
          style={{
            backgroundColor: '#141414',
            border: '1px solid #262626',
            color: '#888888',
          }}
        >
          {t('auth.backToHome')}
        </Link>
      </div>
      </div>
      <Footer />
    </main>
  );
}

function formatTimeAgo(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('online.timeJustNow');
  const minutes = Math.floor(seconds / 60);
  return t('online.timeMinutesAgo', { minutes });
}
