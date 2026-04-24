import type { GameState, PlayerID, CharacterCard, GameAction } from '../../engine/types';


export class ChakraEvaluator {
  
  static evaluateChakraAdvantage(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    const myChakra = state[player].chakra;
    const oppChakra = state[opponent].chakra;

    
    let score = myChakra - oppChakra;

    
    const myIncome = ChakraEvaluator.estimateChakraIncome(state, player);
    const oppIncome = ChakraEvaluator.estimateChakraIncome(state, opponent);
    score += (myIncome - oppIncome) * 2;

    return score;
  }

  
  static estimateChakraIncome(state: GameState, player: PlayerID): number {
    let income = 5; // Base
    let charCount = 0;

    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      charCount += chars.length;

      
      for (const char of chars) {
        if (char.isHidden) continue;
        const effects = char.card.effects ?? [];
        for (const effect of effects) {
          if (effect.type !== 'MAIN') continue;
          const chakraMatch = effect.description.match(/CHAKRA\s*\+(\d+)/i);
          if (chakraMatch) {
            income += parseInt(chakraMatch[1], 10);
          }
        }
      }
    }

    income += charCount; // +1 per character
    return income;
  }

  
  static evaluateCardEfficiency(card: CharacterCard): number {
    if (card.chakra === 0) return card.power * 2; // Free cards are very efficient
    return card.power / card.chakra;
  }

  
  static evaluatePlayability(state: GameState, player: PlayerID): number {
    const playerState = state[player];
    let playableCards = 0;
    let totalPlayableValue = 0;

    for (const card of playerState.hand) {
      if (card.chakra <= playerState.chakra) {
        playableCards++;
        totalPlayableValue += card.power;
      }
    }

    return playableCards * 2 + totalPlayableValue * 0.5;
  }

  
  static shouldConserveChakra(state: GameState, player: PlayerID): boolean {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    
    if (state[player].chakra <= 1) return false;

    
    if (state[opponent].hasPassed) return false;

    
    
    if (state.turn >= 3) return false;

    
    if (state.turn === 2) return false;

    
    
    const hasAffordableCard = state[player].hand.some(
      c => (c.chakra ?? 0) <= state[player].chakra,
    );
    if (hasAffordableCard) return false;

    return true;
  }

  
  static scorePlayAction(action: GameAction, state: GameState, player: PlayerID): number {
    if (action.type === 'PLAY_CHARACTER' || action.type === 'PLAY_HIDDEN') {
      const card = state[player].hand[action.cardIndex];
      if (!card) return 0;

      if (action.type === 'PLAY_HIDDEN') {
        
        return card.power * 0.3 + (card.effects?.length ?? 0) * 0.5;
      }

      
      return ChakraEvaluator.evaluateCardEfficiency(card) * 3 + card.power;
    }

    if (action.type === 'UPGRADE_CHARACTER') {
      const card = state[player].hand[action.cardIndex];
      if (!card) return 0;
      
      return card.power * 1.5 + (card.effects?.length ?? 0);
    }

    return 0;
  }
}
