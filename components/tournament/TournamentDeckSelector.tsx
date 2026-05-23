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

export function TournamentDeckSelector({ decks, bannedCardIds, onSelect, selectedDeckId }: Props) {
  const t = useTranslations('tournament');
  const tDB = useTranslations('deckBuilder');
  const [hoveredDeck, setHoveredDeck] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const bannedSet = useMemo(() => new Set(bannedCardIds), [bannedCardIds]);

  const deckStatus = useMemo(() => {
    return decks.map(deck => {
      const bannedInDeck = deck.cardIds.filter(id => bannedSet.has(id));
      const bannedInMissions = deck.missionIds.filter(id => bannedSet.has(id));
      const hasBanned = bannedInDeck.length > 0 || bannedInMissions.length > 0;
      return { ...deck, bannedInDeck, bannedInMissions, hasBanned, totalBanned: bannedInDeck.length + bannedInMissions.length };
    });
  }, [decks, bannedSet]);

  const filteredDeckStatus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deckStatus;
    return deckStatus.filter(d => d.name.toLowerCase().includes(q));
  }, [deckStatus, searchQuery]);

  const showSearch = decks.length > 5;

  if (decks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-6" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
        <p className="text-xs" style={{ color: '#888' }}>{t('noDecksAvailable')}</p>
        <Link href="/deck-builder" className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('buildADeck')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showSearch && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={tDB('searchDecks')}
          className="px-3 py-2 text-xs w-full"
          style={{
            backgroundColor: '#111111',
            border: '1px solid #262626',
            color: '#e0e0e0',
            outline: 'none',
            letterSpacing: '0.05em',
          }}
        />
      )}
      <div
        className="flex flex-col gap-2"
        style={decks.length > 5 ? { maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' } : undefined}
      >
        {filteredDeckStatus.length === 0 && (
          <p className="text-xs italic" style={{ color: '#555' }}>{tDB('noDeckMatch')}</p>
        )}
        {filteredDeckStatus.map((deck) => {
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
                backgroundColor: isSelected ? '#1a1500' : '#111111',
                border: deck.hasBanned ? '2px solid #cc4444' : isSelected ? '2px solid #c4a35a' : isHovered ? '1px solid #444' : '1px solid #262626',
                cursor: deck.hasBanned ? 'not-allowed' : 'pointer',
                opacity: deck.hasBanned ? 0.7 : 1,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: isSelected ? '#c4a35a' : '#e0e0e0' }}>
                  {deck.name}
                </span>
                <span className="text-[10px]" style={{ color: '#666' }}>{deck.cardIds.length} cards</span>
              </div>
              {deck.hasBanned && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#cc4444' }}>
                    {t('containsBanned')}
                  </span>
                  <span className="text-[10px]" style={{ color: '#cc4444' }}>
                    ({deck.totalBanned} {t('cardBanned')})
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
