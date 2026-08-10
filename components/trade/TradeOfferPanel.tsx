'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData } from '@/lib/engine/types';
import { TradeCardTile } from './TradeCardTile';

interface TradeOfferPanelProps {
  title: string;
  cardIds: string[];
  editable: boolean;
  onRemove?: (index: number) => void;
}

export function TradeOfferPanel({ title, cardIds, editable, onRemove }: TradeOfferPanelProps) {
  const t = useTranslations('trade');

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: 'var(--t-bg-elevated)', boxShadow: '0 12px 32px var(--t-shadow)' }}>
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--t-surface-2)' }}>
        <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
          {title}
        </span>
        <span className="ml-2 text-[10px]" style={{ color: 'var(--t-dim)', fontVariantNumeric: 'tabular-nums' }}>
          {cardIds.length}/20
        </span>
      </div>
      <div className="flex-1 p-3 min-h-[120px]">
        {cardIds.length === 0 ? (
          <p className="text-[11px] py-6 text-center" style={{ color: 'var(--t-dim)' }}>
            {editable ? t('offerEmpty') : '—'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AnimatePresence mode="popLayout">
              {cardIds.map((cardId, i) => {
                const card = getCardById(cardId) as CardData | undefined;
                if (!card) return null;
                return (
                  <motion.div
                    key={`${cardId}-${i}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <TradeCardTile
                      card={card}
                      size="sm"
                      onClick={editable && onRemove ? () => onRemove(i) : undefined}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
