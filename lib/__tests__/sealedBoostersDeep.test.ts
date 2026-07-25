import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  generateBooster,
  generateSealedPool,
  type BoosterCard,
  type BoosterPack,
  type SealedSetChoice,
} from '@/lib/sealed/boosterGenerator';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { getCardById } from '@/lib/data/cardIndex';
import { getSealedSetIds, getSetStatus, ALL_SET_IDS, applySetStatusOverrides, SET_REGISTRY } from '@/lib/data/sets/registry';
import { isVariantRarity, VARIANT_RARITIES } from '@/lib/variants/constants';

const SET = 'KS';
const HOLO_SLOT = 8;
const MISSION_SLOT = 9;
const BOOSTER_SIZE = 10;
const MISSION_RARITY = 'MMS';
const CONFIGURABLE_COUNTS = [4, 5, 6];

const setChars = getPlayableCharacters().filter((c) => c.set === SET);
const idsOfRarity = (rarity: string): Set<string> =>
  new Set(setChars.filter((c) => c.rarity === rarity).map((c) => c.id));

const COMMON_IDS = idsOfRarity('C');
const UNCOMMON_IDS = idsOfRarity('UC');
const RARE_IDS = idsOfRarity('R');
const RARE_ART_IDS = idsOfRarity('RA');
const SECRET_IDS = idsOfRarity('S');
const LEGENDARY_IDS = idsOfRarity('L');
const MISSION_IDS = new Set(
  getPlayableMissions()
    .filter((m) => m.set === SET)
    .map((m) => m.id),
);

const HOLO_BUCKETS: Record<string, Set<string>> = {
  C: COMMON_IDS,
  UC: UNCOMMON_IDS,
  RA: RARE_ART_IDS,
  S: SECRET_IDS,
  L: LEGENDARY_IDS,
};

const ALLOWED_HOLO_RARITIES = Object.keys(HOLO_BUCKETS);
const ALLOWED_POOL_RARITIES = [...ALLOWED_HOLO_RARITIES, 'R', MISSION_RARITY];

function assertSlotComposition(cards: BoosterCard[]): void {
  expect(cards.length).toBe(BOOSTER_SIZE);
  for (let i = 0; i < 4; i++) {
    expect(cards[i].rarity).toBe('C');
    expect(COMMON_IDS.has(cards[i].id)).toBe(true);
  }
  for (let i = 4; i < 7; i++) {
    expect(cards[i].rarity).toBe('UC');
    expect(UNCOMMON_IDS.has(cards[i].id)).toBe(true);
  }
  expect(cards[7].rarity).toBe('R');
  expect(RARE_IDS.has(cards[7].id)).toBe(true);
  expect(cards[HOLO_SLOT].isHolo).toBe(true);
  expect(ALLOWED_HOLO_RARITIES).toContain(cards[HOLO_SLOT].rarity);
  expect(HOLO_BUCKETS[cards[HOLO_SLOT].rarity].has(cards[HOLO_SLOT].id)).toBe(true);
  expect(cards[MISSION_SLOT].card_type).toBe('mission');
  expect(MISSION_IDS.has(cards[MISSION_SLOT].id)).toBe(true);
}

function instanceSuffix(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sealed pool fixtures resolve against the real card data', () => {
  it('the KS buckets used by the booster generator are all non empty', () => {
    expect(COMMON_IDS.size).toBeGreaterThanOrEqual(4);
    expect(UNCOMMON_IDS.size).toBeGreaterThanOrEqual(3);
    expect(RARE_IDS.size).toBeGreaterThanOrEqual(1);
    expect(RARE_ART_IDS.size).toBeGreaterThan(0);
    expect(SECRET_IDS.size).toBeGreaterThan(0);
    expect(LEGENDARY_IDS.size).toBeGreaterThan(0);
    expect(MISSION_IDS.size).toBeGreaterThanOrEqual(1);
  });
});

