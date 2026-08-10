'use client';

import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';
import { Link } from '@/lib/i18n/navigation';

interface DeckSummary {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
}

interface Props {
  decks: DeckSummary[];
  bannedCardIds: string[];
  onSelect: (deckId: string) => void;
  selectedDeckId?: string;
}

const INITIAL_DECK_LIMIT = 20;
const LOAD_MORE_STEP = 30;

export function TournamentDeckSelector({ decks, bannedCardIds, onSelect, selectedDeckId }: Props) {
  const t = useTranslations('tournament');
  const tDB = useTranslations('deckBuilder');
  const [hoveredDeck, setHoveredDeck] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_DECK_LIMIT);
  const bannedSet = useMemo(() => new Set(bannedCardIds), [bannedCardIds]);

  const deckStatus = useMemo(() => {
    return decks.map(deck => {
      const bannedInDeck = deck.cardIds.filter(id => bannedSet.has(id));
      const bannedInMissions = deck.missionIds.filter(id => bannedSet.has(id));
      const hasBanned = bannedInDeck.length > 0 || bannedInMissions.length > 0;
      return { ...deck, bannedInDeck, bannedInMissions, hasBanned, totalBanned: bannedInDeck.length + bannedInMissions.length };
    });
  }, [decks, bannedSet]);

  const visibleDeckStatus = deckStatus.slice(0, visibleCount);
  const hiddenCount = Math.max(0, deckStatus.length - visibleCount);

  if (decks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-6" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
        <p className="text-xs" style={{ color: 'var(--t-muted)' }}>{t('noDecksAvailable')}</p>
        <Link href="/deck-builder" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--t-accent)' }}>
          {t('buildADeck')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleDeckStatus.map((deck) => {
        const isSelected = selectedDeckId === deck.id;
        const isHovered = hoveredDeck === deck.id;
        return (
          <button
            key={deck.id}
            onClick={() => !deck.hasBanned && onSelect(deck.id)}
            onMouseEnter={() => setHoveredDeck(deck.id)}
            onMouseLeave={() => setHoveredDeck(null)}
            disabled={deck.hasBanned}
            className="flex flex-col gap-1 p-3 text-left transition-all"
            style={{
              backgroundColor: isSelected ? '#1a1500' : 'var(--t-panel)',
              border: deck.hasBanned ? '2px solid var(--t-danger)' : isSelected ? '2px solid var(--t-accent)' : isHovered ? '1px solid var(--t-border-strong)' : '1px solid var(--t-border)',
              cursor: deck.hasBanned ? 'not-allowed' : 'pointer',
              opacity: deck.hasBanned ? 0.7 : 1,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--t-accent)' : 'var(--t-text)' }}>
                {deck.name}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>{deck.cardIds.length} cards</span>
            </div>
            {deck.hasBanned && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--t-danger)' }}>
                  {t('containsBanned')}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--t-danger)' }}>
                  ({deck.totalBanned} {t('cardBanned')})
                </span>
              </div>
            )}
          </button>
        );
      })}

      {hiddenCount > 0 && (
        <button
          onClick={() => setVisibleCount((n) => n + LOAD_MORE_STEP)}
          className="px-3 py-2 text-xs uppercase cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--t-panel)',
            color: 'var(--t-accent)',
            letterSpacing: '0.18em',
          }}
        >
          {tDB('loadMoreDecks', { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
