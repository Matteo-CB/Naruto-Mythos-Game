import { describe, it, expect } from 'vitest';
import { cardVersionKey, sameVersion } from '@/lib/cards/versionKey';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { validateDeckForTournament, emptyTournamentRules } from '@/lib/tournament/deckValidation';
import { LOCKED_VARIANT_RARITIES, isLockedVariant } from '@/lib/variants/constants';
import { mockCharacter, mockMission } from './testHelpers';

describe('a card version is its number PLUS its edition', () => {
  it('collapses every printed variant of the same number in the same set', () => {
    expect(cardVersionKey('KS-108-R')).toBe('KS-108');
    expect(cardVersionKey('KS-108-RA')).toBe('KS-108');
    expect(cardVersionKey('KS-133-S')).toBe('KS-133');
    expect(cardVersionKey('KS-133-SV')).toBe('KS-133');
    expect(cardVersionKey('KS-133_2-MV')).toBe('KS-133');
  });

  it('never collapses the same number across two different editions', () => {
    expect(cardVersionKey('KS-108-R')).not.toBe(cardVersionKey('SS-108-C'));
    expect(sameVersion('KS-050-M', 'SS-050-M')).toBe(false);
    expect(sameVersion('SS-050-M', 'SS-050-MV')).toBe(true);
  });

  it('treats a holo skin as the same version as its base card', () => {
    expect(cardVersionKey('KS-001-C_H')).toBe('KS-001');
    expect(sameVersion('KS-001-C', 'KS-001-C_H')).toBe(true);
  });

  it('falls back to the raw id for anything it cannot parse', () => {
    expect(cardVersionKey('KS-MSS-01')).toBe('KS-MSS-01');
    expect(cardVersionKey('')).toBe('');
    expect(cardVersionKey('weird id')).toBe('weird id');
  });
});

describe('the copy limit applies to every set, not just the first one', () => {
  const missions = [mockMission({ id: 'KS-001-MMS' }), mockMission({ id: 'KS-002-MMS' }), mockMission({ id: 'KS-003-MMS' })];
  const fill = (count: number, id: string) => Array.from({ length: count }, () => mockCharacter({ id }));
  const filler = (count: number) => Array.from({ length: count }, (_, i) => mockCharacter({ id: `KS-${900 + i}-C` }));

  it('rejects a third copy of the same version in a NON-KS set', () => {
    const deck = [...fill(2, 'SS-050-M'), ...fill(2, 'SS-050-MV'), ...filler(26)];
    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/SS-050/);
  });

  it('still rejects it in the KS set', () => {
    const deck = [...fill(2, 'KS-133-S'), ...fill(2, 'KS-133_2-MV'), ...filler(26)];
    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/KS-133/);
  });

  it('accepts the same number in two different editions, which are two real cards', () => {
    const deck = [...fill(2, 'KS-108-R'), ...fill(2, 'SS-108-C'), ...filler(26)];
    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(true);
  });

  it('accepts a base rare plus its rare art up to the limit, and refuses beyond', () => {
    const ok = validateDeck([...fill(1, 'SS-070-R'), ...fill(1, 'SS-070-RA'), ...filler(28)], missions);
    expect(ok.valid).toBe(true);
    const tooMany = validateDeck([...fill(2, 'SS-070-R'), ...fill(1, 'SS-070-RA'), ...filler(27)], missions);
    expect(tooMany.valid).toBe(false);
  });
});

describe('the tournament validator uses the same version definition', () => {
  const rules = { ...emptyTournamentRules(), maxCopiesPerCard: 2 };
  const deckOf = (cardIds: string[]) => ({ cardIds, missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'] });

  it('does not confuse two different cards that share a number across editions', () => {
    const res = validateDeckForTournament(deckOf(['KS-108-R', 'KS-108-R', 'SS-108-C', 'SS-108-C']), { ...rules, minDeckSize: 1 });
    expect(res.errors.join(' ')).not.toMatch(/Too many copies/);
  });

  it('still counts a base card and its printed variant as the same version', () => {
    const res = validateDeckForTournament(deckOf(['KS-108-R', 'KS-108-R', 'KS-108-RA']), { ...rules, minDeckSize: 1 });
    expect(res.errors.join(' ')).toMatch(/Too many copies/);
  });
});

describe('every V variant rarity is locked by default', () => {
  it('locks SPV alongside the other promo variant rarities', () => {
    for (const rarity of ['RA', 'MV', 'SV', 'L', 'SPV', 'POPV', 'CHIBIV']) {
      expect(isLockedVariant(rarity), `${rarity} must be locked`).toBe(true);
    }
    expect(LOCKED_VARIANT_RARITIES).toContain('SPV');
  });

  it('never locks a base rarity', () => {
    for (const rarity of ['C', 'UC', 'R', 'S', 'M', 'MSS', 'SP', 'POP', 'CHIBI']) {
      expect(isLockedVariant(rarity), `${rarity} must stay unlocked`).toBe(false);
    }
  });
});
