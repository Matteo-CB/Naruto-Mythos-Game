import { describe, it, expect, afterEach } from 'vitest';
import {
  SET_REGISTRY,
  ALL_SET_IDS,
  isSetAvailable,
  isSetSealedReady,
  getSealedSetIds,
  getLatestSealedSetId,
  applySetStatusOverrides,
} from '@/lib/data/sets/registry';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';

afterEach(() => {
  applySetStatusOverrides({});
});

describe('sealed only ever uses a set that is explicitly sealed ready', () => {
  it('today that is Konoha Shido and nothing else', () => {
    expect(getSealedSetIds()).toEqual(['KS']);
    expect(getLatestSealedSetId()).toBe('KS');
  });

  it('a set being revealed is never sealed ready', () => {
    expect(SET_REGISTRY.SS.status).toBe('revealing');
    expect(isSetSealedReady('SS')).toBe(false);
    expect(isSetSealedReady('AK')).toBe(false);
  });

  it('becoming available is NOT enough to enter sealed on its own', () => {
    applySetStatusOverrides({ SS: 'available' });
    expect(isSetAvailable('SS')).toBe(true);
    expect(isSetSealedReady('SS')).toBe(false);
    expect(getSealedSetIds()).toEqual(['KS']);
    expect(getLatestSealedSetId()).toBe('KS');
  });

  it('a sealed ready set that is pulled back from release leaves sealed too', () => {
    applySetStatusOverrides({ KS: 'revealing' });
    expect(isSetSealedReady('KS')).toBe(false);
    expect(getSealedSetIds()).toEqual([]);
    expect(getLatestSealedSetId()).toBeNull();
  });

  it('every set flagged sealed ready is also available', () => {
    for (const id of getSealedSetIds()) {
      expect(isSetAvailable(id), `${id} must be available to be sealed ready`).toBe(true);
    }
  });

  it('no set is sealed ready by accident', () => {
    for (const id of ALL_SET_IDS) {
      if (SET_REGISTRY[id].sealedReady !== true) {
        expect(isSetSealedReady(id), `${id} must not be sealed ready`).toBe(false);
      }
    }
  });
});

describe('a random sealed pool never contains a set that is not sealed ready', () => {
  it('draws only Konoha Shido cards today', () => {
    for (let i = 0; i < 40; i++) {
      const pool = generateSealedPool(5, 'random');
      for (const card of pool.allCards) {
        expect(card.id.startsWith('KS-'), `unexpected set for ${card.id}`).toBe(true);
      }
    }
  });

  it('still draws only Konoha Shido once a later set is merely available', () => {
    applySetStatusOverrides({ SS: 'available' });
    for (let i = 0; i < 25; i++) {
      const pool = generateSealedPool(5, 'random');
      for (const booster of pool.boosters) {
        expect(booster.setId).toBe('KS');
      }
    }
  });
});
