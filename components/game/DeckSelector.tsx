'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { useBannedCards } from '@/lib/hooks/useBannedCards';

interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
}

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
}

interface DeckSelectorProps {
  onSelect: (deck: ResolvedDeck) => void;
  allCharacters: CharacterCard[];
  allMissions: MissionCard[];
}

export function DeckSelector({ onSelect, allCharacters, allMissions }: DeckSelectorProps) {
  const t = useTranslations();
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { bannedIds } = useBannedCards();

  useEffect(() => {
    fetch('/api/decks')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SavedDeck[]) => {
        setSavedDecks(data);
        setLoading(false);
      })
      .catch(() => {
        setSavedDecks([]);
        setLoading(false);
      });
  }, []);

  const resolveAndSelect = (deckId: string | null) => {
    if (!deckId) {
      // Random deck — exclude banned cards
      const availableChars = allCharacters.filter((c) => !bannedIds.has(c.id));
      const availableMissions = allMissions.filter((m) => !bannedIds.has(m.id));
      const shuffledChars = [...availableChars].sort(() => Math.random() - 0.5);
      const shuffledMissions = [...availableMissions].sort(() => Math.random() - 0.5);
      onSelect({
        characters: shuffledChars.slice(0, 30),
        missions: shuffledMissions.slice(0, 3),
      });
      return;
    }

    const deck = savedDecks.find((d) => d.id === deckId);
    if (!deck) return;

    const charMap = new Map(allCharacters.map((c) => [c.id, c]));
    const missionMap = new Map(allMissions.map((m) => [m.id, m]));

    const characters: CharacterCard[] = [];
    for (const id of deck.cardIds) {
      const card = charMap.get(id);
      if (card) characters.push(card);
    }

    const missions: MissionCard[] = [];
    for (const id of deck.missionIds) {
      const card = missionMap.get(id);
      if (card) missions.push(card);
    }

    onSelect({ characters, missions });
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-xs text-[#888888] uppercase tracking-wider">
        {t('playAI.selectDeck')}
      </p>

      {/* Random option */}
      <button
        onClick={() => {
          setSelectedDeckId(null);
          resolveAndSelect(null);
        }}
        className={`flex flex-col items-start p-3 border transition-colors text-left ${
          selectedDeckId === null
            ? 'bg-[#1a1a1a] border-[#c4a35a] text-[#e0e0e0]'
            : 'bg-[#141414] border-[#262626] text-[#888888] hover:bg-[#1a1a1a] hover:border-[#333]'
        }`}
      >
        <span className="text-sm font-medium">{t('playAI.randomDeck')}</span>
        <span className="text-xs text-[#666] mt-0.5">{t('playAI.randomDeckDesc')}</span>
      </button>

      {/* Saved decks */}
      {loading && (
        <p className="text-xs text-[#555] italic">{t('common.loading')}</p>
      )}
      {!loading && savedDecks.length === 0 && (
        <p className="text-xs text-[#555] italic">{t('deckBuilder.noSavedDecks')}</p>
      )}
      {savedDecks.map((deck) => (
        <button
          key={deck.id}
          onClick={() => {
            setSelectedDeckId(deck.id);
            resolveAndSelect(deck.id);
          }}
          className={`flex flex-col items-start p-3 border transition-colors text-left ${
            selectedDeckId === deck.id
              ? 'bg-[#1a1a1a] border-[#c4a35a] text-[#e0e0e0]'
              : 'bg-[#141414] border-[#262626] text-[#888888] hover:bg-[#1a1a1a] hover:border-[#333]'
          }`}
        >
          <span className="text-sm font-medium">{deck.name}</span>
          <span className="text-xs text-[#666] mt-0.5">
            {deck.cardIds.length} {t('deckBuilder.characters', { count: deck.cardIds.length })} + {deck.missionIds.length} missions
          </span>
        </button>
      ))}
    </div>
  );
}
