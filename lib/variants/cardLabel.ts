import type { CardData } from '@/lib/engine/types';
import type { CardMetaTranslator } from '@/lib/utils/cardLocale';

export type LabelLocale = string;

function formatNumber(numberStr: number | string): string {
  const raw = String(numberStr);
  const m = raw.match(/^(\d+)(.*)$/);
  if (!m) return raw;
  const padded = m[1].padStart(3, '0');
  return `${padded}${m[2]}`;
}

function localized(card: Record<string, unknown>, base: 'name' | 'title', locale: string): string {
  const l = card[`${base}_${locale}`];
  if (typeof l === 'string' && l) return l;
  const en = card[`${base}_en`];
  if (typeof en === 'string' && en) return en;
  const fr = card[`${base}_fr`];
  return typeof fr === 'string' ? fr : '';
}

export function formatCardLabel(
  card: Pick<CardData, 'name_fr' | 'name_en' | 'title_fr' | 'title_en' | 'number' | 'rarity'> | null | undefined,
  locale: LabelLocale = 'fr',
  tRaritySuffix?: CardMetaTranslator,
): string {
  if (!card) return '';
  const name = localized(card as unknown as Record<string, unknown>, 'name', locale);
  const title = localized(card as unknown as Record<string, unknown>, 'title', locale);
  const number = formatNumber(card.number);
  const suffix = tRaritySuffix && tRaritySuffix.has(card.rarity) ? tRaritySuffix(card.rarity) : '';
  const titlePart = title ? `${title} ` : '';
  return `${name} ${titlePart}${number}${suffix ? ` ${suffix}` : ''}`.trim();
}

export function formatCardLabelShort(
  card: Pick<CardData, 'name_fr' | 'name_en' | 'title_fr' | 'title_en' | 'number'> | null | undefined,
  locale: LabelLocale = 'fr',
): string {
  if (!card) return '';
  const name = localized(card as unknown as Record<string, unknown>, 'name', locale);
  const title = localized(card as unknown as Record<string, unknown>, 'title', locale);
  const number = formatNumber(card.number);
  const titlePart = title ? `${title} ` : '';
  return `${name} ${titlePart}${number}`.trim();
}
