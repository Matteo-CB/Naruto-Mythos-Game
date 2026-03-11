/**
 * MissionEvaluator - Confidence-based mission scoring for AI decisions.
 *
 * Each mission is scored using a confidence value (-1.5 to +1.5) that
 * represents how likely the AI is to win it, adjusted for context:
 * - Opponent has passed (advantage locked in)
 * - Hidden characters (uncertainty)
 * - Wasted investment (many chars on a losing mission)
 */

import type { GameState, PlayerID, ActiveMission } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';

export class MissionEvaluator {
  /**
   * Evaluate total mission control for the player.
   */
  static evaluateMissionControl(state: GameState, player: PlayerID): number {
    let score = 0;
    for (const mission of state.activeMissions) {
      score += MissionEvaluator.evaluateSingleMission(state, mission, player);
    }
    return score;
  }

  /**
   * Evaluate a single mission using confidence-based scoring.
   *
   * Returns missionValue * confidence, where confidence ranges from -1.5 to +1.5.
   */
  static evaluateSingleMission(
    state: GameState,
    mission: ActiveMission,
    player: PlayerID,
  ): number {
    // Already scored - return the actual outcome
    if (mission.wonBy) {
      if (mission.wonBy === 'draw') return 0;
      const missionValue = mission.basePoints + mission.rankBonus;
      return mission.wonBy === player ? missionValue * 1.5 : -missionValue * 1.0;
    }

    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

    const myPower = myChars.reduce(
      (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
    );
    const oppPower = oppChars.reduce(
      (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
    );

    const missionValue = mission.basePoints + mission.rankBonus;
    const totalPower = myPower + oppPower;

    // Both at 0 - no one wins
    if (myPower === 0 && oppPower === 0) return 0;

    // ─── Calculate base confidence ────────────────────────────────────

    let confidence: number;

    if (myPower === 0 && oppPower > 0) {
      // We can't win (no power)
      confidence = -0.9;
    } else if (oppPower === 0 && myPower > 0) {
      // We win unless opponent plays more
      confidence = 0.95;
    } else {
      const powerDiff = myPower - oppPower;

      if (powerDiff > 0) {
        // Winning - confidence scales with lead relative to total power
        const leadRatio = powerDiff / Math.max(1, totalPower);
        confidence = 0.5 + leadRatio * 2.0;
        confidence = Math.min(confidence, 1.5);
      } else if (powerDiff === 0) {
        // Tied - edge holder wins
        confidence = state.edgeHolder === player ? 0.3 : -0.3;
      } else {
        // Losing
        const deficitRatio = Math.abs(powerDiff) / Math.max(1, totalPower);
        confidence = -0.5 - deficitRatio * 2.0;
        confidence = Math.max(confidence, -1.5);
      }
    }

    // ─── Contextual adjustments ───────────────────────────────────────

    if (state.phase === 'action') {
      // Opponent has passed - our advantage/disadvantage is locked in
      if (state[opponent].hasPassed && confidence > 0) {
        confidence *= 1.3; // More certain of winning
      }
      if (state[player].hasPassed && confidence < 0) {
        confidence *= 1.3; // More certain of losing (can't recover)
      }

      // Hidden characters create uncertainty
      const oppHidden = oppChars.filter(c => c.isHidden).length;
      const myHidden = myChars.filter(c => c.isHidden).length;

      if (oppHidden > 0 && confidence > 0) {
        // Opponent might reveal something strong
        confidence *= Math.max(0.6, 1 - oppHidden * 0.12);
      }
      if (myHidden > 0 && confidence < 0) {
        // We might reveal something to recover
        confidence *= Math.max(0.6, 1 - myHidden * 0.12);
      }
    }

    // Investment penalty: many of our characters on a losing mission = wasted resources
    if (confidence < -0.3 && myChars.length >= 2) {
      confidence -= myChars.length * 0.08;
    }

    return missionValue * confidence;
  }

  /**
   * Get the most valuable contestable mission for strategic targeting.
   */
  static getMostValuableMission(state: GameState, player: PlayerID): number {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      if (mission.wonBy) continue;

      const value = mission.basePoints + mission.rankBonus;
      const missionScore = MissionEvaluator.evaluateSingleMission(state, mission, player);

      // Prefer high-value missions where we're competitive
      const adjusted = value + missionScore;
      if (adjusted > bestValue) {
        bestValue = adjusted;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  /**
   * Identify missions that can still be won or contested.
   */
  static getContestableMissions(state: GameState, player: PlayerID): number[] {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const contestable: number[] = [];

    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      if (mission.wonBy) continue;

      const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );

      // A mission is contestable if we could reasonably catch up
      // Consider our hand's strongest playable card
      const maxPlayablePower = state[player].hand
        .filter(c => (c.chakra ?? 0) <= state[player].chakra)
        .reduce((max, c) => Math.max(max, c.power ?? 0), 0);

      if (oppPower <= maxPlayablePower + 3) {
        contestable.push(i);
      }
    }

    return contestable;
  }

  /**
   * Calculate point spread: scored points + projected wins.
   */
  static calculatePointSpread(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let myProjected = state[player].missionPoints;
    let oppProjected = state[opponent].missionPoints;

    for (const mission of state.activeMissions) {
      if (mission.wonBy) continue;

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
