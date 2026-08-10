import { describe, it, expect } from 'vitest';
import {
  canRevealHiddenCharacter,
  findLegalRevealUpgradeTarget,
  revealWouldViolateNameUniqueness,
} from '../effects/revealNameUniqueness';
import { isUpgradeNameLegal } from '../engine/rules/PlayValidation';
import { hasFlexibleUpgradeRestriction } from '../engine/rules/flexibleUpgradeRestriction';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';
import { getAllCharacters } from '../data/cardLoader';
import type { CardEffect, CharacterCard } from '../engine/types';

const FLEXIBLE_MAIN: CardEffect[] = [
  {
    type: 'MAIN',
    description: '[⧗] You can play this character as an upgrade to any character that is not a Summon nor Orochimaru.',
  },
];

function stateWithOrochimaruPair(hiddenChakra: number, visibleChakra: number) {
  const state = createActionPhaseState({});
  const visible = mockCharInPlay(
    { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
    { id: 'KS-051-UC', name_fr: 'OROCHIMARU', chakra: visibleChakra, number: 51, set: 'KS' },
  );
  const hidden = mockCharInPlay(
    { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
    { id: 'KS-138-S', name_fr: 'OROCHIMARU', chakra: hiddenChakra, number: 138, set: 'KS', effects: FLEXIBLE_MAIN },
  );
  state.activeMissions[0].player1Characters = [visible, hidden];
  return { state, visible, hidden };
}

describe('a printed upgrade restriction also forbids the reveal', () => {
  it('the real card 138 carries the restriction and the card 051 does not', () => {
    const all = getAllCharacters();
    const card138 = all.find((c) => c.id === 'KS-138-S');
    const card051 = all.find((c) => c.id === 'KS-051-UC');
    expect(card138, 'KS-138-S must exist').toBeDefined();
    expect(hasFlexibleUpgradeRestriction(card138!)).toBe(true);
    expect(hasFlexibleUpgradeRestriction(card051!)).toBe(false);
  });

  it('Orochimaru cannot merge onto another Orochimaru even when it costs strictly more', () => {
    const { state, hidden } = stateWithOrochimaruPair(6, 5);

    expect(
      findLegalRevealUpgradeTarget(state, 'player1', 0, hidden),
      'its own text forbids upgrading onto an Orochimaru',
    ).toBeNull();
  });

  it('so the reveal is refused entirely, the card stays hidden', () => {
    const { state, hidden } = stateWithOrochimaruPair(6, 5);

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(true);

    const check = canRevealHiddenCharacter(state, 'player1', 0, hidden);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reasonKey).toBe('game.error.duplicateNameReveal');
    }
  });

  it('the hand path and the reveal path now agree', () => {
    const upgrading = {
      id: 'KS-138-S',
      name_fr: 'OROCHIMARU',
      chakra: 6,
      number: 138,
      set: 'KS',
      effects: FLEXIBLE_MAIN,
    } as unknown as CharacterCard;
    const target = { name_fr: 'OROCHIMARU', keywords: [] } as unknown as CharacterCard;

    expect(isUpgradeNameLegal(upgrading, target), 'refused from hand').toBe(false);

    const { state, hidden } = stateWithOrochimaruPair(6, 5);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden), 'refused on reveal too').toBeNull();
  });

  it('a Summon is refused the same way', () => {
    const upgrading = {
      id: 'KS-138-S',
      name_fr: 'OROCHIMARU',
      chakra: 6,
      number: 138,
      set: 'KS',
      effects: FLEXIBLE_MAIN,
    } as unknown as CharacterCard;
    const summon = { name_fr: 'MANDA', keywords: ['Summon'] } as unknown as CharacterCard;

    expect(isUpgradeNameLegal(upgrading, summon)).toBe(false);
  });

  it('a character without the printed restriction still merges normally', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'SHIKAMARU', chakra: 2, number: 100, set: 'KS' },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'SHIKAMARU', chakra: 5, number: 111, set: 'KS' },
    );
    state.activeMissions[0].player1Characters = [visible, hidden];

    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)?.instanceId).toBe(visible.instanceId);
    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(false);
  });
});
