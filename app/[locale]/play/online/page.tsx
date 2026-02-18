'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useSocketStore } from '@/lib/socket/client';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

type Tab = 'create' | 'join' | 'matchmaking';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

export default function PlayOnlinePage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [joinCode, setJoinCode] = useState('');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deckSelected, setDeckSelected] = useState(false);

  const {
    connected,
    roomCode,
    opponentJoined,
    matchmakingStatus,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    selectDeck,
    joinMatchmaking,
    leaveMatchmaking,
    clearError,
  } = useSocketStore();

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const characters = mod.getPlayableCharacters();
      const missions = mod.getPlayableMissions();
      setCards({ characters, missions });
    });
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Auto-join room from match invite (via ?room= query param)
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && session?.user?.id && !connected) {
      connect(session.user.id);
      setActiveTab('join');
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
      <div
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
      </div>
    );
  }

  const handleCreateRoom = async () => {
    if (!connected) {
      await connect(session.user.id);
    }
    createRoom(session.user.id, true);
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return;
    if (!connected) {
      await connect(session.user.id);
    }
    joinRoom(joinCode.trim().toUpperCase(), session.user.id);
  };

  const handleMatchmaking = async () => {
    if (!connected) {
      await connect(session.user.id);
    }
    joinMatchmaking(session.user.id);
  };

  const handleDeckSelect = (deck: ResolvedDeck) => {
    selectDeck(deck.characters, deck.missions);
    setDeckSelected(true);
  };

  const tabStyle = (tab: Tab) => ({
    backgroundColor: activeTab === tab ? '#1a1a1a' : '#0a0a0a',
    borderBottom: activeTab === tab ? '2px solid #c4a35a' : '2px solid transparent',
    color: activeTab === tab ? '#e0e0e0' : '#555555',
  });

  // Show deck selector once in a room and opponent has joined
  const showDeckSelector = roomCode && opponentJoined && !deckSelected && cards;

  return (
    <div
      className="flex min-h-screen relative flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="playOnline" />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 max-w-md w-full relative z-10">
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

        {/* Tab navigation (hide once deck selection is shown) */}
        {!showDeckSelector && !deckSelected && (
          <>
            <div className="flex w-full">
              {(['create', 'join', 'matchmaking'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors"
                  style={tabStyle(tab)}
                >
                  {tab === 'create' ? t('online.createRoom') : tab === 'join' ? t('online.joinRoom') : t('online.findMatch')}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div
              className="w-full rounded-lg p-6"
              style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
            >
              {activeTab === 'create' && (
                <div className="flex flex-col gap-4 items-center">
                  {roomCode ? (
                    <>
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
                    </>
                  ) : (
                    <button
                      onClick={handleCreateRoom}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >
                      {t('online.createRoom')}
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'join' && (
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
                    onClick={handleJoinRoom}
                    disabled={joinCode.length < 6}
                    className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                    style={{
                      backgroundColor: joinCode.length < 6 ? '#333333' : '#c4a35a',
                      color: '#0a0a0a',
                    }}
                  >
                    {t('online.joinRoom')}
                  </button>
                </div>
              )}

              {activeTab === 'matchmaking' && (
                <div className="flex flex-col gap-4 items-center">
                  {matchmakingStatus === 'idle' && (
                    <>
                      <p className="text-xs" style={{ color: '#888888' }}>
                        {t('online.findMatch')}
                      </p>
                      <button
                        onClick={handleMatchmaking}
                        className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors"
                        style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                      >
                        {t('online.startMatchmaking')}
                      </button>
                    </>
                  )}
                  {matchmakingStatus === 'waiting' && (
                    <>
                      <p className="text-sm" style={{ color: '#e0e0e0' }}>
                        {t('online.searching')}
                      </p>
                      <div
                        className="w-8 h-8 rounded-full border-2 animate-spin"
                        style={{
                          borderColor: '#262626',
                          borderTopColor: '#c4a35a',
                        }}
                      />
                      <button
                        onClick={leaveMatchmaking}
                        className="text-xs underline"
                        style={{ color: '#888888' }}
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  )}
                  {matchmakingStatus === 'found' && (
                    <p className="text-sm" style={{ color: '#c4a35a' }}>
                      {t('online.matchFound')}
                    </p>
                  )}
                </div>
              )}
            </div>
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
    </div>
  );
}
