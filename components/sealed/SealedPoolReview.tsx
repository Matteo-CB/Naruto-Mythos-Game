'use client';

import { useMemo } from 'react';
import { compareBySetOrder } from '@/lib/cards/order';
import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import type { BoosterCard } from '@/lib/sealed/boosterGenerator';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { isLandscapeCard } from '@/lib/cards/orientation';
import { getCardName, getRarityLabel } from '@/lib/utils/cardLocale';
import { VariantHoloOverlay } from '@/components/cards/VariantHoloOverlay';
import { CardArtFallback } from '@/components/cards/CardArtFallback';
import { RarityIcon } from '@/components/icons/RarityIcon';

interface SealedPoolReviewProps {
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
  C: 'var(--t-muted)',
  UC: '#2ecc71',
  R: '#3498db',
  RA: '#9b59b6',
  S: 'var(--t-accent)',
  SV: 'var(--t-accent)',
  M: '#ff4444',
  MV: '#ff4444',
  L: '#ffd700',
  MMS: '#e67e22',
};

export function SealedPoolReview({ cards, onContinue }: SealedPoolReviewProps) {
  const t = useTranslations('sealed');
  const locale = useLocale() as 'en' | 'fr';
  const tCardMeta = useTranslations('cardMeta');

  const sortedCards = useMemo(
    () =>
      [...cards].sort(
        (a, b) => (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)
          || compareBySetOrder(a, b),
      ),
    [cards],
  );

  const characters = sortedCards.filter((c) => c.card_type === 'character');
  const missions = sortedCards.filter((c) => c.card_type === 'mission');

  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cards) {
      counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
      
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: 'var(--t-surface)', borderBottom: '1px solid var(--t-border)' }}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--t-accent)' }}>
            {t('cardsCollected')}
          </h2>
          <span className="text-sm" style={{ color: 'var(--t-muted)' }}>
            {cards.length} {t('cards')}
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onContinue}
          className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
          style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)' }}
        >
          {t('buildDeck')}
        </motion.button>
      </div>

      <div className="flex gap-3 px-4 py-2 flex-wrap shrink-0" style={{ borderBottom: '1px solid var(--t-surface-2)' }}>
        {Object.entries(rarityCounts)
          .sort(([a], [b]) => (RARITY_ORDER[a] ?? 99) - (RARITY_ORDER[b] ?? 99))
          .map(([rarity, count]) => (
            <span key={rarity} className="text-xs font-bold" style={{ color: RARITY_COLORS[rarity] ?? '#888' }}>
              <span className="inline-flex items-center gap-1.5"><RarityIcon rarity={rarity} size={13} />{getRarityLabel(rarity, tCardMeta)}: {count}</span>
            </span>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        
        {missions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>
              {t('missionsLabel')} ({missions.length})
            </h3>
            <div className="flex gap-2 flex-wrap">
              {missions.map((card, i) => (
                <PoolCard key={card.sealedInstanceId} card={card} index={i} locale={locale} />
              ))}
            </div>
          </div>
        )}

        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t-muted)' }}>
          {t('characters')} ({characters.length})
        </h3>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
          {characters.map((card, i) => (
            <PoolCard key={card.sealedInstanceId} card={card} index={i} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PoolCard({ card, index, locale }: { card: BoosterCard; index: number; locale: string }) {
  const t = useTranslations('sealed');
  const imgPath = normalizeImagePath(card.image_file);
  const rarityColor = RARITY_COLORS[card.rarity] ?? '#888';
  const isMission = isLandscapeCard(card);
  const cardName = getCardName(card, locale);

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
        <img src={imgPath} alt={cardName} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
      ) : (
        <CardArtFallback card={card} />
      )}
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[8px] truncate" style={{ color: 'var(--t-text)' }}>{cardName}</span>
          <RarityIcon rarity={card.rarity} size={11} />
        </div>
      </div>
      {card.isHolo && !card.isTemporaryVariant && (
        <div className="absolute top-0.5 left-0.5">
          <span className="text-[6px] px-0.5 rounded font-bold" style={{ backgroundColor: 'rgba(196,163,90,0.8)', color: 'var(--t-bg)' }}>
            {t('holo')}
          </span>
        </div>
      )}
      {card.isTemporaryVariant && (
        <>
          <VariantHoloOverlay intensity="subtle" imageUrl={imgPath} />
          <div className="absolute top-0.5 left-0.5 z-10" title={t('temporaryVariantTooltip')}>
            <span
              className="font-display text-[7px] px-0.5 tracking-widest uppercase"
              style={{ backgroundColor: 'rgba(196,163,90,0.85)', color: 'var(--t-bg)' }}
            >
              {t('temporaryVariantTag')}
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
}
