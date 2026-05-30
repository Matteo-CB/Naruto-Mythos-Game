import type { CardData, Rarity } from '@/lib/engine/types';

export type LabelLocale = 'fr' | 'en';

const RARITY_SUFFIX_FR: Record<Rarity, string> = {
  C: 'Commune',
  UC: 'Peu commune',
  R: 'Rare',
  RA: 'Rare Art',
  S: 'Secrète',
  SV: 'Secrète Variante',
  M: 'Mythos',
  MV: 'Mythos Variante',
  L: 'Légendaire',
  MMS: 'Mission',
};

const RARITY_SUFFIX_EN: Record<Rarity, string> = {
  C: 'Common',
  UC: 'Uncommon',
  R: 'Rare',
  RA: 'Rare Art',
  S: 'Secret',
  SV: 'Secret Variant',
  M: 'Mythos',
  MV: 'Mythos Variant',
  L: 'Legendary',
  MMS: 'Mission',
};

function formatNumber(numberStr: number | string): string {
  const raw = String(numberStr);
  const m = raw.match(/^(\d+)(.*)$/);
  if (!m) return raw;
  const padded = m[1].padStart(3, '0');
  return `${padded}${m[2]}`;
}

export function formatCardLabel(
  card: Pick<CardData, 'name_fr' | 'name_en' | 'title_fr' | 'title_en' | 'number' | 'rarity'> | null | undefined,
  locale: LabelLocale = 'fr',
): string {
  if (!card) return '';
  const isFr = locale === 'fr';
  const name = (isFr ? card.name_fr : card.name_en || card.name_fr) ?? '';
  const title = (isFr ? card.title_fr : card.title_en || card.title_fr) ?? '';
  const number = formatNumber(card.number);
  const suffix = isFr ? RARITY_SUFFIX_FR[card.rarity] : RARITY_SUFFIX_EN[card.rarity];
  const titlePart = title ? `${title} ` : '';
  return `${name} ${titlePart}${number}${suffix ? ` ${suffix}` : ''}`.trim();
}

export function formatCardLabelShort(
  card: Pick<CardData, 'name_fr' | 'name_en' | 'title_fr' | 'title_en' | 'number'> | null | undefined,
  locale: LabelLocale = 'fr',
): string {
  if (!card) return '';
  const isFr = locale === 'fr';
  const name = (isFr ? card.name_fr : card.name_en || card.name_fr) ?? '';
  const title = (isFr ? card.title_fr : card.title_en || card.title_fr) ?? '';
  const number = formatNumber(card.number);
  const titlePart = title ? `${title} ` : '';
  return `${name} ${titlePart}${number}`.trim();
}