describe('every booster inside a generated pool keeps the exact 10 card composition', () => {
  it('holds for every booster of 30 independent 6 booster pools', () => {
    for (let p = 0; p < 30; p++) {
      const pool = generateSealedPool(6, SET);
      expect(pool.boosters.length).toBe(6);
      for (const booster of pool.boosters) assertSlotComposition(booster.cards);
    }
  });

  it('a booster that rolled a variant is exactly the same size as one that did not', () => {
    const pool = generateSealedPool(400, SET);
    const withVariant = pool.boosters.filter((b) => b.cards.some((c) => isVariantRarity(c.rarity)));
    const withoutVariant = pool.boosters.filter((b) => !b.cards.some((c) => isVariantRarity(c.rarity)));
    expect(withVariant.length).toBeGreaterThan(0);
    expect(withoutVariant.length).toBeGreaterThan(0);
    for (const b of withVariant) expect(b.cards.length).toBe(BOOSTER_SIZE);
    for (const b of withoutVariant) expect(b.cards.length).toBe(BOOSTER_SIZE);
  });

  it('allCards is the flat concatenation of the boosters in order', () => {
    const pool = generateSealedPool(6, SET);
    const flattened = pool.boosters.flatMap((b: BoosterPack) => b.cards);
    expect(pool.allCards.length).toBe(flattened.length);
    expect(pool.allCards.map((c) => c.sealedInstanceId)).toEqual(flattened.map((c) => c.sealedInstanceId));
  });
});

describe('pool size math for the configurable 4, 5 and 6 booster counts', () => {
  it('produces exactly 10 times the booster count for each configurable count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.boosters.length).toBe(n);
      expect(pool.allCards.length).toBe(n * BOOSTER_SIZE);
    }
  });

  it('carries exactly one mission per booster, so mission count equals booster count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.filter((c) => c.card_type === 'mission').length).toBe(n);
      for (const b of pool.boosters) {
        expect(b.cards.filter((c) => c.card_type === 'mission').length).toBe(1);
      }
    }
  });

  it('carries exactly one holo per booster for each configurable count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.filter((c) => c.isHolo).length).toBe(n);
    }
  });

  it('the per rarity slot budget of a pool is exactly 4, 3, 1, 1, 1 times the booster count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      const nonHolo = pool.allCards.filter((c) => !c.isHolo && c.card_type === 'character');
      expect(nonHolo.filter((c) => c.rarity === 'C').length).toBe(4 * n);
      expect(nonHolo.filter((c) => c.rarity === 'UC').length).toBe(3 * n);
      expect(nonHolo.filter((c) => c.rarity === 'R').length).toBe(1 * n);
      expect(pool.allCards.filter((c) => c.isHolo).length).toBe(1 * n);
      expect(pool.allCards.filter((c) => c.card_type === 'mission').length).toBe(1 * n);
    }
  });
});

describe('pool size versus sealed deck legality', () => {
  it('a pool yields exactly 9 characters and 1 mission per booster', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.filter((c) => c.card_type === 'character').length).toBe(9 * n);
      expect(pool.allCards.filter((c) => c.card_type === 'mission').length).toBe(n);
    }
  });

  it('each configurable count can cover the 30 character and 3 mission minimum', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.filter((c) => c.card_type === 'character').length).toBeGreaterThanOrEqual(30);
      expect(pool.allCards.filter((c) => c.card_type === 'mission').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('any count below 4 makes a legal sealed deck arithmetically impossible', () => {
    for (const n of [1, 2, 3]) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.filter((c) => c.card_type === 'character').length).toBeLessThan(30);
    }
  });
});

