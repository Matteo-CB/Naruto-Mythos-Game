import { describe, it, expect } from 'vitest';
import { getSealedSetIds, isSetSealedReady, ALL_SET_IDS } from '@/lib/data/sets/registry';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';

describe('le scelle distribue les deux sets publies', () => {
  it('les deux sets sont jouables en scelle, et eux seuls', () => {
    expect(getSealedSetIds()).toEqual(['KS', 'SS']);
    expect(isSetSealedReady('KS')).toBe(true);
    expect(isSetSealedReady('SS')).toBe(true);
    for (const id of ALL_SET_IDS) {
      if (id === 'KS' || id === 'SS') continue;
      expect(isSetSealedReady(id), `${id} ne doit pas etre jouable en scelle`).toBe(false);
    }
  });

  it('un tirage aleatoire ne sort jamais d un set non ouvert, et peut melanger les deux', () => {
    const ouverts = new Set(getSealedSetIds());
    const vus = new Set<string>();
    for (let essai = 0; essai < 25; essai++) {
      const pool = generateSealedPool(5, 'random');
      for (const booster of pool.boosters) {
        expect(ouverts.has(booster.setId), `${booster.setId} n est pas ouvert au scelle`).toBe(true);
        vus.add(booster.setId);
      }
    }
    expect(vus.size, 'sur vingt-cinq tirages, les deux sets doivent sortir').toBeGreaterThan(1);
  });

  it('demander un set qui n est pas ouvert au scelle est refuse', () => {
    expect(() => generateSealedPool(5, 'AK')).toThrow();
    expect(() => generateSealedPool(5, 'SS')).not.toThrow();
    expect(() => generateSealedPool(5, 'KS')).not.toThrow();
  });
});
