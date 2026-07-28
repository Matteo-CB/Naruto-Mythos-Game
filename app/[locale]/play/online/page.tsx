'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import { LiveGamesBar } from '@/components/play-online/LiveGamesBar';
import { PlayStatsButton } from '@/components/play-online/PlayStatsButton';
import { RoomCard } from '@/components/play-online/RoomCard';
import { HoloSurface } from '@/components/HoloSurface';
import { useHasEvolvingDeck } from '@/components/play-online/useHasEvolvingDeck';
import { useMemo } from 'react';
import { randomHoloHue } from '@/lib/utils/holoColor';
import { useToastStore } from '@/stores/toastStore';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { ALL_SET_IDS, SET_REGISTRY, isSetSealedReady, getSetName } from '@/lib/data/sets/registry';
import { useLocale } from 'next-intl';

type GameMode = 'casual' | 'ranked';
type View = 'browse' | 'private';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
  id?: string;
}

const EVOLVING_TOGGLE_STORAGE_KEY = 'naruto-mythos-evolving-toggle';
const SEALED_TOGGLE_STORAGE_KEY = 'naruto-mythos-sealed-toggle';
const SEALED_DEFAULT_BOOSTER_COUNT: 4 | 5 | 6 = 5;
const SEALED_DEFAULT_SET_CHOICE = 'KS';
const JOIN_RETRY_INTERVAL_MS = 4000;
const JOIN_MAX_ATTEMPTS = 10;
const JOIN_SLOW_RETRY_EVERY = 5;
const JOIN_NON_RETRYABLE_ERRORS = new Set([
  'game.error.youAreHost',
  'game.error.roomFull',
  'game.error.suspended',
  'game.error.rankedBanned',
  'game.error.gameBanned',
  'game.error.tournamentBusy',
  'game.error.maintenanceNoNewGames',
  'room.error.evolvingNoDeck',
]);

