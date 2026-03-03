import type { GameState, GameAction, PlayerID, CharacterInPlay, CharacterCard } from '../engine/types';
import { GameEngine } from '../engine/GameEngine';
import { EasyAI } from './strategies/EasyAI';
import { MediumAI } from './strategies/MediumAI';
import { HardAI } from './strategies/HardAI';
import { ImpossibleAI } from './strategies/ImpossibleAI';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

/**
 * Interface that all AI strategies must implement.
 */
export interface AIStrategy {
  /**
   * Choose the best action from the set of valid actions.
   * The AI only receives visible state information — never reads hidden cards.
   */
  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction;
  chooseActionAsync?(state: GameState, player: PlayerID, validActions: GameAction[]): Promise<GameAction>;

  /** Human-readable difficulty name */
  readonly difficulty: AIDifficulty;
}

const HIDDEN_HAND_CARD_ID = '__hidden_hand__';

function createHiddenHandPlaceholder(index: number): CharacterCard {
  return {
    id: `${HIDDEN_HAND_CARD_ID}-${index}`,
    cardId: HIDDEN_HAND_CARD_ID,
    set: 'UNK',
    number: 0,
    name_fr: 'Hidden',
    title_fr: '',
    rarity: 'C',
    card_type: 'character',
    has_visual: false,
    chakra: 0,
    power: 0,
    keywords: [],
    group: '',
    effects: [],
  };
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
      case 'impossible':
        return new ImpossibleAI();
      default:
        return new ImpossibleAI();
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

  async getActionAsync(state: GameState): Promise<GameAction | null> {
    const validActions = GameEngine.getValidActions(state, this.player);
    if (validActions.length === 0) return null;
    if (validActions.length === 1) return validActions[0];

    const sanitized = AIPlayer.sanitizeStateForAI(state, this.player);
    if (this.strategy.chooseActionAsync) {
      return this.strategy.chooseActionAsync(sanitized, this.player, validActions);
    }

    return this.strategy.chooseAction(sanitized, this.player, validActions);
  }

  /**
   * Create a sanitized copy of GameState that hides opponent's private information.
   * Keeps the GameState shape so strategies work unchanged, but:
   * - Opponent's hand is replaced with hidden placeholders (AI knows count, not cards)
   * - Opponent's hidden characters have their card data blanked
   */
  static sanitizeStateForAI(state: GameState, aiPlayer: PlayerID): GameState {
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';

    // Hide opponent's hand but preserve count for the neural features.
    const opponentState = {
      ...state[opponent],
      hand: state[opponent].hand.map((_, index) => createHiddenHandPlaceholder(index)),
    };

    // Hide opponent's hidden character card details on missions
    const missions = state.activeMissions.map((mission) => {
      const opponentCharsKey = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
      const sanitizedChars = mission[opponentCharsKey].map((char: CharacterInPlay) => {
        if (char.isHidden) {
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

  async executeTurnAsync(state: GameState): Promise<GameState> {
    const action = await this.getActionAsync(state);
    if (!action) return state;

    return GameEngine.applyAction(state, this.player, action);
  }

  get difficulty(): AIDifficulty {
    return this.strategy.difficulty;
  }
}
