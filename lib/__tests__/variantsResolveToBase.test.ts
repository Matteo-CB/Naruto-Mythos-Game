import { describe, it, expect, vi } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';

function mockCard(id: string, rarity: Rarity): CardData {
  return {
    id,
    cardId: id,
    set: 'KS',
    number: 0,
    name_fr: id,
    title_fr: '',
    rarity,
    card_type: 'character',
    has_visual: true,
    chakra: 1,
    power: 1,
    keywords: [],
    group: '',
    effects: [],
  };
}

vi.mock('@/lib/data/cardLoader', () => ({
  getAllCards: () =>
    [
      mockCard('KS-104-R', 'R'),
      mockCard('KS-104-RA', 'RA'),
      mockCard('KS-117-R', 'R'),
      mockCard('KS-117-L', 'L'),
      mockCard('KS-128-R', 'R'),
      mockCard('KS-128-MV', 'MV'),
      mockCard('KS-133-S', 'S'),
      mockCard('KS-133-MV', 'MV'),
      mockCard('KS-133-L', 'L'),
      mockCard('KS-133_2-MV', 'MV'),
      mockCard('KS-140-S', 'S'),
      mockCard('KS-140-SV', 'SV'),
    ],
}));

import { resolveVariantToBaseCardId } from '@/lib/variants/variantPool';
import { clearVariantPoolCache } from '@/lib/variants/variantPool';

describe('resolveVariantToBaseCardId — fallback chain with existence', () => {
  it('RA → R', () => {
    expect(resolveVariantToBaseCardId('KS-104-RA')).toBe('KS-104-R');
  });

  it('SV → S', () => {
    expect(resolveVariantToBaseCardId('KS-140-SV')).toBe('KS-140-S');
  });

  it('MV → M if exists, else R, else S — no -M case falls to -R', () => {
    expect(resolveVariantToBaseCardId('KS-128-MV')).toBe('KS-128-R');
  });

  it('MV → S when -M and -R both missing but -S exists', () => {
    expect(resolveVariantToBaseCardId('KS-133-MV')).toBe('KS-133-S');
  });

  it('L → S if exists, else R', () => {
    expect(resolveVariantToBaseCardId('KS-133-L')).toBe('KS-133-S');
  });

  it('L falls to R when -S missing', () => {
    expect(resolveVariantToBaseCardId('KS-117-L')).toBe('KS-117-R');
  });

  it('strips _2 suffix before resolving', () => {
    expect(resolveVariantToBaseCardId('KS-133_2-MV')).toBe('KS-133-S');
  });

  it('leaves non-variants unchanged', () => {
    expect(resolveVariantToBaseCardId('KS-104-R')).toBe('KS-104-R');
  });

  it('returns input unchanged for unknown card ids', () => {
    clearVariantPoolCache();
    expect(resolveVariantToBaseCardId('XX-999-RA')).toBe('XX-999-RA');
  });
});
