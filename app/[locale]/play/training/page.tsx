'use client';

import { useState, useEffect } from 'react';
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

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

const DIFFICULTIES: { key: AIDifficulty; labelFr: string; descFr: string; color: string }[] = [
  {
    key: 'easy',
    labelFr: 'Facile',
    descFr: 'Idéal pour apprendre — l\'IA fait des erreurs occasionnelles',
    color: '#4ade80',
  },
  {
    key: 'medium',
    labelFr: 'Moyen',
    descFr: 'Jeu cohérent, bon défi pour pratiquer les stratégies',
    color: '#c4a35a',
  },
  {
    key: 'hard',
    labelFr: 'Difficile',
    descFr: 'Très fort — planification sur plusieurs tours',
    color: '#f97316',
  },
  {
    key: 'impossible',
    labelFr: 'Impossible',
    descFr: 'Réseau de neurones — quasi-imbattable. Apprends de tes erreurs',
    color: '#ef4444',
  },
];

export default function TrainingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const startAIGame = useGameStore((s) => s.startAIGame);
  const enableTraining = useTrainingStore((s) => s.enable);
  const resetTraining = useTrainingStore((s) => s.reset);

  // Auth gate: redirect unauthenticated users
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/');
    }
  }, [session, status, router]);

  const [difficulty, setDifficulty] = useState<AIDifficulty>('medium');
  const [cards, setCards] = useState<{ characters: CharacterCard[]; missions: MissionCard[] } | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<ResolvedDeck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { bannedIds } = useBannedCards();

  useEffect(() => {
    import('@/lib/data/cardLoader').then((mod) => {
      setCards({
        characters: mod.getPlayableCharacters(),
        missions: mod.getPlayableMissions(),
      });
    });
  }, []);

  const handleStart = () => {
    if (!cards || cards.characters.length < 30 || cards.missions.length < 3) return;
    setIsLoading(true);

    const availableChars = cards.characters.filter((c) => !bannedIds.has(c.id));
    const availableMissions = cards.missions.filter((m) => !bannedIds.has(m.id));

    const player1Deck = selectedDeck
      ? selectedDeck.characters
      : [...availableChars].sort(() => Math.random() - 0.5).slice(0, 30);
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

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-[#888888] text-lg">...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#0a0a0a] relative">
      <CloudBackground />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col gap-6 max-w-lg w-full relative z-10">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#e0e0e0] mb-1">
              Mode Entraînement
            </h1>
            <p className="text-sm text-[#888888]">
              L&apos;IA coach analyse chaque coup et te guide en temps réel.
              Ce mode n&apos;est pas disponible en partie normale.
            </p>
          </div>

          {/* Coach badge */}
          <div
            className="border px-4 py-3 text-sm"
            style={{ borderColor: '#c4a35a22', backgroundColor: '#c4a35a0a' }}
          >
            <p className="text-[#c4a35a] font-medium mb-1">Ce que le Coach analyse :</p>
            <ul className="text-[#888] space-y-0.5 text-xs list-none">
              <li>— Probabilité de victoire en temps réel</li>
              <li>— Qualité de chaque coup (Excellent / Bon / Erreur / Grosse erreur)</li>
              <li>— Recommandation du meilleur coup disponible</li>
              <li>— Analyse de chaque mission (domination / contestée / perdue)</li>
              <li>— Note de chaque carte dans ta main (0-10)</li>
              <li>— Avertissements et conseils stratégiques</li>
            </ul>
          </div>

          {/* Difficulty */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#888888] uppercase tracking-wider mb-1">
              Difficulté de l&apos;adversaire
            </p>
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                onClick={() => setDifficulty(d.key)}
                className="flex items-start gap-3 p-4 border transition-colors text-left"
                style={{
                  backgroundColor: difficulty === d.key ? '#1a1a1a' : '#141414',
                  borderColor: difficulty === d.key ? d.color : '#262626',
                }}
              >
                <span
                  className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <div>
                  <p className="text-sm font-medium text-[#e0e0e0]">{d.labelFr}</p>
                  <p className="text-xs text-[#666] mt-0.5">{d.descFr}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Deck selector */}
          {cards && (
            <DeckSelector
              onSelect={setSelectedDeck}
              allCharacters={cards.characters}
              allMissions={cards.missions}
            />
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => router.push('/')}
              className="flex-1 h-12 bg-[#141414] border border-[#262626] text-[#888888] font-medium hover:bg-[#1a1a1a] transition-colors"
            >
              Retour
            </button>
            <button
              onClick={handleStart}
              disabled={isLoading || !cards}
              className="flex-1 h-12 border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#1a1a1a',
                borderColor: '#c4a35a',
                color: '#e0e0e0',
              }}
            >
              {isLoading ? 'Chargement...' : 'Démarrer l\'entraînement'}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
