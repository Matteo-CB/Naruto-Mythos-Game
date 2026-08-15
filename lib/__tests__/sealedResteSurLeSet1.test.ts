import { describe, it, expect } from 'vitest';
import { getSealedSetIds, isSetSealedReady } from '@/lib/data/sets/registry';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';

describe('le scelle ne distribue que le set 1', () => {
  it('un seul set est jouable en scelle, et c_est Konoha Shido', () => {
    expect(getSealedSetIds()).toEqual(['KS']);
    expect(isSetSealedReady('KS')).toBe(true);
    expect(isSetSealedReady('SS')).toBe(false);
  });

  it('un tirage aleatoire ne sort jamais du set 1', () => {
    for (let essai = 0; essai < 25; essai++) {
      const pool = generateSealedPool(5, 'random');
      for (const booster of pool.boosters) {
        expect(booster.setId, 'chaque booster vient du set 1').toBe('KS');
      }
      for (const carte of pool.allCards) {
        expect(carte.id.startsWith('KS-'), `${carte.id} appartient au set 1`).toBe(true);
      }
    }
  });

  it('demander explicitement le set 2 en scelle est refuse', () => {
    expect(() => generateSealedPool(5, 'SS')).toThrow();
  });
});
