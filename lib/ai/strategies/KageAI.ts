/**
 * Kage AI — Niveau 2 sur 3
 *
 * ISMCTS avec 1000 simulations + réseau de neurones (si disponible).
 * Utilise l'évaluation par lots (batched) du réseau.
 * Environ 20-30x plus fort que l'Expert actuel.
 *
 * Sans modèle entraîné: tourne avec l'heuristique BoardEvaluator.
 * Avec modèle: activement guidé par le réseau de neurones.
 *
 * Temps de réponse estimé: 200-800ms par action.
 */

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS, DEFAULT_KAGE_CONFIG } from '../neural/NeuralISMCTS';
import { NeuralEvaluator } from '../neural/NeuralEvaluator';

export class KageAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'hard';

  private mcts: NeuralISMCTS;
  private evaluator: NeuralEvaluator;

  constructor() {
    this.evaluator = NeuralEvaluator.getInstance();
    this.mcts = new NeuralISMCTS({
      ...DEFAULT_KAGE_CONFIG,
      simulations: 1000,
      maxDepth: 6,
      explorationC: 1.41,
      evaluator: this.evaluator,
      maxBranching: 12,
      useBatchedEval: false, // sync for compatibility
    });
  }

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 1) return validActions[0];
    if (state.phase === 'mulligan') return this.decideMulligan(state, player, validActions);

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  /**
   * Async version — uses batched NN inference for better quality evaluations.
   * Call this from the server when async is acceptable.
   */
  async chooseActionAsync(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): Promise<GameAction> {
    if (validActions.length === 1) return validActions[0];
    if (state.phase === 'mulligan') return this.decideMulligan(state, player, validActions);

    return this.mcts.chooseActionAsync(state, player, validActions);
  }

  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;

    let score = 0;

    // Chakra curve
    const costs = hand.map(c => c.chakra ?? 0);
    const minCost = Math.min(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / costs.length;

    if (minCost <= 2) score += 3; // Can play turn 1
    if (avgCost <= 5) score += 2; // Good curve

    // Power
    const totalPower = hand.reduce((s, c) => s + (c.power ?? 0), 0);
    score += totalPower * 0.4;

    // Effects
    for (const card of hand) {
      if (card.effects?.some(e => e.type === 'AMBUSH')) score += 2;
      if (card.effects?.some(e => e.type === 'SCORE')) score += 1.5;
      if (card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description))) score += 2;
      if (card.effects?.some(e => /POWERUP/i.test(e.description))) score += 1;
    }

    // Synergy: multiple cards of same group
    const groups = hand.map(c => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const g of groups) {
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    }
    for (const count of groupCounts.values()) {
      if (count >= 3) score += 3;
      else if (count >= 2) score += 1;
    }

    const keep = validActions.find(a => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find(a => a.type === 'MULLIGAN' && a.doMulligan);

    if (score >= 12 && keep) return keep;
    if (mulligan) return mulligan;
    return validActions[0];
  }
}
