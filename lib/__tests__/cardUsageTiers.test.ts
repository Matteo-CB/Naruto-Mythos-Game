import { describe, it, expect } from 'vitest';
import { assignUsageTiers } from '@/lib/cards/usageTiers';

describe('assignUsageTiers (Pokemon-style usage tiers)', () => {
  it('puts the most-used cards in OU and unused cards in NU', () => {
    const rates = [
      { cardId: 'a', rate: 0.9 },
      { cardId: 'b', rate: 0.7 },
      { cardId: 'c', rate: 0.5 },
      { cardId: 'd', rate: 0.3 },
      { cardId: 'e', rate: 0.15 },
      { cardId: 'f', rate: 0.05 },
      { cardId: 'g', rate: 0 },
      { cardId: 'h', rate: 0 },
    ];
    const tiers = assignUsageTiers(rates);
    expect(tiers.get('a')).toBe('OU');
    expect(tiers.get('g')).toBe('NU');
    expect(tiers.get('h')).toBe('NU');
    const order = ['OU', 'UU', 'RU', 'NU'];
    expect(order.indexOf(tiers.get('a')!)).toBeLessThanOrEqual(order.indexOf(tiers.get('f')!));
  });

  it('every zero-usage card is NU', () => {
    const tiers = assignUsageTiers([{ cardId: 'x', rate: 0 }, { cardId: 'y', rate: 0 }]);
    expect(tiers.get('x')).toBe('NU');
    expect(tiers.get('y')).toBe('NU');
  });

  it('handles an empty input', () => {
    expect(assignUsageTiers([]).size).toBe(0);
  });
});
