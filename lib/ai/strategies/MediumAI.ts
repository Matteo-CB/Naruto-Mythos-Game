import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';

/**
 * Medium AI - solid heuristic ISMCTS without the neural net.
 */
export class MediumAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'medium';

  private mcts = new NeuralISMCTS({
    simulations: 250,
    maxDepth: 5,
    explorationC: 1.41,
    evaluator: null,
    maxBranching: 10,
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
      const hand = state[player].hand;
      const playable = hand.filter((card) => (card.chakra ?? 0) <= 5).length;
      const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
      const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);

      if (playable >= 2 && keep) return keep;
      return mulligan ?? validActions[0];
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }
}
