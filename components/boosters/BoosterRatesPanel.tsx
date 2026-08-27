'use client';

import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { getCardName } from '@/lib/utils/cardLocale';
import { portraitImagePath } from '@/lib/utils/imagePath';
import { HoloFoilOverlay } from '@/components/cards/HoloFoilOverlay';
import { CardArtFallback } from '@/components/cards/CardArtFallback';
import type { PackSlotKind } from '@/lib/variants/constants';
import { tauxDuBoosterVariante } from '@/lib/variants/rates';
import { eligibleVariantsForSetByRarity, holoEligibleForSet } from '@/lib/variants/variantPool';
import { getSetName } from '@/lib/data/sets/registry';

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const TILE_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const SLOT_COLOR: Partial<Record<PackSlotKind, string>> = {
  HOLO_C: '#a8e6ff',
  HOLO_UC: '#7fd4a8',
  RA: 'var(--t-accent)',
  MV: '#5fa3df',
  SPV: '#d98cc4',
  SHINOBIV: '#e0a33c',
  POPV: '#8ad3c6',
  SV: '#9b59b6',
  L: 'var(--t-danger)',
};

const ETIQUETTE: Partial<Record<PackSlotKind, string>> = {
  HOLO_C: 'Holo C',
  HOLO_UC: 'Holo UC',
  RA: 'Rare Art',
  MV: 'Mythos V',
  SPV: 'Special V',
  SHINOBIV: 'Shinobi V',
  POPV: 'Pop V',
  SV: 'Secret V',
  L: 'Gold',
};

function formatPct(p: number): string {
  const pct = p * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

function oneInN(p: number): string {
  if (p <= 0) return '';
  return `1 / ${Math.round(1 / p)}`;
}

// L exemple montre une carte reellement tirable pour cette rarete dans ce set, plutot qu un
// identifiant fige qui deviendrait faux des qu une carte change de statut.
function carteExemple(setId: string, kind: PackSlotKind) {
  if (kind === 'HOLO_C' || kind === 'HOLO_UC') {
    return holoEligibleForSet(setId)[kind][0] ?? null;
  }
  const pools = eligibleVariantsForSetByRarity(setId);
  return pools[kind as keyof typeof pools]?.[0] ?? null;
}

function TauxDUnSet({ setId, locale }: { setId: string; locale: string }) {
  const taux = tauxDuBoosterVariante(setId);
  const cases = (Object.entries(taux) as Array<[PackSlotKind, number]>)
    .filter(([kind, p]) => p > 0 && carteExemple(setId, kind) !== null)
    .sort((a, b) => b[1] - a[1]);

  if (cases.length === 0) return null;

  return (
    <div className="mb-5 last:mb-0">
      <h4
        className="font-display text-[10px] uppercase tracking-[0.24em] mb-2"
        style={{ color: 'var(--t-accent)' }}
      >
        {getSetName(setId, locale)}
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cases.map(([kind, p]) => {
          const color = SLOT_COLOR[kind] ?? 'var(--t-muted)';
          const estHolo = kind === 'HOLO_C' || kind === 'HOLO_UC';
          const card = carteExemple(setId, kind);
          const img = card ? portraitImagePath(card) : null;
          return (
            <div
              key={`${setId}-${kind}`}
              className="flex flex-col items-center text-center gap-2 px-2 py-4"
              style={{ backgroundColor: 'var(--t-surface-2)', clipPath: TILE_CLIP }}
            >
              {card && (
                <div className="relative overflow-hidden" style={{ width: 72, height: 100 }}>
                  {img ? (
                    <>
                      <img
                        src={img}
                        alt={getCardName(card, locale)}
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', boxShadow: `0 0 16px ${color}40` }}
                      />
                      {estHolo && <HoloFoilOverlay intensity="strong" imageUrl={img} />}
                    </>
                  ) : (
                    <CardArtFallback card={card} />
                  )}
                </div>
              )}
              <span className="font-display text-[10px] uppercase leading-none" style={{ color, letterSpacing: '0.14em' }}>
                {ETIQUETTE[kind] ?? kind}
              </span>
              <span className="font-display text-lg tabular-nums leading-none" style={{ color: '#f4f1e8' }}>
                {formatPct(p)}
              </span>
              <span className="text-[9px] tabular-nums" style={{ color: 'var(--t-dim)' }}>
                {oneInN(p)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoosterRatesPanel({ setIds = ['SS', 'KS'] }: { setIds?: string[] }) {
  const t = useTranslations('boosters');
  const locale = useLocale();

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="px-5 py-4 mt-6"
      style={{ backgroundColor: 'var(--t-bg)', clipPath: PANEL_CLIP, boxShadow: '0 12px 32px var(--t-shadow)' }}
    >
      <h3 className="font-display text-[11px] uppercase tracking-[0.28em] mb-1" style={{ color: 'var(--t-dim)' }}>
        {t('ratesTitle')}
      </h3>
      <p className="text-[11px] mb-4" style={{ color: 'var(--t-dim)' }}>
        {t('ratesSubtitle')}
      </p>

      {setIds.map((setId) => (
        <TauxDUnSet key={setId} setId={setId} locale={locale} />
      ))}
    </motion.section>
  );
}