describe('every generated card belongs to the requested set and to the card index', () => {
  it('a KS pool never leaks a card from another set', () => {
    const pool = generateSealedPool(60, SET);
    for (const c of pool.allCards) expect(c.set).toBe(SET);
  });

  it('every pool card matches its canonical card index entry on id, set, rarity and type', () => {
    const pool = generateSealedPool(30, SET);
    for (const c of pool.allCards) {
      const canon = getCardById(c.id);
      expect(canon).toBeTruthy();
      expect(canon?.set).toBe(c.set);
      expect(canon?.rarity).toBe(c.rarity);
      expect(canon?.card_type).toBe(c.card_type);
    }
  });

  it('a pool only ever contains sealed booster rarities, never M, MV or SV', () => {
    const pool = generateSealedPool(400, SET);
    const rarities = new Set(pool.allCards.map((c) => c.rarity));
    for (const r of rarities) expect(ALLOWED_POOL_RARITIES).toContain(r);
    expect(rarities.has('M')).toBe(false);
    expect(rarities.has('MV')).toBe(false);
    expect(rarities.has('SV')).toBe(false);
  });

  it('every booster of a set specific pool reports that same set id', () => {
    const pool = generateSealedPool(6, SET);
    for (const b of pool.boosters) expect(b.setId).toBe(SET);
  });

  it('booster cards are copies, so mutating a pool card cannot corrupt the card index', () => {
    const pool = generateSealedPool(4, SET);
    const target = pool.allCards[0];
    const canonBefore = getCardById(target.id);
    const originalPower = canonBefore?.power;
    (target as unknown as { power: number }).power = 9999;
    expect(getCardById(target.id)?.power).toBe(originalPower);
    expect(getCardById(target.id)).not.toBe(target);
  });
});

describe('the mission slot only ever draws from the playable mission list', () => {
  it('every mission of a large pool is a playable mission of the set', () => {
    const pool = generateSealedPool(300, SET);
    const missions = pool.allCards.filter((c) => c.card_type === 'mission');
    expect(missions.length).toBe(300);
    for (const m of missions) {
      expect(MISSION_IDS.has(m.id)).toBe(true);
      expect(m.rarity).toBe(MISSION_RARITY);
      expect(m.set).toBe(SET);
    }
  });

  it('the mission is never holo and never a temporary variant', () => {
    const pool = generateSealedPool(120, SET);
    for (const m of pool.allCards.filter((c) => c.card_type === 'mission')) {
      expect(m.isHolo).toBe(false);
      expect(m.isTemporaryVariant).toBe(false);
    }
  });

  it('no character slot ever produces a mission and no mission slot ever produces a character', () => {
    const pool = generateSealedPool(150, SET);
    for (const b of pool.boosters) {
      for (let i = 0; i < MISSION_SLOT; i++) expect(b.cards[i].card_type).toBe('character');
      expect(b.cards[MISSION_SLOT].card_type).toBe('mission');
    }
  });

  it('every playable mission of the set is reachable over a large sample', () => {
    const pool = generateSealedPool(400, SET);
    const seen = new Set(pool.allCards.filter((c) => c.card_type === 'mission').map((c) => c.id));
    expect(seen.size).toBe(MISSION_IDS.size);
    for (const id of MISSION_IDS) expect(seen.has(id)).toBe(true);
  });
});

