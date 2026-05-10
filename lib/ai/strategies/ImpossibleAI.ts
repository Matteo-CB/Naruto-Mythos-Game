import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';
import { decideMulliganStrong } from './mulliganPolicy';

export const IMPOSSIBLE_CHAKRA_BONUS = 5;

export class ImpossibleAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'impossible';

  private mcts = new NeuralISMCTS({
    simulations: 600,
    maxDepth: 5,
    explorationC: 1.41,
    evaluator: null,
    maxBranching: 12,
    useBatchedEval: false,
  });

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) return { type: 'PASS' };
    if (validActions.length === 1) return validActions[0];

    if (state.phase === 'mulligan') {
      return decideMulliganStrong(state, player, validActions);
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }
}
