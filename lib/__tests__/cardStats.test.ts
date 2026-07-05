import { describe, it, expect } from 'vitest';
import { getCardStats, cardEfficiency } from '@/lib/cards/stats';
import { getCardById } from '@/lib/data/cardIndex';

describe('card stats (competitive)', () => {
  it('cardEfficiency = power / chakra, and power for 0-cost cards', () => {
    expect(cardEfficiency({ chakra: 2, power: 4 })).toBe(2);
    expect(cardEfficiency({ chakra: 4, power: 6 })).toBe(1.5);
    expect(cardEfficiency({ chakra: 0, power: 3 })).toBe(3);
  });

  it('getCardStats returns efficiency, baseline and bounded percentages', () => {
    const card = getCardById('KS-108-R')!;
    const s = getCardStats(card);
    expect(s.power).toBe(card.power);
    expect(s.chakra).toBe(card.chakra);
    expect(s.efficiency).toBeCloseTo(card.power / card.chakra);
    expect(s.avgEfficiency).toBeGreaterThan(0);
    expect(s.efficiencyPercent).toBeGreaterThanOrEqual(0);
    expect(s.efficiencyPercent).toBeLessThanOrEqual(100);
    expect(s.vsAveragePercent).toBeGreaterThan(0);
  });

  it('aggregates effect counts by type', () => {
    const s = getCardStats(getCardById('SS-112-SPV')!);
    const types = s.effectCounts.map((e) => e.type);
    expect(types).toContain('UPGRADE');
    expect(types).toContain('DUEL');
  });
});
