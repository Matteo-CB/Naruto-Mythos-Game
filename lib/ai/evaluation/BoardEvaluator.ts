import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '../../engine/types';
import { RANK_BONUS } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';
import { MissionEvaluator } from './MissionEvaluator';
import { ChakraEvaluator } from './ChakraEvaluator';

/**
 * Central board evaluation heuristic for AI decision-making.
 * Returns a score from the perspective of the given player.
 * Positive = favorable, negative = unfavorable.
 */
export class BoardEvaluator {
  /**
   * Evaluate the entire board state from a player's perspective.
   * Combines multiple evaluation components with weights.
   */
  static evaluate(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    let score = 0;

    // 1. Mission points already scored (most important)
    const myPoints = state[player].missionPoints;
    const oppPoints = state[opponent].missionPoints;
    score += (myPoints - oppPoints) * 100;

    // 2. Mission control (projected wins based on current power)
    score += MissionEvaluator.evaluateMissionControl(state, player) * 40;

    // 3. Board presence (characters in play)
    score += BoardEvaluator.evaluateBoardPresence(state, player) * 10;

    // 4. Chakra advantage
    score += ChakraEvaluator.evaluateChakraAdvantage(state, player) * 5;

    // 5. Hand size advantage (more options)
    const handDiff = state[player].hand.length - state[opponent].hand.length;
    score += handDiff * 3;

    // 6. Edge token (tie-breaker advantage)
    if (state.edgeHolder === player) {
      score += 8;
    }

    // 7. Card quality in hand
    score += BoardEvaluator.evaluateHandQuality(state, player) * 2;

    // 8. Hidden character threat value
    score += BoardEvaluator.evaluateHiddenThreats(state, player) * 4;

    return score;
  }

  /**
   * Evaluate board presence: how many characters, their power, strategic positioning.
   */
  static evaluateBoardPresence(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let score = 0;

    for (const mission of state.activeMissions) {
      const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

      // More characters = more board control
      score += myChars.length - oppChars.length;

      // Power advantage on each mission
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player),
        0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent),
        0,
      );

      // Weight by mission value
      const missionValue = mission.basePoints + mission.rankBonus;
      score += (myPower - oppPower) * missionValue * 0.5;
    }

    return score;
  }

  /**
   * Evaluate the quality of cards in hand.
   * Higher cost/power cards and cards with effects are more valuable.
   */
  static evaluateHandQuality(state: GameState, player: PlayerID): number {
    let score = 0;
    const hand = state[player].hand;

    for (const card of hand) {
      // Base value from power
      score += card.power * 0.5;

      // Bonus for cards with effects
      if (card.effects && card.effects.length > 0) {
        score += 1;
      }

      // Bonus for SCORE effects
      if (card.effects?.some((e) => e.type === 'SCORE')) {
        score += 2;
      }

      // Bonus for POWERUP effects (power tokens are strong board advantage)
      for (const effect of card.effects ?? []) {
        const powerupMatch = effect.description.match(/POWERUP\s+(\d+)/i);
        if (powerupMatch) {
          score += parseInt(powerupMatch[1], 10) * 1.5;
        }
      }

      // Bonus for CHAKRA +X effects (ongoing income)
      for (const effect of card.effects ?? []) {
        const chakraMatch = effect.description.match(/CHAKRA\s*\+(\d+)/i);
        if (chakraMatch) {
          score += parseInt(chakraMatch[1], 10) * 2;
        }
      }

      // Penalty for very expensive cards if low chakra
      if (card.chakra > state[player].chakra + 5) {
        score -= 0.5;
      }
    }

    return score;
  }

  /**
   * Evaluate the threat value of hidden characters.
   * Hidden characters create uncertainty for the opponent.
   */
  static evaluateHiddenThreats(state: GameState, player: PlayerID): number {
    let myHidden = 0;
    let oppHidden = 0;

    for (const mission of state.activeMissions) {
      const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

      myHidden += myChars.filter((c) => c.isHidden).length;
      oppHidden += oppChars.filter((c) => c.isHidden).length;
    }

    // Our hidden chars = positive (threatening), their hidden chars = negative (risk)
    return (myHidden * 2) - (oppHidden * 1.5);
  }

  /**
   * Quick evaluation for terminal or near-terminal states.
   */
  static evaluateTerminal(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myPoints = state[player].missionPoints;
    const oppPoints = state[opponent].missionPoints;

    if (state.phase === 'gameOver') {
      if (myPoints > oppPoints) return 10000;
      if (oppPoints > myPoints) return -10000;
      // Tie goes to edge holder
      return state.edgeHolder === player ? 10000 : -10000;
    }

    return BoardEvaluator.evaluate(state, player);
  }
}