describe('the holo slot never produces a card from a wrong slot', () => {
  it('the holo card is always drawn from its own rarity bucket', () => {
    const pool = generateSealedPool(500, SET);
    for (const b of pool.boosters) {
      const holo = b.cards[HOLO_SLOT];
      expect(ALLOWED_HOLO_RARITIES).toContain(holo.rarity);
      expect(HOLO_BUCKETS[holo.rarity].has(holo.id)).toBe(true);
    }
  });

  it('the holo slot is never a plain rare and never a mission', () => {
    const pool = generateSealedPool(500, SET);
    for (const b of pool.boosters) {
      expect(b.cards[HOLO_SLOT].rarity).not.toBe('R');
      expect(b.cards[HOLO_SLOT].rarity).not.toBe(MISSION_RARITY);
      expect(b.cards[HOLO_SLOT].card_type).toBe('character');
    }
  });

  it('the isHolo flag is a strict boolean on every card and only true on slot 9', () => {
    const pool = generateSealedPool(50, SET);
    for (const b of pool.boosters) {
      for (let i = 0; i < BOOSTER_SIZE; i++) {
        expect(typeof b.cards[i].isHolo).toBe('boolean');
        expect(b.cards[i].isHolo).toBe(i === HOLO_SLOT);
      }
    }
  });

  it('the holo outcome mix stays inside generous bounds over 4000 boosters', () => {
    const sample = 4000;
    const pool = generateSealedPool(sample, SET);
    const holos = pool.boosters.map((b) => b.cards[HOLO_SLOT]);
    expect(holos.length).toBe(sample);
    const rate = (r: string): number => holos.filter((c) => c.rarity === r).length / sample;
    expect(rate('RA')).toBeGreaterThan(0.1);
    expect(rate('RA')).toBeLessThan(0.28);
    expect(rate('S')).toBeGreaterThan(0.04);
    expect(rate('S')).toBeLessThan(0.17);
    expect(rate('L')).toBeLessThan(0.02);
    expect(rate('C')).toBeGreaterThan(0.2);
    expect(rate('UC')).toBeGreaterThan(0.2);
    expect(rate('C') + rate('UC') + rate('RA') + rate('S') + rate('L')).toBeCloseTo(1, 10);
  });
});

describe('forced holo branches prove the special roll replaces the slot instead of adding one', () => {
  function boosterWithFixedRandom(value: number): BoosterCard[] {
    vi.spyOn(Math, 'random').mockReturnValue(value);
    return generateBooster(0, SET).cards;
  }

  it('a forced legendary roll still yields exactly 10 cards with one legendary in the holo slot', () => {
    const cards = boosterWithFixedRandom(0.001);
    expect(cards.length).toBe(BOOSTER_SIZE);
    expect(cards[HOLO_SLOT].rarity).toBe('L');
    expect(cards[HOLO_SLOT].isHolo).toBe(true);
    expect(cards[HOLO_SLOT].isTemporaryVariant).toBe(true);
    expect(cards.filter((c) => c.rarity === 'L').length).toBe(1);
    assertSlotComposition(cards);
  });

  it('a forced secret roll still yields exactly 10 cards and a secret is not a temporary variant', () => {
    const cards = boosterWithFixedRandom(0.05);
    expect(cards.length).toBe(BOOSTER_SIZE);
    expect(cards[HOLO_SLOT].rarity).toBe('S');
    expect(cards[HOLO_SLOT].isHolo).toBe(true);
    expect(cards[HOLO_SLOT].isTemporaryVariant).toBe(false);
    expect(cards.filter((c) => isVariantRarity(c.rarity)).length).toBe(0);
    assertSlotComposition(cards);
  });

  it('a forced rare art roll without a special upgrade yields one flagged variant in the holo slot', () => {
    const cards = boosterWithFixedRandom(0.15);
    expect(cards.length).toBe(BOOSTER_SIZE);
    expect(cards[HOLO_SLOT].rarity).toBe('RA');
    expect(cards[HOLO_SLOT].isTemporaryVariant).toBe(true);
    expect(cards.filter((c) => c.isTemporaryVariant).length).toBe(1);
    assertSlotComposition(cards);
  });

  it('a mid roll yields a holo common and a high roll yields a holo uncommon, both 10 cards', () => {
    const midCards = boosterWithFixedRandom(0.3);
    expect(midCards.length).toBe(BOOSTER_SIZE);
    expect(midCards[HOLO_SLOT].rarity).toBe('C');
    expect(midCards[HOLO_SLOT].isTemporaryVariant).toBe(false);
    vi.restoreAllMocks();
    const highCards = boosterWithFixedRandom(0.7);
    expect(highCards.length).toBe(BOOSTER_SIZE);
    expect(highCards[HOLO_SLOT].rarity).toBe('UC');
    expect(highCards[HOLO_SLOT].isTemporaryVariant).toBe(false);
  });

  it('a whole pool of forced legendary boosters is still exactly 10 cards per booster', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.length).toBe(n * BOOSTER_SIZE);
      expect(pool.temporaryVariants.length).toBe(n);
      for (const b of pool.boosters) expect(b.cards.length).toBe(BOOSTER_SIZE);
    }
  });
});

