'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { BoosterOpening } from '@/components/draft/BoosterOpening';
import { DraftPoolReview } from '@/components/draft/DraftPoolReview';
import { DraftDeckBuilder } from '@/components/draft/DraftDeckBuilder';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { AIDifficulty } from '@/lib/ai/AIPlayer';
import type { BoosterCard, BoosterPack, DraftPool } from '@/lib/draft/boosterGenerator';

type DraftStep =
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

export default function DraftPage() {
  const t = useTranslations('draft');
  const tc = useTranslations('common');
  const tAI = useTranslations('playAI');
  const tOnline = useTranslations('playOnline');
  const router = useRouter();
  const { data: session } = useSession();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const setDraftDeck = useGameStore((s) => s.setDraftDeck);

  // Socket store for online draft
  const socketConnect = useSocketStore((s) => s.connect);
  const socketCreateRoom = useSocketStore((s) => s.createRoom);
  const socketJoinRoom = useSocketStore((s) => s.joinRoom);
  const socketSelectDeck = useSocketStore((s) => s.selectDeck);
  const socketConnected = useSocketStore((s) => s.connected);
  const socketRoomCode = useSocketStore((s) => s.roomCode);
  const socketOpponentJoined = useSocketStore((s) => s.opponentJoined);
  const socketGameStarted = useSocketStore((s) => s.gameStarted);
  const socketError = useSocketStore((s) => s.error);
  const draftBoosters = useSocketStore((s) => s.draftBoosters);
  const draftAllCards = useSocketStore((s) => s.draftAllCards);
  const draftDeadline = useSocketStore((s) => s.draftDeadline);

  const [step, setStep] = useState<DraftStep>('loading');
  const [mode, setMode] = useState<'ai' | 'online' | null>(null);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [draftPool, setDraftPool] = useState<DraftPool | null>(null);
  const [allOpenedCards, setAllOpenedCards] = useState<BoosterCard[]>([]);
  const [joinCode, setJoinCode] = useState('');

  // Check access on load
  useEffect(() => {
    fetch('/api/draft/access')
      .then((res) => res.json())
      .then((data) => {
        if (data.canAccess) {
          setStep('mode-select');
        } else {
          setStep('denied');
        }
      })
      .catch(() => setStep('denied'));
  }, []);

  // When online boosters arrive, transition to opening
  useEffect(() => {
    if (mode === 'online' && draftBoosters && draftAllCards && step === 'online-waiting') {
      const pool: DraftPool = {
        boosters: draftBoosters as BoosterPack[],
        allCards: draftAllCards as BoosterCard[],
      };
      setDraftPool(pool);
      setStep('opening');
    }
  }, [mode, draftBoosters, draftAllCards, step]);

  // When online game starts, redirect to game page
  useEffect(() => {
    if (mode === 'online' && socketGameStarted) {
      router.push('/game');
    }
  }, [mode, socketGameStarted, router]);

  const handleModeSelect = useCallback((selectedMode: 'ai' | 'online') => {
    setMode(selectedMode);
    if (selectedMode === 'ai') {
      setStep('difficulty');
    } else {
      setStep('online-create');
    }
  }, []);

  const handleOnlineCreate = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      await socketConnect(session.user.id);
      socketCreateRoom(session.user.id, true, false, true); // isDraft = true
      setStep('online-waiting');
    } catch {
      // Error handled via socket store
    }
  }, [session?.user?.id, socketConnect, socketCreateRoom]);

  const handleOnlineJoin = useCallback(async () => {
    if (!session?.user?.id || !joinCode.trim()) return;
    try {
      await socketConnect(session.user.id);
      socketJoinRoom(joinCode.trim().toUpperCase(), session.user.id);
      setStep('online-waiting');
    } catch {
      // Error handled via socket store
    }
  }, [session?.user?.id, joinCode, socketConnect, socketJoinRoom]);

  const handleDifficultySelect = useCallback((diff: AIDifficulty) => {
    setDifficulty(diff);

    // Generate boosters
    import('@/lib/draft/boosterGenerator').then((mod) => {
      const pool = mod.generateDraftPool(6);
      setDraftPool(pool);
      setStep('opening');
    });
  }, []);

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
        import('@/lib/draft/boosterGenerator').then((boosterMod) => {
          import('@/lib/draft/aiDraftDeckBuilder').then((aiMod) => {
            import('@/lib/data/cardLoader').then((cardMod) => {
              const aiPool = boosterMod.generateDraftPool(6);
              const aiDeck = aiMod.buildAIDraftDeck(aiPool);

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

              setDraftDeck(
                characters.map((c) => c.id),
                missions.map((m) => m.id),
              );

              startAIGame(config, difficulty, session?.user?.name ?? undefined);
              router.push('/game');
            });
          });
        });
      } else if (mode === 'online') {
        // Submit deck via socket
        setDraftDeck(
          characters.map((c) => c.id),
          missions.map((m) => m.id),
        );
        socketSelectDeck(characters, missions);
        setStep('starting');
      }
    },
    [mode, difficulty, startAIGame, setDraftDeck, session?.user?.name, router, socketSelectDeck],
  );

  const handleTimeUp = useCallback(() => {
    router.push('/');
  }, [router]);

  // Compute remaining seconds for online timer
  const onlineTimerSeconds = draftDeadline
    ? Math.max(0, Math.floor((draftDeadline - Date.now()) / 1000))
    : 900;

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
  if (step === 'opening' && draftPool) {
    return <BoosterOpening boosters={draftPool.boosters} onComplete={handleBoostersComplete} />;
  }

  // Pool review
  if (step === 'review' && allOpenedCards.length > 0) {
    return <DraftPoolReview cards={allOpenedCards} onContinue={handleContinueToBuilding} />;
  }

  // Deck building
  if (step === 'building' && allOpenedCards.length > 0) {
    return (
      <DraftDeckBuilder
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
              {t('description')}
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
                <button
                  onClick={handleOnlineCreate}
                  className="flex flex-col items-start p-4 border transition-colors text-left hover:bg-[#1a1a1a] hover:border-[#c4a35a] cursor-pointer"
                  style={{ backgroundColor: '#141414', borderColor: '#262626' }}
                >
                  <span className="text-base font-medium" style={{ color: '#e0e0e0' }}>
                    {tOnline('createRoom')}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: '#666' }}>
                    {tOnline('createRoomDesc')}
                  </span>
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
                      onClick={handleOnlineJoin}
                      disabled={joinCode.trim().length < 6}
                      className="px-4 py-2 text-sm font-bold uppercase rounded cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >
                      {tOnline('join')}
                    </button>
                  </div>
                </div>

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
                {socketRoomCode && (
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
