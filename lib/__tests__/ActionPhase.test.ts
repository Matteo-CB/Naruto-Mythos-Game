import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

describe('Action Phase', () => {
  describe('Play Character Face-Visible', () => {
    it('should play a character on a mission', () => {
      const state = createActionPhaseState();
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 4, // Iruka, cost 1
        missionIndex: 0,
        hidden: false,
      });

      expect(newState.activeMissions[0].player1Characters.length).toBe(1);
      expect(newState.activeMissions[0].player1Characters[0].card.name_fr).toBe('Iruka');
      expect(newState.activeMissions[0].player1Characters[0].isHidden).toBe(false);
    });

    it('should deduct chakra cost', () => {
      const state = createActionPhaseState();
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 0, // Naruto, cost 3
        missionIndex: 0,
        hidden: false,
      });

      expect(newState.player1.chakra).toBe(7); // 10 - 3
    });

    it('should remove card from hand', () => {
      const state = createActionPhaseState();
      const initialHandSize = state.player1.hand.length;

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        hidden: false,
      });

      expect(newState.player1.hand.length).toBe(initialHandSize - 1);
    });

    it('should not allow playing with insufficient chakra', () => {
      const state = createActionPhaseState({
        player1: {
          ...createActionPhaseState().player1,
          chakra: 2,
        },
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 0, // Naruto, cost 3
        missionIndex: 0,
        hidden: false,
      });

      // State should be unchanged (action rejected)
      expect(newState.player1.hand.length).toBe(state.player1.hand.length);
    });

    it('should not allow two characters with the same name on the same mission', () => {
      const state = createActionPhaseState();
      // Add a character named 'Naruto' already on mission 0
      state.activeMissions[0].player1Characters.push(
        mockCharInPlay(
          { controlledBy: 'player1', missionIndex: 0 },
          { name_fr: 'Naruto' },
        ),
      );

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 0, // Naruto in hand
        missionIndex: 0,
        hidden: false,
      });

      // Should be rejected
      expect(newState.activeMissions[0].player1Characters.length).toBe(1);
    });

    it('should alternate active player after action', () => {
      const state = createActionPhaseState();
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 4, // Iruka, cost 1
        missionIndex: 0,
        hidden: false,
      });

      expect(newState.activePlayer).toBe('player2');
    });
  });

  describe('Play Hidden', () => {
    it('should play a character face-down for 1 chakra', () => {
      const state = createActionPhaseState();
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 0,
        missionIndex: 0,
      });

      expect(newState.activeMissions[0].player1Characters.length).toBe(1);
      expect(newState.activeMissions[0].player1Characters[0].isHidden).toBe(true);
      expect(newState.player1.chakra).toBe(9); // 10 - 1
    });

    it('should cost exactly 1 chakra regardless of printed cost', () => {
      const state = createActionPhaseState();
      // Play Kakashi (cost 5) hidden - should still cost only 1
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 3, // Kakashi, printed cost 5
        missionIndex: 0,
      });

      expect(newState.player1.chakra).toBe(9); // 10 - 1, not 10 - 5
    });

    it('should not allow playing hidden with 0 chakra', () => {
      const state = createActionPhaseState({
        player1: {
          ...createActionPhaseState().player1,
          chakra: 0,
        },
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 0,
        missionIndex: 0,
      });

      expect(newState.activeMissions[0].player1Characters.length).toBe(0);
    });
  });

  describe('Reveal Character', () => {
    it('should reveal a hidden character', () => {
      const state = createActionPhaseState();
      // First play hidden
      let newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 4, // Iruka, cost 1
        missionIndex: 0,
      });

      const hiddenChar = newState.activeMissions[0].player1Characters[0];
      expect(hiddenChar.isHidden).toBe(true);

      // Now player 2 passes, then player 1 reveals
      newState = GameEngine.applyAction(newState, 'player2', { type: 'PASS' });
      newState = GameEngine.applyAction(newState, 'player1', {
        type: 'REVEAL_CHARACTER',
        missionIndex: 0,
        characterInstanceId: hiddenChar.instanceId,
      });

      const revealedChar = newState.activeMissions[0].player1Characters[0];
      expect(revealedChar.isHidden).toBe(false);
    });

    it('should pay the printed chakra cost on reveal', () => {
      const state = createActionPhaseState();
      // Play hidden (cost 1)
      let newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 0, // Naruto, printed cost 3
        missionIndex: 0,
      });
      const afterHiddenChakra = newState.player1.chakra; // 10 - 1 = 9

      const hiddenChar = newState.activeMissions[0].player1Characters[0];

      // Player 2 passes
      newState = GameEngine.applyAction(newState, 'player2', { type: 'PASS' });

      // Reveal (should cost 3, the printed cost)
      newState = GameEngine.applyAction(newState, 'player1', {
        type: 'REVEAL_CHARACTER',
        missionIndex: 0,
        characterInstanceId: hiddenChar.instanceId,
      });

      expect(newState.player1.chakra).toBe(afterHiddenChakra - 3); // 9 - 3 = 6
    });
  });

  describe('Upgrade Character', () => {
    it('should upgrade a character with a same-name higher-cost card', () => {
      const state = createActionPhaseState();
      // Place a low-cost Naruto on the board
      const lowNaruto = mockCharInPlay(
        { controlledBy: 'player1', missionIndex: 0 },
        { id: '010/130', name_fr: 'Naruto', title_fr: 'Genin', chakra: 3, power: 3 },
      );
      state.activeMissions[0].player1Characters.push(lowNaruto);

      // Put a higher-cost Naruto in hand
      state.player1.hand[0] = mockCharacter({
        id: '011/130',
        name_fr: 'Naruto',
        title_fr: 'Rasengan',
        chakra: 5,
        power: 5,
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        targetInstanceId: lowNaruto.instanceId,
      });

      const upgraded = newState.activeMissions[0].player1Characters[0];
      expect(upgraded.card.title_fr).toBe('Rasengan');
      expect(upgraded.stack.length).toBe(2);
    });

    it('should only pay the cost difference', () => {
      const state = createActionPhaseState();
      const lowNaruto = mockCharInPlay(
        { controlledBy: 'player1', missionIndex: 0 },
        { name_fr: 'Naruto', chakra: 3, power: 3 },
      );
      state.activeMissions[0].player1Characters.push(lowNaruto);

      state.player1.hand[0] = mockCharacter({
        name_fr: 'Naruto',
        chakra: 5,
        power: 5,
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        targetInstanceId: lowNaruto.instanceId,
      });

      // Should pay 5 - 3 = 2
      expect(newState.player1.chakra).toBe(8); // 10 - 2
    });

    it('should not allow upgrade with same or lower cost', () => {
      const state = createActionPhaseState();
      const existingChar = mockCharInPlay(
        { controlledBy: 'player1', missionIndex: 0 },
        { name_fr: 'Naruto', chakra: 4, power: 3 },
      );
      state.activeMissions[0].player1Characters.push(existingChar);

      state.player1.hand[0] = mockCharacter({
        name_fr: 'Naruto',
        chakra: 3, // Lower cost - should fail
        power: 2,
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        targetInstanceId: existingChar.instanceId,
      });

      // Should be rejected
      expect(newState.activeMissions[0].player1Characters[0].card.chakra).toBe(4);
    });

    it('should transfer power tokens on upgrade', () => {
      const state = createActionPhaseState();
      const existingChar = mockCharInPlay(
        { controlledBy: 'player1', missionIndex: 0, powerTokens: 3 },
        { name_fr: 'Naruto', chakra: 3, power: 3 },
      );
      state.activeMissions[0].player1Characters.push(existingChar);

      state.player1.hand[0] = mockCharacter({
        name_fr: 'Naruto',
        chakra: 5,
        power: 5,
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        targetInstanceId: existingChar.instanceId,
      });

      expect(newState.activeMissions[0].player1Characters[0].powerTokens).toBe(3);
    });
  });

  describe('Pass', () => {
    it('should mark player as passed', () => {
      const state = createActionPhaseState();
      const newState = GameEngine.applyAction(state, 'player1', { type: 'PASS' });

      expect(newState.player1.hasPassed).toBe(true);
    });

    it('should give Edge token to first passer', () => {
      const state = createActionPhaseState({ edgeHolder: 'player2' });
      const newState = GameEngine.applyAction(state, 'player1', { type: 'PASS' });

      expect(newState.edgeHolder).toBe('player1');
      expect(newState.firstPasser).toBe('player1');
    });

    it('should not change Edge if not first passer', () => {
      const state = createActionPhaseState({
        edgeHolder: 'player1',
        firstPasser: 'player1',
        player1: {
          ...createActionPhaseState().player1,
          hasPassed: true,
        },
      });

      const newState = GameEngine.applyAction(state, 'player2', { type: 'PASS' });

      // Edge should stay with player1 (first passer)
      expect(newState.edgeHolder).toBe('player1');
    });

    it('should allow other player to continue after one passes', () => {
      const state = createActionPhaseState();
      // Player 1 passes
      let newState = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
      expect(newState.player1.hasPassed).toBe(true);
      expect(newState.activePlayer).toBe('player2');

      // Player 2 should still be able to take actions
      const actions = GameEngine.getValidActions(newState, 'player2');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.type !== 'PASS')).toBe(true);
    });

    it('should not allow actions from a player who has passed', () => {
      const state = createActionPhaseState({
        player1: {
          ...createActionPhaseState().player1,
          hasPassed: true,
        },
      });

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER',
        cardIndex: 0,
        missionIndex: 0,
        hidden: false,
      });

      // Should be unchanged
      expect(newState.activeMissions[0].player1Characters.length).toBe(
        state.activeMissions[0].player1Characters.length,
      );
    });
  });
});
