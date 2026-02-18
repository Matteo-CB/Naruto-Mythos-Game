'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { useGameStore } from '@/stores/gameStore';
import type { GameConfig, CharacterCard, MissionCard } from '@/lib/engine/types';
import type { AIDifficulty } from '@/lib/ai/AIPlayer';

export default function PlayAIPage() {
  const t = useTranslations();

  const DIFFICULTIES = [
    { key: 'easy' as AIDifficulty, label: t('playAI.difficulties.easy'), description: t('playAI.difficulties.easyDesc') },
    { key: 'medium' as AIDifficulty, label: t('playAI.difficulties.medium'), description: t('playAI.difficulties.mediumDesc') },
    { key: 'hard' as AIDifficulty, label: t('playAI.difficulties.hard'), description: t('playAI.difficulties.hardDesc') },
    { key: 'expert' as AIDifficulty, label: t('playAI.difficulties.expert'), description: t('playAI.difficulties.expertDesc') },
  ];
  const router = useRouter();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [isLoading, setIsLoading] = useState(false);
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);

  useEffect(() => {
    // Load card data dynamically
    import('@/lib/data/cardLoader').then((mod) => {
      const characters = mod.getPlayableCharacters();
      const missions = mod.getPlayableMissions();
      setCards({ characters, missions });
    });
  }, []);

  const handleStart = () => {
    if (!cards || cards.characters.length < 30 || cards.missions.length < 3) return;

    setIsLoading(true);

    // Build simple decks from available cards for now
    // Shuffle and pick 30 characters + 3 missions for each player
    const shuffled = [...cards.characters].sort(() => Math.random() - 0.5);
    const missions = [...cards.missions].sort(() => Math.random() - 0.5);

    const player1Deck = shuffled.slice(0, 30);
    const player2Deck = shuffled.slice(0, 30).sort(() => Math.random() - 0.5);
    const player1Missions = missions.slice(0, 3);
    const player2Missions = missions.slice(3, 6).length >= 3
      ? missions.slice(3, 6)
      : missions.slice(0, 3);

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

    startAIGame(config, difficulty);
    router.push('/game');
  };

  return (
    <div className="flex min-h-screen relative flex-col bg-[#0a0a0a]">
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="playAI" />
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 max-w-md w-full relative z-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#e0e0e0] mb-1">{t('playAI.title')}</h1>
          <p className="text-sm text-[#888888]">{t('playAI.selectDifficulty')}</p>
        </div>

        {/* Difficulty selection */}
        <div className="flex flex-col gap-2 w-full">
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-1">{t('playAI.selectDifficulty')}</p>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDifficulty(d.key)}
              className={`flex flex-col items-start p-4 border transition-colors text-left ${
                difficulty === d.key
                  ? 'bg-[#1a1a1a] border-[#c4a35a] text-[#e0e0e0]'
                  : 'bg-[#141414] border-[#262626] text-[#888888] hover:bg-[#1a1a1a] hover:border-[#333]'
              }`}
            >
              <span className="text-base font-medium">{d.label}</span>
              <span className="text-xs text-[#666] mt-0.5">{d.description}</span>
            </button>
          ))}
        </div>

        {/* Card count info */}
        {cards && (
          <p className="text-xs text-[#555]">
            {t('playAI.cardsLoaded', { chars: cards.characters.length, missions: cards.missions.length })}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={() => router.push('/')}
            className="flex-1 h-12 bg-[#141414] border border-[#262626] text-[#888888] font-medium hover:bg-[#1a1a1a] transition-colors"
          >
            {t('common.back')}
          </button>
          <button
            onClick={handleStart}
            disabled={isLoading || !cards}
            className="flex-1 h-12 bg-[#1a1a1a] border border-[#c4a35a] text-[#e0e0e0] font-medium hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.loading') : t('playAI.startGame')}
          </button>
        </div>
      </div>
      </div>
      <Footer />
    </div>
  );
}
