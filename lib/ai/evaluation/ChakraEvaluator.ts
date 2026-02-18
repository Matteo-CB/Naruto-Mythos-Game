import type { GameState, PlayerID, CharacterCard, GameAction } from '../../engine/types';

/**
 * Evaluates chakra efficiency for AI decision-making.
 */
export class ChakraEvaluator {
  /**
   * Evaluate the chakra advantage for a player.
   * Takes into account current chakra, projected income, and spending potential.
   */
  static evaluateChakraAdvantage(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    const myChakra = state[player].chakra;
    const oppChakra = state[opponent].chakra;

    // Direct chakra advantage
    let score = myChakra - oppChakra;

    // Projected chakra income (from characters in play with CHAKRA +X)
    const myIncome = ChakraEvaluator.estimateChakraIncome(state, player);
    const oppIncome = ChakraEvaluator.estimateChakraIncome(state, opponent);
    score += (myIncome - oppIncome) * 2;

    return score;
  }

  /**
   * Estimate chakra income for next turn.
   * 5 base + 1 per character in play + CHAKRA +X bonuses.
   */
  static estimateChakraIncome(state: GameState, player: PlayerID): number {
    let income = 5; // Base
    let charCount = 0;

    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      charCount += chars.length;

      // Check for CHAKRA +X effects on visible characters
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

  /**
   * Evaluate the cost efficiency of playing a card.
   * Higher power-per-chakra = more efficient.
   */
  static evaluateCardEfficiency(card: CharacterCard): number {
    if (card.chakra === 0) return card.power * 2; // Free cards are very efficient
    return card.power / card.chakra;
  }

  /**
   * Determine if the player can afford to play their best cards.
   * Returns a measure of "playability" of the hand.
   */
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

  /**
   * Evaluate whether passing now is advisable from a chakra perspective.
   * If opponent has much more chakra, they can outplay us after we pass.
   */
  static shouldConserveChakra(state: GameState, player: PlayerID): boolean {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    // If we have very little chakra left, passing is fine
    if (state[player].chakra <= 1) return false;

    // If opponent already passed, we should spend our chakra
    if (state[opponent].hasPassed) return false;

    // If it's early in the game, conserve
    if (state.turn <= 2 && state[player].chakra > 3) {
      return true;
    }

    return false;
  }

  /**
   * Score a play action based on chakra efficiency.
   */
  static scorePlayAction(action: GameAction, state: GameState, player: PlayerID): number {
    if (action.type === 'PLAY_CHARACTER' || action.type === 'PLAY_HIDDEN') {
      const card = state[player].hand[action.cardIndex];
      if (!card) return 0;

      if (action.type === 'PLAY_HIDDEN') {
        // Hidden play costs 1 chakra - value based on potential
        return card.power * 0.3 + (card.effects?.length ?? 0) * 0.5;
      }

      // Face-up play
      return ChakraEvaluator.evaluateCardEfficiency(card) * 3 + card.power;
    }

    if (action.type === 'UPGRADE_CHARACTER') {
      const card = state[player].hand[action.cardIndex];
      if (!card) return 0;
      // Upgrades get power difference bonus
      return card.power * 1.5 + (card.effects?.length ?? 0);
    }

    return 0;
  }
}
