import changelog from '@/lib/data/changelog.json';
import { getSetName, getSetNumber } from '@/lib/data/sets/registry';

export interface MarqueurDeSet {
  setId: string;
  date: string;
}

export function marqueursDeSet(): MarqueurDeSet[] {
  const bruts = (changelog as { setMarkers?: unknown }).setMarkers;
  if (!Array.isArray(bruts)) return [];
  return bruts
    .filter((m): m is MarqueurDeSet =>
      !!m && typeof (m as MarqueurDeSet).setId === 'string' && typeof (m as MarqueurDeSet).date === 'string')
    .filter((m) => getSetNumber(m.setId) !== null);
}

export function marqueurALaDate(date: string): MarqueurDeSet | null {
  return marqueursDeSet().find((m) => m.date === date) ?? null;
}

export interface LibelleDeMarqueur extends Record<string, string | number> {
  number: number;
  name: string;
}

export function libelleDuMarqueur(setId: string, locale: string): LibelleDeMarqueur {
  return {
    number: getSetNumber(setId) ?? 0,
    name: getSetName(setId, locale),
  };
}
