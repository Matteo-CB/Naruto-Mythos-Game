'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import {
  useSettingsStore,
  DECK_LIST_LIMIT_MIN,
  DECK_LIST_LIMIT_MAX,
  MAX_FAVORITE_DECKS,
} from '@/stores/settingsStore';

interface DeckRow {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
}

export function DeckPreferencesSection() {
  const t = useTranslations('settings');
  const { data: session } = useSession();
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const deckListLimit = useSettingsStore((s) => s.deckListLimit);
  const setDeckListLimit = useSettingsStore((s) => s.setDeckListLimit);
  const favoriteDeckIds = useSettingsStore((s) => s.favoriteDeckIds);
  const toggleFavoriteDeck = useSettingsStore((s) => s.toggleFavoriteDeck);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [draftLimit, setDraftLimit] = useState<string>(String(deckListLimit));

  useEffect(() => { setDraftLimit(String(deckListLimit)); }, [deckListLimit]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch('/api/decks')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DeckRow[]) => setDecks(Array.isArray(d) ? d : []))
      .catch(() => setDecks([]));
  }, [session?.user?.id]);

  const commitLimit = () => {
    const n = Number(draftLimit);
    if (!Number.isFinite(n)) { setDraftLimit(String(deckListLimit)); return; }
    setDeckListLimit(n);
  };

  if (!session?.user?.id) return null;

  const favoriteDecks = favoriteDeckIds
    .map((id) => decks.find((d) => d.id === id))
    .filter((d): d is DeckRow => d !== undefined);

  return (
    <div
      className="mt-4 flex flex-col gap-4 p-5 lg:mt-6 lg:p-6"
      style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}
    >
      <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
        {t('deckPrefs')}
      </span>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm tracking-wide" style={{ color: 'var(--t-text)' }}>{t('deckListLimit')}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeckListLimit(deckListLimit - 1)}
              disabled={!isLoaded || deckListLimit <= DECK_LIST_LIMIT_MIN}
              aria-label={t('deckListLimitLess')}
              className="h-8 w-8 text-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-accent)', border: 'none', cursor: 'pointer' }}
            >
              &minus;
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={DECK_LIST_LIMIT_MIN}
              max={DECK_LIST_LIMIT_MAX}
              value={draftLimit}
              disabled={!isLoaded}
              onChange={(e) => setDraftLimit(e.target.value)}
              onBlur={commitLimit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLimit(); }}
              className="w-16 px-2 py-1.5 text-center text-sm tabular-nums"
              style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => setDeckListLimit(deckListLimit + 1)}
              disabled={!isLoaded || deckListLimit >= DECK_LIST_LIMIT_MAX}
              aria-label={t('deckListLimitMore')}
              className="h-8 w-8 text-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-accent)', border: 'none', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>
        <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>{t('deckListLimitHint')}</p>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--t-surface-2)' }} />

      <div className="flex flex-col gap-2">
        <span className="text-sm tracking-wide" style={{ color: 'var(--t-text)' }}>
          {t('favoriteDecks')} ({favoriteDeckIds.length}/{MAX_FAVORITE_DECKS})
        </span>
        <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>{t('favoriteDecksHint')}</p>

        {favoriteDecks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {favoriteDecks.map((deck) => (
              <span
                key={deck.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px]"
                style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)' }}
              >
                <span aria-hidden="true">&#9733;</span>
                <span className="max-w-[140px] truncate">{deck.name}</span>
                <button
                  type="button"
                  onClick={() => toggleFavoriteDeck(deck.id)}
                  aria-label={t('unfavorite')}
                  className="text-[11px]"
                  style={{ background: 'none', border: 'none', color: 'var(--t-accent)', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {decks.length === 0 ? (
          <p className="text-xs italic" style={{ color: 'var(--t-dim)' }}>{t('deckPrefsNoDecks')}</p>
        ) : (
          <div
            className="flex flex-col gap-1 overflow-y-auto"
            style={{ maxHeight: 220, scrollSnapType: 'y proximity' }}
          >
            {decks.map((deck) => {
              const isFav = favoriteDeckIds.includes(deck.id);
              const atCap = favoriteDeckIds.length >= MAX_FAVORITE_DECKS && !isFav;
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => { if (!atCap) toggleFavoriteDeck(deck.id); }}
                  disabled={atCap}
                  aria-pressed={isFav}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: isFav ? 'var(--t-accent-glow)' : '#161616',
                    color: isFav ? 'var(--t-text)' : atCap ? '#4a4a4a' : '#b9b7b1',
                    cursor: atCap ? 'default' : 'pointer',
                  }}
                >
                  <span className="min-w-0 truncate text-sm">{deck.name}</span>
                  <span aria-hidden="true" className="shrink-0 text-[13px]" style={{ color: isFav ? 'var(--t-accent)' : atCap ? 'var(--t-border-strong)' : 'var(--t-dim)' }}>
                    {isFav ? '★' : '☆'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
