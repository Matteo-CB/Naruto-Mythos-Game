'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { resolveCardId } from '@/lib/data/cardLoader';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';

interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  evolvingPoints?: number;
  evolvingCompatible?: boolean;
}

interface ResolvedDeck {
  characters: CharacterCard[];
  missions: MissionCard[];
  id?: string;
}

interface DeckSelectorProps {
  onSelect: (deck: ResolvedDeck) => void;
  allCharacters: CharacterCard[];
  allMissions: MissionCard[];
  evolvingOnly?: boolean;
}

export function DeckSelector({ onSelect, allCharacters, allMissions, evolvingOnly = false }: DeckSelectorProps) {
  const t = useTranslations();
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = evolvingOnly ? '/api/decks?evolving=true' : '/api/decks';
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SavedDeck[]) => {
        setSavedDecks(data);
        setLoading(false);
      })
      .catch(() => {
        setSavedDecks([]);
        setLoading(false);
      });
  }, [evolvingOnly]);

  const resolveAndSelect = async (deckId: string | null) => {
    if (!deckId) {
      if (evolvingOnly) {
        try {
          const res = await fetch('/api/random-evolving-deck');
          if (res.ok) {
            const data: { cardIds: string[]; missionIds: string[] } = await res.json();
            const charMap = new Map(allCharacters.map((c) => [c.id, c]));
            const missionMap = new Map(allMissions.map((m) => [m.id, m]));
            const characters: CharacterCard[] = [];
            for (const id of data.cardIds) {
              const resolved = resolveCardId(id);
              const card = charMap.get(resolved);
              if (card) characters.push(card);
            }
            const missions: MissionCard[] = [];
            for (const id of data.missionIds) {
              const resolved = resolveCardId(id);
              const card = missionMap.get(resolved);
              if (card) missions.push(card);
            }
            onSelect({ characters, missions });
            return;
          }
        } catch {

        }
      }
      const shuffledChars = [...allCharacters].sort(() => Math.random() - 0.5);
      const shuffledMissions = [...allMissions].sort(() => Math.random() - 0.5);
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
      const resolved = resolveCardId(id);
      const card = charMap.get(resolved);
      if (card) characters.push(card);
    }

    const missions: MissionCard[] = [];
    for (const id of deck.missionIds) {
      const resolved = resolveCardId(id);
      const card = missionMap.get(resolved);
      if (card) missions.push(card);
    }

    if (characters.length === 0) {
      console.warn('[DeckSelector] Deck resolved to 0 characters - IDs may be outdated:', deck.cardIds.slice(0, 5));
    }

    onSelect({ characters, missions, id: deck.id });
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-xs text-[#888888] uppercase tracking-wider">
        {t('playAI.selectDeck')}
      </p>

      
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
        <span className="text-xs text-[#666] mt-0.5 font-inter-force">{t('playAI.randomDeckDesc')}</span>
      </button>

      
      {loading && (
        <p className="text-xs text-[#555] italic">{t('common.loading')}</p>
      )}
      {!loading && savedDecks.length === 0 && (
        <p className="text-xs text-[#555] italic">{t('deckBuilder.noSavedDecks')}</p>
      )}
      {savedDecks.map((deck) => (
        <EvolvingDeckHolo key={deck.id} points={deck.evolvingPoints ?? 0} enabled={deck.evolvingCompatible === true} intensity="subtle">
        <button
          onClick={() => {
            setSelectedDeckId(deck.id);
            resolveAndSelect(deck.id);
          }}
          className={`flex flex-col items-start p-3 border transition-colors text-left w-full ${
            selectedDeckId === deck.id
              ? 'bg-[#1a1a1a] border-[#c4a35a] text-[#e0e0e0]'
              : 'bg-[#141414] border-[#262626] text-[#888888] hover:bg-[#1a1a1a] hover:border-[#333]'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{deck.name}</span>
            {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints ?? 0} />}
          </div>
          <span className="text-xs text-[#666] mt-0.5 font-inter-force">
            {deck.cardIds.length} {t('deckBuilder.characters', { count: deck.cardIds.length })} + {deck.missionIds.length} missions
          </span>
        </button>
        </EvolvingDeckHolo>
      ))}
    </div>
  );
}
