import { describe, it, expect } from 'vitest';
import { canPlayNameOnMission, canRevealOnMission } from '../engine/rules/NameUniqueness';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

describe('Name Uniqueness', () => {
  it('should allow playing a character with no name conflict', () => {
    const state = createActionPhaseState();
    const result = canPlayNameOnMission(state, 'player1', 'Naruto', 0);
    expect(result).toBe(true);
  });

  it('should reject playing a character if a visible one with the same name exists', () => {
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters.push(
      mockCharInPlay(
        { controlledBy: 'player1', isHidden: false },
        { name_fr: 'Naruto' },
      ),
    );

    const result = canPlayNameOnMission(state, 'player1', 'Naruto', 0);
    expect(result).toBe(false);
  });

  it('should allow playing same name if existing character is hidden', () => {
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters.push(
      mockCharInPlay(
        { controlledBy: 'player1', isHidden: true },
        { name_fr: 'Naruto' },
      ),
    );

    // Two hidden with same name can coexist
    const result = canPlayNameOnMission(state, 'player1', 'Naruto', 0);
    expect(result).toBe(true);
  });

  it('should be case-insensitive', () => {
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters.push(
      mockCharInPlay(
        { controlledBy: 'player1', isHidden: false },
        { name_fr: 'NARUTO UZUMAKI' },
      ),
    );

    const result = canPlayNameOnMission(state, 'player1', 'Naruto Uzumaki', 0);
    expect(result).toBe(false);
  });

  it('should allow same name on different missions', () => {
    const state = createActionPhaseState();
    // Add second mission
    state.activeMissions.push({
      card: state.activeMissions[0].card,
      rank: 'C',
      basePoints: 3,
      rankBonus: 2,
      player1Characters: [],
      player2Characters: [],
      wonBy: null,
    });

    // Naruto on mission 0
    state.activeMissions[0].player1Characters.push(
      mockCharInPlay(
        { controlledBy: 'player1', isHidden: false },
        { name_fr: 'Naruto' },
      ),
    );

    // Can play Naruto on mission 1 (different mission)
    const result = canPlayNameOnMission(state, 'player1', 'Naruto', 1);
    expect(result).toBe(true);
  });

  it('should not restrict opponent from using same name', () => {
    const state = createActionPhaseState();
    state.activeMissions[0].player1Characters.push(
      mockCharInPlay(
        { controlledBy: 'player1', isHidden: false },
        { name_fr: 'Naruto' },
      ),
    );

    // Player 2 can still play Naruto on the same mission
    const result = canPlayNameOnMission(state, 'player2', 'Naruto', 0);
    expect(result).toBe(true);
  });

  it('should exclude a specific instanceId from the check', () => {
    const state = createActionPhaseState();
    const char = mockCharInPlay(
      { controlledBy: 'player1', isHidden: false },
      { name_fr: 'Naruto' },
    );
    state.activeMissions[0].player1Characters.push(char);

    // Excluding the existing character should allow the name
    const result = canPlayNameOnMission(state, 'player1', 'Naruto', 0, char.instanceId);
    expect(result).toBe(true);
  });

  describe('canRevealOnMission', () => {
    it('should allow revealing if no visible same-name character', () => {
      const state = createActionPhaseState();
      const hiddenChar = mockCharInPlay(
        { controlledBy: 'player1', isHidden: true },
        { name_fr: 'Naruto' },
      );
      state.activeMissions[0].player1Characters.push(hiddenChar);

      const result = canRevealOnMission(state, 'player1', hiddenChar.instanceId, 0);
      expect(result).toBe(true);
    });

    it('should reject revealing if a visible same-name character exists', () => {
      const state = createActionPhaseState();
      const visibleChar = mockCharInPlay(
        { controlledBy: 'player1', isHidden: false },
        { name_fr: 'Naruto' },
      );
      const hiddenChar = mockCharInPlay(
        { controlledBy: 'player1', isHidden: true },
        { name_fr: 'Naruto' },
      );
      state.activeMissions[0].player1Characters.push(visibleChar, hiddenChar);

      const result = canRevealOnMission(state, 'player1', hiddenChar.instanceId, 0);
      expect(result).toBe(false);
    });
  });
});