describe('temporary variant flagging is exact in both directions', () => {
  it('the flag is a strict boolean on every single card of a large pool', () => {
    const pool = generateSealedPool(120, SET);
    for (const c of pool.allCards) expect(typeof c.isTemporaryVariant).toBe('boolean');
  });

  it('only RA and L ever carry the flag in a sealed pool', () => {
    const pool = generateSealedPool(600, SET);
    const flaggedRarities = new Set(pool.allCards.filter((c) => c.isTemporaryVariant).map((c) => c.rarity));
    expect(flaggedRarities.size).toBeGreaterThan(0);
    for (const r of flaggedRarities) {
      expect(VARIANT_RARITIES as readonly string[]).toContain(r);
      expect(['RA', 'L']).toContain(r);
    }
  });

  it('no common, uncommon, rare, secret or mission is ever flagged', () => {
    const pool = generateSealedPool(400, SET);
    for (const c of pool.allCards) {
      if (['C', 'UC', 'R', 'S', MISSION_RARITY].includes(c.rarity)) {
        expect(c.isTemporaryVariant).toBe(false);
      }
    }
  });

  it('the flagged count equals the temporaryVariants length for each configurable count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.temporaryVariants.length).toBe(pool.allCards.filter((c) => c.isTemporaryVariant).length);
    }
  });

  it('a flagged card is never in a non holo slot', () => {
    const pool = generateSealedPool(500, SET);
    for (const b of pool.boosters) {
      for (let i = 0; i < BOOSTER_SIZE; i++) {
        if (i !== HOLO_SLOT) expect(b.cards[i].isTemporaryVariant).toBe(false);
      }
    }
  });
});

