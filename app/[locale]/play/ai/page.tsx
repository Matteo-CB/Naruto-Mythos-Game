'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useGameStore } from '@/stores/gameStore';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { AIDifficulty } from '@/lib/ai/AIPlayer';
import { isLockedVariant } from '@/lib/variants/constants';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

export default function PlayAIPage() {
  const t = useTranslations();
  const { data: session } = useSession();

  const DIFFICULTIES = [
    { key: 'easy' as AIDifficulty, label: t('playAI.difficulties.easy'), description: t('playAI.difficulties.easyDesc') },
    { key: 'medium' as AIDifficulty, label: t('playAI.difficulties.medium'), description: t('playAI.difficulties.mediumDesc') },
    { key: 'hard' as AIDifficulty, label: t('playAI.difficulties.hard'), description: t('playAI.difficulties.hardDesc') },
    { key: 'impossible' as AIDifficulty, label: t('playAI.difficulties.impossible'), description: t('playAI.difficulties.impossibleDesc') },
  ];
  const router = useRouter();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const { unlockedIds } = useUnlockedVariants();
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [isLoading, setIsLoading] = useState(false);
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<ResolvedDeck | null>(null);

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const characters = [...mod.getPlayableCharacters(), ...(mod.getPlayableAttachments() as unknown as ReturnType<typeof mod.getPlayableCharacters>)];
      const missions = mod.getPlayableMissions();
      setCards({ characters, missions });
    });
  }, []);

  const buildAIDeckFromRecommendation = async (
    allChars: CharacterCard[],
    allMissions: MissionCard[],
    playerMissionIds: Set<string>,
  ): Promise<{ deck: CharacterCard[]; missions: MissionCard[] } | null> => {
    try {
      const res = await fetch('/api/ai-decks/recommended', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const recs: Array<{ cardIds: string[]; missionIds: string[] }> = data.decks ?? [];
      if (recs.length === 0) return null;

      const pick = recs[Math.floor(Math.random() * recs.length)];

      const charById = new Map(allChars.map((c) => [c.id, c]));
      const missionById = new Map(allMissions.map((m) => [m.id, m]));

      const deck: CharacterCard[] = [];
      for (const cardId of pick.cardIds) {
        const card = charById.get(cardId);
        if (card) deck.push(card);
      }
      if (deck.length < 30) return null;

      const missions: MissionCard[] = [];
      for (const mid of pick.missionIds) {
        const m = missionById.get(mid);
        if (m && !playerMissionIds.has(m.id)) missions.push(m);
        if (missions.length === 3) break;
      }
      if (missions.length < 3) {
        const fallbackPool = allMissions.filter(
          (m) => !playerMissionIds.has(m.id) && !missions.some((mm) => mm.id === m.id),
        );
        for (const m of [...fallbackPool].sort(() => Math.random() - 0.5)) {
          missions.push(m);
          if (missions.length === 3) break;
        }
      }
      if (missions.length < 3) return null;

      return { deck, missions };
    } catch {
      return null;
    }
  };

  const handleStart = async () => {
    if (!cards || cards.characters.length < 30 || cards.missions.length < 3) return;

    setIsLoading(true);

    const allChars = cards.characters;
    const allMissions = cards.missions;

    const p1Pool = allChars.filter((c) => !isLockedVariant(c.rarity) || unlockedIds.has(c.id));
    const player1Deck = selectedDeck
      ? selectedDeck.characters
      : [...p1Pool].sort(() => Math.random() - 0.5).slice(0, 30);
    const player1Missions = selectedDeck
      ? selectedDeck.missions
      : [...allMissions].sort(() => Math.random() - 0.5).slice(0, 3);

    const playerMissionIds = new Set(player1Missions.map((m) => m.id));

    const recommended = await buildAIDeckFromRecommendation(allChars, allMissions, playerMissionIds);

    let player2Deck: CharacterCard[];
    let player2Missions: MissionCard[];
    if (recommended) {
      player2Deck = recommended.deck;
      player2Missions = recommended.missions;
    } else {
      player2Deck = [...allChars].sort(() => Math.random() - 0.5).slice(0, 30);
      const aiMissionPool = allMissions.filter((m) => !playerMissionIds.has(m.id));
      const aiMissions = [...aiMissionPool].sort(() => Math.random() - 0.5);
      player2Missions = aiMissions.length >= 3
        ? aiMissions.slice(0, 3)
        : [...allMissions].sort(() => Math.random() - 0.5).slice(0, 3);
    }

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

    startAIGame(config, difficulty, session?.user?.name ?? undefined);
    router.push('/game');
  };

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col bg-[var(--t-bg)]">
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="playAI" />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 max-w-md w-full relative z-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--t-text)] mb-1">{t('playAI.title')}</h1>
          <p className="text-sm text-[var(--t-muted)]">{t('playAI.selectDifficultyDesc')}</p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <p className="text-xs text-[var(--t-muted)] uppercase tracking-wider mb-1">{t('playAI.selectDifficulty')}</p>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className={`flex flex-col items-start p-4 border transition-colors text-left ${
                difficulty === d.key
                  ? 'bg-[var(--t-surface-2)] border-[var(--t-accent)] text-[var(--t-text)]'
                  : 'bg-[var(--t-surface)] border-[var(--t-border)] text-[var(--t-muted)] hover:bg-[var(--t-surface-2)] hover:border-[var(--t-border-strong)]'
              }`}
            >
              <span className="text-base font-medium">{d.label}</span>
              <span className="text-xs text-[var(--t-dim)] mt-0.5 font-inter-force">{d.description}</span>
            </button>
          ))}
        </div>

        {cards && (
          <DeckSelector
            onSelect={(deck) => setSelectedDeck(deck)}
            allCharacters={cards.characters}
            allMissions={cards.missions}
          />
        )}

        {cards && (
          <p className="text-xs text-[var(--t-dim)]">
            {t('playAI.cardsLoaded', { chars: cards.characters.length, missions: cards.missions.length })}
          </p>
        )}

        <div className="flex gap-3 w-full">
          <button
            onClick={() => router.push('/')}
            className="flex-1 h-12 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)] font-medium hover:bg-[var(--t-surface-2)] transition-colors"
          >
            {t('common.back')}
          </button>
          <button
            onClick={handleStart}
            disabled={isLoading || !cards}
            className="flex-1 h-12 bg-[var(--t-surface-2)] border border-[var(--t-accent)] text-[var(--t-text)] font-medium hover:bg-[var(--t-border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.loading') : t('playAI.startGame')}
          </button>
        </div>
      </div>
      </div>
      <Footer />
    </main>
  );
}
