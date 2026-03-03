import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';

/**
 * Easy AI — beginner-friendly.
 * Small ISMCTS budget + occasional deliberate mistakes.
 */
export class EasyAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'easy';

  private mcts = new NeuralISMCTS({
    simulations: 50,
    maxDepth: 3,
    explorationC: 1.9,
    evaluator: null,
    maxBranching: 8,
    useBatchedEval: false,
  });

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    if (validActions.length === 1) {
      return validActions[0];
    }

    if (state.phase === 'mulligan') {
      const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
      const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);
      if (!keep || !mulligan) return validActions[0];
      return Math.random() < 0.65 ? keep : mulligan;
    }

    // Deliberate imperfection so Easy stays beatable.
    if (Math.random() < 0.2) {
      return validActions[Math.floor(Math.random() * validActions.length)];
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }
}
