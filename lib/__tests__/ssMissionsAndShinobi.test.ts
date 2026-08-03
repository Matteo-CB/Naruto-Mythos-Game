import { describe, expect, it } from 'vitest';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { getAllCards, getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { LOCKED_VARIANT_RARITIES, SPECIAL_VARIANT_RARITIES, FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { cardVersionKey } from '@/lib/cards/versionKey';
import { hasScenario } from '@/lib/cards/sim/keys';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

const SHINOBI_IDS = ['SS-111-SHINOBIV', 'SS-112-SHINOBIV', 'SS-114-SHINOBIV', 'SS-115-SHINOBIV'];

function thirtyCharacters(): CharacterCard[] {
  const pool = getAllCards().filter((c) => c.card_type === 'character' && c.set === 'KS') as CharacterCard[];
  const deck: CharacterCard[] = [];
  for (let i = 0; deck.length < 30; i++) {
    deck.push(pool[i % pool.length]);
    deck.push(pool[i % pool.length]);
  }
  return deck.slice(0, 30);
}

describe('set 2 missions ship as paired artworks of the same mission', () => {
  it('every SS mission number has exactly two artworks that share one version key', () => {
    const missions = getAllCards().filter((c) => c.card_type === 'mission' && c.set === 'SS');
    expect(missions.length).toBe(20);

    const byVersion = new Map<string, string[]>();
    for (const mission of missions) {
      const key = cardVersionKey(mission.id);
      byVersion.set(key, [...(byVersion.get(key) ?? []), mission.id]);
    }

    expect(byVersion.size, 'ten distinct missions, two artworks each').toBe(10);
    for (const [key, ids] of byVersion) {
      expect(ids.length, `${key} artwork count`).toBe(2);
    }
  });

  it('the two artworks of a mission carry identical rules text and points', () => {
    for (let n = 1; n <= 10; n++) {
      const padded = String(n).padStart(3, '0');
      const first = getMissionById(`SS-${padded}-MMS`);
      const second = getMissionById(`SS-${padded}_2-MMS`);
      expect(first, `SS-${padded}-MMS exists`).toBeTruthy();
      expect(second, `SS-${padded}_2-MMS exists`).toBeTruthy();
      expect(second!.basePoints).toBe(first!.basePoints);
      expect((second!.effects ?? []).map((e) => `${e.type}|${e.description}`))
        .toEqual((first!.effects ?? []).map((e) => `${e.type}|${e.description}`));
    }
  });

  it('a deck may not carry both artworks of the same mission', () => {
    const characters = thirtyCharacters();
    const sameMissionTwice = [
      getMissionById('SS-001-MMS')!,
      getMissionById('SS-001_2-MMS')!,
      getMissionById('SS-002-MMS')!,
    ] as MissionCard[];

    const rejected = validateDeck(characters, sameMissionTwice);
    expect(rejected.valid, 'two artworks of mission 1 must be refused').toBe(false);

    const distinctMissions = [
      getMissionById('SS-001-MMS')!,
      getMissionById('SS-002-MMS')!,
      getMissionById('SS-003-MMS')!,
    ] as MissionCard[];
    expect(validateDeck(characters, distinctMissions).valid, 'three distinct missions are legal').toBe(true);

    const mixedArtworks = [
      getMissionById('SS-001_2-MMS')!,
      getMissionById('SS-002_2-MMS')!,
      getMissionById('SS-003-MMS')!,
    ] as MissionCard[];
    expect(validateDeck(characters, mixedArtworks).valid, 'either artwork may be chosen freely').toBe(true);
  });
});

describe('the Shinobi variants are a real rarity with real cards', () => {
  it('SHINOBI and SHINOBIV are registered as special rarities, SHINOBIV as a locked variant', () => {
    expect(SPECIAL_VARIANT_RARITIES).toContain('SHINOBI');
    expect(SPECIAL_VARIANT_RARITIES).toContain('SHINOBIV');
    expect(LOCKED_VARIANT_RARITIES).toContain('SHINOBIV');
    expect(LOCKED_VARIANT_RARITIES).not.toContain('SHINOBI');
  });

  it('the four Shinobi cards exist, are playable by everyone and stay out of ranked', () => {
    for (const id of SHINOBI_IDS) {
      const card = getCharacterById(id);
      expect(card, `${id} exists`).toBeTruthy();
      expect(card!.rarity).toBe('SHINOBIV');
      expect(card!.set).toBe('SS');
      expect((card!.effects ?? []).length, `${id} has effects`).toBeGreaterThan(0);
      expect(FORCE_UNLOCKED_CARD_IDS.has(id), `${id} unlocked for everyone`).toBe(true);
      expect(isStaticRankedBanned(id), `${id} banned in ranked`).toBe(true);
    }
  });

  it('a Shinobi artwork of an existing card keeps that card rules exactly', () => {
    const pairs: Array<[string, string]> = [
      ['SS-112-SHINOBIV', 'SS-112-SPV'],
      ['SS-114-SHINOBIV', 'SS-114-R'],
    ];
    for (const [variant, base] of pairs) {
      const v = getCharacterById(variant)!;
      const b = getCharacterById(base)!;
      expect(v.chakra, `${variant} cost`).toBe(b.chakra);
      expect(v.power, `${variant} power`).toBe(b.power);
      expect(v.group).toBe(b.group);
      expect([...(v.keywords ?? [])].sort()).toEqual([...(b.keywords ?? [])].sort());
      expect((v.effects ?? []).map((e) => `${e.type}|${e.description}`))
        .toEqual((b.effects ?? []).map((e) => `${e.type}|${e.description}`));
    }
  });

  it('every Shinobi card has a simulation that the sim guard can run', () => {
    for (const id of SHINOBI_IDS) {
      expect(hasScenario(id), `${id} hasScenario`).toBe(true);
    }
  });
});
