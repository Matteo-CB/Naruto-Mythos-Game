import { describe, it, expect } from 'vitest';
import type { ActiveMission, GameState } from '../engine/types';
import {
  canRevealHiddenCharacter,
  findLegalRevealUpgradeTarget,
  revealWouldViolateNameUniqueness,
} from '../effects/revealNameUniqueness';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';

function addSecondMission(state: GameState): void {
  const extra: ActiveMission = {
    card: mockMission({ id: 'KS-002-MMS', basePoints: 4 }),
    rank: 'C',
    basePoints: 4,
    rankBonus: 2,
    player1Characters: [],
    player2Characters: [],
    wonBy: null,
  };
  state.activeMissions = [...state.activeMissions, extra];
}

describe('revealNameUniqueness: central No Repetition guard for every reveal path', () => {
  it('allows the reveal when no visible same-name character is on that side', () => {
    const state = createActionPhaseState({});
    const otherName = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-014-R', name_fr: 'Sasuke', chakra: 4 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [otherName, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(false);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)).toBeNull();

    const check = canRevealHiddenCharacter(state, 'player1', 0, hidden);
    expect(check.allowed).toBe(true);
    if (check.allowed) expect(check.upgradeTarget).toBeNull();
  });

  it('allows the reveal as an upgrade when the same-name visible card is owned and cheaper', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [visible, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(false);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)?.instanceId).toBe(visible.instanceId);

    const check = canRevealHiddenCharacter(state, 'player1', 0, hidden);
    expect(check.allowed).toBe(true);
    if (check.allowed) expect(check.upgradeTarget?.instanceId).toBe(visible.instanceId);
  });

  it('blocks the reveal when the printed costs are equal', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 3 },
    );
    state.activeMissions[0].player1Characters = [visible, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(true);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)).toBeNull();

    const check = canRevealHiddenCharacter(state, 'player1', 0, hidden);
    expect(check.allowed).toBe(false);
    if (!check.allowed) {
      expect(check.reasonKey).toBe('game.error.duplicateNameReveal');
      expect(check.reasonParams.name).toBe('Shikamaru');
    }
  });

  it('blocks the reveal when the hidden card costs less than the visible one', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [visible, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(true);
    expect(canRevealHiddenCharacter(state, 'player1', 0, hidden).allowed).toBe(false);
  });

  it('blocks the reveal when the same-name visible card is controlled, even with a higher cost', () => {
    const state = createActionPhaseState({});
    const stolen = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, isHidden: false, controllerInstanceId: 'inst-ino' },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [stolen, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(true);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)).toBeNull();
    expect(canRevealHiddenCharacter(state, 'player1', 0, hidden).allowed).toBe(false);
  });

  it('blocks the reveal when the hidden card itself is controlled', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    const stolenHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false, controllerInstanceId: 'inst-oro' },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    state.activeMissions[0].player1Characters = [visible, stolenHidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, stolenHidden)).toBe(true);
    expect(canRevealHiddenCharacter(state, 'player1', 0, stolenHidden).allowed).toBe(false);
  });

  it('allows the reveal when the same-name character on that side is still hidden', () => {
    const state = createActionPhaseState({});
    const otherHidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 1 },
    );
    state.activeMissions[0].player1Characters = [otherHidden, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(false);
    expect(canRevealHiddenCharacter(state, 'player1', 0, hidden).allowed).toBe(true);
  });

  it('allows the reveal when the same-name visible character is on another mission', () => {
    const state = createActionPhaseState({});
    addSecondMission(state);
    const visibleElsewhere = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 1, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    state.activeMissions[0].player1Characters = [visibleElsewhere];
    state.activeMissions[1].player1Characters = [hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 1, hidden)).toBe(false);
    expect(canRevealHiddenCharacter(state, 'player1', 1, hidden).allowed).toBe(true);
  });

  it('allows the reveal when the same-name visible character belongs to the opponent side', () => {
    const state = createActionPhaseState({});
    const enemyVisible = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 5 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    state.activeMissions[0].player2Characters = [enemyVisible];
    state.activeMissions[0].player1Characters = [hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(false);
    expect(canRevealHiddenCharacter(state, 'player1', 0, hidden).allowed).toBe(true);
  });

  it('compares names case-insensitively and reads the top card of an upgraded stack', () => {
    const state = createActionPhaseState({});
    const visible = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'SHIKAMARU', chakra: 2 },
    );
    const hiddenStack = mockCharInPlay(
      { controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-021-C', name_fr: 'Choji', chakra: 1 },
    );
    const topCard = { ...hiddenStack.card, id: 'KS-111-R', name_fr: 'shikamaru', chakra: 4 };
    hiddenStack.stack = [hiddenStack.card, topCard];

    state.activeMissions[0].player2Characters = [visible, hiddenStack];

    expect(revealWouldViolateNameUniqueness(state, 'player2', 0, hiddenStack)).toBe(false);
    expect(findLegalRevealUpgradeTarget(state, 'player2', 0, hiddenStack)?.instanceId).toBe(visible.instanceId);
  });

  it('blocks the reveal when two visible same-name characters already sit on that side', () => {
    const state = createActionPhaseState({});
    const visibleA = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-100-C', name_fr: 'Shikamaru', chakra: 2 },
    );
    const visibleB = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-022-C', name_fr: 'Shikamaru', chakra: 3 },
    );
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 6 },
    );
    state.activeMissions[0].player1Characters = [visibleA, visibleB, hidden];

    expect(revealWouldViolateNameUniqueness(state, 'player1', 0, hidden)).toBe(true);
    expect(findLegalRevealUpgradeTarget(state, 'player1', 0, hidden)).toBeNull();
  });

  it('returns no violation when the mission index does not exist', () => {
    const state = createActionPhaseState({});
    const hidden = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: true, wasRevealedAtLeastOnce: false },
      { id: 'KS-111-R', name_fr: 'Shikamaru', chakra: 6 },
    );

    expect(revealWouldViolateNameUniqueness(state, 'player1', 7, hidden)).toBe(false);
    expect(canRevealHiddenCharacter(state, 'player1', 7, hidden).allowed).toBe(true);
  });
});
