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
import { LeaderboardPanel } from '@/components/play-online/LeaderboardPanel';
import { MyStatsPanel } from '@/components/play-online/MyStatsPanel';
import { LiveGamesBar } from '@/components/play-online/LiveGamesBar';
import { RoomCard } from '@/components/play-online/RoomCard';
import type { LeaderboardMode } from '@/components/play-online/LeaderboardModeSwitch';
import { LeaderboardModeSwitch } from '@/components/play-online/LeaderboardModeSwitch';
import { HoloSurface } from '@/components/HoloSurface';
import { useHasEvolvingDeck } from '@/components/play-online/useHasEvolvingDeck';
import { useMemo } from 'react';
import { randomHoloHue } from '@/lib/utils/holoColor';
import { useToastStore } from '@/stores/toastStore';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

type GameMode = 'casual' | 'ranked';
type View = 'browse' | 'private';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
  id?: string;
}

const LB_MODE_STORAGE_KEY = 'naruto-mythos-leaderboard-mode';

export default function PlayOnlinePage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const initialMode: LeaderboardMode = (() => {
    if (typeof window === 'undefined') return 'ranked';
    const fromUrl = searchParams.get('mode');
    if (fromUrl === 'evolving' || fromUrl === 'ranked') return fromUrl;
    const fromStorage = localStorage.getItem(LB_MODE_STORAGE_KEY);
    if (fromStorage === 'evolving' || fromStorage === 'ranked') return fromStorage;
    return 'ranked';
  })();
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>(initialMode);
  useEffect(() => {
    try { localStorage.setItem(LB_MODE_STORAGE_KEY, leaderboardMode); } catch { /* ignore */ }
  }, [leaderboardMode]);

  const [view, setView] = useState<View>('browse');
  const [selectedMode, setSelectedMode] = useState<GameMode>('casual');
  const [joinCode, setJoinCode] = useState('');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deckSelected, setDeckSelected] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isEvolvingToggle, setIsEvolvingToggle] = useState(leaderboardMode === 'evolving');
  const showToast = useToastStore((s) => s.showToast);
  const triggerEvoErrorToast = useCallback(() => {
    showToast({
      type: 'error',
      titleKey: 'online.evolving.noDeckTitle',
      messageKey: 'online.evolving.noDeck',
      action: { labelKey: 'online.evolving.createDeck', href: '/deck-builder/manage?evolving=1' },
      dedupeKey: 'evo-no-deck',
      durationMs: 6000,
    });
  }, [showToast]);

  const { hasEvo } = useHasEvolvingDeck();
  const previewHue = useMemo(() => randomHoloHue(), []);
  const evoToggleBlocked = isEvolvingToggle && hasEvo === false;

  const {
    connected,
    roomCode,
    currentRoomGameMode,
    currentRoomIsEvolving,
    currentRoomHoloHue,
    playerRole,
    opponentJoined,
    gameStarted,
    visibleState,
    error,
    errorKey,
    bannedCardsError,
    publicRooms,
    tournamentMatchRoom,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    selectDeck,
    changeDeck,
    opponentChangingDeck,
    requestRoomList,
    unsubscribeRoomList,
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

  const connectAndFetch = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      if (!connected) {
        await connect(session.user.id, session.user.name ?? undefined);
      }
      requestRoomList();
    } catch { /* ignore */ }
  }, [session?.user?.id, connected, connect, requestRoomList]);

  useEffect(() => {
    if (session?.user?.id) {
      connectAndFetch();
    }
    return () => { unsubscribeRoomList(); };
  }, [session?.user?.id, connectAndFetch, unsubscribeRoomList]);

  useEffect(() => {
    return () => {
      if (!useSocketStore.getState().gameStarted) {
        disconnect();
      }
    };
  }, [disconnect]);

  useEffect(() => {
    if (errorKey === 'room.error.evolvingNoDeck') {
      triggerEvoErrorToast();
      const timer = setTimeout(clearError, 200);
      return () => clearTimeout(timer);
    }
    const CONNECTION_KEYS = new Set([
      'game.error.connectionTimeout',
      'game.error.connectionLost',
      'game.error.reconnectFailed',
      'game.error.notConnected',
    ]);
    if (errorKey && CONNECTION_KEYS.has(errorKey)) {
      return;
    }
    if (error && !(bannedCardsError && bannedCardsError.length > 0)) {
      showToast({
        type: 'error',
        messageKey: errorKey ?? undefined,
        message: errorKey ? undefined : error,
        dedupeKey: errorKey ?? `room-err-${error}`,
        durationMs: 4500,
      });
      const timer = setTimeout(clearError, 200);
      return () => clearTimeout(timer);
    }
  }, [error, errorKey, bannedCardsError, clearError, showToast, triggerEvoErrorToast]);

  const maintenanceWarning = useSocketStore((s) => s.maintenanceWarning);
  useEffect(() => {
    if (maintenanceWarning && !gameStarted) {
      router.push('/maintenance');
    }
  }, [maintenanceWarning, gameStarted, router]);

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

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && session?.user?.id && !connected) {
      connect(session.user.id, session.user.name ?? undefined);
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
            <h1 className="text-2xl font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.22em' }}>
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
                style={{ backgroundColor: '#141414', color: '#888888' }}
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

  const handleCreatePublicRoom = async (mode: GameMode) => {
    if (evoToggleBlocked) {
      triggerEvoErrorToast();
      return;
    }
    try {
      if (!connected) await connect(session.user.id, session.user.name ?? undefined);
      const isRanked = mode === 'ranked';
      createRoom(
        session.user.id,
        false,
        isRanked,
        false,
        isEvolvingToggle && isRanked ? 'evolving' : mode,
        session.user.name ?? undefined,
        undefined,
        undefined,
        isAnonymous,
        isEvolvingToggle,
      );
      setIsPrivateRoom(false);
    } catch { /* ignore */ }
  };

  const handleCreatePrivateRoom = async () => {
    if (evoToggleBlocked) {
      triggerEvoErrorToast();
      return;
    }
    try {
      if (!connected) await connect(session.user.id, session.user.name ?? undefined);
      const isRanked = selectedMode === 'ranked';
      createRoom(
        session.user.id,
        true,
        isRanked,
        false,
        isEvolvingToggle && isRanked ? 'evolving' : selectedMode,
        session.user.name ?? undefined,
        undefined,
        undefined,
        isAnonymous,
        isEvolvingToggle,
      );
      setIsPrivateRoom(true);
    } catch { /* ignore */ }
  };

  const handleJoinRoom = async (code?: string) => {
    const codeToJoin = code || joinCode.trim().toUpperCase();
    if (!codeToJoin) return;
    try {
      if (!connected) await connect(session.user.id, session.user.name ?? undefined);
      joinRoom(codeToJoin, session.user.id);
    } catch { /* ignore */ }
  };

  const handleDeckSelect = (deck: ResolvedDeck) => {
    selectDeck(deck.characters, deck.missions, deck.id);
    setDeckSelected(true);
  };

  const showDeckSelector = roomCode && opponentJoined && !deckSelected && cards && !tournamentMatchRoom;
  const isEvoRoomActive = currentRoomIsEvolving || currentRoomGameMode === 'evolving';

  useEffect(() => {
    if (tournamentMatchRoom && !deckSelected) {
      setDeckSelected(true);
    }
  }, [tournamentMatchRoom, deckSelected]);

  const modeStyle = (mode: GameMode) => ({
    backgroundColor: selectedMode === mode ? 'rgba(196, 163, 90, 0.12)' : 'transparent',
    boxShadow: selectedMode === mode ? 'inset 0 -2px 0 #c4a35a' : 'none',
    color: selectedMode === mode ? '#e8e8e8' : '#555555',
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

      <div className="flex-1 px-2 sm:px-4 py-4 sm:py-6 relative z-10">
        <div className="mx-auto w-full" style={{ maxWidth: 1280 }}>
          <header className="flex flex-col items-center gap-1 mb-4 sm:mb-5">
            <h1 className="text-xl sm:text-2xl font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.28em' }}>
              {t('online.title')}
            </h1>
            <p className="text-[10px] sm:text-[11px]" style={{ color: '#555' }}>
              {t('online.signedInAs', { name: session.user.name })}
            </p>
          </header>

          {bannedCardsError && bannedCardsError.length > 0 && (
            <div
              className="w-full px-4 py-3 mb-4 text-xs flex flex-col gap-2"
              style={{ backgroundColor: 'rgba(26, 10, 10, 0.92)', boxShadow: 'inset 0 0 0 1px rgba(179, 62, 62, 0.35)', color: '#e8e8e8' }}
            >
              <div style={{ color: '#b33e3e' }}>{t('online.deckBannedTitle')}</div>
              <div style={{ color: '#888888', fontSize: '10px' }}>{t('online.deckBannedRankedOnly')}</div>
              <div className="flex flex-col gap-1">
                {bannedCardsError.map((bc) => (
                  <div key={bc.cardId} className="flex items-center gap-2">
                    <span style={{ color: '#b33e3e', fontWeight: 600 }}>{bc.cardId}</span>
                    {bc.reason && <span style={{ color: '#888888', fontStyle: 'italic' }}>: {bc.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showDeckSelector && (
            <div className="w-full mb-4">
              {isEvoRoomActive ? (
                <HoloSurface
                  hue={currentRoomHoloHue ?? previewHue}
                  intensity="subtle"
                  motion="idle"
                  className="overflow-hidden"
                  style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
                >
                  <div className="p-4 sm:p-6">
                    <DeckSelector
                      onSelect={handleDeckSelect}
                      allCharacters={cards.characters}
                      allMissions={cards.missions}
                      evolvingOnly={true}
                    />
                  </div>
                </HoloSurface>
              ) : (
                <div className="p-4 sm:p-6" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                  <DeckSelector
                    onSelect={handleDeckSelect}
                    allCharacters={cards.characters}
                    allMissions={cards.missions}
                    evolvingOnly={false}
                  />
                </div>
              )}
            </div>
          )}

          {deckSelected && (
            <div className="flex flex-col items-center gap-3 mb-4">
              <p className="text-xs" style={{ color: '#c4a35a' }}>
                {opponentChangingDeck ? t('online.opponentChangingDeck') : t('online.waitingForOpponent')}
              </p>
              <button
                onClick={() => { changeDeck(); setDeckSelected(false); }}
                className="px-4 py-2 text-xs cursor-pointer"
                style={{ backgroundColor: 'rgba(20, 20, 20, 0.9)', color: '#888' }}
              >
                {t('online.changeDeck')}
              </button>
            </div>
          )}

          {!showDeckSelector && !deckSelected && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <div className="flex flex-col gap-4 min-w-0">
                <LiveGamesBar />

                <div
                  className="flex w-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
                >
                  <button
                    onClick={() => setView('browse')}
                    className="flex-1 py-2.5 text-[11px] font-bold uppercase cursor-pointer no-select"
                    style={{
                      letterSpacing: '0.22em',
                      backgroundColor: view === 'browse' ? 'rgba(196, 163, 90, 0.10)' : 'transparent',
                      boxShadow: view === 'browse' ? 'inset 0 -2px 0 #c4a35a' : 'inset 0 -2px 0 transparent',
                      color: view === 'browse' ? '#e8e8e8' : '#555',
                      transition: 'color 0.15s',
                    }}
                  >
                    {t('online.publicRooms')}
                  </button>
                  <button
                    onClick={() => setView('private')}
                    className="flex-1 py-2.5 text-[11px] font-bold uppercase cursor-pointer no-select"
                    style={{
                      letterSpacing: '0.22em',
                      backgroundColor: view === 'private' ? 'rgba(196, 163, 90, 0.10)' : 'transparent',
                      boxShadow: view === 'private' ? 'inset 0 -2px 0 #c4a35a' : 'inset 0 -2px 0 transparent',
                      color: view === 'private' ? '#e8e8e8' : '#555',
                      transition: 'color 0.15s',
                    }}
                  >
                    {t('online.privateRoom')}
                  </button>
                </div>

                {view === 'browse' && !roomCode && (
                  <div className="flex flex-col gap-3">
                    <ToggleRow
                      label={t('online.anonymous.label')}
                      description={t('online.anonymous.description')}
                      checked={isAnonymous}
                      onChange={setIsAnonymous}
                    />
                    <EvolvingToggleBlock
                      checked={isEvolvingToggle}
                      onChange={setIsEvolvingToggle}
                      blocked={evoToggleBlocked}
                      previewHue={previewHue}
                    />

                    <RoomsGrid
                      casualRooms={publicRooms.filter((r) => !r.isRanked)}
                      rankedRooms={publicRooms.filter((r) => r.isRanked)}
                      onJoin={handleJoinRoom}
                      onCreateCasual={() => handleCreatePublicRoom('casual')}
                      onCreateRanked={() => handleCreatePublicRoom('ranked')}
                      disableCreate={evoToggleBlocked}
                    />
                  </div>
                )}

                {view === 'browse' && roomCode && (
                  <div className="p-6" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                    <div className="flex flex-col gap-4 items-center">
                      <p className="text-sm font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.18em' }}>
                        {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                      </p>
                    </div>
                  </div>
                )}

                {view === 'private' && (
                  <div className="p-5 sm:p-6" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                    {roomCode ? (
                      <div className="flex flex-col gap-4 items-center">
                        <p className="text-xs uppercase" style={{ color: '#888', letterSpacing: '0.2em' }}>
                          {t('online.roomCreated')}
                        </p>
                        <p
                          className="text-3xl font-bold"
                          style={{ color: '#c4a35a', letterSpacing: '0.3em' }}
                        >
                          {roomCode}
                        </p>
                        <p className="text-xs" style={{ color: '#555' }}>
                          {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                        </p>
                      </div>
                    ) : showJoinInput ? (
                      <div className="flex flex-col gap-4 items-center">
                        <p className="text-xs uppercase" style={{ color: '#888', letterSpacing: '0.2em' }}>
                          {t('online.enterCode')}
                        </p>
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                          maxLength={6}
                          placeholder={t('online.codePlaceholder')}
                          className="w-full text-center text-2xl font-bold py-3 outline-none uppercase"
                          style={{
                            backgroundColor: 'rgba(8, 8, 14, 0.7)',
                            color: '#e8e8e8',
                            letterSpacing: '0.3em',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }}
                        />
                        <button
                          onClick={() => handleJoinRoom()}
                          disabled={joinCode.length < 6}
                          className="w-full py-3 text-sm font-bold uppercase cursor-pointer no-select"
                          style={{
                            backgroundColor: joinCode.length < 6 ? '#333' : '#c4a35a',
                            color: '#0a0a0a',
                            letterSpacing: '0.18em',
                          }}
                        >
                          {t('online.joinRoom')}
                        </button>
                        <button
                          onClick={() => setShowJoinInput(false)}
                          className="text-xs underline cursor-pointer"
                          style={{ color: '#888' }}
                        >
                          {t('common.back')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex w-full overflow-hidden">
                          {(['casual', 'ranked'] as GameMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setSelectedMode(mode)}
                              className="flex-1 py-3 text-xs font-bold uppercase cursor-pointer no-select"
                              style={{ letterSpacing: '0.22em', ...modeStyle(mode) }}
                            >
                              {t(`online.mode.${mode}`)}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs" style={{ color: '#555' }}>
                          {t(`online.modeDesc.${selectedMode}`)}
                        </p>

                        <ToggleRow
                          label={t('online.anonymous.label')}
                          description={t('online.anonymous.description')}
                          checked={isAnonymous}
                          onChange={setIsAnonymous}
                        />
                        <EvolvingToggleBlock
                          checked={isEvolvingToggle}
                          onChange={setIsEvolvingToggle}
                          blocked={evoToggleBlocked}
                          previewHue={previewHue}
                        />

                        <button
                          onClick={handleCreatePrivateRoom}
                          disabled={evoToggleBlocked}
                          className="w-full py-3 text-sm font-bold uppercase no-select"
                          style={{
                            backgroundColor: evoToggleBlocked ? '#333' : '#c4a35a',
                            color: '#0a0a0a',
                            letterSpacing: '0.18em',
                            cursor: evoToggleBlocked ? 'not-allowed' : 'pointer',
                            opacity: evoToggleBlocked ? 0.55 : 1,
                          }}
                        >
                          {t('online.createPrivateRoom')}
                        </button>
                        <button
                          onClick={() => setShowJoinInput(true)}
                          className="w-full py-3 text-sm font-bold uppercase cursor-pointer no-select"
                          style={{ backgroundColor: 'rgba(20, 20, 20, 0.85)', color: '#e8e8e8', letterSpacing: '0.18em' }}
                        >
                          {t('online.joinRoom')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <aside className="flex flex-col gap-4 min-w-0">
                <LeaderboardPanel mode={leaderboardMode} onModeChange={setLeaderboardMode} topCount={5} />
                <MyStatsPanel
                  username={session.user.name ?? ''}
                  mode={leaderboardMode}
                  onModeChange={setLeaderboardMode}
                />
              </aside>
            </div>
          )}

          <div className="flex justify-center mt-6">
            <Link
              href="/"
              className="px-6 py-2 text-xs uppercase no-select"
              style={{ backgroundColor: 'rgba(20, 20, 20, 0.85)', color: '#888', letterSpacing: '0.18em' }}
            >
              {t('auth.backToHome')}
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function ToggleRow({
  label, description, checked, onChange, accent,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const accentColor = accent ?? '#c4a35a';
  return (
    <div
      className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5"
      style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.3)' }}
    >
      <div className="flex flex-col gap-0.5 pr-2 min-w-0">
        <span className="text-[11px] font-medium uppercase truncate" style={{ color: '#e8e8e8', letterSpacing: '0.16em' }}>
          {label}
        </span>
        <span className="text-[9px]" style={{ color: '#555' }}>{description}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 cursor-pointer shrink-0"
        style={{
          backgroundColor: checked ? accentColor : 'rgba(60, 60, 60, 0.6)',
          transition: 'background-color 0.18s',
          borderRadius: 999,
        }}
        aria-pressed={checked}
      >
        <span
          className="absolute top-0.5"
          style={{
            width: 16, height: 16, borderRadius: 999, backgroundColor: '#0a0a0a',
            left: checked ? 22 : 2, transition: 'left 0.18s',
          }}
        />
      </button>
    </div>
  );
}

function RoomsGrid({
  casualRooms, rankedRooms, onJoin, onCreateCasual, onCreateRanked, disableCreate,
}: {
  casualRooms: ReturnType<typeof useSocketStore.getState>['publicRooms'];
  rankedRooms: ReturnType<typeof useSocketStore.getState>['publicRooms'];
  onJoin: (code: string) => void;
  onCreateCasual: () => void;
  onCreateRanked: () => void;
  disableCreate?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <RoomColumn
        title={t('online.mode.casual')}
        accent="#c4a35a"
        rooms={casualRooms}
        onCreate={onCreateCasual}
        onJoin={onJoin}
        createLabel={t('online.createPublicRoom')}
        emptyLabel={t('online.noRooms')}
        disableCreate={disableCreate}
      />
      <RoomColumn
        title={t('online.mode.ranked')}
        accent="#b33e3e"
        rooms={rankedRooms}
        onCreate={onCreateRanked}
        onJoin={onJoin}
        createLabel={t('online.createPublicRoom')}
        emptyLabel={t('online.noRooms')}
        disableCreate={disableCreate}
      />
    </div>
  );
}

function RoomColumn({
  title, accent, rooms, onCreate, onJoin, createLabel, emptyLabel, disableCreate,
}: {
  title: string;
  accent: string;
  rooms: ReturnType<typeof useSocketStore.getState>['publicRooms'];
  onCreate: () => void;
  onJoin: (code: string) => void;
  createLabel: string;
  emptyLabel: string;
  disableCreate?: boolean;
}) {
  return (
    <div className="flex flex-col" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
      <div
        className="px-3 py-2"
        style={{ boxShadow: `inset 0 -2px 0 ${accent}` }}
      >
        <span className="text-[11px] font-bold uppercase" style={{ color: accent, letterSpacing: '0.22em' }}>
          {title}
        </span>
      </div>
      <div className="flex-1 min-h-[88px]">
        {rooms.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <span className="text-[10px]" style={{ color: '#444' }}>{emptyLabel}</span>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 p-1.5">
            {rooms.map((room) => (
              <RoomCard
                key={room.code}
                code={room.code}
                hostName={room.hostName}
                gameMode={room.gameMode}
                createdAt={room.createdAt}
                isEvolving={room.isEvolving}
                holoHue={room.holoHue}
                isRanked={room.isRanked}
                isAnonymous={room.isAnonymous}
                onJoin={() => onJoin(room.code)}
              />
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onCreate}
        disabled={disableCreate}
        className="w-full py-2.5 text-[11px] font-bold uppercase no-select"
        style={{
          backgroundColor: disableCreate ? '#333' : accent,
          color: accent === '#b33e3e' && !disableCreate ? '#e8e8e8' : '#0a0a0a',
          letterSpacing: '0.18em',
          cursor: disableCreate ? 'not-allowed' : 'pointer',
          opacity: disableCreate ? 0.55 : 1,
        }}
      >
        {createLabel}
      </button>
    </div>
  );
}

function EvolvingToggleBlock({
  checked, onChange, blocked, previewHue,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  blocked: boolean;
  previewHue: number;
}) {
  const t = useTranslations();
  const wrapped = (
    <ToggleRow
      label={t('online.evolving.toggleLabel')}
      description={t('online.evolving.toggleDescription')}
      checked={checked}
      onChange={onChange}
      accent="#c4a35a"
    />
  );

  return (
    <div className="flex flex-col gap-1">
      {checked ? (
        <HoloSurface hue={previewHue} intensity="subtle" motion="idle" className="overflow-hidden">
          {wrapped}
        </HoloSurface>
      ) : wrapped}
      {blocked && (
        <span className="text-[10px] italic px-3" style={{ color: '#777' }}>
          {t('online.evolving.needDeckHint')}
        </span>
      )}
    </div>
  );
}

