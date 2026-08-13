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
  it('today that is Konoha Shido and Shinobi Shiren, and nothing else', () => {
    expect(getSealedSetIds()).toEqual(['KS', 'SS']);
    expect(getLatestSealedSetId()).toBe('SS');
  });

  it('an available set is not sealed ready unless it says so', () => {
    expect(SET_REGISTRY.SS.status).toBe('available');
    expect(SET_REGISTRY.SS.sealedReady).toBe(true);
    expect(isSetSealedReady('SS')).toBe(true);
    expect(isSetSealedReady('AK')).toBe(false);
  });

  it('becoming available is NOT enough to enter sealed on its own', () => {
    applySetStatusOverrides({ AK: 'available' });
    expect(isSetAvailable('AK')).toBe(true);
    expect(isSetSealedReady('AK')).toBe(false);
    expect(getSealedSetIds()).toEqual(['KS', 'SS']);
  });

  it('a sealed ready set that is pulled back from release leaves sealed too', () => {
    applySetStatusOverrides({ KS: 'revealing', SS: 'revealing' });
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
  it('draws only cards of sets that are sealed ready', () => {
    const prets = new Set(getSealedSetIds());
    for (let i = 0; i < 40; i++) {
      const pool = generateSealedPool(5, 'random');
      for (const card of pool.allCards) {
        expect(prets.has(card.set), `unexpected set for ${card.id}`).toBe(true);
      }
      for (const booster of pool.boosters) expect(prets.has(booster.setId)).toBe(true);
    }
  });

  it('a set that becomes merely available never enters a random pool', () => {
    applySetStatusOverrides({ AK: 'available' });
    for (let i = 0; i < 25; i++) {
      const pool = generateSealedPool(5, 'random');
      for (const booster of pool.boosters) {
        expect(booster.setId).not.toBe('AK');
      }
    }
  });

  it('un booster ne melange jamais deux sets', () => {
    for (let i = 0; i < 30; i++) {
      for (const booster of generateSealedPool(4, 'random').boosters) {
        for (const carte of booster.cards) expect(carte.set).toBe(booster.setId);
      }
    }
  });
});
