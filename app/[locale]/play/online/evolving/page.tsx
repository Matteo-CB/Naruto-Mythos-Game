'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { EvolvingTop5 } from '@/components/evolving/EvolvingTop5';
import { EvolvingRulesModal } from '@/components/deckBuilder/EvolvingRulesModal';
import { LiveGamesSection } from '@/components/online/LiveGamesSection';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

type View = 'browse' | 'private';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
  id?: string;
}

const GOLD = '#c4a35a';
const PANEL_BG = '#111111';
const PANEL_BG_DEEP = '#0e0e0e';
const BORDER = '#262626';
const BORDER_SOFT = '#1a1a1a';
const TEXT_LIGHT = '#e0e0e0';
const TEXT_DIM = '#888888';
const TEXT_DARK = '#555555';

function formatTimeAgo(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('online.timeJustNow');
  const minutes = Math.floor(seconds / 60);
  return t('online.timeMinutesAgo', { minutes });
}

export default function PlayOnlineEvolvingPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>('browse');
  const [joinCode, setJoinCode] = useState('');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deckSelected, setDeckSelected] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [showRules, setShowRules] = useState(false);

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
    unsubscribeRoomList,
    clearError,
  } = useSocketStore();

  const startOnlineGame = useGameStore((s) => s.startOnlineGame);
  const playerNames = useSocketStore((s) => s.playerNames);

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
    } catch {

    }
  }, [session?.user?.id, connected, connect, requestRoomList]);

  useEffect(() => {
    if (session?.user?.id) {
      connectAndFetch();
    }
    return () => {
      unsubscribeRoomList();
    };
  }, [session?.user?.id, connectAndFetch, unsubscribeRoomList]);

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

  const maintenanceWarning = useSocketStore((s) => s.maintenanceWarning);
  useEffect(() => {
    if (maintenanceWarning && !gameStarted) {
      router.push('/maintenance');
    }
  }, [maintenanceWarning, gameStarted, router]);

  useEffect(() => {
    if (gameStarted && visibleState && playerRole) {
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
            <h1
              className="text-2xl font-bold tracking-wider uppercase"
              style={{ color: GOLD }}
            >
              {t('evolving.lobby.title')}
            </h1>
            <p className="text-sm" style={{ color: TEXT_DIM }}>
              {t('online.signInRequired')}
            </p>
            <div className="flex gap-3">
              <Link
                href="/login"
                className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: GOLD, color: '#0a0a0a' }}
              >
                {t('common.signIn')}
              </Link>
              <Link
                href="/"
                className="px-6 py-2.5 text-sm"
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${BORDER}`,
                  color: TEXT_DIM,
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
        await connect(session.user.id, session.user.name ?? undefined);
      }
      createRoom(session.user.id, false, true, false, 'evolving', session.user.name ?? undefined, undefined, undefined, false);
    } catch {

    }
  };

  const handleCreatePrivateRoom = async () => {
    try {
      if (!connected) {
        await connect(session.user.id, session.user.name ?? undefined);
      }
      createRoom(session.user.id, true, true, false, 'evolving', session.user.name ?? undefined, undefined, undefined);
    } catch {

    }
  };

  const handleJoinRoom = async (code?: string) => {
    const codeToJoin = code || joinCode.trim().toUpperCase();
    if (!codeToJoin) return;
    try {
      if (!connected) {
        await connect(session.user.id, session.user.name ?? undefined);
      }
      joinRoom(codeToJoin, session.user.id);
    } catch {

    }
  };

  const handleDeckSelect = (deck: ResolvedDeck) => {
    selectDeck(deck.characters, deck.missions, deck.id);
    setDeckSelected(true);
  };

  const evolvingRooms = publicRooms.filter((r) => r.gameMode === 'evolving');

  const showDeckSelector = roomCode && opponentJoined && !deckSelected && cards;

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
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            <h1
              className="text-2xl font-bold tracking-wider uppercase"
              style={{ color: GOLD }}
            >
              {t('evolving.lobby.title')}
            </h1>
            <button
              onClick={() => setShowRules(true)}
              aria-label={t('evolving.rules.title')}
              className="inline-flex items-center justify-center text-xs font-bold transition-colors"
              style={{
                color: GOLD,
                border: `1px solid ${GOLD}`,
                backgroundColor: 'rgba(196, 163, 90, 0.05)',
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              ?
            </button>
          </motion.div>

          <p className="text-xs -mt-3" style={{ color: TEXT_DARK }}>
            {t('evolving.lobbySubtitle')}
          </p>

          <p className="text-xs" style={{ color: TEXT_DARK }}>
            {t('online.signedInAs', { name: session.user.name })}
          </p>

          {error && (
            <div
              className="w-full rounded px-4 py-3 text-xs"
              style={{ backgroundColor: '#1a0a0a', border: '1px solid #b33e3e', color: '#b33e3e' }}
            >
              {error}
            </div>
          )}

          {!showDeckSelector && !deckSelected && !roomCode && (
            <EvolvingTop5 />
          )}

          {showDeckSelector && cards && (
            <div
              className="w-full rounded-lg p-6"
              style={{ backgroundColor: '#141414', border: `1px solid ${BORDER}` }}
            >
              <div className="mb-4 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER_SOFT}` }}>
                <span className="text-[11px] uppercase tracking-[0.2em] font-bold" style={{ color: GOLD }}>
                  {t('evolving.lobby.pickDeckTitle')}
                </span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                  {t('evolving.lobby.evolvingDecksOnly')}
                </span>
              </div>
              <DeckSelector
                onSelect={handleDeckSelect}
                allCharacters={cards.characters}
                allMissions={cards.missions}
                evolvingOnly
              />
            </div>
          )}

          {deckSelected && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs" style={{ color: GOLD }}>
                {opponentChangingDeck ? t('online.opponentChangingDeck') : t('online.waitingForOpponent')}
              </p>
              <button
                onClick={() => { changeDeck(); setDeckSelected(false); }}
                className="px-4 py-2 text-xs rounded cursor-pointer"
                style={{ backgroundColor: '#141414', border: '1px solid #333', color: TEXT_DIM }}
              >
                {t('online.changeDeck')}
              </button>
            </div>
          )}

          {!showDeckSelector && !deckSelected && (
            <>
              <div
                className="flex w-full rounded-lg overflow-hidden"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <button
                  onClick={() => setView('browse')}
                  className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: view === 'browse' ? '#141414' : '#0a0a0a',
                    borderRight: `1px solid ${BORDER}`,
                    color: view === 'browse' ? TEXT_LIGHT : TEXT_DARK,
                  }}
                >
                  {t('online.publicRooms')}
                </button>
                <button
                  onClick={() => setView('private')}
                  className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: view === 'private' ? '#141414' : '#0a0a0a',
                    color: view === 'private' ? TEXT_LIGHT : TEXT_DARK,
                  }}
                >
                  {t('online.privateRoom')}
                </button>
              </div>

              {view === 'browse' && !roomCode && (
                <div className="w-full flex flex-col gap-3">
                  <div className="flex flex-col">
                    <div className="px-3 py-2" style={{ backgroundColor: PANEL_BG, borderBottom: `2px solid ${GOLD}` }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GOLD }}>
                        {t('evolving.lobby.publicRoomsHeader')}
                      </span>
                    </div>
                    <div style={{ backgroundColor: PANEL_BG, minHeight: '80px' }}>
                      {evolvingRooms.length === 0 ? (
                        <div className="px-3 py-5 text-center">
                          <span className="text-[10px]" style={{ color: '#444' }}>
                            {t('online.noRooms')}
                          </span>
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          {evolvingRooms.map((room) => (
                            <div
                              key={room.code}
                              className="flex items-center justify-between px-3 py-2"
                              style={{ borderBottom: `1px solid ${BORDER_SOFT}` }}
                            >
                              <div className="flex flex-col">
                                <span
                                  className="text-xs font-medium"
                                  style={{
                                    color: room.hostName === '__anonymous__' ? TEXT_DIM : '#ddd',
                                    fontStyle: room.hostName === '__anonymous__' ? 'italic' : 'normal',
                                  }}
                                >
                                  {room.hostName === '__anonymous__' ? t('online.anonymous.name') : room.hostName}
                                </span>
                                <span className="text-[9px]" style={{ color: TEXT_DARK }}>
                                  {formatTimeAgo(room.createdAt, t)}
                                </span>
                              </div>
                              <button
                                onClick={() => handleJoinRoom(room.code)}
                                className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                style={{ backgroundColor: GOLD, color: '#0a0a0a' }}
                              >
                                {t('online.join')}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleCreatePublicRoom}
                      className="w-full py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                      style={{ backgroundColor: GOLD, color: '#0a0a0a' }}
                    >
                      {t('evolving.lobby.createPublicEvolvingRoom')}
                    </button>
                  </div>

                  <LiveGamesSection filter="evolving" />
                </div>
              )}

              {view === 'browse' && roomCode && (
                <div
                  className="w-full rounded-lg p-6"
                  style={{ backgroundColor: '#141414', border: `1px solid ${BORDER}` }}
                >
                  <div className="flex flex-col gap-4 items-center">
                    <p className="text-sm font-bold" style={{ color: GOLD }}>
                      {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                    </p>
                  </div>
                </div>
              )}

              {view === 'private' && (
                <div
                  className="w-full rounded-lg p-6"
                  style={{ backgroundColor: '#141414', border: `1px solid ${BORDER}` }}
                >
                  {roomCode ? (
                    <div className="flex flex-col gap-4 items-center">
                      <p className="text-xs" style={{ color: TEXT_DIM }}>
                        {t('online.roomCreated')}
                      </p>
                      <p
                        className="text-3xl font-bold tracking-[0.3em]"
                        style={{ color: GOLD }}
                      >
                        {roomCode}
                      </p>
                      <p className="text-xs" style={{ color: TEXT_DARK }}>
                        {opponentJoined ? t('online.opponentJoined') : t('online.waitingForOpponent')}
                      </p>
                    </div>
                  ) : showJoinInput ? (
                    <div className="flex flex-col gap-4 items-center">
                      <p className="text-xs" style={{ color: TEXT_DIM }}>
                        {t('online.enterCode')}
                      </p>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                        maxLength={6}
                        placeholder={t('online.codePlaceholder')}
                        className="w-full text-center text-2xl font-bold tracking-[0.3em] rounded py-3 outline-none uppercase"
                        style={{
                          backgroundColor: '#0a0a0a',
                          border: `1px solid ${BORDER}`,
                          color: TEXT_LIGHT,
                        }}
                      />
                      <button
                        onClick={() => handleJoinRoom()}
                        disabled={joinCode.length < 6}
                        className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                        style={{
                          backgroundColor: joinCode.length < 6 ? '#333333' : GOLD,
                          color: '#0a0a0a',
                        }}
                      >
                        {t('online.joinRoom')}
                      </button>
                      <button
                        onClick={() => setShowJoinInput(false)}
                        className="text-xs underline"
                        style={{ color: TEXT_DIM }}
                      >
                        {t('common.back')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div
                        className="px-3 py-2 mb-1"
                        style={{ backgroundColor: PANEL_BG_DEEP, borderLeft: `2px solid ${GOLD}` }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: GOLD }}>
                          {t('evolving.lobby.title')}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: TEXT_DARK }}>
                          {t('evolving.lobby.privateRoomDesc')}
                        </p>
                      </div>

                      <button
                        onClick={handleCreatePrivateRoom}
                        className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                        style={{ backgroundColor: GOLD, color: '#0a0a0a' }}
                      >
                        {t('online.createPrivateRoom')}
                      </button>
                      <button
                        onClick={() => setShowJoinInput(true)}
                        className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                        style={{
                          backgroundColor: '#141414',
                          border: `1px solid ${BORDER}`,
                          color: TEXT_LIGHT,
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
            href={'/play' as '/play'}
            className="px-6 py-2 text-sm transition-colors"
            style={{
              backgroundColor: '#141414',
              border: `1px solid ${BORDER}`,
              color: TEXT_DIM,
            }}
          >
            {t('auth.backToHome')}
          </Link>
        </div>
      </div>
      <Footer />

      <EvolvingRulesModal open={showRules} onClose={() => setShowRules(false)} />
    </main>
  );
}
