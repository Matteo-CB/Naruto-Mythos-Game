import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { createTestConfig, createActionPhaseState, mockCharacter, mockMission } from './testHelpers';
import type { GameState } from '../engine/types';

describe('GameEngine', () => {
  describe('createGame', () => {
    it('should create a game in mulligan phase', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(state.phase).toBe('mulligan');
      expect(state.turn).toBe(1);
      expect(state.gameId).toBeTruthy();
    });

    it('should deal 5 cards to each player', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(state.player1.hand.length).toBe(5);
      expect(state.player2.hand.length).toBe(5);
    });

    it('should assign Edge token to one player', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(['player1', 'player2']).toContain(state.edgeHolder);
      expect(state.activePlayer).toBe(state.edgeHolder);
    });

    it('should construct a 4-card mission deck from both players missions', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      // 2 missions selected from each player (3 each, pick 2)
      expect(state.missionDeck.length).toBe(4);
    });

    it('should initialize chakra at 0', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(state.player1.chakra).toBe(0);
      expect(state.player2.chakra).toBe(0);
    });

    it('should start with no active missions', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(state.activeMissions.length).toBe(0);
    });

    it('should start with 0 mission points', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      expect(state.player1.missionPoints).toBe(0);
      expect(state.player2.missionPoints).toBe(0);
    });
  });

  describe('mulligan', () => {
    it('should allow a player to keep their hand', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);
      const originalHand = [...state.player1.hand];

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      expect(newState.player1.hasMulliganed).toBe(true);
      expect(newState.player1.hand).toEqual(originalHand);
    });

    it('should allow a player to mulligan for a new hand', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);

      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: true,
      });

      expect(newState.player1.hasMulliganed).toBe(true);
      expect(newState.player1.hand.length).toBe(5);
    });

    it('should transition to start phase when both players mulligan', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);

      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });
      state = GameEngine.applyAction(state, 'player2', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      // After both mulligan, should transition through start phase to action phase
      expect(state.phase).toBe('action');
      expect(state.turn).toBe(1);
    });

    it('should reveal a mission card after mulligan', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);

      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });
      state = GameEngine.applyAction(state, 'player2', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      expect(state.activeMissions.length).toBe(1);
      expect(state.activeMissions[0].rank).toBe('D');
    });

    it('should grant chakra after transition to action phase', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);

      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });
      state = GameEngine.applyAction(state, 'player2', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      // Base chakra is 5 (no characters in play on turn 1)
      expect(state.player1.chakra).toBe(5);
      expect(state.player2.chakra).toBe(5);
    });

    it('should draw 2 cards after transition to action phase', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);
      const p1HandSize = state.player1.hand.length;
      const p2HandSize = state.player2.hand.length;

      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });
      state = GameEngine.applyAction(state, 'player2', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      expect(state.player1.hand.length).toBe(p1HandSize + 2);
      expect(state.player2.hand.length).toBe(p2HandSize + 2);
    });

    it('should not allow double mulligan', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);

      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      // Try to mulligan again
      const state2 = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: true,
      });

      // Should be unchanged (already mulliganed)
      expect(state2.player1.hasMulliganed).toBe(true);
    });
  });

  describe('getValidActions', () => {
    it('should return mulligan options during mulligan phase', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);
      const actions = GameEngine.getValidActions(state, 'player1');

      expect(actions.length).toBe(2);
      expect(actions.some((a) => a.type === 'MULLIGAN' && a.doMulligan)).toBe(true);
      expect(actions.some((a) => a.type === 'MULLIGAN' && !a.doMulligan)).toBe(true);
    });

    it('should return no actions for already-mulliganed player', () => {
      const config = createTestConfig();
      let state = GameEngine.createGame(config);
      state = GameEngine.applyAction(state, 'player1', {
        type: 'MULLIGAN',
        doMulligan: false,
      });

      const actions = GameEngine.getValidActions(state, 'player1');
      expect(actions.length).toBe(0);
    });

    it('should include PASS during action phase', () => {
      const state = createActionPhaseState();
      const actions = GameEngine.getValidActions(state, 'player1');
      expect(actions.some((a) => a.type === 'PASS')).toBe(true);
    });

    it('should include play character options', () => {
      const state = createActionPhaseState();
      const actions = GameEngine.getValidActions(state, 'player1');
      const playActions = actions.filter((a) => a.type === 'PLAY_CHARACTER');
      expect(playActions.length).toBeGreaterThan(0);
    });

    it('should include play hidden options', () => {
      const state = createActionPhaseState();
      const actions = GameEngine.getValidActions(state, 'player1');
      const hiddenActions = actions.filter((a) => a.type === 'PLAY_HIDDEN');
      expect(hiddenActions.length).toBeGreaterThan(0);
    });

    it('should return no actions for player who has passed', () => {
      const state = createActionPhaseState({
        player1: {
          ...createActionPhaseState().player1,
          hasPassed: true,
        },
      });

      const actions = GameEngine.getValidActions(state, 'player1');
      expect(actions.length).toBe(0);
    });
  });

  describe('getVisibleState', () => {
    it('should hide opponent hand', () => {
      const state = createActionPhaseState();
      const visible = GameEngine.getVisibleState(state, 'player1');

      expect(visible.myState.hand.length).toBe(5);
      expect(visible.opponentState.handSize).toBe(5);
      // Opponent state should not have the actual hand
      expect((visible.opponentState as any).hand).toBeUndefined();
    });

    it('should show own hidden characters', () => {
      const state = createActionPhaseState();
      // Play a hidden character
      const newState = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN',
        cardIndex: 0,
        missionIndex: 0,
      });

      const visible = GameEngine.getVisibleState(newState, 'player1');
      const myChars = visible.activeMissions[0].player1Characters;
      const hiddenChar = myChars.find((c) => c.isHidden);

      expect(hiddenChar).toBeDefined();
      expect(hiddenChar!.card).toBeDefined(); // Can see own hidden card
    });

    it('should not show opponent hidden character details', () => {
      const state = createActionPhaseState({ activePlayer: 'player2' });
      // Player 2 plays hidden
      const newState = GameEngine.applyAction(state, 'player2', {
        type: 'PLAY_HIDDEN',
        cardIndex: 0,
        missionIndex: 0,
      });

      const visible = GameEngine.getVisibleState(newState, 'player1');
      const oppChars = visible.activeMissions[0].player2Characters;
      const hiddenChar = oppChars.find((c) => c.isHidden);

      expect(hiddenChar).toBeDefined();
      expect(hiddenChar!.card).toBeUndefined(); // Cannot see opponent hidden card
    });
  });

  describe('getWinner', () => {
    it('should return null if game is not over', () => {
      const state = createActionPhaseState();
      expect(GameEngine.getWinner(state)).toBeNull();
    });

    it('should return the player with more points', () => {
      const state = createActionPhaseState({
        phase: 'gameOver',
        player1: {
          ...createActionPhaseState().player1,
          missionPoints: 10,
        },
        player2: {
          ...createActionPhaseState().player2,
          missionPoints: 5,
        },
      });
      expect(GameEngine.getWinner(state)).toBe('player1');
    });

    it('should return edge holder on tie', () => {
      const state = createActionPhaseState({
        phase: 'gameOver',
        edgeHolder: 'player2',
        player1: {
          ...createActionPhaseState().player1,
          missionPoints: 7,
        },
        player2: {
          ...createActionPhaseState().player2,
          missionPoints: 7,
        },
      });
      expect(GameEngine.getWinner(state)).toBe('player2');
    });
  });
});
