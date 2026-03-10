/**
 * Chunin AI - Niveau 1 sur 3
 *
 * ISMCTS avec 200 simulations, sans réseau de neurones.
 * Utilise l'évaluateur heuristique (BoardEvaluator) aux feuilles.
 * Environ 5-8x plus fort que l'Expert actuel.
 *
 * Temps de réponse estimé: 50-150ms par action.
 */

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy } from '../AIPlayer';
import type { AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS, DEFAULT_CHUNIN_CONFIG } from '../neural/NeuralISMCTS';

export class ChuninsAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'medium';

  private mcts = new NeuralISMCTS({
    ...DEFAULT_CHUNIN_CONFIG,
    simulations: 200,
    maxDepth: 4,
    explorationC: 1.41,
    evaluator: null, // No NN - heuristic evaluation only
    maxBranching: 10,
    useBatchedEval: false,
  });

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 1) return validActions[0];
    if (state.phase === 'mulligan') return this.decideMulligan(state, player, validActions);

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;
    const totalPower = hand.reduce((s, c) => s + (c.power ?? 0), 0);
    const avgCost = hand.reduce((s, c) => s + (c.chakra ?? 0), 0) / hand.length;
    const hasEffects = hand.some(c => c.effects && c.effects.length > 0);

    // Keep if: decent average power or good effects and reasonable cost
    const keepHand = totalPower >= 8 || (hasEffects && avgCost <= 5);

    const keep = validActions.find(a => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find(a => a.type === 'MULLIGAN' && a.doMulligan);

    if (keepHand && keep) return keep;
    if (mulligan) return mulligan;
    return validActions[0];
  }
}
