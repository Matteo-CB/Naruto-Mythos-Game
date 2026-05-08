import { describe, it, expect } from 'vitest';
import { validateDeckForTournament, emptyTournamentRules } from '../tournament/deckValidation';
import { getCardById } from '../data/cardIndex';

const KS_001_C = 'KS-001-C';
const KS_002_UC = 'KS-002-UC';
const KS_104_R = 'KS-104-R';
const KS_131_S = 'KS-131-S';

function fillTo30(extra: string[] = []): string[] {
  const base = [
    KS_001_C, KS_001_C, 'KS-003-C', 'KS-003-C', 'KS-005-C', 'KS-005-C',
    'KS-007-C', 'KS-007-C', 'KS-009-C', 'KS-009-C',
    'KS-010-C', 'KS-010-C', 'KS-011-C', 'KS-011-C',
    KS_002_UC, KS_002_UC, 'KS-004-UC', 'KS-004-UC', 'KS-006-UC',
    'KS-006-UC', 'KS-008-UC', 'KS-008-UC',
    'KS-013-C', 'KS-013-C', 'KS-014-C', 'KS-014-C',
    'KS-015-C', 'KS-015-C', 'KS-016-UC', 'KS-016-UC',
  ];
  return [...base, ...extra];
}

const MSS_01 = 'KS-001-MMS';
const MSS_02 = 'KS-002-MMS';
const MSS_03 = 'KS-003-MMS';
const MISSIONS_OK = [MSS_01, MSS_02, MSS_03];

describe('validateDeckForTournament — basic size & mission rules', () => {
  it('valid 30-card deck with 3 missions and no restrictions', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      emptyTournamentRules(),
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects deck with fewer than minDeckSize', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30().slice(0, 29), missionIds: MISSIONS_OK },
      emptyTournamentRules(),
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/at least 30/);
  });

  it('rejects deck with wrong mission count', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: [MSS_01, MSS_02] },
      emptyTournamentRules(),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('exactly 3 mission'))).toBe(true);
  });

  it('respects custom minDeckSize and maxDeckSize', () => {
    const rules = { ...emptyTournamentRules(), minDeckSize: 40, maxDeckSize: 50 };
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      rules,
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('at least 40'))).toBe(true);
  });

  it('respects maxDeckSize upper bound', () => {
    const rules = { ...emptyTournamentRules(), maxDeckSize: 25 };
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      rules,
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('at most 25'))).toBe(true);
  });
});

describe('validateDeckForTournament — banned cards', () => {
  it('rejects deck containing a banned card', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), bannedCardIds: [KS_001_C] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes(KS_001_C))).toBe(true);
  });

  it('rejects deck with a banned mission', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), bannedCardIds: [MSS_01] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Mission') || e.includes(MSS_01))).toBe(true);
  });
});

describe('validateDeckForTournament — copy limits', () => {
  it('default max copies is 2', () => {
    const list = [KS_001_C, KS_001_C, KS_001_C, ...fillTo30().slice(2)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      emptyTournamentRules(),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Too many copies'))).toBe(true);
  });

  it('respects custom maxCopiesPerCard=1', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), maxCopiesPerCard: 1 },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Too many copies'))).toBe(true);
  });

  it('respects maxCopiesPerCard=4 (more permissive)', () => {
    const list = [KS_001_C, KS_001_C, KS_001_C, KS_001_C, ...fillTo30().slice(4)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), maxCopiesPerCard: 4 },
    );
    expect(r.valid).toBe(true);
  });
});

describe('validateDeckForTournament — rarity filters', () => {
  it('rejects card whose rarity is not in allowedRarities', () => {
    const card = getCardById(KS_104_R);
    expect(card?.rarity).toBe('R');
    const list = [KS_104_R, KS_104_R, ...fillTo30().slice(2)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), allowedRarities: ['C', 'UC'] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Rarity R is not allowed'))).toBe(true);
  });

  it('rejects card whose rarity is in bannedRarities', () => {
    const list = [KS_131_S, KS_131_S, ...fillTo30().slice(2)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), bannedRarities: ['S'] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Rarity S is banned'))).toBe(true);
  });

  it('respects maxPerRarity', () => {
    const list = [KS_104_R, KS_104_R, ...fillTo30().slice(2)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), maxPerRarity: { R: 1 } },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Too many R cards'))).toBe(true);
  });
});

describe('validateDeckForTournament — chakra cap', () => {
  it('rejects card exceeding maxChakraCost', () => {
    const card = getCardById(KS_131_S);
    expect(card).toBeDefined();
    const list = [KS_131_S, KS_131_S, ...fillTo30().slice(2)];
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), maxChakraCost: 4 },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('chakra'))).toBe(true);
  });
});

describe('validateDeckForTournament — group filter', () => {
  it('respects allowedGroups (rejects out-of-list)', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), allowedGroups: ['Sand Village'] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('not allowed'))).toBe(true);
  });
});

describe('validateDeckForTournament — combinations', () => {
  it('reports multiple distinct errors when multiple rules fail', () => {
    const list = fillTo30().slice(0, 25);
    const r = validateDeckForTournament(
      { cardIds: list, missionIds: [MSS_01] },
      { ...emptyTournamentRules(), maxCopiesPerCard: 1 },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates identical errors', () => {
    const r = validateDeckForTournament(
      { cardIds: fillTo30(), missionIds: MISSIONS_OK },
      { ...emptyTournamentRules(), bannedCardIds: [KS_001_C] },
    );
    expect(r.errors.filter((e) => e.includes(KS_001_C)).length).toBe(1);
  });

  it('treats Rare and Rare Art variants of the same card as the same version for max-copies', () => {
    const baseR = getCardById(KS_104_R);
    const variantRA = getCardById('KS-104-RA');
    if (!baseR || !variantRA) return;
    expect(baseR.number).toBe(variantRA.number);
    const cards = [
      KS_104_R, KS_104_R,
      'KS-104-RA', 'KS-104-RA',
      ...fillTo30().slice(0, 26),
    ];
    const r = validateDeckForTournament(
      { cardIds: cards, missionIds: MISSIONS_OK },
      emptyTournamentRules(),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('Too many copies') && e.includes('104'))).toBe(true);
  });

  it('allows 1 R + 1 RA of the same card under default max 2 copies', () => {
    const baseR = getCardById(KS_104_R);
    const variantRA = getCardById('KS-104-RA');
    if (!baseR || !variantRA) return;
    const cards = [
      KS_104_R, 'KS-104-RA',
      ...fillTo30().slice(0, 28),
    ];
    const r = validateDeckForTournament(
      { cardIds: cards, missionIds: MISSIONS_OK },
      emptyTournamentRules(),
    );
    expect(r.errors.filter(e => e.includes('Too many copies'))).toEqual([]);
  });
});
