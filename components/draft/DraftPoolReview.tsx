'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { BoosterCard } from '@/lib/draft/boosterGenerator';
import { normalizeImagePath } from '@/lib/utils/imagePath';

interface DraftPoolReviewProps {
  cards: BoosterCard[];
  onContinue: () => void;
}

const RARITY_ORDER: Record<string, number> = {
  L: 0,
  M: 1,
  MV: 1,
  S: 2,
  SV: 2,
  RA: 3,
  R: 4,
  UC: 5,
  C: 6,
  MMS: 7,
};

const RARITY_COLORS: Record<string, string> = {
  C: '#888888',
  UC: '#2ecc71',
  R: '#3498db',
  RA: '#9b59b6',
  S: '#c4a35a',
  SV: '#c4a35a',
  M: '#ff4444',
  MV: '#ff4444',
  L: '#ffd700',
  MMS: '#e67e22',
};

export function DraftPoolReview({ cards, onContinue }: DraftPoolReviewProps) {
  const t = useTranslations('draft');

  const sortedCards = useMemo(
    () =>
      [...cards].sort(
        (a, b) => (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99),
      ),
    [cards],
  );

  const characters = sortedCards.filter((c) => c.card_type === 'character');
  const missions = sortedCards.filter((c) => c.card_type === 'mission');

  // Count by rarity
  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
      counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: '#141414', borderBottom: '1px solid #262626' }}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold" style={{ color: '#c4a35a' }}>
            {t('cardsCollected')}
          </h2>
          <span className="text-sm" style={{ color: '#888' }}>
            {cards.length} {t('cards')}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onContinue}
          className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
          style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
        >
          {t('buildDeck')}
        </motion.button>
      </div>

      {/* Rarity summary */}
      <div className="flex gap-3 px-4 py-2 flex-wrap shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
        {Object.entries(rarityCounts)
          .sort(([a], [b]) => (RARITY_ORDER[a] ?? 99) - (RARITY_ORDER[b] ?? 99))
          .map(([rarity, count]) => (
            <span key={rarity} className="text-xs font-bold" style={{ color: RARITY_COLORS[rarity] ?? '#888' }}>
              {rarity}: {count}
            </span>
          ))}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Missions */}
        {missions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#e67e22' }}>
              Missions ({missions.length})
            </h3>
            <div className="flex gap-2 flex-wrap">
              {missions.map((card, i) => (
                <PoolCard key={card.draftInstanceId} card={card} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Characters */}
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#888' }}>
          {t('characters')} ({characters.length})
        </h3>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
          {characters.map((card, i) => (
            <PoolCard key={card.draftInstanceId} card={card} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PoolCard({ card, index }: { card: BoosterCard; index: number }) {
  const imgPath = normalizeImagePath(card.image_file);
  const rarityColor = RARITY_COLORS[card.rarity] ?? '#888';
  const isMission = card.card_type === 'mission';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className="relative rounded overflow-hidden"
      style={{
        aspectRatio: isMission ? '3.5/2.5' : '5/7',
        border: `1px solid ${rarityColor}40`,
      }}
    >
      {imgPath ? (
        <img src={imgPath} alt={card.name_fr} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
          <span className="text-[9px] text-center px-1" style={{ color: '#888' }}>{card.name_fr}</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[8px] truncate" style={{ color: '#e0e0e0' }}>{card.name_fr}</span>
          <span className="text-[8px] font-bold" style={{ color: rarityColor }}>{card.rarity}</span>
        </div>
      </div>
      {card.isHolo && (
        <div className="absolute top-0.5 left-0.5">
          <span className="text-[6px] px-0.5 rounded font-bold" style={{ backgroundColor: 'rgba(196,163,90,0.8)', color: '#0a0a0a' }}>
            HOLO
          </span>
        </div>
      )}
    </motion.div>
  );
}
