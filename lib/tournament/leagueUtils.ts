

export interface LeagueTier {
  key: string;
  minElo: number;
}


export const LEAGUE_TIERS: LeagueTier[] = [
  { key: 'academyStudent', minElo: 0 },
  { key: 'genin', minElo: 450 },
  { key: 'chunin', minElo: 550 },
  { key: 'specialJonin', minElo: 700 },
  { key: 'eliteJonin', minElo: 1000 },
  { key: 'legendarySannin', minElo: 1200 },
  { key: 'kage', minElo: 1700 },
  { key: 'sageOfSixPaths', minElo: 2000 },
  { key: 'willOfFire', minElo: 2500 },
];

export const VALID_LEAGUE_KEYS = LEAGUE_TIERS.map(t => t.key);


export function getPlayerLeague(elo: number): string {
  let matched = LEAGUE_TIERS[0].key;
  for (const tier of LEAGUE_TIERS) {
    if (elo >= tier.minElo) matched = tier.key;
  }
  return matched;
}


export function validateLeagueKeys(keys: string[]): boolean {
  return keys.every(k => VALID_LEAGUE_KEYS.includes(k));
}
