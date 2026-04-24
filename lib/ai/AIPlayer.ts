import type { GameState, GameAction, PlayerID, CharacterInPlay, CharacterCard } from '../engine/types';
import { GameEngine } from '../engine/GameEngine';
import { EasyAI } from './strategies/EasyAI';
import { MediumAI } from './strategies/MediumAI';
import { HardAI } from './strategies/HardAI';
import { ImpossibleAI } from './strategies/ImpossibleAI';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';


export interface AIStrategy {
  
  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction;
  chooseActionAsync?(state: GameState, player: PlayerID, validActions: GameAction[]): Promise<GameAction>;

  
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


export class AIPlayer {
  private strategy: AIStrategy;
  readonly player: PlayerID;

  constructor(difficulty: AIDifficulty, player: PlayerID) {
    this.player = player;
    this.strategy = AIPlayer.createStrategy(difficulty);
  }

  
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

  
  static sanitizeStateForAI(state: GameState, aiPlayer: PlayerID): GameState {
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';

    
    const opponentState = {
      ...state[opponent],
      hand: state[opponent].hand.map((_, index) => createHiddenHandPlaceholder(index)),
    };

    
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
