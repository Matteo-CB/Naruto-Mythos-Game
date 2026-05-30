'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData } from '@/lib/engine/types';
import { isFullyExcluded } from '@/lib/trade/inventory-rules';
import { TradeCardTile } from './TradeCardTile';

interface TradeInventoryGridProps {
  inventory: Map<string, number>;
  offerCounts: Map<string, number>;
  onAdd: (cardId: string) => void;
  disabled?: boolean;
}

export function TradeInventoryGrid({ inventory, offerCounts, onAdd, disabled }: TradeInventoryGridProps) {
  const t = useTranslations('trade');

  const entries = useMemo(() => {
    const list: Array<{ card: CardData; total: number }> = [];
    for (const [cardId, total] of inventory) {
      if (total <= 0) continue;
      if (isFullyExcluded(cardId)) continue;
      const card = getCardById(cardId) as CardData | undefined;
      if (card) list.push({ card, total });
    }
    return list.sort((a, b) => a.card.cardId.localeCompare(b.card.cardId));
  }, [inventory]);

  if (entries.length === 0) {
    return (
      <p className="text-[11px] py-8 text-center" style={{ color: '#555' }}>
        {t('inventoryEmpty')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
      {entries.map(({ card, total }) => {
        const used = offerCounts.get(card.cardId) ?? 0;
        const remaining = total - used;
        const exhausted = remaining <= 0;
        return (
          <TradeCardTile
            key={card.cardId}
            card={card}
            count={remaining}
            dimmed={exhausted}
            disabled={disabled || exhausted}
            onClick={() => onAdd(card.cardId)}
          />
        );
      })}
    </div>
  );
}
