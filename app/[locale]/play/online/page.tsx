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

type GameMode = 'casual' | 'ranked';
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
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);

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
    changeDeck,
    opponentChangingDeck,
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

  // Redirect to maintenance page if server is draining and player is not in a game
  const maintenanceWarning = useSocketStore((s) => s.maintenanceWarning);
  useEffect(() => {
    if (maintenanceWarning && !gameStarted) {
      router.push('/maintenance');
    }
  }, [maintenanceWarning, gameStarted, router]);

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

  const handleCreatePublicRoom = async (mode?: GameMode) => {
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      const actualMode = mode ?? selectedMode;
      const isRanked = actualMode === 'ranked';
      createRoom(session.user.id, false, isRanked, false, actualMode, session.user.name ?? undefined, undefined, isRanked ? true : timerEnabled);
      setIsPrivateRoom(false);
    } catch {
      // Error set in socket store
    }
  };

  const handleCreatePrivateRoom = async () => {
    try {
      if (!connected) {
        await connect(session.user.id);
      }
      const isRanked = selectedMode === 'ranked';
      createRoom(session.user.id, true, isRanked, false, selectedMode, session.user.name ?? undefined, undefined, isRanked ? true : timerEnabled);
      setIsPrivateRoom(true);
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

  // Split rooms by mode
  const casualRooms = publicRooms.filter((r) => r.gameMode === 'casual');
  const rankedRooms = publicRooms.filter((r) => r.gameMode === 'ranked');

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
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full relative z-10">
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
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs" style={{ color: '#c4a35a' }}>
              {opponentChangingDeck ? t('online.opponentChangingDeck') : t('online.waitingForOpponent')}
            </p>
            <button
              onClick={() => { changeDeck(); setDeckSelected(false); }}
              className="px-4 py-2 text-xs rounded cursor-pointer"
              style={{ backgroundColor: '#141414', border: '1px solid #333', color: '#888' }}
            >
              {t('online.changeDeck')}
            </button>
          </div>
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
                {/* Dual room lists — casual + ranked side by side */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Casual column */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2" style={{ backgroundColor: '#111', borderBottom: '2px solid #c4a35a' }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                        {t('online.mode.casual')}
                      </span>
                    </div>
                    <div className="flex-1" style={{ backgroundColor: '#111', minHeight: '80px' }}>
                      {casualRooms.length === 0 ? (
                        <div className="px-3 py-5 text-center">
                          <span className="text-[10px]" style={{ color: '#444' }}>{t('online.noRooms')}</span>
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto">
                          {casualRooms.map((room) => (
                            <div key={room.code} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium" style={{ color: '#ddd' }}>{room.hostName}</span>
                                <span className="text-[9px]" style={{ color: '#555' }}>{formatTimeAgo(room.createdAt, t)}</span>
                              </div>
                              <button onClick={() => { setSelectedMode('casual'); handleJoinRoom(room.code); }}
                                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}>
                                {t('online.join')}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedMode('casual'); handleCreatePublicRoom('casual'); }}
                      className="w-full py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}>
                      {t('online.createPublicRoom')}
                    </button>
                  </div>

                  {/* Ranked column */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2" style={{ backgroundColor: '#111', borderBottom: '2px solid #b33e3e' }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#b33e3e' }}>
                        {t('online.mode.ranked')}
                      </span>
                    </div>
                    <div className="flex-1" style={{ backgroundColor: '#111', minHeight: '80px' }}>
                      {rankedRooms.length === 0 ? (
                        <div className="px-3 py-5 text-center">
                          <span className="text-[10px]" style={{ color: '#444' }}>{t('online.noRooms')}</span>
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto">
                          {rankedRooms.map((room) => (
                            <div key={room.code} className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium" style={{ color: '#ddd' }}>{room.hostName}</span>
                                <span className="text-[9px]" style={{ color: '#555' }}>{formatTimeAgo(room.createdAt, t)}</span>
                              </div>
                              <button onClick={() => { setSelectedMode('ranked'); handleJoinRoom(room.code); }}
                                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                style={{ backgroundColor: '#b33e3e', color: '#e0e0e0' }}>
                                {t('online.join')}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedMode('ranked'); handleCreatePublicRoom('ranked'); }}
                      className="w-full py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      style={{ backgroundColor: '#b33e3e', color: '#e0e0e0' }}>
                      {t('online.createPublicRoom')}
                    </button>
                  </div>
                </div>

                {/* Live Games — spectate */}
                <LiveGamesSection />
              </>
            )}

            {view === 'browse' && roomCode && (
              <div
                className="w-full rounded-lg p-6"
                style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
              >
                <div className="flex flex-col gap-4 items-center">
                  <p className="text-sm font-bold" style={{ color: '#c4a35a' }}>
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
                    {/* Mode selector tabs */}
                    <div className="flex w-full rounded-t-lg overflow-hidden">
                      {(['casual', 'ranked'] as GameMode[]).map((mode) => (
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
                    <p className="text-xs -mt-2" style={{ color: '#555555' }}>
                      {t(`online.modeDesc.${selectedMode}`)}
                    </p>

                    {/* Timer toggle (casual only) */}
                    {selectedMode === 'casual' && (
                      <div
                        className="flex items-center justify-between w-full px-4 py-3 rounded-lg"
                        style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626' }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium" style={{ color: '#e0e0e0' }}>
                            {t('online.timer.label')}
                          </span>
                          <span className="text-[10px]" style={{ color: '#555555' }}>
                            {t('online.timer.description')}
                          </span>
                        </div>
                        <button
                          onClick={() => setTimerEnabled(!timerEnabled)}
                          className="relative w-10 h-5 rounded-full transition-colors"
                          style={{
                            backgroundColor: timerEnabled ? '#c4a35a' : '#333333',
                          }}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                            style={{
                              backgroundColor: '#0a0a0a',
                              left: timerEnabled ? '22px' : '2px',
                            }}
                          />
                        </button>
                      </div>
                    )}

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

function LiveGamesSection() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const activeGames = useSocketStore((s) => s.activeGames);
  const requestActiveGames = useSocketStore((s) => s.requestActiveGames);
  const spectateGame = useSocketStore((s) => s.spectateGame);
  const startOnlineGame = useGameStore((s) => s.startOnlineGame);

  useEffect(() => {
    requestActiveGames();
    const interval = setInterval(requestActiveGames, 5000);
    return () => clearInterval(interval);
  }, [requestActiveGames]);

  const publicGames = activeGames.filter((g) => !g.isPrivate);

  const handleSpectate = (game: typeof publicGames[0]) => {
    if (!session?.user?.id) return;
    // Clean up any previous spectating session first
    const ss = useSocketStore.getState();
    if (ss.isSpectating || ss.spectatingRoomCode) {
      ss.leaveSpectating();
    }
    // Also clear any stale game state from a previous spectate/game
    useGameStore.setState({ visibleState: null, gameState: null, gameOver: false, isOnlineGame: false });
    // Small delay to let the leave propagate before joining new room
    setTimeout(() => {
      spectateGame(game.roomCode, session!.user!.id!, session!.user!.name ?? 'Spectator');
      router.push('/game' as '/');
    }, 100);
  };

  return (
    <div className="w-full mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3e8b3e' }} />
        <span className="text-xs uppercase font-bold tracking-wider" style={{ color: '#c4a35a' }}>
          {t('spectator.liveGames')}
        </span>
        <span className="text-[10px]" style={{ color: '#555' }}>({publicGames.length})</span>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
        {publicGames.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <span className="text-[11px]" style={{ color: '#555' }}>
              {t('spectator.noLiveGames')}
            </span>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {publicGames.map((game) => (
              <div key={game.roomCode} className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid #1e1e1e' }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium" style={{ color: '#e0e0e0' }}>
                    {game.player1Name} <span style={{ color: '#555' }}>{t('spectator.vs')}</span> {game.player2Name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px]" style={{ color: '#888' }}>
                      {t('spectator.turn', { turn: game.turn })}
                    </span>
                    <span className="text-[9px]" style={{ color: game.isRanked ? '#c4a35a' : '#666' }}>
                      {game.isRanked ? t('spectator.ranked') : t('spectator.casual')}
                    </span>
                    {game.spectatorCount > 0 && (
                      <span className="text-[9px]" style={{ color: '#666' }}>
                        {t('spectator.spectators', { count: game.spectatorCount })}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleSpectate(game)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  style={{ backgroundColor: 'rgba(196,163,90,0.1)', border: '1px solid rgba(196,163,90,0.3)', color: '#c4a35a' }}>
                  {t('spectator.joinSpectate')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
