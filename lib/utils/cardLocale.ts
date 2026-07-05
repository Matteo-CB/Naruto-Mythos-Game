export interface CardMetaTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

interface LocalizableCard {
  name_fr?: string;
  name_en?: string;
  title_fr?: string;
  title_en?: string;
}

function localizedField(card: LocalizableCard, base: 'name' | 'title', locale: string): string {
  const rec = card as unknown as Record<string, unknown>;
  const localized = rec[`${base}_${locale}`];
  if (typeof localized === 'string' && localized) return localized;
  const en = rec[`${base}_en`];
  if (typeof en === 'string' && en) return en;
  const fr = rec[`${base}_fr`];
  return typeof fr === 'string' ? fr : '';
}


export function getCardName(card: LocalizableCard, locale: string): string {
  return localizedField(card, 'name', locale);
}


export function getCardTitle(card: LocalizableCard, locale: string): string {
  return localizedField(card, 'title', locale);
}


export function getCardGroup(group: string, t: CardMetaTranslator): string {
  const key = `group.${group}`;
  return t.has(key) ? t(key) : group;
}


export function getCardKeyword(keyword: string, t: CardMetaTranslator): string {
  const key = `keyword.${keyword}`;
  return t.has(key) ? t(key) : keyword;
}


export function getRarityLabel(rarity: string, t: CardMetaTranslator): string {
  const key = `rarity.${rarity}`;
  return t.has(key) ? t(key) : rarity;
}
