'use client';

import { motion } from 'framer-motion';
import type { CardData } from '@/lib/engine/types';
import { normalizeImagePath , portraitImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { HoloFoilOverlay } from '@/components/cards/HoloFoilOverlay';
import { useLocale } from 'next-intl';

interface TradeCardTileProps {
  card: CardData;
  count?: number;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  dimmed?: boolean;
}

export function TradeCardTile({ card, count, onClick, disabled, size = 'md', dimmed }: TradeCardTileProps) {
  const locale = useLocale() as 'en' | 'fr';
  const img = portraitImagePath(card);
  const w = size === 'sm' ? 60 : 72;
  const h = size === 'sm' ? 84 : 100;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      className="relative overflow-hidden shrink-0"
      style={{
        width: w,
        height: h,
        backgroundColor: 'var(--t-surface)',
        cursor: disabled ? 'default' : onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.4 : 1,
        boxShadow: '0 4px 12px var(--t-shadow)',
      }}
      aria-label={getCardName(card, locale)}
    >
      {img ? (
        <>
          <img
            src={img}
            alt={getCardName(card, locale)}
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
          {card.isHolo && <HoloFoilOverlay imageUrl={img} />}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center px-1">
          <span className="text-[8px] text-center" style={{ color: 'var(--t-muted)' }}>{getCardName(card, locale)}</span>
        </div>
      )}
      {count !== undefined && count >= 2 && (
        <span
          className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[8px] font-bold"
          style={{ backgroundColor: 'var(--t-accent)33', color: 'var(--t-accent)', fontVariantNumeric: 'tabular-nums' }}
        >
          x{count}
        </span>
      )}
    </motion.button>
  );
}