export default function PlayOnlinePage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const initialEvolving = (() => {
    if (typeof window === 'undefined') return false;
    const fromUrl = searchParams.get('mode');
    if (fromUrl === 'evolving') return true;
    if (fromUrl === 'ranked' || fromUrl === 'sealed') return false;
    return localStorage.getItem(EVOLVING_TOGGLE_STORAGE_KEY) === '1';
  })();
  const initialSealed = (() => {
    if (typeof window === 'undefined') return false;
    const fromUrl = searchParams.get('mode');
    if (fromUrl === 'sealed') return true;
    if (fromUrl === 'evolving' || fromUrl === 'ranked') return false;
    try { return localStorage.getItem(SEALED_TOGGLE_STORAGE_KEY) === '1'; } catch { return false; }
  })();

  const [view, setView] = useState<View>('browse');
  const [selectedMode, setSelectedMode] = useState<GameMode>('casual');
  const [joinCode, setJoinCode] = useState('');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deckSelected, setDeckSelected] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isEvolvingToggle, setIsEvolvingToggleRaw] = useState(initialEvolving);
  const [isSealedToggle, setIsSealedToggleRaw] = useState<boolean>(initialSealed);
  const setIsEvolvingToggle = useCallback((v: boolean) => {
    setIsEvolvingToggleRaw(v);
    if (v) setIsSealedToggleRaw(false);
  }, []);
  const setIsSealedToggle = useCallback((v: boolean) => {
    setIsSealedToggleRaw(v);
    if (v) setIsEvolvingToggleRaw(false);
  }, []);
  const [roomCreatedAt, setRoomCreatedAt] = useState<number | null>(null);
  const [, setRoomTick] = useState(0);
  useEffect(() => {
    try { localStorage.setItem(EVOLVING_TOGGLE_STORAGE_KEY, isEvolvingToggle ? '1' : '0'); } catch { /* ignore */ }
  }, [isEvolvingToggle]);
  useEffect(() => {
    try { localStorage.setItem(SEALED_TOGGLE_STORAGE_KEY, isSealedToggle ? '1' : '0'); } catch { /* ignore */ }
  }, [isSealedToggle]);
  const [sealedSetChoice, setSealedSetChoice] = useState<string>(SEALED_DEFAULT_SET_CHOICE);
  const locale = useLocale() as 'en' | 'fr';
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
      const characters = [...mod.getPlayableCharacters(), ...(mod.getPlayableAttachments() as unknown as ReturnType<typeof mod.getPlayableCharacters>)];
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
      const st = useSocketStore.getState();
      if (st.tournamentMatchRoom) return;
      if (!st.gameStarted) {
        disconnect();
      }
    };
  }, [disconnect]);

  useEffect(() => {
    if (roomCode && !opponentJoined && roomCreatedAt === null) {
      setRoomCreatedAt(Date.now());
    } else if (!roomCode) {
      setRoomCreatedAt(null);
    }
  }, [roomCode, opponentJoined, roomCreatedAt]);

  useEffect(() => {
    if (roomCreatedAt === null) return;
    const id = setInterval(() => setRoomTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [roomCreatedAt]);

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
    if (gameInitRef.current) return;
    if (!gameStarted || !visibleState || !playerRole) return;
    const roomParam = searchParams.get('room');
    if (roomParam && roomCode !== roomParam) return;
    if (!playerNames) return;
    gameInitRef.current = true;
    const myName = session?.user?.name ?? undefined;
    const oppName = playerRole === 'player1' ? playerNames.player2 : playerNames.player1;
    startOnlineGame(visibleState, playerRole, myName, oppName);
    router.push('/game');
  }, [gameStarted, visibleState, playerRole, startOnlineGame, router, session, playerNames, searchParams, roomCode]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && session?.user?.id && !connected) {
      connect(session.user.id, session.user.name ?? undefined);
      setView('private');
      setShowJoinInput(true);
      setJoinCode(roomParam);
    }
  }, [searchParams, session, connected, connect]);

  const joinedCodeRef = useRef<string | null>(null);
  const joinAttemptsRef = useRef(0);
  const joinState = useSocketStore((s) => s.joinState);
  const seatBound = useSocketStore((s) => s.seatBound);
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (!roomParam) {
      joinedCodeRef.current = null;
      joinAttemptsRef.current = 0;
      return;
    }
    if (!connected || !session?.user?.id) return;
    if (joinedCodeRef.current === roomParam) return;
    if (roomCode && roomCode !== roomParam) {
      useSocketStore.getState().leaveMatchContext();
      gameInitRef.current = false;
    }
    joinedCodeRef.current = roomParam;
    joinAttemptsRef.current = 1;
    joinRoom(roomParam, session.user.id);
  }, [searchParams, connected, session, roomCode, joinRoom]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (!roomParam) return;
    if (!connected || !session?.user?.id) return;
    if (gameStarted) return;
    if (seatBound && roomCode === roomParam) return;
    const id = setInterval(() => {
      const st = useSocketStore.getState();
      if (st.gameStarted) return;
      if (!st.connected || !session?.user?.id) return;
      if (st.seatBound && st.roomCode === roomParam) return;
      if (st.errorKey && JOIN_NON_RETRYABLE_ERRORS.has(st.errorKey)) return;
      joinAttemptsRef.current += 1;
      const interval = joinAttemptsRef.current > JOIN_MAX_ATTEMPTS ? JOIN_SLOW_RETRY_EVERY : 1;
      if (joinAttemptsRef.current % interval !== 0) return;
      console.warn('[PlayOnline] Still not seated in', roomParam, 'retrying room:join, attempt', joinAttemptsRef.current);
      st.joinRoom(roomParam, session.user.id);
    }, JOIN_RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [searchParams, connected, session, joinState, gameStarted, seatBound, roomCode]);

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
            <h1 className="text-2xl font-bold" style={{ color: '#c4a35a', letterSpacing: '0.22em' }}>
              {t('online.title')}
            </h1>
            <p className="text-sm" style={{ color: '#888888' }}>
              {t('online.signInRequired')}
            </p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2.5 text-sm font-bold tracking-wider"
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
      if (isSealedToggle) {
        createRoom(
          session.user.id,
          false,
          false,
          true,
          'sealed',
          session.user.name ?? undefined,
          SEALED_DEFAULT_BOOSTER_COUNT,
          sealedSetChoice,
          isAnonymous,
          false,
        );
      } else {
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
      }
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
      if (isSealedToggle) {
        createRoom(
          session.user.id,
          true,
          false,
          true,
          'sealed',
          session.user.name ?? undefined,
          SEALED_DEFAULT_BOOSTER_COUNT,
          sealedSetChoice,
          isAnonymous,
          false,
        );
      } else {
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
      }
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

  useEffect(() => {
    if (roomCode && currentRoomGameMode === 'sealed' && !tournamentMatchRoom) {
      router.replace(`/play/sealed?room=${encodeURIComponent(roomCode)}`);
    }
  }, [roomCode, currentRoomGameMode, router, tournamentMatchRoom]);

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
    backgroundColor: selectedMode === mode ? 'rgba(196, 163, 90, 0.14)' : 'transparent',
    color: selectedMode === mode ? '#e8c477' : '#666666',
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

      <div className="flex-1 px-3 sm:px-6 py-6 sm:py-10 relative z-10">
        <div className="mx-auto w-full" style={{ maxWidth: 960 }}>
          <motion.header
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-2 mb-6 sm:mb-8"
          >
            <h1
              className="font-display text-2xl sm:text-3xl md:text-4xl font-bold leading-none"
              style={{
                color: '#e8c477',
                letterSpacing: '0.18em',
                textShadow: '0 2px 18px rgba(196, 163, 90, 0.22)',
              }}
            >
              {t('online.title')}
            </h1>
            <p
              className="font-body text-[10px] sm:text-[11px]"
              style={{ color: '#666', letterSpacing: '0.32em' }}
            >
              {t('online.signedInAs', { name: session.user.name })}
            </p>
            <PlayStatsButton />
          </motion.header>

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
            <div className="flex flex-col gap-5">
                <ViewTabs view={view} onChange={setView} />

                {view === 'browse' && !roomCode && (
                  <div className="flex flex-col gap-5">
                    <Section title={t('online.sectionOptions')}>
                      <div className="flex flex-col gap-2">
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
                        <SealedToggleBlock
                          checked={isSealedToggle}
                          onChange={setIsSealedToggle}
                          setChoice={sealedSetChoice}
                          onSetChoiceChange={setSealedSetChoice}
                          locale={locale}
                        />
                      </div>
                    </Section>

                    <Section title={t('online.sectionRooms')}>
                      <RoomsGrid
                        casualRooms={publicRooms.filter((r) => !r.isRanked)}
                        rankedRooms={publicRooms.filter((r) => r.isRanked)}
                        onJoin={handleJoinRoom}
                        onCreateCasual={() => handleCreatePublicRoom('casual')}
                        onCreateRanked={() => handleCreatePublicRoom('ranked')}
                        disableCreate={evoToggleBlocked}
                      />
                    </Section>
                  </div>
                )}

                {view === 'browse' && roomCode && (
                  <div>
                    <WaitingRoomHeader
                      gameMode={currentRoomGameMode}
                      isEvolving={currentRoomIsEvolving}
                      createdAt={roomCreatedAt}
                    />
                    <div className="p-6" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                      <div className="flex flex-col gap-4 items-center">
                        <p className="text-sm font-bold" style={{ color: '#c4a35a', letterSpacing: '0.18em' }}>
                          {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {view === 'private' && (
                  <div>
                    {roomCode && (
                      <WaitingRoomHeader
                        gameMode={currentRoomGameMode}
                        isEvolving={currentRoomIsEvolving}
                        createdAt={roomCreatedAt}
                      />
                    )}
                    <div className="p-5 sm:p-7" style={{ backgroundColor: 'rgba(15, 15, 20, 0.78)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                      {roomCode ? (
                      <div className="flex flex-col gap-5 items-center py-3">
                        <p className="font-body text-[11px]" style={{ color: '#888', letterSpacing: '0.32em' }}>
                          {t('online.roomCreated')}
                        </p>
                        <div
                          className="px-8 py-5"
                          style={{
                            backgroundColor: 'rgba(196, 163, 90, 0.06)',
                            boxShadow: 'inset 0 0 0 1px rgba(196, 163, 90, 0.25)',
                          }}
                        >
                          <p
                            className="font-display text-3xl sm:text-4xl font-bold"
                            style={{
                              color: '#e8c477',
                              letterSpacing: '0.32em',
                              textShadow: '0 2px 18px rgba(196, 163, 90, 0.35)',
                            }}
                          >
                            {roomCode}
                          </p>
                        </div>
                        <p className="font-body text-[11px]" style={{ color: '#555', letterSpacing: '0.2em' }}>
                          {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                        </p>
                      </div>
                    ) : showJoinInput ? (
                      <div className="flex flex-col gap-5 items-center">
                        <p className="font-body text-[11px]" style={{ color: '#888', letterSpacing: '0.32em' }}>
                          {t('online.enterCode')}
                        </p>
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                          maxLength={6}
                          placeholder={t('online.codePlaceholder')}
                          className="font-display w-full text-center text-3xl font-bold py-4 outline-none"
                          style={{
                            backgroundColor: 'rgba(8, 8, 14, 0.7)',
                            color: '#e8e8e8',
                            letterSpacing: '0.32em',
                            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                          }}
                        />
                        <button
                          onClick={() => handleJoinRoom()}
                          disabled={joinCode.length < 6}
                          className="w-full py-3 text-sm font-bold cursor-pointer no-select transition-opacity"
                          style={{
                            backgroundColor: joinCode.length < 6 ? '#2a2a2a' : '#c4a35a',
                            color: joinCode.length < 6 ? '#666' : '#0a0a0a',
                            letterSpacing: '0.22em',
                          }}
                        >
                          {t('online.joinRoom')}
                        </button>
                        <button
                          onClick={() => setShowJoinInput(false)}
                          className="font-body text-[11px] cursor-pointer transition-opacity hover:opacity-100"
                          style={{ color: '#888', letterSpacing: '0.3em', opacity: 0.7 }}
                        >
                          {'<'} {t('common.back')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-5">
                        <Section title={t('online.sectionMode')}>
                          <div
                            className="relative flex w-full"
                            style={{ backgroundColor: 'rgba(8, 8, 12, 0.55)' }}
                          >
                            {(['casual', 'ranked'] as GameMode[]).map((mode) => {
                              const active = selectedMode === mode;
                              const accent = mode === 'ranked' ? '#b33e3e' : '#c4a35a';
                              const activeColor = mode === 'ranked' ? '#ec8a8a' : '#f0d089';
                              const subtleBg = mode === 'ranked' ? 'rgba(179, 62, 62, 0.05)' : 'rgba(196, 163, 90, 0.04)';
                              return (
                                <button
                                  key={mode}
                                  onClick={() => setSelectedMode(mode)}
                                  className="relative flex-1 py-4 text-[12px] font-bold cursor-pointer no-select"
                                  style={{
                                    letterSpacing: '0.3em',
                                    backgroundColor: 'transparent',
                                    color: active ? activeColor : '#5a5a5a',
                                    transition: 'color 0.2s',
                                    textShadow: active ? `0 0 18px ${accent}66` : 'none',
                                    zIndex: 1,
                                  }}
                                >
                                  {active && (
                                    <motion.span
                                      layoutId="private-mode-bg"
                                      className="absolute inset-x-0"
                                      style={{
                                        top: 0,
                                        bottom: 3,
                                        backgroundColor: subtleBg,
                                        zIndex: -1,
                                      }}
                                      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                    />
                                  )}
                                  {t(`online.mode.${mode}`)}
                                  {active && (
                                    <motion.span
                                      layoutId="private-mode-underline"
                                      className="absolute left-0 right-0"
                                      style={{
                                        bottom: 0,
                                        height: 3,
                                        backgroundColor: accent,
                                        boxShadow: `0 0 10px ${accent}aa`,
                                      }}
                                      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <p
                            className="font-body text-xs mt-3 px-1"
                            style={{ color: '#888', lineHeight: 1.5 }}
                          >
                            {t(`online.modeDesc.${selectedMode}`)}
                          </p>
                        </Section>

                        <Section title={t('online.sectionOptions')}>
                          <div className="flex flex-col gap-2">
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
                          </div>
                        </Section>

                        <div className="flex flex-col gap-2 pt-1">
                          <button
                            onClick={handleCreatePrivateRoom}
                            disabled={evoToggleBlocked}
                            className="w-full py-3.5 text-sm font-bold no-select transition-opacity"
                            style={{
                              backgroundColor: evoToggleBlocked ? '#2a2a2a' : '#c4a35a',
                              color: evoToggleBlocked ? '#666' : '#0a0a0a',
                              letterSpacing: '0.22em',
                              cursor: evoToggleBlocked ? 'not-allowed' : 'pointer',
                              opacity: evoToggleBlocked ? 0.55 : 1,
                            }}
                          >
                            {t('online.createPrivateRoom')}
                          </button>
                          <button
                            onClick={() => setShowJoinInput(true)}
                            className="w-full py-3 text-[12px] font-bold cursor-pointer no-select transition-colors"
                            style={{
                              backgroundColor: 'transparent',
                              color: '#c4a35a',
                              letterSpacing: '0.22em',
                              boxShadow: 'inset 0 0 0 1px rgba(196, 163, 90, 0.35)',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(196, 163, 90, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            }}
                          >
                            {t('online.joinRoom')}
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                )}

              <LiveGamesBar />
            </div>
          )}

          <div className="flex justify-center mt-10 sm:mt-12">
            <Link
              href="/"
              className="text-[11px] no-select transition-opacity hover:opacity-100"
              style={{ color: '#888', letterSpacing: '0.3em', opacity: 0.7 }}
            >
              {'<'} {t('auth.backToHome')}
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
        <span className="text-[11px] font-medium truncate" style={{ color: '#e8e8e8', letterSpacing: '0.16em' }}>
          {label}
        </span>
        <span className="font-body text-[10px] leading-snug" style={{ color: '#888' }}>{description}</span>
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
      <div className="relative px-4 pt-5 pb-4 flex flex-col items-center">
        <span
          className="font-display text-sm font-bold"
          style={{
            color: accent,
            letterSpacing: '0.36em',
            textShadow: `0 0 18px ${accent}66`,
          }}
        >
          {title}
        </span>
        <span
          aria-hidden
          className="absolute left-0 right-0"
          style={{
            bottom: 0,
            height: 3,
            backgroundColor: accent,
            boxShadow: `0 0 10px ${accent}aa`,
          }}
        />
      </div>
      <div className="flex-1 min-h-[100px]">
        {rooms.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <span className="font-body text-[10px]" style={{ color: '#444', letterSpacing: '0.2em' }}>{emptyLabel}</span>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 p-2">
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
                sealedSetChoice={room.sealedSetChoice}
                onJoin={() => onJoin(room.code)}
              />
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onCreate}
        disabled={disableCreate}
        className="w-full py-3 text-[11px] font-bold no-select transition-opacity"
        style={{
          backgroundColor: disableCreate ? '#2a2a2a' : accent,
          color: accent === '#b33e3e' && !disableCreate ? '#ffffff' : '#0a0a0a',
          letterSpacing: '0.22em',
          cursor: disableCreate ? 'not-allowed' : 'pointer',
          opacity: disableCreate ? 0.45 : 1,
        }}
      >
        {createLabel}
      </button>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getRoomModeLabel(
  gameMode: 'casual' | 'ranked' | 'sealed' | 'evolving' | null,
  isEvolving: boolean,
): { labelKey: string; accent: string } {
  if (gameMode === 'evolving') {
    return { labelKey: 'online.modeLabel.rankedEvolving', accent: '#b33e3e' };
  }
  if (gameMode === 'ranked') {
    return { labelKey: 'online.modeLabel.ranked', accent: '#b33e3e' };
  }
  if (gameMode === 'casual' && isEvolving) {
    return { labelKey: 'online.modeLabel.casualEvolving', accent: '#c4a35a' };
  }
  return { labelKey: 'online.modeLabel.casual', accent: '#c4a35a' };
}

function WaitingRoomHeader({
  gameMode,
  isEvolving,
  createdAt,
}: {
  gameMode: 'casual' | 'ranked' | 'sealed' | 'evolving' | null;
  isEvolving: boolean;
  createdAt: number | null;
}) {
  const t = useTranslations();
  const { labelKey, accent } = getRoomModeLabel(gameMode, isEvolving);
  const elapsed = createdAt ? Date.now() - createdAt : 0;
  return (
    <div className="flex flex-col items-center gap-2 mb-3">
      <span
        className="font-display text-sm font-bold"
        style={{
          color: accent,
          letterSpacing: '0.32em',
          textShadow: `0 0 14px ${accent}55`,
        }}
      >
        {t(labelKey)}
      </span>
      {createdAt !== null && (
        <span
          className="font-body text-[10px]"
          style={{ color: '#777', letterSpacing: '0.3em' }}
        >
          {t('online.roomOpenSince')} · {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-display text-[10px] font-bold px-1"
        style={{ color: '#666', letterSpacing: '0.36em' }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useTranslations();
  const tabs: { key: View; labelKey: string }[] = [
    { key: 'browse', labelKey: 'online.publicRooms' },
    { key: 'private', labelKey: 'online.privateRoom' },
  ];
  return (
    <div className="relative flex w-full" style={{ backgroundColor: 'rgba(15, 15, 20, 0.6)' }}>
      {tabs.map((tab) => {
        const active = view === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative flex-1 py-4 text-[12px] font-bold cursor-pointer no-select"
            style={{
              letterSpacing: '0.3em',
              backgroundColor: 'transparent',
              color: active ? '#f0d089' : '#5a5a5a',
              transition: 'color 0.2s',
              textShadow: active ? '0 0 18px rgba(196, 163, 90, 0.55)' : 'none',
              zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId="view-tab-bg"
                className="absolute inset-x-0"
                style={{
                  top: 0,
                  bottom: 3,
                  backgroundColor: 'rgba(196, 163, 90, 0.04)',
                  zIndex: -1,
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              />
            )}
            {t(tab.labelKey)}
            {active && (
              <motion.span
                layoutId="view-tab-underline"
                className="absolute left-0 right-0"
                style={{
                  bottom: 0,
                  height: 3,
                  backgroundColor: '#c4a35a',
                  boxShadow: '0 0 10px rgba(196, 163, 90, 0.6)',
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SealedToggleBlock({
  checked, onChange, setChoice, onSetChoiceChange, locale,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  setChoice: string;
  onSetChoiceChange: (v: string) => void;
  locale: string;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-1">
      <ToggleRow
        label={t('online.sealed.toggleLabel')}
        description={t('online.sealed.toggleDescription')}
        checked={checked}
        onChange={onChange}
        accent="#c4a35a"
      />
      <div
        className="flex flex-col gap-2 px-3 sm:px-4 py-2.5"
        style={{
          backgroundColor: 'rgba(15, 15, 20, 0.78)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          opacity: checked ? 1 : 0.55,
        }}
      >
        <span className="text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>
          {t('online.sealed.setChoiceLabel')}
        </span>
        <div className="flex flex-wrap gap-2">
          {ALL_SET_IDS.map((sid) => {
            const desc = SET_REGISTRY[sid];
            const name = getSetName(sid, locale);
            const available = isSetSealedReady(sid);
            const selectable = checked && available;
            const isSelected = setChoice === sid;
            return (
              <button
                key={sid}
                type="button"
                onClick={() => selectable && onSetChoiceChange(sid)}
                disabled={!selectable}
                className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-display"
                style={{
                  backgroundColor: isSelected ? '#c4a35a' : '#1a1a1a',
                  color: !selectable ? '#444' : isSelected ? '#0a0a0a' : '#888',
                  cursor: selectable ? 'pointer' : 'not-allowed',
                  opacity: selectable ? 1 : 0.6,
                }}
                title={!available ? t('common.comingSoon') : undefined}
              >
                {name}
                {!available && <span className="ml-1 normal-case opacity-70">({t('common.comingSoon')})</span>}
              </button>
            );
          })}
          <button
            type="button"
            disabled
            className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-display"
            style={{
              backgroundColor: '#1a1a1a',
              color: '#444',
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
            title={t('common.comingSoon')}
          >
            {t('online.sealed.setRandom')}
            <span className="ml-1 normal-case opacity-70">({t('common.comingSoon')})</span>
          </button>
        </div>
      </div>
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

