import { getAllCards } from '@/lib/data/cardLoader';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';
import type { CardData } from '@/lib/engine/types';

function stripEffectMarkers(s: string): string {
  return s.replace(/\[⧗\]/g, '').replace(/\[↯\]/g, '').replace(/\s+/g, ' ').trim();
}

let nameMap: Map<string, CardData> | null = null;

function getNameMap(): Map<string, CardData> {
  if (nameMap) return nameMap;
  const map = new Map<string, CardData>();
  for (const c of getAllCards()) {
    if (c.name_fr) map.set(c.name_fr.toUpperCase(), c);
    if (c.name_en && !map.has(c.name_en.toUpperCase())) map.set(c.name_en.toUpperCase(), c);
  }
  nameMap = map;
  return map;
}

const NAME_PARAM_KEYS = ['card', 'target', 'name', 'oldCard', 'source'];

const NAME_LIST_PARAM_KEYS = ['revealed'];

function localizeNameList(value: string, locale: string): string | null {
  const parts = value.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => !p)) return null;

  const map = getNameMap();
  const localized = parts.map((p) => {
    const card = map.get(p.toUpperCase());
    return card ? getCardName(card, locale) : null;
  });

  if (localized.some((p) => p === null)) return null;
  return localized.join(', ');
}

export function localizeMessageParams(
  params: Record<string, string | number> | undefined,
  locale: string,
): Record<string, string | number> | undefined {
  if (!params) return params;
  const result = { ...params };

  if (typeof params.effectIndex === 'number' && typeof params.id === 'string' && params.id) {
    const fallback = typeof params.effect === 'string' ? params.effect : '';
    result.effect = stripEffectMarkers(getCardEffectDescription(params.id, params.effectIndex, locale, fallback));
  }

  if (locale === 'fr') return result;

  for (const key of Object.keys(params)) {
    if (!key.endsWith('_en')) continue;
    const baseKey = key.slice(0, -3);
    if (!(baseKey in params)) continue;
    const localizedKey = `${baseKey}_${locale}`;
    result[baseKey] = localizedKey in params ? params[localizedKey] : params[key];
  }

  if (typeof params.id === 'string' && params.id && typeof result.card === 'string') {
    const sourceCard = getCardById(params.id);
    if (sourceCard) result.card = getCardName(sourceCard, locale);
  }

  const map = getNameMap();
  for (const key of Object.keys(result)) {
    if (!NAME_PARAM_KEYS.includes(key)) continue;
    const v = result[key];
    if (typeof v !== 'string' || !v) continue;
    const card = map.get(v.toUpperCase());
    if (card) result[key] = getCardName(card, locale);
  }

  for (const key of NAME_LIST_PARAM_KEYS) {
    const v = result[key];
    if (typeof v !== 'string' || !v) continue;
    const localized = localizeNameList(v, locale);
    if (localized) result[key] = localized;
  }

  if ('title' in result) {
    const titleCard =
      (typeof params.card === 'string' && params.card ? map.get(params.card.toUpperCase()) : undefined) ??
      (typeof params.card_en === 'string' && params.card_en ? map.get(params.card_en.toUpperCase()) : undefined) ??
      (typeof params.id === 'string' && params.id ? getCardById(params.id) : undefined);
    if (titleCard) {
      const localizedTitle = getCardTitle(titleCard, locale);
      if (localizedTitle) result.title = localizedTitle;
    }
  }

  return result;
}

export function resolveNameToLocale(name: string | undefined, locale: string): string {
  if (!name) return name ?? '';
  const card = getNameMap().get(name.toUpperCase());
  return card ? getCardName(card, locale) : name;
}

export function lookupCardByName(name: string | undefined): CardData | undefined {
  if (!name) return undefined;
  return getNameMap().get(name.toUpperCase());
}
