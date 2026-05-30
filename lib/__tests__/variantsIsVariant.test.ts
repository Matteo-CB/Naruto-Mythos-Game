import { describe, it, expect } from 'vitest';
import { isVariantCard, getVariantRarity, parseCardId, baseCardIdFor } from '@/lib/variants/isVariant';

describe('isVariantCard', () => {
  it('returns true for variant rarities', () => {
    expect(isVariantCard({ rarity: 'RA' as never })).toBe(true);
    expect(isVariantCard({ rarity: 'MV' as never })).toBe(true);
    expect(isVariantCard({ rarity: 'SV' as never })).toBe(true);
    expect(isVariantCard({ rarity: 'L' as never })).toBe(true);
  });

  it('returns false for base rarities', () => {
    expect(isVariantCard({ rarity: 'C' as never })).toBe(false);
    expect(isVariantCard({ rarity: 'R' as never })).toBe(false);
    expect(isVariantCard({ rarity: 'M' as never })).toBe(false);
    expect(isVariantCard({ rarity: 'S' as never })).toBe(false);
    expect(isVariantCard(null)).toBe(false);
    expect(isVariantCard(undefined)).toBe(false);
  });

  it('getVariantRarity returns null for non-variants', () => {
    expect(getVariantRarity({ rarity: 'R' as never })).toBeNull();
    expect(getVariantRarity({ rarity: 'L' as never })).toBe('L');
  });
});

describe('parseCardId', () => {
  it('parses standard ids', () => {
    expect(parseCardId('KS-108-R')).toEqual({ set: 'KS', number: '108', rarity: 'R' });
    expect(parseCardId('KS-133-MV')).toEqual({ set: 'KS', number: '133', rarity: 'MV' });
    expect(parseCardId('KS-133_2-MV')).toEqual({ set: 'KS', number: '133_2', rarity: 'MV' });
  });

  it('returns null for invalid ids', () => {
    expect(parseCardId('invalid')).toBeNull();
    expect(parseCardId('ks-108-r')).toBeNull();
  });
});

describe('baseCardIdFor', () => {
  it('maps RA to R', () => {
    expect(baseCardIdFor('KS-108-RA')).toBe('KS-108-R');
  });
  it('maps SV to S', () => {
    expect(baseCardIdFor('KS-140-SV')).toBe('KS-140-S');
  });
  it('maps MV to M (base resolution to be confirmed downstream)', () => {
    expect(baseCardIdFor('KS-133-MV')).toBe('KS-133-M');
  });
  it('maps L to S', () => {
    expect(baseCardIdFor('KS-117-L')).toBe('KS-117-S');
  });
  it('strips _2 suffix', () => {
    expect(baseCardIdFor('KS-133_2-MV')).toBe('KS-133-M');
  });
  it('leaves non-variants alone', () => {
    expect(baseCardIdFor('KS-108-R')).toBe('KS-108-R');
  });
});