describe('sealed instance identity inside a pool', () => {
  it('the instance counter runs one unbroken step per pooled card, so no id is allocated then thrown away', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      const suffixes = pool.allCards.map((c) => instanceSuffix(c.sealedInstanceId));
      const first = suffixes[0];
      expect(suffixes).toEqual(Array.from({ length: n * BOOSTER_SIZE }, (_, i) => first + i));
    }
  });

  it('a pool whose every booster upgraded its holo slot still consumes exactly 10n ids', () => {
    for (const forced of [0.001, 0.05]) {
      vi.spyOn(Math, 'random').mockReturnValue(forced);
      const pool = generateSealedPool(5, SET);
      const suffixes = pool.allCards.map((c) => instanceSuffix(c.sealedInstanceId));
      const first = suffixes[0];
      expect(suffixes).toEqual(Array.from({ length: 5 * BOOSTER_SIZE }, (_, i) => first + i));
      expect(pool.boosters[0].cards[HOLO_SLOT].rarity).toBe(forced < 0.00125 ? 'L' : 'S');
      vi.restoreAllMocks();
    }
  });

  it('two pools built back to back never share an instance id', () => {
    for (let i = 0; i < 10; i++) {
      const a = generateSealedPool(2, SET);
      const b = generateSealedPool(2, SET);
      const idsA = new Set(a.allCards.map((c) => c.sealedInstanceId));
      expect(b.allCards.filter((c) => idsA.has(c.sealedInstanceId)).length).toBe(0);
    }
  });

  it('a host pool and a guest pool built in the same millisecond stay disjoint', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T10:00:00.000Z'));
    try {
      const host = generateSealedPool(5, SET);
      const guest = generateSealedPool(5, SET);
      const hostIds = new Set(host.allCards.map((c) => c.sealedInstanceId));
      expect(hostIds.size).toBe(50);
      expect(guest.allCards.some((c) => hostIds.has(c.sealedInstanceId))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('every instance id is unique and well formed across 25 repeated pools', () => {
    for (let i = 0; i < 25; i++) {
      const pool = generateSealedPool(5, SET);
      const ids = pool.allCards.map((c) => c.sealedInstanceId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(/^sealed-\d+-\d+$/.test(id)).toBe(true);
    }
  });

  it('two cards of the same printed id inside one pool still get distinct instance ids', () => {
    const pool = generateSealedPool(30, SET);
    const byPrintedId = new Map<string, string[]>();
    for (const c of pool.allCards) {
      byPrintedId.set(c.id, [...(byPrintedId.get(c.id) ?? []), c.sealedInstanceId]);
    }
    const duplicated = [...byPrintedId.values()].filter((v) => v.length > 1);
    expect(duplicated.length).toBeGreaterThan(0);
    for (const instances of duplicated) expect(new Set(instances).size).toBe(instances.length);
  });
});

describe('the random set choice never resolves to a non available set', () => {
  it('the shipped registry only exposes KS as sealed ready', () => {
    expect(getSealedSetIds()).toEqual(['KS']);
    for (const id of ALL_SET_IDS) {
      if (getSealedSetIds().includes(id)) {
        expect(getSetStatus(id)).toBe('available');
        expect(SET_REGISTRY[id].sealedReady).toBe(true);
      }
    }
  });

  it('300 random pools never resolve to a revealing or coming soon set', () => {
    const available = getSealedSetIds();
    for (let i = 0; i < 300; i++) {
      const pool = generateSealedPool(1, 'random');
      expect(available).toContain(pool.boosters[0].setId);
      expect(getSetStatus(pool.boosters[0].setId)).toBe('available');
    }
  });

  it('the cards of a random pool all belong to the set the booster resolved to', () => {
    for (let i = 0; i < 50; i++) {
      const pool = generateSealedPool(4, 'random');
      for (const b of pool.boosters) {
        for (const c of b.cards) expect(c.set).toBe(b.setId);
      }
    }
  });

  it('a bare generateBooster with no set id defaults to an available set', () => {
    const available = getSealedSetIds();
    for (let i = 0; i < 40; i++) {
      const booster = generateBooster(i);
      expect(available).toContain(booster.setId);
      assertSlotComposition(booster.cards);
    }
  });
});

describe('malformed and boundary generation input', () => {
  it('a booster count of zero is refused instead of silently returning an empty pool', () => {
    expect(() => generateSealedPool(0, SET)).toThrow(/Invalid sealed booster count/);
  });

  it('a negative booster count is refused', () => {
    expect(() => generateSealedPool(-4, SET)).toThrow(/Invalid sealed booster count/);
  });

  it('a NaN or non numeric booster count is refused', () => {
    expect(() => generateSealedPool(Number.NaN, SET)).toThrow(/Invalid sealed booster count/);
    expect(() => generateSealedPool('5' as unknown as number, SET)).toThrow(/Invalid sealed booster count/);
    expect(() => generateSealedPool(Number.POSITIVE_INFINITY, SET)).toThrow(/Invalid sealed booster count/);
  });

  it('a fractional booster count is refused rather than truncated', () => {
    expect(() => generateSealedPool(4.5, SET)).toThrow(/Invalid sealed booster count/);
  });

  it('an empty, wrongly cased or padded set id is refused', () => {
    for (const bad of ['', 'ks', ' KS', 'KS ', 'KS-1']) {
      expect(() => generateSealedPool(4, bad)).toThrow(/not available for sealed play/);
    }
  });

  it('a null or undefined set choice is either refused or defaulted, never silently wrong', () => {
    expect(() => generateSealedPool(1, null as unknown as SealedSetChoice)).toThrow();
    const pool = generateSealedPool(1, undefined);
    expect(getSealedSetIds()).toContain(pool.boosters[0].setId);
  });

  it('a refused booster count never persists a partial pool to the caller', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      let captured: unknown = null;
      try {
        captured = generateSealedPool(bad, SET);
      } catch {
        captured = 'threw';
      }
      expect(captured).toBe('threw');
    }
  });
});

