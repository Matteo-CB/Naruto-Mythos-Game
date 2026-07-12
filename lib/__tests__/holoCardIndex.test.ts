import { describe, it, expect } from 'vitest';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';

describe('holo-aware card index', () => {
  it('resolves a holo id to a decorated copy of the base card', () => {
    const base = getCardById('KS-001-C');
    expect(base).toBeDefined();
    const holo = getCardById('KS-001-C_H');
    expect(holo).toBeDefined();
    expect(holo!.isHolo).toBe(true);
    expect(holo!.cardId).toBe('KS-001-C_H');
    expect(holo!.name_fr).toBe(base!.name_fr);
    expect(holo!.power).toBe(base!.power);
    expect(base!.isHolo).toBeUndefined();
  });

  it('returns the same cached object on repeated holo lookups', () => {
    const a = getCardById('KS-001-C_H');
    const b = getCardById('KS-001-C_H');
    expect(a).toBe(b);
  });

  it('resolves holo character ids', () => {
    const holo = getCharacterById('KS-001-C_H');
    expect(holo).toBeDefined();
    expect(holo!.isHolo).toBe(true);
    expect(holo!.card_type).toBe('character');
  });

  it('rejects holo ids of non eligible rarities', () => {
    expect(getCardById('KS-104-R_H')).toBeUndefined();
    expect(getCharacterById('KS-133-S_H')).toBeUndefined();
  });
});
