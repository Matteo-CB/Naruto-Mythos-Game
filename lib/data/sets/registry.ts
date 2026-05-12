export type SetStatus = 'available' | 'coming_soon';

export interface SetDescriptor {
  id: string;
  nameEn: string;
  nameFr: string;
  status: SetStatus;
  boosterImage: string;
  releaseDate?: string;
}

export const SET_REGISTRY: Record<string, SetDescriptor> = {
  KS: {
    id: 'KS',
    nameEn: 'Konoha Shido',
    nameFr: 'Konoha Shido',
    status: 'available',
    boosterImage: '/images/booster-KS.webp',
    releaseDate: '2025-09-15',
  },
  SS: {
    id: 'SS',
    nameEn: 'Shinobi Shiren',
    nameFr: 'Shinobi Shiren',
    status: 'coming_soon',
    boosterImage: '/images/booster-SS.webp',
  },
};

export const ALL_SET_IDS = Object.keys(SET_REGISTRY);

export function getAvailableSetIds(): string[] {
  return ALL_SET_IDS.filter((id) => SET_REGISTRY[id].status === 'available');
}

export function isSetAvailable(setId: string): boolean {
  return SET_REGISTRY[setId]?.status === 'available';
}

export function getSet(setId: string): SetDescriptor | undefined {
  return SET_REGISTRY[setId];
}

export function getSetName(setId: string, locale: 'en' | 'fr' = 'en'): string {
  const set = SET_REGISTRY[setId];
  if (!set) return setId;
  return locale === 'fr' ? set.nameFr : set.nameEn;
}
