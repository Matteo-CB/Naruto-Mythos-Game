/**
 * Hard AI — strong level.
 *
 * ISMCTS 600 simulations, with neural network guidance when available.
 */

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';
import { NeuralEvaluator } from '../neural/NeuralEvaluator';

export class HardAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'hard';

  private mcts: NeuralISMCTS;
  private evaluator: NeuralEvaluator;

  constructor() {
    this.evaluator = NeuralEvaluator.getInstance();
    this.mcts = new NeuralISMCTS({
      simulations: 600,
      maxDepth: 6,
      explorationC: 1.41,
      evaluator: this.evaluator,
      maxBranching: 12,
      useBatchedEval: true,
    });
  }

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 1) return validActions[0];

    if (state.phase === 'mulligan') {
      return this.decideMulligan(state, player, validActions);
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  async chooseActionAsync(state: GameState, player: PlayerID, validActions: GameAction[]): Promise<GameAction> {
    if (validActions.length === 1) return validActions[0];

    if (state.phase === 'mulligan') {
      return this.decideMulligan(state, player, validActions);
    }

    await this.evaluator.load();

    if (this.evaluator.isReady()) {
      return this.mcts.chooseActionAsync(state, player, validActions);
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  private decideMulligan(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    const hand = state[player].hand;
    let score = 0;

    const costs = hand.map((c) => c.chakra ?? 0);
    const minCost = Math.min(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / costs.length;

    if (minCost <= 4) score += 3;
    if (avgCost <= 6) score += 2;
    score += hand.reduce((s, c) => s + (c.power ?? 0), 0) * 0.5;

    for (const card of hand) {
      if (card.effects?.some((e) => e.type === 'AMBUSH')) score += 2;
      if (card.effects?.some((e) => e.type === 'SCORE')) score += 1.5;
      if (card.effects?.some((e) => /CHAKRA\s*\+/i.test(e.description))) score += 2;
    }

    const groups = hand.map((c) => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const group of groups) {
      groupCounts.set(group!, (groupCounts.get(group!) ?? 0) + 1);
    }

    for (const count of groupCounts.values()) {
      if (count >= 3) score += 4;
      else if (count >= 2) score += 2;
    }

    const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);

    if (score >= 11 && keep) return keep;
    return mulligan ?? validActions[0];
  }
}
