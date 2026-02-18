import type { GameState, PlayerID, ActiveMission } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';

/**
 * Evaluates mission control and strategic mission value for AI decisions.
 */
export class MissionEvaluator {
  /**
   * Evaluate how well the player controls the missions.
   * Returns a weighted score based on projected wins/losses.
   */
  static evaluateMissionControl(state: GameState, player: PlayerID): number {
    let score = 0;

    for (const mission of state.activeMissions) {
      const missionScore = MissionEvaluator.evaluateSingleMission(state, mission, player);
      score += missionScore;
    }

    return score;
  }

  /**
   * Evaluate a single mission from the player's perspective.
   * Considers power advantage, mission point value, and winning probability.
   */
  static evaluateSingleMission(
    state: GameState,
    mission: ActiveMission,
    player: PlayerID,
  ): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

    // Calculate total power for each player
    const myPower = myChars.reduce(
      (sum, c) => sum + calculateCharacterPower(state, c, player),
      0,
    );
    const oppPower = oppChars.reduce(
      (sum, c) => sum + calculateCharacterPower(state, c, opponent),
      0,
    );

    const missionValue = mission.basePoints + mission.rankBonus;
    const powerDiff = myPower - oppPower;

    // If we're already winning this mission (or would win)
    if (powerDiff > 0) {
      return missionValue * 1.5;
    }

    // Tie - edge holder wins
    if (powerDiff === 0 && myPower > 0) {
      if (state.edgeHolder === player) {
        return missionValue * 1.2;
      }
      return -missionValue * 0.3;
    }

    // We're losing
    if (powerDiff < 0) {
      // How badly we're losing matters
      const deficit = Math.abs(powerDiff);
      if (deficit <= 2) {
        // Close enough to contest
        return -missionValue * 0.3;
      }
      // Heavily losing - this mission is likely lost
      return -missionValue * 0.8;
    }

    // Both at 0 power - no one wins
    return 0;
  }

  /**
   * Get the most valuable uncontested mission (for greedy play).
   */
  static getMostValuableMission(state: GameState, player: PlayerID): number {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      const value = mission.basePoints + mission.rankBonus;
      const score = MissionEvaluator.evaluateSingleMission(state, mission, player);

      // Prefer high-value missions where we're not already heavily losing
      const adjusted = value + score;
      if (adjusted > bestValue) {
        bestValue = adjusted;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Identify missions that can still be won (contestable).
   */
  static getContestableMissions(state: GameState, player: PlayerID): number[] {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const contestable: number[] = [];

    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent),
        0,
      );

      // A mission is contestable if opponent's power lead is not insurmountable
      // Consider that we could potentially play high-power cards
      if (oppPower <= 8) {
        contestable.push(i);
      }
    }

    return contestable;
  }

  /**
   * Calculate point spread: difference in scored points + projected wins.
   */
  static calculatePointSpread(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let myProjected = state[player].missionPoints;
    let oppProjected = state[opponent].missionPoints;

    for (const mission of state.activeMissions) {
      if (mission.wonBy) continue; // Already scored

      const score = MissionEvaluator.evaluateSingleMission(state, mission, player);
      const missionValue = mission.basePoints + mission.rankBonus;

      if (score > 0) {
        myProjected += missionValue;
      } else if (score < 0) {
        oppProjected += missionValue;
      }
    }

    return myProjected - oppProjected;
  }
}
