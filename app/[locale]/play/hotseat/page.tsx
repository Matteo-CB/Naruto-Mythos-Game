'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';
import { DeckSelector } from '@/components/game/DeckSelector';
import { useGameStore } from '@/stores/gameStore';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import { useBannedCards } from '@/lib/hooks/useBannedCards';

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

export default function HotseatPage() {
  const t = useTranslations();
  const router = useRouter();
  const startHotseatGame = useGameStore((s) => s.startHotseatGame);
  const [isLoading, setIsLoading] = useState(false);
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [deck1, setDeck1] = useState<ResolvedDeck | null>(null);
  const [deck2, setDeck2] = useState<ResolvedDeck | null>(null);
  const { bannedIds } = useBannedCards();

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      const characters = mod.getPlayableCharacters();
      const missions = mod.getPlayableMissions();
      setCards({ characters, missions });
    });
  }, []);

  const handleStart = () => {
    if (!cards || cards.characters.length < 30 || cards.missions.length < 3) return;
    setIsLoading(true);

    const availableChars = cards.characters.filter((c) => !bannedIds.has(c.id));
    const availableMissions = cards.missions.filter((m) => !bannedIds.has(m.id));

    // Player 1 deck
    const p1Deck = deck1
      ? deck1.characters
      : [...availableChars].sort(() => Math.random() - 0.5).slice(0, 30);
    const p1Missions = deck1
      ? deck1.missions
      : [...availableMissions].sort(() => Math.random() - 0.5).slice(0, 3);

    // Player 2 deck
    const p2Deck = deck2
      ? deck2.characters
      : [...availableChars].sort(() => Math.random() - 0.5).slice(0, 30);

    // Ensure no mission overlap
    const p1MissionIds = new Set(p1Missions.map((m) => m.id));
    const p2MissionPool = availableMissions.filter((m) => !p1MissionIds.has(m.id));
    const p2Missions = deck2
      ? deck2.missions
      : p2MissionPool.length >= 3
        ? [...p2MissionPool].sort(() => Math.random() - 0.5).slice(0, 3)
        : [...availableMissions].sort(() => Math.random() - 0.5).slice(0, 3);

    const config: GameConfig = {
      player1: {
        userId: 'hotseat-p1',
        isAI: false,
        deck: p1Deck,
        missionCards: p1Missions,
      },
      player2: {
        userId: 'hotseat-p2',
        isAI: false,
        deck: p2Deck,
        missionCards: p2Missions,
      },
    };

    startHotseatGame(
      config,
      t('hotseat.player1'),
      t('hotseat.player2'),
      true, // Always sandbox mode
    );
    router.push('/game');
  };

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col bg-[#0a0a0a]">
      <CloudBackground />
      <DecorativeIcons />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center gap-6 max-w-md w-full relative z-10">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#e0e0e0] mb-1">{t('hotseat.title')}</h1>
            <p className="text-sm text-[#888888]">{t('hotseat.subtitle')}</p>
          </div>

          {/* Player 1 deck */}
          {cards && (
            <div className="w-full">
              <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">{t('hotseat.player1Deck')}</p>
              <DeckSelector
                onSelect={(d) => setDeck1(d)}
                allCharacters={cards.characters}
                allMissions={cards.missions}
              />
            </div>
          )}

          {/* Player 2 deck */}
          {cards && (
            <div className="w-full">
              <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">{t('hotseat.player2Deck')}</p>
              <DeckSelector
                onSelect={(d) => setDeck2(d)}
                allCharacters={cards.characters}
                allMissions={cards.missions}
              />
            </div>
          )}

          {/* Card count info */}
          {cards && (
            <p className="text-xs text-[#555]">
              {t('playAI.cardsLoaded', { chars: cards.characters.length, missions: cards.missions.length })}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => router.push('/play')}
              className="flex-1 h-12 bg-[#141414] border border-[#262626] text-[#888888] font-medium hover:bg-[#1a1a1a] transition-colors"
            >
              {t('common.back')}
            </button>
            <button
              onClick={handleStart}
              disabled={isLoading || !cards}
              className="flex-1 h-12 bg-[#1a1a1a] border border-[#c4a35a] text-[#e0e0e0] font-medium hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? t('common.loading') : t('hotseat.startGame')}
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
