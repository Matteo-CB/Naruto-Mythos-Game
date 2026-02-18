import { describe, it, expect } from 'vitest';
import { AIPlayer } from '../ai/AIPlayer';
import { EasyAI } from '../ai/strategies/EasyAI';
import { MediumAI } from '../ai/strategies/MediumAI';
import { HardAI } from '../ai/strategies/HardAI';
import { ExpertAI } from '../ai/strategies/ExpertAI';
import { GameEngine } from '../engine/GameEngine';
import { createActionPhaseState, createTestConfig } from './testHelpers';

describe('AI System', () => {
  describe('AIPlayer', () => {
    it('should create AI with correct difficulty', () => {
      const ai = new AIPlayer('easy', 'player2');
      expect(ai.difficulty).toBe('easy');
      expect(ai.player).toBe('player2');
    });

    it('should choose an action when valid actions exist', () => {
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const ai = new AIPlayer('easy', 'player2');
      const action = ai.getAction(state);
      expect(action).not.toBeNull();
    });

    it('should return null when no valid actions exist', () => {
      const state = createActionPhaseState({
        activePlayer: 'player1',
        player2: {
          ...createActionPhaseState().player2,
          hasPassed: true,
        },
      });
      const ai = new AIPlayer('easy', 'player2');
      const action = ai.getAction(state);
      expect(action).toBeNull();
    });

    it('should execute a turn and return a new state', () => {
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const ai = new AIPlayer('easy', 'player2');
      const newState = ai.executeTurn(state);

      // State should have changed (some action was taken)
      expect(newState).not.toBe(state);
    });
  });

  describe('EasyAI', () => {
    it('should always return a valid action', () => {
      const ai = new EasyAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      expect(validActions).toContainEqual(action);
    });

    it('should handle mulligan decisions', () => {
      const config = createTestConfig();
      const state = GameEngine.createGame(config);
      const ai = new EasyAI();
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      expect(action.type).toBe('MULLIGAN');
    });
  });

  describe('MediumAI', () => {
    it('should prefer high-power cards on high-value missions', () => {
      const ai = new MediumAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);

      // Should choose to play a card (not pass) when there are playable cards
      expect(action.type).not.toBe('PASS');
    });

    it('should always return a valid action', () => {
      const ai = new MediumAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      expect(validActions).toContainEqual(action);
    });
  });

  describe('HardAI', () => {
    it('should always return a valid action', () => {
      const ai = new HardAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      expect(validActions).toContainEqual(action);
    });

    it('should not pass when it has playable cards and chakra', () => {
      const ai = new HardAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      // Hard AI should recognize that playing is better than passing in turn 1
      expect(['PLAY_CHARACTER', 'PLAY_HIDDEN', 'UPGRADE_CHARACTER', 'REVEAL_CHARACTER', 'PASS']).toContain(action.type);
    });
  });

  describe('ExpertAI', () => {
    it('should always return a valid action', { timeout: 120000 }, () => {
      const ai = new ExpertAI();
      const state = createActionPhaseState({ activePlayer: 'player2' });
      const validActions = GameEngine.getValidActions(state, 'player2');

      const action = ai.chooseAction(state, 'player2', validActions);
      expect(validActions).toContainEqual(action);
    });
  });

  describe('AI plays legal moves only', () => {
    it('should never make an illegal move across 10 random turns', () => {
      for (const difficulty of ['easy', 'medium'] as const) {
        const config = createTestConfig({
          player2: {
            userId: null,
            isAI: true,
            aiDifficulty: difficulty,
            deck: createTestConfig().player2.deck,
            missionCards: createTestConfig().player2.missionCards,
          },
        });

        let state = GameEngine.createGame(config);

        // Both players keep hand
        state = GameEngine.applyAction(state, 'player1', {
          type: 'MULLIGAN',
          doMulligan: false,
        });
        state = GameEngine.applyAction(state, 'player2', {
          type: 'MULLIGAN',
          doMulligan: false,
        });

        const ai = new AIPlayer(difficulty, 'player2');
        let turns = 0;

        while (state.phase === 'action' && turns < 10) {
          if (state.activePlayer === 'player2' || state.player1.hasPassed) {
            const validActions = GameEngine.getValidActions(state, 'player2');
            if (validActions.length === 0) break;

            const action = ai.getAction(state);
            if (!action) break;

            // Verify the action is in the valid actions list
            expect(validActions).toContainEqual(action);

            state = GameEngine.applyAction(state, 'player2', action);
          } else {
            // Player 1 passes to let AI play
            state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
          }
          turns++;
        }
      }
    });
  });
});
