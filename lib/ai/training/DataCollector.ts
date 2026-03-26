/**
 * TrainingDataCollector: collects feature snapshots during a live game
 * for later use in training the neural network value function.
 *
 * Usage:
 *   1. Create one collector per room (covers both players).
 *   2. Call `collectSnapshot(state)` after each broadcastState.
 *   3. When the game ends, call `finalize(winnerId)` to label all snapshots with outcomes.
 *   4. Call `getSnapshots()` to retrieve the batch for DB insertion.
 */

import type { GameState, PlayerID } from '../../engine/types';
import { FeatureExtractor } from '../neural/FeatureExtractor';

export interface TrainingSnapshot {
  features: number[]; // 200-dim
  outcome: number;    // 1.0 = win, 0.0 = loss, 0.5 = draw
  turn: number;
  gameId: string;
}

interface RawSnapshot {
  features: number[];
  turn: number;
  player: PlayerID;
}

export class TrainingDataCollector {
  private snapshots: RawSnapshot[] = [];
  private gameId: string;
  private finalized = false;
  private finalizedSnapshots: TrainingSnapshot[] = [];

  constructor(gameId: string) {
    this.gameId = gameId;
  }

  /**
   * Collect feature snapshots for both players from the current game state.
   * Should be called after each state broadcast during the action phase.
   * Lightweight: only runs FeatureExtractor.extract (pure computation, no I/O).
   */
  collectSnapshot(state: GameState): void {
    if (this.finalized) return;

    // Only collect during meaningful game phases (action phase has the most decision-relevant states)
    if (state.phase !== 'action' && state.phase !== 'mission') return;

    // Skip forfeited games
    if (state.forfeitedBy) return;

    try {
      const p1Features = FeatureExtractor.extract(state, 'player1');
      const p2Features = FeatureExtractor.extract(state, 'player2');

      this.snapshots.push({
        features: Array.from(p1Features),
        turn: state.turn,
        player: 'player1',
      });

      this.snapshots.push({
        features: Array.from(p2Features),
        turn: state.turn,
        player: 'player2',
      });
    } catch (err) {
      // Silently skip on extraction errors to avoid affecting gameplay
      console.warn('[TrainingDataCollector] Feature extraction error:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Finalize all collected snapshots with the game outcome.
   * Must be called exactly once when the game ends normally (not forfeit).
   *
   * @param winner - The winning player ID, or null for a draw (though draws are rare in this game)
   */
  finalize(winner: PlayerID | null): void {
    if (this.finalized) return;
    this.finalized = true;

    for (const snap of this.snapshots) {
      let outcome: number;
      if (winner === null) {
        outcome = 0.5; // draw
      } else if (snap.player === winner) {
        outcome = 1.0;
      } else {
        outcome = 0.0;
      }

      this.finalizedSnapshots.push({
        features: snap.features,
        outcome,
        turn: snap.turn,
        gameId: this.gameId,
      });
    }

    // Free raw snapshots memory
    this.snapshots = [];
  }

  /**
   * Get all finalized snapshots ready for DB insertion.
   * Returns empty array if not yet finalized.
   */
  getSnapshots(): TrainingSnapshot[] {
    return this.finalizedSnapshots;
  }

  /**
   * Number of raw (unfinalized) snapshots collected so far.
   */
  get rawCount(): number {
    return this.snapshots.length;
  }

  /**
   * Number of finalized snapshots ready for export.
   */
  get count(): number {
    return this.finalizedSnapshots.length;
  }

  /**
   * Clear all data. Call after saving to DB to free memory.
   */
  clear(): void {
    this.snapshots = [];
    this.finalizedSnapshots = [];
  }
}