describe('a set that cannot fill the ten slots is refused by every public entry point', () => {
  const SHORT_SET = 'SS';
  let previousSealedReady: boolean | undefined;

  function openShortSetForSealed(): void {
    previousSealedReady = SET_REGISTRY[SHORT_SET].sealedReady;
    SET_REGISTRY[SHORT_SET].sealedReady = true;
    applySetStatusOverrides({ [SHORT_SET]: 'available' });
  }

  afterEach(() => {
    SET_REGISTRY[SHORT_SET].sealedReady = previousSealedReady;
    applySetStatusOverrides({});
  });

  it('the pool builder and the bare booster builder both refuse the same short set', () => {
    openShortSetForSealed();
    const shortSet = getPlayableCharacters().filter((c) => c.set === SHORT_SET && c.rarity === 'C').length < 4
      || getPlayableMissions().filter((m) => m.set === SHORT_SET).length < 1;
    expect(shortSet).toBe(true);
    expect(() => generateSealedPool(1, SHORT_SET)).toThrow(/does not have enough cards/);
    expect(() => generateBooster(0, SHORT_SET)).toThrow(/does not have enough cards/);
  });

  it('the bare booster builder never returns a short or holed booster for that set', () => {
    openShortSetForSealed();
    let produced: BoosterPack | null = null;
    try {
      produced = generateBooster(0, SHORT_SET);
    } catch {
      produced = null;
    }
    expect(produced).toBeNull();
  });

  it('a set that is available but not sealed ready is refused by the pool builder', () => {
    applySetStatusOverrides({ [SHORT_SET]: 'available' });
    expect(getSealedSetIds()).not.toContain(SHORT_SET);
    expect(() => generateSealedPool(1, SHORT_SET)).toThrow(/not available for sealed play/);
    expect(() => generateBooster(0, SHORT_SET)).toThrow();
  });
});

describe('repeated generation stays healthy', () => {
  it('500 consecutive boosters never crash and never produce a hole', () => {
    for (let i = 0; i < 500; i++) {
      const booster = generateBooster(i, SET);
      expect(booster.cards.length).toBe(BOOSTER_SIZE);
      for (const c of booster.cards) {
        expect(c).toBeDefined();
        expect(typeof c.id).toBe('string');
        expect(c.id.length).toBeGreaterThan(0);
        expect(typeof c.rarity).toBe('string');
        expect(typeof c.card_type).toBe('string');
        expect(typeof c.sealedInstanceId).toBe('string');
      }
    }
  });

  it('90 consecutive pools cycling 4, 5 and 6 boosters keep exact sizes', () => {
    for (let i = 0; i < 90; i++) {
      const n = CONFIGURABLE_COUNTS[i % CONFIGURABLE_COUNTS.length];
      const pool = generateSealedPool(n, SET);
      expect(pool.allCards.length).toBe(n * BOOSTER_SIZE);
      expect(pool.allCards.some((c) => c === undefined)).toBe(false);
    }
  });

  it('booster indexes stay dense and ordered for every configurable count', () => {
    for (const n of CONFIGURABLE_COUNTS) {
      const pool = generateSealedPool(n, SET);
      expect(pool.boosters.map((b) => b.boosterIndex)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('no booster is ever empty and no pool is ever empty for a valid count', () => {
    for (let i = 0; i < 60; i++) {
      const pool = generateSealedPool(5, SET);
      expect(pool.allCards.length).toBeGreaterThan(0);
      for (const b of pool.boosters) expect(b.cards.length).toBeGreaterThan(0);
    }
  });
});
