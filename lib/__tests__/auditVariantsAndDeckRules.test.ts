import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';
import type { CardData, CharacterCard, CharacterInPlay, EffectType, Rarity } from '@/lib/engine/types';

const fakeUserFindUnique = vi.fn();
const fakeInvFindMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => fakeUserFindUnique(...args) },
    variantInventory: { findMany: (...args: unknown[]) => fakeInvFindMany(...args) },
  },
}));

import {
  VARIANT_RARITIES,
  LOCKED_VARIANT_RARITIES,
  SPECIAL_VARIANT_RARITIES,
  isVariantRarity,
  isSpecialVariant,
  isLockedVariant,
} from '@/lib/variants/constants';
import { isVariantCard, isLockedVariantCard, baseCardIdFor, parseCardId } from '@/lib/variants/isVariant';
import { resolveVariantToBaseCardId } from '@/lib/variants/variantPool';
import { isForceUnlockedCard, getForceUnlockedCardIds } from '@/lib/variants/forceUnlock';
import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';
import {
  HOLO_ID_SUFFIX,
  isHoloId,
  holoBaseId,
  holoIdFor,
  isHoloEligibleCard,
  decorateHoloCard,
  normalizeHoloCardForGame,
} from '@/lib/holo/holoId';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';
import { getAllCards, getAllCharacters } from '@/lib/data/cardLoader';
import { initializeRegistry, getEffectHandler, getRegisteredCardIds } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { validateDeckForTournament, emptyTournamentRules } from '@/lib/tournament/deckValidation';
import { STATIC_RANKED_BANNED_CARD_IDS, isStaticRankedBanned } from '@/lib/data/rankedBans';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState, createTestConfig } from './testHelpers';

const DOCUMENTED_LOCKED_RARITIES = ['RA', 'MV', 'SV', 'L'];
const NEVER_LOCKED_RARITIES = ['C', 'UC', 'R', 'S', 'M', 'MMS', 'MSS'];

const EFFECT_TYPES: EffectType[] = ['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE', 'DUEL'] as EffectType[];

const FILLER_30 = [
  'KS-001-C', 'KS-001-C', 'KS-003-C', 'KS-003-C', 'KS-005-C', 'KS-005-C',
  'KS-007-C', 'KS-007-C', 'KS-009-C', 'KS-009-C', 'KS-010-C', 'KS-010-C',
  'KS-011-C', 'KS-011-C', 'KS-013-C', 'KS-013-C', 'KS-014-C', 'KS-014-C',
  'KS-015-C', 'KS-015-C', 'KS-002-UC', 'KS-002-UC', 'KS-004-UC', 'KS-004-UC',
  'KS-006-UC', 'KS-006-UC', 'KS-008-UC', 'KS-008-UC', 'KS-016-UC', 'KS-016-UC',
];
const MISSIONS_OK = ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'];

function deckOf(extra: string[] = []): string[] {
  return [...extra, ...FILLER_30.slice(0, Math.max(0, 30 - extra.length))];
}

function rules(over: Partial<ReturnType<typeof emptyTournamentRules>> = {}) {
  return { ...emptyTournamentRules(), ...over };
}

function keysOf(result: { errorKeys: Array<{ key: string }> }): string[] {
  return result.errorKeys.map((e) => e.key);
}

const REAL_LOCKED_IDS: Record<string, string> = {
  RA: 'KS-108-RA',
  MV: 'KS-108-MV',
  SV: 'KS-133-SV',
  L: 'KS-133-L',
};

const REAL_UNLOCKED_IDS: Record<string, string> = {
  C: 'KS-001-C',
  UC: 'KS-002-UC',
  R: 'KS-108-R',
  S: 'KS-133-S',
  M: 'KS-141-M',
  MMS: 'KS-001-MMS',
};

function charOf(id: string): CharacterCard {
  const card = getCharacterById(id);
  if (!card) throw new Error(`missing test fixture card ${id}`);
  return card;
}

function commonPool(): CharacterCard[] {
  return getAllCharacters().filter((c) => c.set === 'KS' && c.rarity === 'C');
}

function legalCharacterDeck(size = MIN_DECK_SIZE): CharacterCard[] {
  const pool = commonPool();
  const out: CharacterCard[] = [];
  for (let i = 0; out.length < size; i++) {
    const card = pool[i % pool.length];
    out.push(card);
    if (out.length < size) out.push(card);
  }
  return out.slice(0, size);
}

function threeMissions() {
  return [
    mockMission({ id: 'KS-001-MMS' }),
    mockMission({ id: 'KS-002-MMS' }),
    mockMission({ id: 'KS-003-MMS' }),
  ];
}

function resetDeckBuilder(unlocked: string[] = []) {
  useDeckBuilderStore.setState({
    deckName: 'Audit deck',
    deckChars: [],
    deckMissions: [],
    loadedDeckId: null,
    savedDecks: [],
    unlockedVariantIds: new Set(unlocked),
    addError: null,
    addErrorKey: null,
    addErrorParams: null,
  });
}

beforeAll(() => {
  initializeRegistry();
});

describe('test fixtures are real data', () => {
  it('loads a multi set card pool containing every rarity this suite relies on', () => {
    const all = getAllCards();
    expect(all.length).toBeGreaterThan(200);
    const rarities = new Set<string>(all.map((c) => c.rarity));
    for (const r of [...DOCUMENTED_LOCKED_RARITIES, 'C', 'UC', 'R', 'S', 'M', 'MMS']) {
      expect(rarities.has(r), r).toBe(true);
    }
    expect(new Set(all.map((c) => c.set)).size).toBeGreaterThan(1);
  });
});

