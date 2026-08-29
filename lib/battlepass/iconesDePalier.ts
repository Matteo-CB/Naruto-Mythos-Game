import { SEASON_SET_ID } from './season';

export const PALIERS_ILLUSTRES: Readonly<Record<string, readonly number[]>> = {
  SS: [30, 59],
};

export function paliersIllustres(setId: string = SEASON_SET_ID): readonly number[] {
  return PALIERS_ILLUSTRES[setId] ?? [];
}

export function aUneIconeDePalier(tier: number, setId: string = SEASON_SET_ID): boolean {
  return paliersIllustres(setId).includes(tier);
}

export function iconeDuPalier(tier: number, setId: string = SEASON_SET_ID): string | null {
  if (!aUneIconeDePalier(tier, setId)) return null;
  return `/images/battlepass/${setId}/tier-${tier}.webp`;
}
