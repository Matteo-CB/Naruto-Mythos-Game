'use client';

import { motion } from 'framer-motion';
import type { CardData } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
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
  const img = normalizeImagePath(card.image_file);
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
        backgroundColor: '#141414',
        cursor: disabled ? 'default' : onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.4 : 1,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
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
          {card.isHolo && <HoloFoilOverlay />}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center px-1">
          <span className="text-[8px] text-center" style={{ color: '#888' }}>{getCardName(card, locale)}</span>
        </div>
      )}
      {count !== undefined && count >= 2 && (
        <span
          className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[8px] font-bold"
          style={{ backgroundColor: '#c4a35a33', color: '#c4a35a', fontVariantNumeric: 'tabular-nums' }}
        >
          x{count}
        </span>
      )}
    </motion.button>
  );
}
