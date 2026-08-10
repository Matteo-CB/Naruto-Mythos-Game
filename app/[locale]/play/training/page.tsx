'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { useSession } from 'next-auth/react';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useGameStore } from '@/stores/gameStore';
import { useTrainingStore } from '@/stores/trainingStore';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { AIDifficulty } from '@/lib/ai/AIPlayer';
import { useBannedCards } from '@/lib/hooks/useBannedCards';
import { isLockedVariant } from '@/lib/variants/constants';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

const DIFFICULTIES: { key: AIDifficulty; color: string }[] = [
  { key: 'easy', color: 'var(--t-success)' },
  { key: 'medium', color: 'var(--t-accent)' },
  { key: 'hard', color: '#f97316' },
  { key: 'impossible', color: 'var(--t-danger)' },
];

export default function TrainingPage() {
  const t = useTranslations('training');
  const tc = useTranslations('common');
  const { data: session } = useSession();
  const router = useRouter();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const enableTraining = useTrainingStore((s) => s.enable);
  const resetTraining = useTrainingStore((s) => s.reset);

  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<ResolvedDeck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { bannedIds } = useBannedCards();
  const { unlockedIds } = useUnlockedVariants();

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      setCards({
        characters: [...mod.getPlayableCharacters(), ...(mod.getPlayableAttachments() as unknown as ReturnType<typeof mod.getPlayableCharacters>)],
        missions: mod.getPlayableMissions(),
      });
    });
  }, []);

  const handleStart = () => {
    if (!cards || cards.characters.length < 30 || cards.missions.length < 3) return;
    setIsLoading(true);

    const availableChars = cards.characters.filter((c) => !bannedIds.has(c.id));
    const randomPool = availableChars.filter((c) => !isLockedVariant(c.rarity) || unlockedIds.has(c.id));
    const availableMissions = cards.missions.filter((m) => !bannedIds.has(m.id));

    const player1Deck = selectedDeck
      ? selectedDeck.characters
      : [...randomPool].sort(() => Math.random() - 0.5).slice(0, 30);
    const player1Missions = selectedDeck
      ? selectedDeck.missions
      : [...availableMissions].sort(() => Math.random() - 0.5).slice(0, 3);

    const player2Deck = [...availableChars].sort(() => Math.random() - 0.5).slice(0, 30);
    const playerMissionIds = new Set(player1Missions.map((m) => m.id));
    const aiMissionPool = availableMissions.filter((m) => !playerMissionIds.has(m.id));
    const player2Missions = (aiMissionPool.length >= 3 ? aiMissionPool : availableMissions)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const config: GameConfig = {
      player1: {
        userId: 'local-player',
        isAI: false,
        deck: player1Deck,
        missionCards: player1Missions,
      },
      player2: {
        userId: null,
        isAI: true,
        aiDifficulty: difficulty,
        deck: player2Deck,
        missionCards: player2Missions,
      },
    };

    resetTraining();
    startAIGame(config, difficulty, session?.user?.name ?? undefined);
    enableTraining();
    router.push('/game');
  };

  return (
    <main className="flex min-h-screen flex-col bg-[var(--t-bg)] relative">
      <CloudBackground />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col gap-6 max-w-lg w-full relative z-10">

          <div className="text-center">
            <h1 className="text-3xl font-bold text-[var(--t-text)] mb-1">
              {t('title')}
            </h1>
            <p className="text-sm text-[var(--t-muted)]">
              {t('intro')}
            </p>
          </div>

          <div
            className="border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--t-accent)22', backgroundColor: 'var(--t-accent)0a' }}
          >
            <p className="text-[var(--t-accent)] font-medium mb-1">{t('coachAnalyzes')}</p>
            <ul className="text-[var(--t-muted)] space-y-0.5 text-xs list-none">
              <li>- {t('feature.winProb')}</li>
              <li>- {t('feature.moveQuality')}</li>
              <li>- {t('feature.bestMove')}</li>
              <li>- {t('feature.missionAnalysis')}</li>
              <li>- {t('feature.handGrade')}</li>
              <li>- {t('feature.warnings')}</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--t-muted)] uppercase tracking-wider mb-1">
              {t('opponentDifficulty')}
            </p>
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                onClick={() => setDifficulty(d.key)}
                className="flex items-start gap-3 p-4 border transition-colors text-left"
                style={{
                  backgroundColor: difficulty === d.key ? 'var(--t-surface-2)' : 'var(--t-surface)',
                  borderColor: difficulty === d.key ? d.color : 'var(--t-border)',
                }}
              >
                <span
                  className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <div>
                  <p className="text-sm font-medium text-[var(--t-text)]">{t(`difficulty.${d.key}.label`)}</p>
                  <p className="text-xs text-[var(--t-dim)] mt-0.5">{t(`difficulty.${d.key}.desc`)}</p>
                </div>
              </button>
            ))}
          </div>

          {cards && (
            <DeckSelector
              onSelect={setSelectedDeck}
              allCharacters={cards.characters}
              allMissions={cards.missions}
            />
          )}

          <div className="flex gap-3 w-full">
            <button
              onClick={() => router.push('/')}
              className="flex-1 h-12 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)] font-medium hover:bg-[var(--t-surface-2)] transition-colors"
            >
              {tc('back')}
            </button>
            <button
              onClick={handleStart}
              disabled={isLoading || !cards}
              className="flex-1 h-12 border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--t-surface-2)',
                borderColor: 'var(--t-accent)',
                color: 'var(--t-text)',
              }}
            >
              {isLoading ? tc('loading') : t('startTraining')}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
