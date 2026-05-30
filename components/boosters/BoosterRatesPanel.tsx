'use client';

import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName } from '@/lib/utils/cardLocale';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { VARIANT_PACK_PROBABILITIES, type VariantRarity } from '@/lib/variants/constants';

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const TILE_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const RARITY_ORDER: VariantRarity[] = ['RA', 'MV', 'SV', 'L'];

const RARITY_COLOR: Record<VariantRarity, string> = {
  RA: '#c4a35a',
  MV: '#5fa3df',
  SV: '#9b59b6',
  L: '#d97676',
};

const EXAMPLE_CARD: Record<VariantRarity, string> = {
  RA: 'KS-104-RA',
  MV: 'KS-111-MV',
  SV: 'KS-140-SV',
  L: 'KS-117-L',
};

function formatPct(p: number): string {
  const pct = p * 100;
  return pct >= 10 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
}

function oneInN(p: number): string {
  if (p <= 0) return '';
  return `1 / ${Math.round(1 / p)}`;
}

export function BoosterRatesPanel() {
  const t = useTranslations('boosters');
  const locale = useLocale() as 'en' | 'fr';

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="px-5 py-4 mt-6"
      style={{ backgroundColor: '#0d0c10', clipPath: PANEL_CLIP, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
    >
      <h3 className="font-display text-[11px] uppercase tracking-[0.28em] mb-1" style={{ color: '#666' }}>
        {t('ratesTitle')}
      </h3>
      <p className="text-[11px] mb-4" style={{ color: '#555' }}>
        {t('ratesSubtitle')}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RARITY_ORDER.map((r) => {
          const color = RARITY_COLOR[r];
          const card = getCardById(EXAMPLE_CARD[r]);
          const img = card ? normalizeImagePath(card.image_file) : null;
          const p = VARIANT_PACK_PROBABILITIES[r];
          return (
            <div
              key={r}
              className="flex flex-col items-center text-center gap-2 px-2 py-4"
              style={{ backgroundColor: '#0a090d', clipPath: TILE_CLIP }}
            >
              {img && (
                <img
                  src={img}
                  alt={card ? getCardName(card, locale) : r}
                  draggable={false}
                  style={{ width: 72, height: 100, objectFit: 'cover', boxShadow: `0 0 16px ${color}40` }}
                />
              )}
              <span className="font-display text-[10px] uppercase leading-none" style={{ color, letterSpacing: '0.14em' }}>
                {t(`animation.finale.${r}`)}
              </span>
              <span className="font-display text-lg tabular-nums leading-none" style={{ color: '#f4f1e8' }}>
                {formatPct(p)}
              </span>
              <span className="text-[9px] tabular-nums" style={{ color: '#555' }}>
                {oneInN(p)}
              </span>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
