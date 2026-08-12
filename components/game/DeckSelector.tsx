'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { resolveCardId } from '@/lib/data/cardLoader';
import { isHoloId, holoBaseId } from '@/lib/holo/holoId';
import { isLockedVariant } from '@/lib/variants/constants';
import { useUnlockedVariants } from '@/lib/hooks/useUnlockedVariants';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { Link } from '@/lib/i18n/navigation';
import { useSettingsStore } from '@/stores/settingsStore';

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

const LOAD_MORE_STEP = 30;

export function DeckSelector({ onSelect, allCharacters, allMissions, evolvingOnly = false }: DeckSelectorProps) {
  const t = useTranslations();
  const { unlockedIds } = useUnlockedVariants();
  const deckListLimit = useSettingsStore((s) => s.deckListLimit);
  const favoriteDeckIds = useSettingsStore((s) => s.favoriteDeckIds);
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(deckListLimit);

  useEffect(() => {
    if (!settingsLoaded) fetchSettings().catch(() => {});
  }, [settingsLoaded, fetchSettings]);

  useEffect(() => { setVisibleCount(deckListLimit); }, [deckListLimit]);

  const favoriteSet = new Set(favoriteDeckIds);
  const favoriteDecks = favoriteDeckIds
    .map((id) => savedDecks.find((d) => d.id === id))
    .filter((d): d is SavedDeck => d !== undefined);
  const otherDecks = savedDecks.filter((d) => !favoriteSet.has(d.id));
  const visibleOtherDecks = otherDecks.slice(0, visibleCount);
  const hiddenCount = Math.max(0, otherDecks.length - visibleCount);

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
      const availableChars = allCharacters.filter((c) => !isLockedVariant(c.rarity) || unlockedIds.has(c.id));
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
      const holo = isHoloId(id);
      const resolved = resolveCardId(holoBaseId(id));
      const card = charMap.get(resolved);
      if (card) characters.push(holo ? { ...card, isHolo: true } : card);
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

  const renderDeckButton = (deck: SavedDeck, isFavorite: boolean) => (
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
          backgroundColor: selectedDeckId === deck.id
            ? 'color-mix(in srgb, var(--t-surface-2) 95%, transparent)'
            : 'color-mix(in srgb, var(--t-surface) 85%, transparent)',
          color: selectedDeckId === deck.id ? 'var(--t-text)' : 'var(--t-muted)',
          boxShadow: selectedDeckId === deck.id ? 'inset 0 -2px 0 var(--t-accent)' : 'inset 0 -2px 0 transparent',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {isFavorite && (
            <span aria-hidden="true" style={{ color: 'var(--t-accent)', fontSize: 12, lineHeight: 1 }}>&#9733;</span>
          )}
          <span className="text-sm font-medium">{deck.name}</span>
          {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints ?? 0} />}
        </div>
        <span className="text-xs mt-0.5 font-inter-force" style={{ color: 'var(--t-dim)' }}>
          {deck.cardIds.length} {t('deckBuilder.characters', { count: deck.cardIds.length })} + {deck.missionIds.length} missions
        </span>
      </button>
    </EvolvingDeckHolo>
  );

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-xs uppercase" style={{ color: 'var(--t-muted)', letterSpacing: '0.18em' }}>
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
            backgroundColor: selectedDeckId === null
              ? 'color-mix(in srgb, var(--t-surface-2) 95%, transparent)'
              : 'color-mix(in srgb, var(--t-surface) 85%, transparent)',
            color: selectedDeckId === null ? 'var(--t-text)' : 'var(--t-muted)',
            boxShadow: selectedDeckId === null ? 'inset 0 -2px 0 var(--t-accent)' : 'inset 0 -2px 0 transparent',
          }}
        >
          <span className="text-sm font-medium">{t('playAI.randomDeck')}</span>
          <span className="text-xs mt-0.5 font-inter-force" style={{ color: 'var(--t-dim)' }}>
            {t('playAI.randomDeckDesc')}
          </span>
        </button>
      )}

      {loading && (
        <p className="text-xs italic" style={{ color: 'var(--t-faint)' }}>{t('common.loading')}</p>
      )}

      {!loading && savedDecks.length === 0 && (
        evolvingOnly ? (
          <div className="flex flex-col gap-3 items-center text-center p-5" style={{ backgroundColor: 'color-mix(in srgb, var(--t-surface) 85%, transparent)' }}>
            <p className="text-xs italic" style={{ color: 'var(--t-muted)' }}>
              {t('online.evolving.noDeckInSelector')}
            </p>
            <Link
              href={'/deck-builder/manage?evolving=1' as '/deck-builder/manage'}
              className="px-4 py-2 text-[11px] font-bold uppercase no-select"
              style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-on-accent)', letterSpacing: '0.18em' }}
            >
              {t('online.evolving.createDeck')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 gap-2">
            <img src="/images/icons/empty-decks.svg" alt="" draggable={false} style={{ width: 36, height: 36, opacity: 0.2 }} />
            <p className="text-xs italic" style={{ color: 'var(--t-faint)' }}>{t('deckBuilder.noSavedDecks')}</p>
          </div>
        )
      )}

      {favoriteDecks.length > 0 && (
        <>
          {favoriteDecks.map((deck) => renderDeckButton(deck, true))}
          {otherDecks.length > 0 && (
            <div className="flex items-center gap-2 pt-1" aria-hidden="true">
              <span className="flex-1 h-px" style={{ backgroundColor: 'var(--t-divider)' }} />
              <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: 'var(--t-faint)' }}>{t('deckBuilder.otherDecks')}</span>
              <span className="flex-1 h-px" style={{ backgroundColor: 'var(--t-divider)' }} />
            </div>
          )}
        </>
      )}

      {visibleOtherDecks.map((deck) => renderDeckButton(deck, false))}

      {hiddenCount > 0 && (
        <button
          onClick={() => setVisibleCount((n) => n + LOAD_MORE_STEP)}
          className="px-3 py-2 text-xs uppercase no-select cursor-pointer transition-colors"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--t-surface) 85%, transparent)',
            color: 'var(--t-accent)',
            letterSpacing: '0.18em',
          }}
        >
          {t('deckBuilder.loadMoreDecks', { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