describe('variant rarity classification', () => {
  it('exposes exactly the four documented variant rarities', () => {
    expect([...VARIANT_RARITIES].sort()).toEqual(['L', 'MV', 'RA', 'SV']);
  });

  it('locks every documented locked rarity', () => {
    for (const r of DOCUMENTED_LOCKED_RARITIES) {
      expect(isLockedVariant(r)).toBe(true);
      expect((LOCKED_VARIANT_RARITIES as readonly string[]).includes(r)).toBe(true);
    }
  });

  it('never locks a base rarity', () => {
    for (const r of NEVER_LOCKED_RARITIES) {
      expect(isLockedVariant(r)).toBe(false);
      expect((LOCKED_VARIANT_RARITIES as readonly string[]).includes(r)).toBe(false);
      expect(isVariantRarity(r)).toBe(false);
    }
  });

  it('treats the four variant rarities as variant rarities', () => {
    for (const r of DOCUMENTED_LOCKED_RARITIES) {
      expect(isVariantRarity(r)).toBe(true);
      expect(isSpecialVariant(r)).toBe(true);
      expect((SPECIAL_VARIANT_RARITIES as readonly string[]).includes(r)).toBe(true);
    }
  });

  it('rejects empty, null, undefined and malformed rarity input', () => {
    const bad = [null, undefined, '', ' ', 'ra', 'mv', 'RARE', 'VARIANT', 'C ', 'RA_H', '0'];
    for (const v of bad) {
      expect(isVariantRarity(v as unknown as Rarity)).toBe(false);
      expect(isLockedVariant(v as unknown as Rarity)).toBe(false);
      expect(isSpecialVariant(v as unknown as Rarity)).toBe(false);
    }
  });

  it('rejects null, undefined and rarity-less card objects', () => {
    expect(isVariantCard(null)).toBe(false);
    expect(isVariantCard(undefined)).toBe(false);
    expect(isLockedVariantCard(null)).toBe(false);
    expect(isLockedVariantCard(undefined)).toBe(false);
    expect(isLockedVariantCard({} as Pick<CardData, 'rarity'>)).toBe(false);
    expect(isVariantCard({ rarity: undefined } as unknown as Pick<CardData, 'rarity'>)).toBe(false);
  });

  it('classifies every real card of a locked rarity as locked', () => {
    const locked = getAllCards().filter((c) => DOCUMENTED_LOCKED_RARITIES.includes(c.rarity));
    expect(locked.length).toBeGreaterThan(0);
    for (const card of locked) {
      expect(isLockedVariantCard(card)).toBe(true);
      expect(isVariantCard(card)).toBe(true);
    }
  });

  it('classifies every real card of a base rarity as unlocked', () => {
    const base = getAllCards().filter((c) => NEVER_LOCKED_RARITIES.includes(c.rarity));
    expect(base.length).toBeGreaterThan(0);
    for (const card of base) {
      expect(isLockedVariantCard(card)).toBe(false);
    }
  });

  it('resolves the real fixture cards used by this suite to their expected rarity', () => {
    for (const [rarity, id] of Object.entries(REAL_LOCKED_IDS)) {
      expect(getCardById(id)?.rarity).toBe(rarity);
    }
    for (const [rarity, id] of Object.entries(REAL_UNLOCKED_IDS)) {
      expect(getCardById(id)?.rarity).toBe(rarity);
    }
  });
});

describe('card id parsing and base card resolution', () => {
  it('parses a well formed card id', () => {
    expect(parseCardId('KS-108-RA')).toEqual({ set: 'KS', number: '108', rarity: 'RA' });
    expect(parseCardId('KS-133_2-MV')).toEqual({ set: 'KS', number: '133_2', rarity: 'MV' });
  });

  it('returns null on empty and malformed ids', () => {
    for (const bad of ['', 'KS-108', 'ks-108-ra', 'KS-108-RA-X', 'KS--RA', '108', 'KS-108-R_H']) {
      expect(parseCardId(bad)).toBeNull();
    }
  });

  it('maps each variant rarity back to its printed base rarity', () => {
    expect(baseCardIdFor('KS-108-RA')).toBe('KS-108-R');
    expect(baseCardIdFor('KS-133-SV')).toBe('KS-133-S');
    expect(baseCardIdFor('KS-108-MV')).toBe('KS-108-M');
    expect(baseCardIdFor('KS-133-L')).toBe('KS-133-S');
    expect(baseCardIdFor('KS-108_2-MV')).toBe('KS-108-M');
  });

  it('leaves base rarities and unparsable ids untouched', () => {
    expect(baseCardIdFor('KS-001-C')).toBe('KS-001-C');
    expect(baseCardIdFor('KS-001-MMS')).toBe('KS-001-MMS');
    expect(baseCardIdFor('')).toBe('');
    expect(baseCardIdFor('not-a-card-id')).toBe('not-a-card-id');
  });

  it('resolves a rare art variant to the existing base rare card', () => {
    expect(resolveVariantToBaseCardId('KS-108-RA')).toBe('KS-108-R');
    expect(getCardById('KS-108-R')?.rarity).toBe('R');
  });

  it('falls back down the chain when the printed base rarity does not exist', () => {
    expect(resolveVariantToBaseCardId('KS-108-MV')).toBe('KS-108-R');
    expect(resolveVariantToBaseCardId('KS-117-L')).toBe('KS-117-R');
    expect(resolveVariantToBaseCardId('KS-133-SV')).toBe('KS-133-S');
  });

  it('returns the input for non variants and for unknown ids', () => {
    expect(resolveVariantToBaseCardId('KS-001-C')).toBe('KS-001-C');
    expect(resolveVariantToBaseCardId('ZZ-999-RA')).toBe('ZZ-999-RA');
    expect(resolveVariantToBaseCardId('')).toBe('');
  });
});

describe('force unlocked cards', () => {
  it('force unlocks every card of a not yet released set', () => {
    expect(isForceUnlockedCard('SS-149-L')).toBe(true);
    expect(isForceUnlockedCard('SS-147-POPV')).toBe(true);
    expect(isForceUnlockedCard('AK-001-RA')).toBe(true);
  });

  it('does not force unlock a released set', () => {
    expect(isForceUnlockedCard('KS-108-RA')).toBe(false);
    expect(isForceUnlockedCard('KS-133-L')).toBe(false);
  });

  it('rejects empty and malformed ids', () => {
    expect(isForceUnlockedCard('')).toBe(false);
    expect(isForceUnlockedCard('garbage')).toBe(false);
    expect(isForceUnlockedCard('KS-108')).toBe(false);
  });

  it('lists the not yet released card ids and never a released one', () => {
    const ids = getForceUnlockedCardIds();
    expect(ids.has('SS-149-L')).toBe(true);
    expect(ids.has('KS-108-RA')).toBe(false);
    for (const id of ids) {
      expect(id.startsWith('KS-')).toBe(false);
    }
  });
});

