export type UsageTier = 'OU' | 'UU' | 'RU' | 'NU' | 'BAN';

export const USAGE_TIER_ORDER: UsageTier[] = ['OU', 'UU', 'RU', 'NU'];

export const USAGE_TIER_COLORS: Record<UsageTier, string> = {
  OU: '#c4a35a',
  UU: '#4a7ab5',
  RU: '#4a9e4a',
  NU: '#777777',
  BAN: '#b33e3e',
};

export function assignUsageTiers(rates: Array<{ cardId: string; rate: number }>): Map<string, UsageTier> {
  const tiers = new Map<string, UsageTier>();
  const used = rates.filter((r) => r.rate > 0).sort((a, b) => b.rate - a.rate);
  const n = used.length;

  if (n > 0) {
    const ouCut = Math.max(1, Math.round(n * 0.1));
    const uuCut = ouCut + Math.round(n * 0.2);
    const ruCut = uuCut + Math.round(n * 0.3);
    used.forEach((r, i) => {
      tiers.set(r.cardId, i < ouCut ? 'OU' : i < uuCut ? 'UU' : i < ruCut ? 'RU' : 'NU');
    });
  }

  for (const r of rates) {
    if (!tiers.has(r.cardId)) tiers.set(r.cardId, 'NU');
  }
  return tiers;
}
