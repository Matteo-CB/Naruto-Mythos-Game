export type SetStatus = 'available' | 'revealing' | 'coming_soon';

export interface SetDescriptor {
  id: string;
  number: number;
  nameEn: string;
  nameFr: string;
  nameEs?: string;
  nameJa?: string;
  status: SetStatus;
  boosterImage: string;
  releaseDate?: string;
}

export const SET_REGISTRY: Record<string, SetDescriptor> = {
  KS: {
    id: 'KS',
    number: 1,
    nameEn: 'Konoha Shido',
    nameFr: 'Konoha Shido',
    nameJa: '木ノ葉指導',
    status: 'available',
    boosterImage: '/images/booster-KS.webp',
    releaseDate: '2025-09-15',
  },
  SS: {
    id: 'SS',
    number: 2,
    nameEn: 'Shinobi Shiren',
    nameFr: 'Shinobi Shiren',
    nameJa: '忍びの試練',
    status: 'coming_soon',
    boosterImage: '/images/booster-SS.webp',
  },
  AK: {
    id: 'AK',
    number: 3,
    nameEn: 'Akatsuki',
    nameFr: 'Akatsuki',
    nameJa: '暁',
    status: 'coming_soon',
    boosterImage: '/images/booster-unknown.webp',
  },
};

export function getSetNumber(setId: string): number | null {
  return SET_REGISTRY[setId]?.number ?? null;
}

export const ORDERED_SET_IDS = Object.values(SET_REGISTRY)
  .sort((a, b) => a.number - b.number)
  .map((s) => s.id);

export const BOOSTER_FALLBACK_IMAGE = '/images/booster-unknown.webp';

export const ALL_SET_IDS = Object.keys(SET_REGISTRY);

export function getAvailableSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => SET_REGISTRY[id].status === 'available');
}

export function isSetAvailable(setId: string): boolean {
  return SET_REGISTRY[setId]?.status === 'available';
}

// A set that is currently being revealed: its cards are playable in constructed/casual
// but are automatically banned in ranked, and individual cards are hidden until revealed.
export function isSetRevealing(setId: string): boolean {
  return SET_REGISTRY[setId]?.status === 'revealing';
}

// Sets whose cards can be used in constructed (casual) decks: released + revealing.
export function getPlayableSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => {
    const s = SET_REGISTRY[id].status;
    return s === 'available' || s === 'revealing';
  });
}

// Sets whose cards are legal in RANKED play: released ('available') only.
// Cards from a revealing set are auto-banned in ranked.
export function isSetRankedLegal(setId: string): boolean {
  return SET_REGISTRY[setId]?.status === 'available';
}

export function getSet(setId: string): SetDescriptor | undefined {
  return SET_REGISTRY[setId];
}

export function getSetName(setId: string, locale: string = 'en'): string {
  const set = SET_REGISTRY[setId];
  if (!set) return setId;
  const localized = (set as unknown as Record<string, unknown>)[`name${locale.charAt(0).toUpperCase()}${locale.slice(1)}`];
  if (typeof localized === 'string' && localized) return localized;
  return set.nameEn || set.nameFr;
}
