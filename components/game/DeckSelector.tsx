'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { resolveCardId } from '@/lib/data/cardLoader';
import { isVariantRarity } from '@/lib/variants/constants';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { Link } from '@/lib/i18n/navigation';

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

const INITIAL_DECK_LIMIT = 5;
const LOAD_MORE_STEP = 10;

export function DeckSelector({ onSelect, allCharacters, allMissions, evolvingOnly = false }: DeckSelectorProps) {
  const t = useTranslations();
  const { unlockedIds } = useUnlockedVariants();
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_DECK_LIMIT);

  const visibleDecks = savedDecks.slice(0, visibleCount);
  const hiddenCount = Math.max(0, savedDecks.length - visibleCount);

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
      const availableChars = allCharacters.filter((c) => !isVariantRarity(c.rarity) || unlockedIds.has(c.id));
      const shuffledChars = [...availableChars].sort(() => Math.random() - 0.5);
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
      <p className="text-xs uppercase" style={{ color: '#888', letterSpacing: '0.18em' }}>
        {t('playAI.selectDeck')}
      </p>

      {!evolvingOnly && (
        <button
          onClick={() => {
            setSelectedDeckId(null);
            resolveAndSelect(null);
          }}
          className="flex flex-col items-start p-3 transition-colors text-left no-select"
          style={{
            backgroundColor: selectedDeckId === null ? 'rgba(26, 26, 26, 0.95)' : 'rgba(20, 20, 20, 0.85)',
            color: selectedDeckId === null ? '#e8e8e8' : '#888',
            boxShadow: selectedDeckId === null ? 'inset 0 -2px 0 #c4a35a' : 'inset 0 -2px 0 transparent',
          }}
        >
          <span className="text-sm font-medium">{t('playAI.randomDeck')}</span>
          <span className="text-xs mt-0.5 font-inter-force" style={{ color: '#666' }}>
            {t('playAI.randomDeckDesc')}
          </span>
        </button>
      )}

      {loading && (
        <p className="text-xs italic" style={{ color: '#555' }}>{t('common.loading')}</p>
      )}

      {!loading && savedDecks.length === 0 && (
        evolvingOnly ? (
          <div className="flex flex-col gap-3 items-center text-center p-5" style={{ backgroundColor: 'rgba(20, 20, 20, 0.85)' }}>
            <p className="text-xs italic" style={{ color: '#888' }}>
              {t('online.evolving.noDeckInSelector')}
            </p>
            <Link
              href={'/deck-builder/manage?evolving=1' as '/deck-builder/manage'}
              className="px-4 py-2 text-[11px] font-bold uppercase no-select"
              style={{ backgroundColor: '#c4a35a', color: '#0a0a0a', letterSpacing: '0.18em' }}
            >
              {t('online.evolving.createDeck')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-2">
            <img src="/images/icons/empty-decks.svg" alt="" draggable={false} style={{ width: 36, height: 36, opacity: 0.2 }} />
            <p className="text-xs italic" style={{ color: '#555' }}>{t('deckBuilder.noSavedDecks')}</p>
          </div>
        )
      )}

      {visibleDecks.map((deck) => (
        <EvolvingDeckHolo
          key={deck.id}
          points={deck.evolvingPoints ?? 0}
          enabled={deck.evolvingCompatible === true}
          intensity="subtle"
          className="overflow-hidden"
        >
          <button
            onClick={() => {
              setSelectedDeckId(deck.id);
              resolveAndSelect(deck.id);
            }}
            className="flex flex-col items-start p-3 transition-colors text-left w-full no-select"
            style={{
              backgroundColor: selectedDeckId === deck.id ? 'rgba(26, 26, 26, 0.95)' : 'rgba(20, 20, 20, 0.85)',
              color: selectedDeckId === deck.id ? '#e8e8e8' : '#888',
              boxShadow: selectedDeckId === deck.id ? 'inset 0 -2px 0 #c4a35a' : 'inset 0 -2px 0 transparent',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{deck.name}</span>
              {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints ?? 0} />}
            </div>
            <span className="text-xs mt-0.5 font-inter-force" style={{ color: '#666' }}>
              {deck.cardIds.length} {t('deckBuilder.characters', { count: deck.cardIds.length })} + {deck.missionIds.length} missions
            </span>
          </button>
        </EvolvingDeckHolo>
      ))}

      {hiddenCount > 0 && (
        <button
          onClick={() => setVisibleCount((n) => n + LOAD_MORE_STEP)}
          className="px-3 py-2 text-xs uppercase no-select cursor-pointer transition-colors"
          style={{
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            color: '#c4a35a',
            letterSpacing: '0.18em',
          }}
        >
          {t('deckBuilder.loadMoreDecks', { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
