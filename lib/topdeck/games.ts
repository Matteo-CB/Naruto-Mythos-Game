export interface TopdeckGameCatalogEntry {
  game: string;
  formats: string[];
}

export const TOPDECK_GAME_CATALOG: TopdeckGameCatalogEntry[] = [
  { game: 'Naruto', formats: ['Local Tournament', 'Release Event', 'Pre-Release Event', 'Store Championship', 'Regional'] },
];

export interface GameFormatPair {
  game: string;
  format: string;
}

export function topdeckGameFormatPairs(catalog: TopdeckGameCatalogEntry[] = TOPDECK_GAME_CATALOG): GameFormatPair[] {
  const pairs: GameFormatPair[] = [];
  for (const entry of catalog) {
    for (const format of entry.formats) {
      pairs.push({ game: entry.game, format });
    }
  }
  return pairs;
}

export function nextRoundRobinIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  const safe = Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
  return (safe + 1) % length;
}
