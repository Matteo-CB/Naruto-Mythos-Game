import type { GameState, GameAction, PlayerID, CharacterInPlay } from '../engine/types';
import { GameEngine } from '../engine/GameEngine';
import { EasyAI } from './strategies/EasyAI';
import { MediumAI } from './strategies/MediumAI';
import { HardAI } from './strategies/HardAI';
import { ExpertAI } from './strategies/ExpertAI';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Interface that all AI strategies must implement.
 */
export interface AIStrategy {
  /**
   * Choose the best action from the set of valid actions.
   * The AI only receives visible state information — never reads hidden cards.
   */
  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction;

  /** Human-readable difficulty name */
  readonly difficulty: AIDifficulty;
}

/**
 * AI Player controller. Wraps a strategy and handles the game interaction loop.
 */
export class AIPlayer {
  private strategy: AIStrategy;
  readonly player: PlayerID;

  constructor(difficulty: AIDifficulty, player: PlayerID) {
    this.player = player;
    this.strategy = AIPlayer.createStrategy(difficulty);
  }

  /**
   * Factory method to create the appropriate strategy.
   */
  static createStrategy(difficulty: AIDifficulty): AIStrategy {
    switch (difficulty) {
      case 'easy':
        return new EasyAI();
      case 'medium':
        return new MediumAI();
      case 'hard':
        return new HardAI();
      case 'expert':
        return new ExpertAI();
    }
  }

  /**
   * Get the AI's next action for the current game state.
   * Sanitizes state to hide opponent's private info (hand, hidden cards).
   */
  getAction(state: GameState): GameAction | null {
    const validActions = GameEngine.getValidActions(state, this.player);
    if (validActions.length === 0) return null;
    if (validActions.length === 1) return validActions[0];

    const sanitized = AIPlayer.sanitizeStateForAI(state, this.player);
    return this.strategy.chooseAction(sanitized, this.player, validActions);
  }

  /**
   * Create a sanitized copy of GameState that hides opponent's private information.
   * Keeps the GameState shape so strategies work unchanged, but:
   * - Opponent's hand is replaced with empty array (AI can't see cards)
   * - Opponent's hidden characters have their card data blanked
   */
  static sanitizeStateForAI(state: GameState, aiPlayer: PlayerID): GameState {
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';

    // Hide opponent's hand
    const opponentState = {
      ...state[opponent],
      hand: [], // AI knows hand size from original but can't see cards
    };

    // Hide opponent's hidden character card details on missions
    const missions = state.activeMissions.map((mission) => {
      const opponentCharsKey = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
      const sanitizedChars = mission[opponentCharsKey].map((char: CharacterInPlay) => {
        if (char.isHidden) {
          // Replace card info with blank — AI knows a hidden char exists but not what it is
          return {
            ...char,
            card: { ...char.card, id: 'hidden', name_fr: 'Hidden', title_fr: '', effects: [], power: 0, chakra: 0 },
            stack: [],
          };
        }
        return char;
      });
      return { ...mission, [opponentCharsKey]: sanitizedChars };
    });

    return {
      ...state,
      [opponent]: opponentState,
      activeMissions: missions,
    };
  }

  /**
   * Execute the AI's turn: choose and apply an action.
   * Returns the new state after the AI's action.
   */
  executeTurn(state: GameState): GameState {
    const action = this.getAction(state);
    if (!action) return state;

    return GameEngine.applyAction(state, this.player, action);
  }

  get difficulty(): AIDifficulty {
    return this.strategy.difficulty;
  }
}
