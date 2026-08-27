import { describe, expect, it } from 'vitest';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { getAllCards, getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { LOCKED_VARIANT_RARITIES, SPECIAL_VARIANT_RARITIES, FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { cardVersionKey, isAlternateArtwork } from '@/lib/cards/versionKey';
import { hasScenario } from '@/lib/cards/sim/keys';
import type { CharacterCard, GameState, MissionCard } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';

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

  it('les quatre cartes Shinobi existent, se gagnent et restent hors classe', () => {
    for (const id of SHINOBI_IDS) {
      const card = getCharacterById(id);
      expect(card, `${id} exists`).toBeTruthy();
      expect(card!.rarity).toBe('SHINOBIV');
      expect(card!.set).toBe('SS');
      expect((card!.effects ?? []).length, `${id} has effects`).toBeGreaterThan(0);
      expect(
        FORCE_UNLOCKED_CARD_IDS.has(id),
        `${id}: plus aucune variante n est offerte, elles se gagnent toutes`,
      ).toBe(false);
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

describe('the deck builder mission section', () => {
  it('hiding variants removes exactly the alternate artworks, never a base mission', () => {
    const missions = getAllCards().filter((c) => c.card_type === 'mission');
    const hidden = missions.filter((m) => isAlternateArtwork(m.id));
    const shown = missions.filter((m) => !isAlternateArtwork(m.id));

    expect(hidden.length, 'the ten SS alternate artworks are the ones hidden').toBe(10);
    expect(hidden.every((m) => m.id.includes('_2-MMS'))).toBe(true);
    expect(shown.some((m) => m.id === 'SS-001-MMS'), 'base SS missions stay visible').toBe(true);
    expect(shown.some((m) => m.id.startsWith('KS-')), 'set 1 missions stay visible').toBe(true);
  });

  it('a full page of missions fits the fifteen-per-page layout', () => {
    const playable = getAllCards().filter((c) => c.card_type === 'mission' && !isAlternateArtwork(c.id));
    const pages = Math.ceil(playable.length / 15);
    expect(playable.length, 'ten set 1 plus ten set 2 base missions').toBe(20);
    expect(pages, 'twenty base missions span two pages').toBe(2);
  });
});

describe('Team Training gives its +5 to the side that has exactly three', () => {
  const ALLY = 'KS-009-C';

  function trainingBoard(friendly: Array<{ hidden?: boolean }>): GameState {
    return buildSimState({
      missionIds: ['SS-008-MMS', 'KS-006-MMS'],
      p1: friendly.map((f, i) => simChar(ALLY, { owner: 'player1', instanceId: `ally-${i}`, hidden: f.hidden })),
    });
  }

  function shownTotal(state: GameState, player: 'player1' | 'player2'): number {
    const visible = GameEngine.getVisibleState(state, player);
    const mission = visible.activeMissions[0];
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const bonus = (player === 'player1' ? mission.player1PowerBonus : mission.player2PowerBonus) ?? 0;
    return chars.reduce((sum, c) => sum + c.effectivePower, 0) + bonus;
  }

  it('the total the player reads on the board includes the +5', () => {
    const three = trainingBoard([{}, {}, {}]);
    const base = three.activeMissions[0].player1Characters
      .reduce((sum, c) => sum + (c.card.power ?? 0), 0);

    expect(shownTotal(three, 'player1'), 'three characters, so five more power').toBe(base + 5);
  });

  it('two or four characters get nothing, and hidden ones do not count', () => {
    expect(GameEngine.getVisibleState(trainingBoard([{}, {}]), 'player1').activeMissions[0].player1PowerBonus ?? 0).toBe(0);
    expect(GameEngine.getVisibleState(trainingBoard([{}, {}, {}, {}]), 'player1').activeMissions[0].player1PowerBonus ?? 0).toBe(0);
    expect(
      GameEngine.getVisibleState(trainingBoard([{}, {}, {}, { hidden: true }]), 'player1').activeMissions[0].player1PowerBonus,
      'a face-down ally is not one of the three',
    ).toBe(5);
    expect(
      GameEngine.getVisibleState(trainingBoard([{}, {}, { hidden: true }]), 'player1').activeMissions[0].player1PowerBonus,
      'only two are visible here',
    ).toBe(0);
  });

  it('scoring uses the same total the board shows, so the mission is actually won', () => {
    const state = buildSimState({
      missionIds: ['SS-008-MMS', 'KS-006-MMS'],
      p1: [0, 1, 2].map((i) => simChar(ALLY, { owner: 'player1', instanceId: `ally-${i}` })),
      p2: [simChar(ALLY, { owner: 'player2', instanceId: 'enemy-1', powerTokens: 6 })],
    });

    const mine = shownTotal(state, 'player1');
    const theirs = shownTotal(state, 'player2');
    expect(mine, 'nine printed power plus five').toBe(14);
    expect(theirs).toBe(9);

    const scored = GameEngine.transitionToMissionPhase(state);
    expect(scored.activeMissions[0].wonBy, 'the bonus decides the mission').toBe('player1');
  });
});
