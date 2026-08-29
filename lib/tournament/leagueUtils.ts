import { LIGUES, ligueDe } from '@/lib/leagues/paliers';

export interface LeagueTier {
  key: string;
  minElo: number;
}

export const LEAGUE_TIERS: LeagueTier[] = LIGUES.map((l) => ({ key: l.key, minElo: l.seuils[0] }));

export const VALID_LEAGUE_KEYS = LEAGUE_TIERS.map((t) => t.key);

export function getPlayerLeague(elo: number): string {
  return ligueDe(elo);
}

export function validateLeagueKeys(keys: string[]): boolean {
  return keys.every((k) => VALID_LEAGUE_KEYS.includes(k));
}
