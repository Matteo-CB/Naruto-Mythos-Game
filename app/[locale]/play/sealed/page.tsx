'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { BoosterOpening } from '@/components/sealed/BoosterOpening';
import { SealedPoolReview } from '@/components/sealed/SealedPoolReview';
import { SealedDeckBuilder } from '@/components/sealed/SealedDeckBuilder';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { AIDifficulty } from '@/lib/ai/AIPlayer';
import type { BoosterCard, BoosterPack, SealedPool } from '@/lib/sealed/boosterGenerator';

type SealedStep =
  | 'loading'
  | 'denied'
  | 'mode-select'
  | 'difficulty'
  | 'online-create'
  | 'online-waiting'
  | 'opening'
  | 'review'
  | 'building'
  | 'starting';

export default function SealedPage() {
  const t = useTranslations('sealed');
  const tc = useTranslations('common');
  const tAI = useTranslations('playAI');
  const tOnline = useTranslations('online');
  const router = useRouter();
  const { data: session } = useSession();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const setSealedDeck = useGameStore((s) => s.setSealedDeck);
  const startOnlineGame = useGameStore((s) => s.startOnlineGame);

  // Socket store for online sealed
  const socketConnect = useSocketStore((s) => s.connect);
  const socketCreateRoom = useSocketStore((s) => s.createRoom);
  const socketJoinRoom = useSocketStore((s) => s.joinRoom);
  const socketSelectDeck = useSocketStore((s) => s.selectDeck);
  const socketConnected = useSocketStore((s) => s.connected);
  const socketRoomCode = useSocketStore((s) => s.roomCode);
  const socketOpponentJoined = useSocketStore((s) => s.opponentJoined);
  const socketGameStarted = useSocketStore((s) => s.gameStarted);
  const socketVisibleState = useSocketStore((s) => s.visibleState);
  const socketPlayerRole = useSocketStore((s) => s.playerRole);
  const socketPlayerNames = useSocketStore((s) => s.playerNames);
  const socketError = useSocketStore((s) => s.error);
  const socketDisconnect = useSocketStore((s) => s.disconnect);
  const publicRooms = useSocketStore((s) => s.publicRooms);
  const requestRoomList = useSocketStore((s) => s.requestRoomList);
  const sealedBoosters = useSocketStore((s) => s.sealedBoosters);
  const sealedAllCards = useSocketStore((s) => s.sealedAllCards);
  const sealedDeadline = useSocketStore((s) => s.sealedDeadline);

  const { status } = useSession();
  const [step, setStep] = useState<SealedStep>('loading');
  const [mode, setMode] = useState<'ai' | 'online' | null>(null);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [sealedPool, setSealedPool] = useState<SealedPool | null>(null);
  const [allOpenedCards, setAllOpenedCards] = useState<BoosterCard[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [onlineView, setOnlineView] = useState<'browse' | 'private'>('browse');
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [boosterCount, setBoosterCount] = useState<4 | 5 | 6>(6);

  // Auth check — redirect to login if not authenticated
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (step === 'loading') {
      setStep('mode-select');
    }
  }, [status, step, router]);

  // When online boosters arrive, transition to opening
  useEffect(() => {
    if (mode === 'online' && sealedBoosters && sealedAllCards && step === 'online-waiting') {
      const pool: SealedPool = {
        boosters: sealedBoosters as BoosterPack[],
        allCards: sealedAllCards as BoosterCard[],
      };
      setSealedPool(pool);
      setStep('opening');
    }
  }, [mode, sealedBoosters, sealedAllCards, step]);

  // When online game starts: initialize gameStore with online state then navigate to /game
  const gameInitRef = useRef(false);
  useEffect(() => {
    if (
      mode === 'online' &&
      socketGameStarted &&
      socketVisibleState &&
      socketPlayerRole &&
      !gameInitRef.current
    ) {
      gameInitRef.current = true;
      const myName = session?.user?.name ?? undefined;
      const oppName = socketPlayerNames
        ? (socketPlayerRole === 'player1' ? socketPlayerNames.player2 : socketPlayerNames.player1)
        : undefined;
      startOnlineGame(socketVisibleState, socketPlayerRole, myName, oppName);
      router.push('/game');
    }
  }, [mode, socketGameStarted, socketVisibleState, socketPlayerRole, startOnlineGame, router, session, socketPlayerNames]);

  const handleModeSelect = useCallback((selectedMode: 'ai' | 'online') => {
    setMode(selectedMode);
    if (selectedMode === 'ai') {
      setStep('difficulty');
    } else {
      setStep('online-create');
    }
  }, []);

  // Connect socket and fetch sealed rooms when entering online-create
  useEffect(() => {
    if (step === 'online-create' && session?.user?.id) {
      (async () => {
        try {
          if (!socketConnected) {
            await socketConnect(session.user.id);
          }
          requestRoomList();
        } catch {
          // Error handled via socket store
        }
      })();
    }
  }, [step, session?.user?.id, socketConnected, socketConnect, requestRoomList]);

  // Cleanup socket on unmount if game not started
  useEffect(() => {
    return () => {
      if (!useSocketStore.getState().gameStarted) {
        socketDisconnect();
      }
    };
  }, [socketDisconnect]);

  const handleOnlineCreatePublic = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      if (!socketConnected) {
        await socketConnect(session.user.id);
      }
      socketCreateRoom(session.user.id, false, false, true, 'sealed', session.user.name ?? undefined, boosterCount);
      setIsPrivateRoom(false);
      setStep('online-waiting');
    } catch {
      // Error handled via socket store
    }
  }, [session?.user?.id, socketConnected, socketConnect, socketCreateRoom, boosterCount]);

  const handleOnlineCreatePrivate = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      if (!socketConnected) {
        await socketConnect(session.user.id);
      }
      socketCreateRoom(session.user.id, true, false, true, 'sealed', session.user.name ?? undefined, boosterCount);
      setIsPrivateRoom(true);
      setStep('online-waiting');
    } catch {
      // Error handled via socket store
    }
  }, [session?.user?.id, socketConnected, socketConnect, socketCreateRoom, boosterCount]);

  const handleOnlineJoin = useCallback(async (code?: string) => {
    const codeToJoin = code || joinCode.trim().toUpperCase();
    if (!session?.user?.id || !codeToJoin) return;
    try {
      if (!socketConnected) {
        await socketConnect(session.user.id);
      }
      socketJoinRoom(codeToJoin, session.user.id);
      setStep('online-waiting');
    } catch {
      // Error handled via socket store
    }
  }, [session?.user?.id, joinCode, socketConnected, socketConnect, socketJoinRoom]);

  const handleDifficultySelect = useCallback((diff: AIDifficulty) => {
    setDifficulty(diff);

    // Generate boosters
    import('@/lib/sealed/boosterGenerator').then((mod) => {
      try {
        const pool = mod.generateSealedPool(boosterCount);
        setSealedPool(pool);
        setStep('opening');
      } catch (err) {
        console.error('[Sealed] Booster generation failed:', err);
        setStep('mode-select');
      }
    }).catch((err) => {
      console.error('[Sealed] Failed to load booster module:', err);
      setStep('mode-select');
    });
  }, [boosterCount]);

  const handleBoostersComplete = useCallback((cards: BoosterCard[]) => {
    setAllOpenedCards(cards);
    setStep('review');
  }, []);

  const handleContinueToBuilding = useCallback(() => {
    setStep('building');
  }, []);

  const handleDeckReady = useCallback(
    (characters: CharacterCard[], missions: MissionCard[]) => {
      if (mode === 'ai') {
        setStep('starting');

        // Generate AI boosters and build AI deck
        Promise.all([
          import('@/lib/sealed/boosterGenerator'),
          import('@/lib/sealed/aiSealedDeckBuilder'),
          import('@/lib/data/cardLoader'),
        ]).then(([boosterMod, aiMod, cardMod]) => {
          try {
            const aiPool = boosterMod.generateSealedPool(boosterCount);
            const aiDeck = aiMod.buildAISealedDeck(aiPool);

            // AI missions: try to avoid overlap with player
            const playerMissionIds = new Set(missions.map((m) => m.id));
            let aiMissions = aiDeck.missions.filter((m) => !playerMissionIds.has(m.id));
            if (aiMissions.length < 3) {
              const allMissions = cardMod.getPlayableMissions();
              const remaining = allMissions.filter((m) => !playerMissionIds.has(m.id));
              aiMissions = [...remaining].sort(() => Math.random() - 0.5).slice(0, 3);
              if (aiMissions.length < 3) {
                aiMissions = aiDeck.missions.slice(0, 3);
              }
            }

            const config: GameConfig = {
              player1: {
                userId: 'local-player',
                isAI: false,
                deck: characters,
                missionCards: missions,
              },
              player2: {
                userId: null,
                isAI: true,
                aiDifficulty: difficulty,
                deck: aiDeck.characters,
                missionCards: aiMissions,
              },
            };

            setSealedDeck(
              characters.map((c) => c.id),
              missions.map((m) => m.id),
            );

            startAIGame(config, difficulty, session?.user?.name ?? undefined);
            router.push('/game');
          } catch (err) {
            console.error('[Sealed] AI deck generation failed:', err);
            setStep('building');
          }
        }).catch((err) => {
          console.error('[Sealed] Failed to load sealed modules:', err);
          setStep('building');
        });
      } else if (mode === 'online') {
        // Submit deck via socket
        setSealedDeck(
          characters.map((c) => c.id),
          missions.map((m) => m.id),
        );
        socketSelectDeck(characters, missions);
        setStep('starting');
      }
    },
    [mode, difficulty, startAIGame, setSealedDeck, session?.user?.name, router, socketSelectDeck],
  );

  const handleTimeUp = useCallback(() => {
    router.push('/');
  }, [router]);

  // Compute remaining seconds for online timer
  const onlineTimerSeconds = sealedDeadline
    ? Math.max(0, Math.floor((sealedDeadline - Date.now()) / 1000))
    : 900;

  // Filter public rooms to sealed mode only
  const sealedPublicRooms = publicRooms.filter((r) => r.gameMode === 'sealed');

  const DIFFICULTIES = [
    { key: 'easy' as AIDifficulty, label: tAI('difficulties.easy'), description: tAI('difficulties.easyDesc') },
    { key: 'medium' as AIDifficulty, label: tAI('difficulties.medium'), description: tAI('difficulties.mediumDesc') },
    { key: 'hard' as AIDifficulty, label: tAI('difficulties.hard'), description: tAI('difficulties.hardDesc') },
    { key: 'expert' as AIDifficulty, label: tAI('difficulties.expert'), description: tAI('difficulties.expertDesc') },
  ];

  // Loading state
  if (step === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <span className="text-sm" style={{ color: '#888888' }}>{tc('loading')}</span>
      </main>
    );
  }

  // Access denied
  if (step === 'denied') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="flex flex-col items-center gap-4">
          <span className="text-sm" style={{ color: '#b33e3e' }}>{t('restricted')}</span>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 text-sm rounded cursor-pointer"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888' }}
          >
            {tc('back')}
          </button>
        </div>
      </main>
    );
  }

  // Booster opening
  if (step === 'opening' && sealedPool) {
    return <BoosterOpening boosters={sealedPool.boosters} onComplete={handleBoostersComplete} />;
  }

  // Pool review
  if (step === 'review' && allOpenedCards.length > 0) {
    return <SealedPoolReview cards={allOpenedCards} onContinue={handleContinueToBuilding} />;
  }

  // Deck building
  if (step === 'building' && allOpenedCards.length > 0) {
    return (
      <SealedDeckBuilder
        pool={allOpenedCards}
        isOnline={mode === 'online'}
        timerSeconds={mode === 'online' ? onlineTimerSeconds : 900}
        onDeckReady={handleDeckReady}
        onTimeUp={handleTimeUp}
      />
    );
  }

  // Starting game / waiting for opponent deck
  if (step === 'starting') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.span
            className="text-lg font-bold"
            style={{ color: '#c4a35a' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {mode === 'online' ? t('waitingOpponent') : tc('loading')}
          </motion.span>
        </motion.div>
      </main>
    );
  }

  // Mode selection, difficulty, and online create pages
  return (
    <main id="main-content" className="flex min-h-screen relative flex-col bg-[#0a0a0a]">
      <CloudBackground />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center gap-6 max-w-md w-full relative z-10">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-1" style={{ color: '#e0e0e0' }}>
              {t('title')}
            </h1>
            <p className="text-sm" style={{ color: '#888888' }}>
              {t('descriptionWithCount', { count: boosterCount })}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {/* Mode selection */}
            {step === 'mode-select' && (
              <motion.div
                key="mode-select"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-3 w-full"
              >
                <button
                  onClick={() => handleModeSelect('ai')}
                  className="flex flex-col items-start p-4 border transition-colors text-left hover:bg-[#1a1a1a] hover:border-[#c4a35a] cursor-pointer"
                  style={{ backgroundColor: '#141414', borderColor: '#262626' }}
                >
                  <span className="text-base font-medium" style={{ color: '#e0e0e0' }}>
                    {t('vsAI')}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: '#666' }}>
                    {t('vsAIDesc')}
                  </span>
                </button>
                <button
                  onClick={() => handleModeSelect('online')}
                  disabled={!session?.user}
                  className="flex flex-col items-start p-4 border transition-colors text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1a1a1a] hover:border-[#c4a35a]"
                  style={{ backgroundColor: '#141414', borderColor: '#262626' }}
                >
                  <span className="text-base font-medium" style={{ color: '#e0e0e0' }}>
                    {t('online')}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: '#666' }}>
                    {t('onlineDesc')}
                  </span>
                </button>
              </motion.div>
            )}

            {/* Difficulty selection (AI mode) */}
            {step === 'difficulty' && (
              <motion.div
                key="difficulty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-2 w-full"
              >
                {/* Booster count selector */}
                <div className="flex items-center justify-between p-3 rounded-lg mb-1" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                    {t('boosterCountLabel')}
                  </span>
                  <div className="flex rounded overflow-hidden" style={{ border: '1px solid #333' }}>
                    {([4, 5, 6] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setBoosterCount(n)}
                        className="px-4 py-1.5 text-sm font-bold transition-colors cursor-pointer"
                        style={{
                          backgroundColor: boosterCount === n ? '#c4a35a' : '#0a0a0a',
                          color: boosterCount === n ? '#0a0a0a' : '#666',
                          borderLeft: n > 4 ? '1px solid #333' : undefined,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#888888' }}>
                  {tAI('selectDifficulty')}
                </p>
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => handleDifficultySelect(d.key)}
                    className="flex flex-col items-start p-4 border transition-colors text-left hover:bg-[#1a1a1a] hover:border-[#c4a35a] cursor-pointer"
                    style={{ backgroundColor: '#141414', borderColor: '#262626' }}
                  >
                    <span className="text-base font-medium" style={{ color: '#e0e0e0' }}>{d.label}</span>
                    <span className="text-xs mt-0.5" style={{ color: '#666' }}>{d.description}</span>
                  </button>
                ))}
              </motion.div>
            )}

            {/* Online room creation/join */}
            {step === 'online-create' && (
              <motion.div
                key="online-create"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-4 w-full"
              >
                {/* Booster count selector */}
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                    {t('boosterCountLabel')}
                  </span>
                  <div className="flex rounded overflow-hidden" style={{ border: '1px solid #333' }}>
                    {([4, 5, 6] as const).map((n) => (
                      <button
                        key={n}
                        onClick={() => setBoosterCount(n)}
                        className="px-4 py-1.5 text-sm font-bold transition-colors cursor-pointer"
                        style={{
                          backgroundColor: boosterCount === n ? '#c4a35a' : '#0a0a0a',
                          color: boosterCount === n ? '#0a0a0a' : '#666',
                          borderLeft: n > 4 ? '1px solid #333' : undefined,
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Browse / Private toggle */}
                <div
                  className="flex w-full rounded-lg overflow-hidden"
                  style={{ border: '1px solid #262626' }}
                >
                  <button
                    onClick={() => setOnlineView('browse')}
                    className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    style={{
                      backgroundColor: onlineView === 'browse' ? '#141414' : '#0a0a0a',
                      borderRight: '1px solid #262626',
                      color: onlineView === 'browse' ? '#e0e0e0' : '#555555',
                    }}
                  >
                    {tOnline('publicRooms')}
                  </button>
                  <button
                    onClick={() => setOnlineView('private')}
                    className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    style={{
                      backgroundColor: onlineView === 'private' ? '#141414' : '#0a0a0a',
                      color: onlineView === 'private' ? '#e0e0e0' : '#555555',
                    }}
                  >
                    {tOnline('privateRoom')}
                  </button>
                </div>

                {/* Public rooms browse */}
                {onlineView === 'browse' && (
                  <>
                    <div
                      className="w-full rounded-lg overflow-hidden"
                      style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                    >
                      {sealedPublicRooms.length === 0 ? (
                        <div className="p-8 text-center">
                          <p className="text-xs" style={{ color: '#555555' }}>
                            {tOnline('noRooms')}
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {sealedPublicRooms.map((room) => (
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
                                  {formatTimeAgo(room.createdAt, tOnline)}
                                </span>
                              </div>
                              <button
                                onClick={() => handleOnlineJoin(room.code)}
                                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider cursor-pointer"
                                style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                              >
                                {tOnline('join')}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleOnlineCreatePublic}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >
                      {tOnline('createPublicRoom')}
                    </button>
                  </>
                )}

                {/* Private room */}
                {onlineView === 'private' && (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleOnlineCreatePrivate}
                      className="w-full py-3 text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >
                      {tOnline('createPrivateRoom')}
                    </button>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs uppercase tracking-wider" style={{ color: '#888' }}>
                        {tOnline('joinRoom')}
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && handleOnlineJoin()}
                          placeholder={tOnline('roomCode')}
                          maxLength={6}
                          className="flex-1 px-3 py-2 text-sm rounded uppercase tracking-wider text-center"
                          style={{
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #333',
                            color: '#e0e0e0',
                            outline: 'none',
                            letterSpacing: '0.2em',
                          }}
                        />
                        <button
                          onClick={() => handleOnlineJoin()}
                          disabled={joinCode.trim().length < 6}
                          className="px-4 py-2 text-sm font-bold uppercase rounded cursor-pointer disabled:opacity-40"
                          style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                        >
                          {tOnline('join')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {socketError && (
                  <span className="text-xs" style={{ color: '#b33e3e' }}>{socketError}</span>
                )}
              </motion.div>
            )}

            {/* Online waiting room */}
            {step === 'online-waiting' && (
              <motion.div
                key="online-waiting"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-4 w-full"
              >
                {socketRoomCode && isPrivateRoom && (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: '#888' }}>
                      {tOnline('roomCode')}
                    </span>
                    <span
                      className="text-3xl font-bold tracking-[0.3em]"
                      style={{ color: '#c4a35a' }}
                    >
                      {socketRoomCode}
                    </span>
                  </div>
                )}

                <motion.span
                  className="text-sm"
                  style={{ color: '#888' }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {socketOpponentJoined
                    ? t('waitingBoosters')
                    : t('waitingOpponent')}
                </motion.span>

                {!socketConnected && (
                  <span className="text-xs" style={{ color: '#b33e3e' }}>
                    {tOnline('connecting')}
                  </span>
                )}

                {socketError && (
                  <span className="text-xs" style={{ color: '#b33e3e' }}>{socketError}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Back button */}
          <button
            onClick={() => {
              if (step === 'difficulty') {
                setStep('mode-select');
              } else if (step === 'online-create') {
                setStep('mode-select');
              } else if (step === 'online-waiting') {
                setStep('online-create');
              } else {
                router.push('/');
              }
            }}
            className="h-12 px-6 bg-[#141414] border border-[#262626] text-[#888888] font-medium hover:bg-[#1a1a1a] transition-colors cursor-pointer"
          >
            {tc('back')}
          </button>
        </div>
      </div>
      <Footer />
    </main>
  );
}

function formatTimeAgo(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('timeJustNow');
  const minutes = Math.floor(seconds / 60);
  return t('timeMinutesAgo', { minutes });
}
