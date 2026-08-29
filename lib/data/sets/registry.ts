export type SetStatus = 'available' | 'revealing' | 'coming_soon';

export interface SetDescriptor {
  id: string;
  number: number;
  nameEn: string;
  nameFr: string;
  nameEs?: string;
  nameJa?: string;
  status: SetStatus;
  sealedReady?: boolean;
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
    sealedReady: true,
    boosterImage: '/images/booster-KS.webp',
    releaseDate: '2025-09-15',
  },
  SS: {
    id: 'SS',
    number: 2,
    nameEn: 'Shinobi Shiren',
    nameFr: 'Shinobi Shiren',
    nameJa: '忍びの試練',
    status: 'available',
    sealedReady: true,
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

const statusOverrides: Record<string, SetStatus> = {};

function isValidStatus(s: unknown): s is SetStatus {
  return s === 'available' || s === 'revealing' || s === 'coming_soon';
}

// Runtime, admin-controlled status overrides. Loaded from the DB on the server and delivered
// to the client so a set can be moved between coming_soon / revealing / available without a
// redeploy. The static SET_REGISTRY status is the default when no override exists.
export function applySetStatusOverrides(overrides: Record<string, unknown> | null | undefined): void {
  for (const k of Object.keys(statusOverrides)) delete statusOverrides[k];
  if (overrides) {
    for (const [setId, status] of Object.entries(overrides)) {
      if (SET_REGISTRY[setId] && isValidStatus(status)) statusOverrides[setId] = status;
    }
  }
}

export function getSetStatusOverrides(): Record<string, SetStatus> {
  return { ...statusOverrides };
}

export function getSetStatus(setId: string): SetStatus | undefined {
  return statusOverrides[setId] ?? SET_REGISTRY[setId]?.status;
}

export function getSetNumber(setId: string): number | null {
  return SET_REGISTRY[setId]?.number ?? null;
}

export const ORDERED_SET_IDS = Object.values(SET_REGISTRY)
  .sort((a, b) => a.number - b.number)
  .map((s) => s.id);

export const BOOSTER_FALLBACK_IMAGE = '/images/booster-unknown.webp';

export const ALL_SET_IDS = Object.keys(SET_REGISTRY);

export function getAvailableSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => getSetStatus(id) === 'available');
}

export function getLatestAvailableSetId(): string | null {
  const ids = getAvailableSetIds();
  if (ids.length === 0) return null;
  return ids.reduce((latest, id) => ((getSetNumber(id) ?? 0) > (getSetNumber(latest) ?? 0) ? id : latest));
}

export function isSetSealedReady(setId: string): boolean {
  return isSetAvailable(setId) && SET_REGISTRY[setId]?.sealedReady === true;
}

export function getSealedSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => isSetSealedReady(id));
}

export function getLatestSealedSetId(): string | null {
  const ids = getSealedSetIds();
  if (ids.length === 0) return null;
  return ids.reduce((latest, id) => ((getSetNumber(id) ?? 0) > (getSetNumber(latest) ?? 0) ? id : latest));
}

export function isSetAvailable(setId: string): boolean {
  return getSetStatus(setId) === 'available';
}

// A set that is currently being revealed: its cards are playable in constructed/casual
// but are automatically banned in ranked, and individual cards are hidden until revealed.
export function isSetRevealing(setId: string): boolean {
  return getSetStatus(setId) === 'revealing';
}

// Sets whose cards can be used in constructed (casual) decks: released + revealing.
export function getPlayableSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => {
    const s = getSetStatus(id);
    return s === 'available' || s === 'revealing';
  });
}

// Sets whose cards are legal in RANKED play: released ('available') only.
// Cards from a revealing set are auto-banned in ranked.
export function isSetRankedLegal(setId: string): boolean {
  return getSetStatus(setId) === 'available';
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