describe('server side deck variant validation', () => {
  beforeEach(() => {
    fakeUserFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeUserFindUnique.mockResolvedValue({ username: 'Player', email: 'player@example.com' });
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('accepts an empty deck without hitting the database', async () => {
    const res = await validateDeckVariantUnlocks('u1', []);
    expect(res).toEqual({ ok: true, lockedCardIds: [] });
    expect(fakeUserFindUnique).not.toHaveBeenCalled();
    expect(fakeInvFindMany).not.toHaveBeenCalled();
  });

  it('accepts a deck made only of never locked rarities without hitting the database', async () => {
    const res = await validateDeckVariantUnlocks('u1', Object.values(REAL_UNLOCKED_IDS));
    expect(res.ok).toBe(true);
    expect(res.lockedCardIds).toEqual([]);
    expect(fakeUserFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an unowned card of each locked rarity', async () => {
    for (const [rarity, id] of Object.entries(REAL_LOCKED_IDS)) {
      const res = await validateDeckVariantUnlocks('u1', deckOf([id]));
      expect(res.ok, `${rarity} should be locked`).toBe(false);
      expect(res.lockedCardIds).toEqual([id]);
    }
  });

  it('accepts a locked variant the player owns', async () => {
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-108-RA' }]);
    const res = await validateDeckVariantUnlocks('u1', deckOf(['KS-108-RA']));
    expect(res.ok).toBe(true);
    expect(res.lockedCardIds).toEqual([]);
  });

  it('reports only the unowned locked variants', async () => {
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-108-RA' }]);
    const res = await validateDeckVariantUnlocks('u1', ['KS-108-RA', 'KS-133-SV', 'KS-001-C']);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual(['KS-133-SV']);
  });

  it('reports every copy of a repeated unowned locked variant', async () => {
    const res = await validateDeckVariantUnlocks('u1', ['KS-108-RA', 'KS-108-RA']);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual(['KS-108-RA', 'KS-108-RA']);
  });

  it('rejects everything when the user row does not exist', async () => {
    fakeUserFindUnique.mockResolvedValue(null);
    const res = await validateDeckVariantUnlocks('ghost', ['KS-108-RA', 'KS-133-L']);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual(['KS-108-RA', 'KS-133-L']);
    expect(fakeInvFindMany).not.toHaveBeenCalled();
  });

  it('ignores unknown and malformed card ids', async () => {
    const res = await validateDeckVariantUnlocks('u1', ['', 'not-an-id', 'KS-999-RA', 'ZZ-000-SV']);
    expect(res.ok).toBe(true);
    expect(res.lockedCardIds).toEqual([]);
    expect(fakeUserFindUnique).not.toHaveBeenCalled();
  });

  it('accepts a locked rarity from a not yet released set without any ownership', async () => {
    expect(isLockedVariantCard(getCardById('SS-147-POPV'))).toBe(true);
    const res = await validateDeckVariantUnlocks('u1', ['SS-147-POPV', 'SS-149-L']);
    expect(res.ok).toBe(true);
    expect(fakeUserFindUnique).not.toHaveBeenCalled();
  });
});

describe('server side deck variant validation admin bypass', () => {
  beforeEach(() => {
    fakeUserFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('lets an admin username submit unowned locked variants', async () => {
    fakeUserFindUnique.mockResolvedValue({ username: 'Kutxyt', email: 'someone@example.com' });
    const res = await validateDeckVariantUnlocks('admin', Object.values(REAL_LOCKED_IDS));
    expect(res.ok).toBe(true);
    expect(res.lockedCardIds).toEqual([]);
    expect(fakeInvFindMany).not.toHaveBeenCalled();
  });

  it('matches the admin username case insensitively', async () => {
    fakeUserFindUnique.mockResolvedValue({ username: 'kUtXyT', email: null });
    const res = await validateDeckVariantUnlocks('admin', ['KS-108-RA']);
    expect(res.ok).toBe(true);
  });

  it('lets an admin email bypass the check', async () => {
    fakeUserFindUnique.mockResolvedValue({ username: 'NotAnAdmin', email: 'matteo.biyikli3224@gmail.com' });
    const res = await validateDeckVariantUnlocks('admin', ['KS-133-SV']);
    expect(res.ok).toBe(true);
  });

  it('does not bypass for a non admin with a similar name', async () => {
    fakeUserFindUnique.mockResolvedValue({ username: 'Kutxyt2', email: 'kutxyt@example.com' });
    const res = await validateDeckVariantUnlocks('u1', ['KS-108-RA']);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual(['KS-108-RA']);
  });
});

describe('server side deck validation of holo skins', () => {
  beforeEach(() => {
    fakeUserFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeUserFindUnique.mockResolvedValue({ username: 'Player', email: 'player@example.com' });
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('rejects a holo id the player does not own even though the base rarity is never locked', async () => {
    const holoId = holoIdFor('KS-001-C');
    expect(isLockedVariantCard(getCardById('KS-001-C'))).toBe(false);
    const res = await validateDeckVariantUnlocks('u1', deckOf([holoId]));
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual([holoId]);
    expect(fakeInvFindMany).toHaveBeenCalled();
  });

  it('accepts a holo id stored in the player inventory under the holo id', async () => {
    const holoId = holoIdFor('KS-002-UC');
    fakeInvFindMany.mockResolvedValue([{ cardId: holoId }]);
    const res = await validateDeckVariantUnlocks('u1', deckOf([holoId]));
    expect(res.ok).toBe(true);
    expect(res.lockedCardIds).toEqual([]);
  });

  it('does not accept a holo id when only the base card id is owned', async () => {
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-001-C' }]);
    const res = await validateDeckVariantUnlocks('u1', [holoIdFor('KS-001-C')]);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual([holoIdFor('KS-001-C')]);
  });

  it('rejects a holo id whose base card cannot carry a holo skin, even if owned', async () => {
    const bogus = holoIdFor('KS-108-R');
    fakeInvFindMany.mockResolvedValue([{ cardId: bogus }]);
    const res = await validateDeckVariantUnlocks('u1', [bogus]);
    expect(res.ok).toBe(false);
    expect(res.lockedCardIds).toEqual([bogus]);
  });

  it('lets an admin play an unowned holo but still rejects an impossible holo id', async () => {
    fakeUserFindUnique.mockResolvedValue({ username: 'Kutxyt', email: null });
    const good = await validateDeckVariantUnlocks('admin', [holoIdFor('KS-001-C')]);
    expect(good.ok).toBe(true);
    expect(fakeInvFindMany).not.toHaveBeenCalled();

    const bad = await validateDeckVariantUnlocks('admin', [holoIdFor('KS-133-S')]);
    expect(bad.ok).toBe(false);
    expect(bad.lockedCardIds).toEqual([holoIdFor('KS-133-S')]);
  });
});

describe('holo ids', () => {
  it('uses the documented suffix', () => {
    expect(HOLO_ID_SUFFIX).toBe('_H');
    expect(holoIdFor('KS-001-C')).toBe('KS-001-C_H');
  });

  it('round trips a base id through the holo id and back', () => {
    for (const id of ['KS-001-C', 'KS-002-UC', 'KS-108-R']) {
      const holo = holoIdFor(id);
      expect(isHoloId(holo)).toBe(true);
      expect(holoBaseId(holo)).toBe(id);
    }
  });

  it('is idempotent and never double suffixes', () => {
    expect(holoIdFor(holoIdFor('KS-001-C'))).toBe('KS-001-C_H');
    expect(holoBaseId(holoBaseId('KS-001-C_H'))).toBe('KS-001-C');
    expect(holoBaseId('KS-001-C')).toBe('KS-001-C');
  });

  it('rejects empty, null and non holo ids', () => {
    expect(isHoloId('')).toBe(false);
    expect(isHoloId(null)).toBe(false);
    expect(isHoloId(undefined)).toBe(false);
    expect(isHoloId('KS-001-C')).toBe(false);
    expect(isHoloId('KS-001-CH')).toBe(false);
  });

  it('only allows holo skins on common and uncommon characters with art', () => {
    expect(isHoloEligibleCard(getCardById('KS-001-C'))).toBe(true);
    expect(isHoloEligibleCard(getCardById('KS-002-UC'))).toBe(true);
    expect(isHoloEligibleCard(getCardById('KS-108-R'))).toBe(false);
    expect(isHoloEligibleCard(getCardById('KS-133-S'))).toBe(false);
    expect(isHoloEligibleCard(getCardById('KS-141-M'))).toBe(false);
    expect(isHoloEligibleCard(getCardById('KS-108-RA'))).toBe(false);
    expect(isHoloEligibleCard(getCardById('KS-001-MMS'))).toBe(false);
  });

  it('rejects null, undefined and art-less cards as holo candidates', () => {
    expect(isHoloEligibleCard(null)).toBe(false);
    expect(isHoloEligibleCard(undefined)).toBe(false);
    expect(isHoloEligibleCard({ card_type: 'character', rarity: 'C', image_file: undefined })).toBe(false);
  });

  it('decorates a card with the holo id in the inventory shape', () => {
    const base = charOf('KS-001-C');
    const holo = decorateHoloCard(base);
    expect(holo.id).toBe('KS-001-C_H');
    expect(holo.cardId).toBe('KS-001-C_H');
    expect(holo.isHolo).toBe(true);
    expect(holo.power).toBe(base.power);
    expect(holo.chakra).toBe(base.chakra);
    expect(holo.effects).toEqual(base.effects);
  });

  it('resolves a holo id back to a playable card only when the base is eligible', () => {
    expect(getCardById('KS-001-C_H')?.id).toBe('KS-001-C_H');
    expect(getCardById('KS-108-R_H')).toBeUndefined();
    expect(getCharacterById('KS-002-UC_H')?.isHolo).toBe(true);
    expect(getCharacterById('KS-001-MMS_H')).toBeUndefined();
  });
});

describe('holo cards in play keep their base id', () => {
  it('normalizes a holo card to the base id and keeps the flag', () => {
    const base = charOf('KS-001-C');
    const inGame = normalizeHoloCardForGame(decorateHoloCard(base));
    expect(inGame.id).toBe('KS-001-C');
    expect(inGame.cardId).toBe('KS-001-C');
    expect(inGame.isHolo).toBe(true);
    expect(isHoloId(inGame.id)).toBe(false);
  });

  it('leaves a non holo card untouched', () => {
    const base = charOf('KS-001-C');
    expect(normalizeHoloCardForGame(base)).toBe(base);
    expect(normalizeHoloCardForGame(base).isHolo).toBeUndefined();
  });

  it('strips every holo id when a game is created', () => {
    const holoDeck = getAllCharacters()
      .filter((c) => c.set === 'KS' && (c.rarity === 'C' || c.rarity === 'UC'))
      .slice(0, 10)
      .map(decorateHoloCard);
    expect(holoDeck).toHaveLength(10);

    const config = createTestConfig({
      player1: { userId: 'u1', isAI: false, deck: holoDeck, missionCards: threeMissions() },
    });
    const state = GameEngine.createGame(config);
    const cards = [...state.player1.deck, ...state.player1.hand];
    expect(cards).toHaveLength(10);
    for (const card of cards) {
      expect(isHoloId(card.id)).toBe(false);
      expect(isHoloId(card.cardId ?? '')).toBe(false);
      expect(card.isHolo).toBe(true);
      expect(getCardById(card.id)).toBeDefined();
    }
  });

  it('keeps the in play id registered as a card specific handler key, which the holo id is not', () => {
    const holo = normalizeHoloCardForGame(decorateHoloCard(charOf('KS-001-C')));
    expect(holo.id).toBe('KS-001-C');
    expect(getEffectHandler('KS-001-C', 'MAIN')).toBeDefined();

    const registeredIds = new Set(getRegisteredCardIds());
    expect(registeredIds.has(holo.id)).toBe(true);
    expect(registeredIds.has(holoIdFor('KS-001-C'))).toBe(false);
  });

  it('runs the card specific handler of a holo card in play down to its own pending effect', () => {
    const holo = normalizeHoloCardForGame(decorateHoloCard(charOf('KS-001-C')));
    expect(holo.isHolo).toBe(true);
    const source: CharacterInPlay = {
      ...mockCharInPlay({ instanceId: 'holo-hiruzen' }),
      card: holo,
      stack: [holo],
    };
    const ally = mockCharInPlay({ instanceId: 'leaf-ally' }, { id: 'KS-003-C', group: 'Leaf Village' });
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters = [source, ally];

    const after = EffectEngine.resolvePlayEffects(state, 'player1', source, 0, false);
    expect(after.player1EffectsUsed).toBe(true);
    expect(after.pendingEffects).toHaveLength(1);
    expect(after.pendingEffects[0].targetSelectionType).toBe('HIRUZEN001_CONFIRM_MAIN');
    expect(after.pendingEffects[0].sourceCardId).toBe('KS-001-C');
    expect(isHoloId(after.pendingEffects[0].sourceCardId)).toBe(false);
  });

  it('announces the card specific no target log of a holo card when nothing is targetable', () => {
    const holo = normalizeHoloCardForGame(decorateHoloCard(charOf('KS-001-C')));
    const inPlay: CharacterInPlay = {
      ...mockCharInPlay({ instanceId: 'holo-hiruzen' }),
      card: holo,
      stack: [holo],
    };
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters = [inPlay];

    const after = EffectEngine.resolvePlayEffects(state, 'player1', inPlay, 0, false);
    expect(after.log.length).toBeGreaterThan(state.log.length);
    const noTarget = after.log.filter((e) => e.action === 'EFFECT_NO_TARGET');
    expect(noTarget).toHaveLength(1);
    expect(noTarget[0].messageParams?.id).toBe('KS-001-C');
    expect(after.pendingEffects).toHaveLength(0);
    expect(after.player1EffectsUsed).toBe(true);
  });

  it('resolves the same handler through the holo id for every registered holo eligible card', () => {
    const registered = getRegisteredCardIds().filter((id) => isHoloEligibleCard(getCardById(id)));
    expect(registered.length).toBeGreaterThan(0);
    let comparedDefined = 0;
    for (const id of registered) {
      for (const type of EFFECT_TYPES) {
        const base = getEffectHandler(id, type);
        expect(getEffectHandler(holoIdFor(id), type)).toBe(base);
        if (base) comparedDefined++;
      }
    }
    expect(comparedDefined).toBeGreaterThanOrEqual(registered.length);
  });

  it('counts a holo skin as a copy of its base version in every deck size check', () => {
    const holoId = holoIdFor('KS-001-C');
    expect(getCardById(holoId)?.number).toBe(getCardById('KS-001-C')?.number);

    const tournamentRes = validateDeckForTournament(
      { cardIds: deckOf([holoId]), missionIds: MISSIONS_OK },
      rules(),
    );
    expect(tournamentRes.valid).toBe(false);
    expect(keysOf(tournamentRes)).toContain('tournament.deckError.tooManyCopies');

    const base = charOf('KS-001-C');
    const engineRes = validateDeck(
      [base, base, decorateHoloCard(base), ...commonPool().slice(1, 28)],
      threeMissions(),
    );
    expect(engineRes.valid).toBe(false);
    expect(engineRes.errors.some((e) => e.includes('KS-001'))).toBe(true);
  });
});

describe('deck construction limits', () => {
  it('uses the documented constants', () => {
    expect(MIN_DECK_SIZE).toBe(30);
    expect(MAX_COPIES_PER_VERSION).toBe(2);
    expect(MISSION_CARDS_PER_PLAYER).toBe(3);
  });

  it('accepts a legal deck', () => {
    const res = validateDeck(legalCharacterDeck(), threeMissions());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('rejects fewer than thirty character cards', () => {
    const res = validateDeck(legalCharacterDeck(29), threeMissions());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('at least 30'))).toBe(true);
  });

  it('accepts more than thirty character cards', () => {
    const res = validateDeck(legalCharacterDeck(40), threeMissions());
    expect(res.valid).toBe(true);
  });

  it('rejects a third copy of the same version', () => {
    const card = charOf('KS-001-C');
    const deck = [card, card, card, ...legalCharacterDeck(27)];
    const res = validateDeck(deck, threeMissions());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Too many copies'))).toBe(true);
  });

  it('accepts exactly two copies of the same version', () => {
    const card = charOf('KS-108-R');
    const deck = [card, card, ...commonPool().slice(0, 28)];
    expect(validateDeck(deck, threeMissions()).valid).toBe(true);
  });

  it('counts a rare art variant against the version of its base rare', () => {
    const rare = charOf('KS-108-R');
    const rareArt = charOf('KS-108-RA');
    const deck = [rare, rare, rareArt, ...commonPool().slice(0, 27)];
    const res = validateDeck(deck, threeMissions());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('KS-108'))).toBe(true);
  });

  it('accepts one base rare plus its rare art', () => {
    const deck = [charOf('KS-108-R'), charOf('KS-108-RA'), ...commonPool().slice(0, 28)];
    expect(validateDeck(deck, threeMissions()).valid).toBe(true);
  });

  it('counts every printed variant of a number against the same version', () => {
    const secret = charOf('KS-133-S');
    for (const variantId of ['KS-133-SV', 'KS-133-L', 'KS-133-MV']) {
      const deck = [secret, secret, charOf(variantId), ...commonPool().slice(0, 27)];
      const res = validateDeck(deck, threeMissions());
      expect(res.valid, variantId).toBe(false);
      expect(res.errors.some((e) => e.includes('KS-133'))).toBe(true);
    }
  });

  it('requires exactly three mission cards', () => {
    const deck = legalCharacterDeck();
    expect(validateDeck(deck, []).valid).toBe(false);
    expect(validateDeck(deck, threeMissions().slice(0, 2)).valid).toBe(false);
    expect(validateDeck(deck, [...threeMissions(), mockMission({ id: 'KS-004-MMS' })]).valid).toBe(false);
    expect(validateDeck(deck, threeMissions()).valid).toBe(true);
  });

  it('rejects an empty deck with both structural errors', () => {
    const res = validateDeck([], []);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(2);
  });

  it('rejects a card with neither art nor complete data', () => {
    const broken = mockCharacter({ id: 'KS-900-C', has_visual: false, data_complete: false });
    const res = validateDeck([broken, ...legalCharacterDeck(29)], threeMissions());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('not playable'))).toBe(true);
  });
});

describe('deck builder locked variant gating', () => {
  beforeEach(() => {
    resetDeckBuilder();
  });

  it('refuses a locked variant the player does not own', () => {
    for (const id of Object.values(REAL_LOCKED_IDS)) {
      const check = useDeckBuilderStore.getState().canAddChar(charOf(id));
      expect(check.allowed, id).toBe(false);
      expect(check.reasonKey).toBe('deckBuilder.error.variantLocked');
    }
  });

  it('does not add a locked variant to the deck', () => {
    useDeckBuilderStore.getState().addChar(charOf('KS-108-RA'));
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(0);
    expect(useDeckBuilderStore.getState().addErrorKey).toBe('deckBuilder.error.variantLocked');
  });

  it('accepts a locked variant once it is unlocked', () => {
    resetDeckBuilder(['KS-108-RA']);
    expect(useDeckBuilderStore.getState().canAddChar(charOf('KS-108-RA')).allowed).toBe(true);
    useDeckBuilderStore.getState().addChar(charOf('KS-108-RA'));
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(1);
  });

  it('always accepts a base rarity card', () => {
    for (const id of ['KS-001-C', 'KS-002-UC', 'KS-108-R', 'KS-133-S', 'KS-141-M']) {
      expect(useDeckBuilderStore.getState().canAddChar(charOf(id)).allowed, id).toBe(true);
    }
  });

  it('stops at two copies of the same version', () => {
    const card = charOf('KS-001-C');
    useDeckBuilderStore.getState().addChar(card);
    useDeckBuilderStore.getState().addChar(card);
    const third = useDeckBuilderStore.getState().canAddChar(card);
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(2);
    expect(third.allowed).toBe(false);
    expect(third.reasonKey).toBe('deckBuilder.error.maxCopies');
  });

  it('counts an unlocked rare art against its base rare version', () => {
    resetDeckBuilder(['KS-108-RA']);
    const rare = charOf('KS-108-R');
    useDeckBuilderStore.getState().addChar(rare);
    useDeckBuilderStore.getState().addChar(rare);
    const check = useDeckBuilderStore.getState().canAddChar(charOf('KS-108-RA'));
    expect(check.allowed).toBe(false);
    expect(check.reasonKey).toBe('deckBuilder.error.maxCopies');
  });

  it('caps missions at three and refuses duplicates', () => {
    const missions = threeMissions();
    for (const m of missions) useDeckBuilderStore.getState().addMission(m);
    expect(useDeckBuilderStore.getState().deckMissions).toHaveLength(3);
    const extra = useDeckBuilderStore.getState().canAddMission(mockMission({ id: 'KS-004-MMS' }));
    expect(extra.allowed).toBe(false);
    expect(extra.reasonKey).toBe('deckBuilder.error.maxMissions');

    resetDeckBuilder();
    useDeckBuilderStore.getState().addMission(missions[0]);
    const dup = useDeckBuilderStore.getState().canAddMission(missions[0]);
    expect(dup.allowed).toBe(false);
    expect(dup.reasonKey).toBe('deckBuilder.error.alreadyInDeck');
  });

  it('gates a holo skin on owning the holo id and never on the base id', () => {
    resetDeckBuilder();
    expect(useDeckBuilderStore.getState().canUseHolo(charOf('KS-001-C'))).toBe(false);
    resetDeckBuilder(['KS-001-C']);
    expect(useDeckBuilderStore.getState().canUseHolo(charOf('KS-001-C'))).toBe(false);
    resetDeckBuilder([holoIdFor('KS-001-C')]);
    expect(useDeckBuilderStore.getState().canUseHolo(charOf('KS-001-C'))).toBe(true);
    expect(useDeckBuilderStore.getState().canUseHolo(charOf('KS-108-R'))).toBe(false);
    expect(useDeckBuilderStore.getState().canUseHolo(charOf('KS-133-S'))).toBe(false);
  });

  it('keeps every locked variant readable so the collection can still show it', () => {
    for (const id of Object.values(REAL_LOCKED_IDS)) {
      const card = getCardById(id);
      expect(card, id).toBeDefined();
      expect(card?.id).toBe(id);
      expect(isLockedVariantCard(card)).toBe(true);
      expect(useDeckBuilderStore.getState().canAddChar(charOf(id)).allowed, id).toBe(false);
    }
  });

  it('repairs a deck by removing locked variants the player no longer owns', () => {
    resetDeckBuilder(['KS-108-RA']);
    useDeckBuilderStore.getState().addChar(charOf('KS-108-RA'));
    useDeckBuilderStore.getState().addChar(charOf('KS-001-C'));
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(2);

    useDeckBuilderStore.setState({ unlockedVariantIds: new Set<string>() });
    const repaired = useDeckBuilderStore.getState().removeLockedVariants();
    expect(repaired).toBe(1);
    const kept = useDeckBuilderStore.getState().deckChars;
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('KS-001-C');
  });

  it('repairs a deck by downgrading a holo skin the player no longer owns', () => {
    resetDeckBuilder([holoIdFor('KS-001-C')]);
    useDeckBuilderStore.getState().addChar(charOf('KS-001-C'));
    useDeckBuilderStore.getState().toggleCharHolo(0);
    expect(useDeckBuilderStore.getState().deckChars[0].isHolo).toBe(true);

    useDeckBuilderStore.setState({ unlockedVariantIds: new Set<string>() });
    expect(useDeckBuilderStore.getState().removeLockedVariants()).toBe(1);
    const kept = useDeckBuilderStore.getState().deckChars;
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('KS-001-C');
    expect(kept[0].isHolo).toBe(false);
  });

  it('saves a holo card under its holo id and a plain card under its base id', async () => {
    resetDeckBuilder([holoIdFor('KS-001-C')]);
    useDeckBuilderStore.getState().addChar(charOf('KS-001-C'));
    useDeckBuilderStore.getState().toggleCharHolo(0);
    useDeckBuilderStore.getState().addChar(charOf('KS-003-C'));
    for (const m of threeMissions()) useDeckBuilderStore.getState().addMission(m);

    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) bodies.push(init.body);
      return { ok: true, json: async () => (init?.body ? { id: 'deck-1' } : []) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await useDeckBuilderStore.getState().saveDeck();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(bodies).toHaveLength(1);
    const payload = JSON.parse(bodies[0]) as { cardIds: string[]; missionIds: string[] };
    expect(payload.cardIds).toEqual([holoIdFor('KS-001-C'), 'KS-003-C']);
    expect(payload.missionIds).toEqual(MISSIONS_OK);
  });
});

describe('tournament deck validation structure', () => {
  it('accepts a legal deck under neutral rules', () => {
    const res = validateDeckForTournament({ cardIds: deckOf(), missionIds: MISSIONS_OK }, rules());
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('applies the default minimum of thirty cards', () => {
    const res = validateDeckForTournament({ cardIds: deckOf().slice(0, 29), missionIds: MISSIONS_OK }, rules());
    expect(res.valid).toBe(false);
    expect(keysOf(res)).toContain('tournament.deckError.tooFewCards');
  });

  it('honours an explicit minimum and maximum deck size', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(keysOf(validateDeckForTournament(deck, rules({ minDeckSize: 40 })))).toContain('tournament.deckError.tooFewCards');
    expect(keysOf(validateDeckForTournament(deck, rules({ maxDeckSize: 20 })))).toContain('tournament.deckError.tooManyCards');
    expect(validateDeckForTournament(deck, rules({ minDeckSize: 30, maxDeckSize: 30 })).valid).toBe(true);
  });

  it('requires exactly three missions', () => {
    for (const missions of [[], MISSIONS_OK.slice(0, 2), [...MISSIONS_OK, 'KS-004-MMS']]) {
      const res = validateDeckForTournament({ cardIds: deckOf(), missionIds: missions }, rules());
      expect(res.valid).toBe(false);
      expect(keysOf(res)).toContain('tournament.deckError.wrongMissionCount');
    }
  });

  it('reports both structural errors on an empty deck', () => {
    const res = validateDeckForTournament({ cardIds: [], missionIds: [] }, rules());
    expect(res.valid).toBe(false);
    expect(keysOf(res).sort()).toEqual([
      'tournament.deckError.tooFewCards',
      'tournament.deckError.wrongMissionCount',
    ]);
  });

  it('ignores unknown card ids instead of throwing', () => {
    const garbage = Array.from({ length: 30 }, (_, i) => `ZZ-${i}-XX`);
    const res = validateDeckForTournament({ cardIds: garbage, missionIds: MISSIONS_OK }, rules({ maxChakraCost: 0 }));
    expect(res.valid).toBe(true);
  });
});

describe('tournament ban list and restricted filters', () => {
  it('rejects a banned card id and a banned mission id', () => {
    const banned = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-RA']), missionIds: MISSIONS_OK },
      rules({ bannedCardIds: ['KS-108-RA'] }),
    );
    expect(banned.valid).toBe(false);
    expect(keysOf(banned)).toContain('tournament.deckError.cardBanned');

    const bannedMission = validateDeckForTournament(
      { cardIds: deckOf(), missionIds: MISSIONS_OK },
      rules({ bannedCardIds: ['KS-002-MMS'] }),
    );
    expect(bannedMission.valid).toBe(false);
    expect(keysOf(bannedMission)).toContain('tournament.deckError.missionBanned');
  });

  it('accepts a deck when the ban list does not touch it', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(), missionIds: MISSIONS_OK },
      rules({ bannedCardIds: ['KS-140-S', 'KS-133-L'] }),
    );
    expect(res.valid).toBe(true);
  });

  it('enforces allowed and banned groups', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(validateDeckForTournament(deck, rules({ allowedGroups: ['Leaf Village'] })).valid).toBe(true);
    const notAllowed = validateDeckForTournament(deck, rules({ allowedGroups: ['Sand Village'] }));
    expect(notAllowed.valid).toBe(false);
    expect(keysOf(notAllowed)).toContain('tournament.deckError.groupNotAllowed');
    const bannedGroup = validateDeckForTournament(deck, rules({ bannedGroups: ['Leaf Village'] }));
    expect(bannedGroup.valid).toBe(false);
    expect(keysOf(bannedGroup)).toContain('tournament.deckError.groupBanned');
    expect(validateDeckForTournament(deck, rules({ bannedGroups: ['Akatsuki'] })).valid).toBe(true);
  });

  it('enforces allowed and banned keywords', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    const bannedKw = validateDeckForTournament(deck, rules({ bannedKeywords: ['Sannin'] }));
    expect(bannedKw.valid).toBe(false);
    expect(keysOf(bannedKw)).toContain('tournament.deckError.keywordBanned');
    expect(validateDeckForTournament(deck, rules({ bannedKeywords: ['Akatsuki'] })).valid).toBe(true);

    const noAllowed = validateDeckForTournament(deck, rules({ allowedKeywords: ['Team 7'] }));
    expect(noAllowed.valid).toBe(false);
    expect(keysOf(noAllowed)).toContain('tournament.deckError.noAllowedKeyword');
    const allAllowed = validateDeckForTournament(
      deck,
      rules({ allowedKeywords: ['Team 7', 'Hokage', 'Sannin', 'Jutsu', 'Weapon'] }),
    );
    expect(allAllowed.valid).toBe(true);
  });

  it('enforces allowed and banned rarities', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(validateDeckForTournament(deck, rules({ allowedRarities: ['C', 'UC'] })).valid).toBe(true);
    const onlyCommon = validateDeckForTournament(deck, rules({ allowedRarities: ['C'] }));
    expect(onlyCommon.valid).toBe(false);
    expect(keysOf(onlyCommon)).toContain('tournament.deckError.rarityNotAllowed');
    const noUncommon = validateDeckForTournament(deck, rules({ bannedRarities: ['UC'] }));
    expect(noUncommon.valid).toBe(false);
    expect(keysOf(noUncommon)).toContain('tournament.deckError.rarityBanned');
    expect(validateDeckForTournament(deck, rules({ bannedRarities: [...DOCUMENTED_LOCKED_RARITIES] })).valid).toBe(true);
  });

  it('bans every locked variant rarity when the organizer asks for it', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-RA', 'KS-133-SV']), missionIds: MISSIONS_OK },
      rules({ bannedRarities: [...DOCUMENTED_LOCKED_RARITIES] }),
    );
    expect(res.valid).toBe(false);
    expect(keysOf(res).filter((k) => k === 'tournament.deckError.rarityBanned').length).toBeGreaterThanOrEqual(2);
  });

  it('enforces the max copies per card', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(validateDeckForTournament(deck, rules({ maxCopiesPerCard: 2 })).valid).toBe(true);
    const singleton = validateDeckForTournament(deck, rules({ maxCopiesPerCard: 1 }));
    expect(singleton.valid).toBe(false);
    expect(keysOf(singleton)).toContain('tournament.deckError.tooManyCopies');
  });

  it('counts a rare art against the version of its base rare', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-R', 'KS-108-R', 'KS-108-RA']), missionIds: MISSIONS_OK },
      rules(),
    );
    expect(res.valid).toBe(false);
    expect(keysOf(res)).toContain('tournament.deckError.tooManyCopies');

    const legal = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-R', 'KS-108-RA']), missionIds: MISSIONS_OK },
      rules(),
    );
    expect(legal.valid).toBe(true);
  });

  it('counts a secret, its secret variant and its legendary against the same version', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-133-S', 'KS-133-SV', 'KS-133-L']), missionIds: MISSIONS_OK },
      rules(),
    );
    expect(res.valid).toBe(false);
    expect(keysOf(res)).toContain('tournament.deckError.tooManyCopies');
  });

  it('treats a numbered second art of a variant as the same version as its base', () => {
    expect(getCardById('KS-108_2-MV')?.rarity).toBe('MV');
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-R', 'KS-108-MV', 'KS-108_2-MV']), missionIds: MISSIONS_OK },
      rules(),
    );
    expect(res.valid).toBe(false);
    expect(keysOf(res)).toContain('tournament.deckError.tooManyCopies');

    const engineRes = validateDeck(
      [charOf('KS-108-R'), charOf('KS-108-MV'), charOf('KS-108_2-MV'), ...commonPool().slice(0, 27)],
      threeMissions(),
    );
    expect(engineRes.valid).toBe(false);
    expect(engineRes.errors.some((e) => e.includes('KS-108'))).toBe(true);
  });

  it('bans a single variant id while its base card stays legal', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-R', 'KS-108-RA']), missionIds: MISSIONS_OK },
      rules({ bannedCardIds: ['KS-108-RA'] }),
    );
    expect(res.valid).toBe(false);
    const banned = res.errorKeys.filter((e) => e.key === 'tournament.deckError.cardBanned');
    expect(banned).toHaveLength(1);
    expect(banned[0].params?.cardId).toBe('KS-108-RA');
  });

  it('enforces the max chakra cost', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(validateDeckForTournament(deck, rules({ maxChakraCost: 5 })).valid).toBe(true);
    const cheap = validateDeckForTournament(deck, rules({ maxChakraCost: 4 }));
    expect(cheap.valid).toBe(false);
    expect(keysOf(cheap)).toContain('tournament.deckError.tooMuchChakra');
  });

  it('enforces a per rarity quota', () => {
    const deck = { cardIds: deckOf(), missionIds: MISSIONS_OK };
    expect(validateDeckForTournament(deck, rules({ maxPerRarity: { UC: 10 } })).valid).toBe(true);
    const capped = validateDeckForTournament(deck, rules({ maxPerRarity: { UC: 5 } }));
    expect(capped.valid).toBe(false);
    expect(keysOf(capped)).toContain('tournament.deckError.tooManyOfRarity');
  });

  it('deduplicates identical error messages', () => {
    const res = validateDeckForTournament(
      { cardIds: deckOf(['KS-108-RA', 'KS-108-RA']), missionIds: MISSIONS_OK },
      rules({ bannedCardIds: ['KS-108-RA'] }),
    );
    expect(res.errors).toEqual([...new Set(res.errors)]);
    expect(res.errors.length).toBe(res.errorKeys.length);
  });
});

