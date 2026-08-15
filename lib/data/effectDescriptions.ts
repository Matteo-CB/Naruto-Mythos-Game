import { allEffectDescriptionsEn, allEffectDescriptionsFr, allEffectDescriptionsEs, allEffectDescriptionsJa, allEffectDescriptionsPt, allEffectDescriptionsIt, allEffectDescriptionsPl } from './sets';

type DescMap = Record<string, string[]>;

const LOCALE_MAPS: Record<string, DescMap> = {
  en: allEffectDescriptionsEn,
  fr: allEffectDescriptionsFr,
  es: allEffectDescriptionsEs,
  ja: allEffectDescriptionsJa,
  pt: allEffectDescriptionsPt,
  it: allEffectDescriptionsIt,
  pl: allEffectDescriptionsPl,
};

export function augmentEffectDescriptions(byLocale: Record<string, DescMap>): void {
  for (const [locale, map] of Object.entries(byLocale)) {
    if (LOCALE_MAPS[locale]) Object.assign(LOCALE_MAPS[locale], map);
  }
}

const RARETES_DE_BASE = ['R', 'UC', 'C', 'S', 'M', 'L'];

function impressionsDeBase(cardId: string): string[] {
  const decoupe = cardId.match(/^([A-Z]+)-(\d+)(?:_\d+)?-([A-Z]+)$/);
  if (!decoupe) return [];
  const [, set, numero, rarete] = decoupe;
  if (RARETES_DE_BASE.includes(rarete)) return [];
  return RARETES_DE_BASE.map((r) => `${set}-${numero}-${r}`);
}

function pick(map: DescMap | undefined, cardId: string, raFallbackId: string | undefined): string[] | undefined {
  if (!map) return undefined;
  const direct = map[cardId] ?? (raFallbackId ? map[raFallbackId] : undefined);
  if (direct) return direct;
  for (const candidat of impressionsDeBase(cardId)) {
    if (map[candidat]) return map[candidat];
  }
  return undefined;
}

export function getCardEffectDescriptions(cardId: string, locale: string): string[] | undefined {
  const raFallbackId = cardId.endsWith('-RA') ? cardId.replace('-RA', '-R') : undefined;
  return (
    pick(LOCALE_MAPS[locale], cardId, raFallbackId) ??
    pick(allEffectDescriptionsEn, cardId, raFallbackId) ??
    pick(allEffectDescriptionsFr, cardId, raFallbackId)
  );
}

export function getCardEffectDescription(cardId: string, index: number, locale: string, fallback: string): string {
  const raFallbackId = cardId.endsWith('-RA') ? cardId.replace('-RA', '-R') : undefined;
  const localeArr = pick(LOCALE_MAPS[locale], cardId, raFallbackId);
  const enArr = pick(allEffectDescriptionsEn, cardId, raFallbackId);
  const frArr = pick(allEffectDescriptionsFr, cardId, raFallbackId);
  return localeArr?.[index] ?? enArr?.[index] ?? frArr?.[index] ?? fallback;
}
