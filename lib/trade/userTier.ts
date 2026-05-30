const TIER_MIN_ELO: number[] = [
  0,
  450,
  550,
  700,
  1000,
  1200,
  1700,
  2000,
  2500,
];

export const MIN_TRADE_TIER = 5;

export function getUserTier(elo: number): number {
  let tier = 1;
  for (let i = 0; i < TIER_MIN_ELO.length; i++) {
    if (elo >= TIER_MIN_ELO[i]) tier = i + 1;
  }
  return tier;
}

export function canUserTrade(elo: number): boolean {
  return getUserTier(elo) >= MIN_TRADE_TIER;
}