describe('static ranked ban list', () => {
  it('bans every id on the static list', () => {
    expect(STATIC_RANKED_BANNED_CARD_IDS.size).toBeGreaterThan(0);
    for (const id of STATIC_RANKED_BANNED_CARD_IDS) {
      expect(isStaticRankedBanned(id), id).toBe(true);
    }
  });

  it('bans every card of a not yet released set', () => {
    applySetStatusOverrides({ SS: 'coming_soon' });
    expect(isStaticRankedBanned('SS-082-C')).toBe(true);
    expect(isStaticRankedBanned('SS-128-R')).toBe(true);
    applySetStatusOverrides(null);
  });

  it('keeps the explicitly banned set 2 promos out of ranked', () => {
    expect(isStaticRankedBanned('SS-149-L')).toBe(true);
    expect(isStaticRankedBanned('SS-147-POPV')).toBe(true);
  });

  it('lets the released set 2 cards into ranked', () => {
    expect(isStaticRankedBanned('SS-046-UC')).toBe(false);
    expect(isStaticRankedBanned('SS-085-UC')).toBe(false);
  });

  it('does not ban released cards', () => {
    for (const id of Object.values(REAL_UNLOCKED_IDS)) {
      expect(isStaticRankedBanned(id), id).toBe(false);
    }
    for (const id of Object.values(REAL_LOCKED_IDS)) {
      expect(isStaticRankedBanned(id), id).toBe(false);
    }
  });

  it('does not ban unknown or empty ids', () => {
    expect(isStaticRankedBanned('')).toBe(false);
    expect(isStaticRankedBanned('ZZ-999-C')).toBe(false);
  });
});
