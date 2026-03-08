/**
 * League/rank tier utilities for tournament league restrictions.
 * Server-safe (no 'use client' dependency).
 */

export interface LeagueTier {
  key: string;
  minElo: number;
}

/** All valid league tier keys, ordered by ELO threshold. */
export const LEAGUE_TIERS: LeagueTier[] = [
  { key: 'academyStudent', minElo: 0 },
  { key: 'genin', minElo: 450 },
  { key: 'chunin', minElo: 550 },
  { key: 'specialJonin', minElo: 650 },
  { key: 'eliteJonin', minElo: 750 },
  { key: 'legendarySannin', minElo: 900 },
  { key: 'kage', minElo: 1050 },
  { key: 'sageOfSixPaths', minElo: 1200 },
];

export const VALID_LEAGUE_KEYS = LEAGUE_TIERS.map(t => t.key);

/**
 * Get the league tier key for a given ELO value.
 */
export function getPlayerLeague(elo: number): string {
  let matched = LEAGUE_TIERS[0].key;
  for (const tier of LEAGUE_TIERS) {
    if (elo >= tier.minElo) matched = tier.key;
  }
  return matched;
}

/**
 * Validate that all provided league keys are valid.
 */
export function validateLeagueKeys(keys: string[]): boolean {
  return keys.every(k => VALID_LEAGUE_KEYS.includes(k));
}
