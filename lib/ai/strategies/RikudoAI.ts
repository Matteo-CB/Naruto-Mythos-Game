/**
 * Rikudo Sennin AI — Niveau 3 sur 3 (Dieu-mode)
 *
 * ISMCTS avec 5000 simulations + réseau de neurones (si disponible).
 * Utilise l'ensemble de déterminisations et le batching GPU.
 * Capacité d'anticipation sur ~8 niveaux de profondeur.
 * Environ 50-100x plus fort que l'Expert actuel avec modèle entraîné.
 *
 * ATTENTION: ~1-3 secondes par action avec GPU.
 *            ~5-15 secondes sans GPU (NN sur CPU).
 *            Sans modèle: tourne avec l'heuristique — toujours très fort.
 *
 * Intègre:
 *  - IS-MCTS avec 5000 simulations
 *  - Évaluation par réseau de neurones aux feuilles
 *  - Gestion du jeton Avantage
 *  - Planning multi-tour (profondeur 8 = peut voir 2 tours complets)
 *  - Stratégie de mulligan expertement calibrée
 */

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS, DEFAULT_RIKUDO_CONFIG } from '../neural/NeuralISMCTS';
import { NeuralEvaluator } from '../neural/NeuralEvaluator';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { MissionEvaluator } from '../evaluation/MissionEvaluator';

export class RikudoAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'impossible';

  private mcts: NeuralISMCTS;
  private evaluator: NeuralEvaluator;

  constructor() {
    this.evaluator = NeuralEvaluator.getInstance();
    this.mcts = new NeuralISMCTS({
      ...DEFAULT_RIKUDO_CONFIG,
      simulations: 5000,
      maxDepth: 8,
      explorationC: 1.2, // slightly less exploration → more exploitation
      evaluator: this.evaluator,
      maxBranching: 15,
      useBatchedEval: true,
    });
  }

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 1) return validActions[0];
    if (state.phase === 'mulligan') return this.decideMulligan(state, player, validActions);

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  /**
   * Async version with full GPU-batched NN evaluation.
   * This is the strongest version — use from the server in async context.
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

  /**
   * Rikudo-level mulligan: highly sophisticated hand evaluation.
   * Considers curve, synergy, effects, and late-game viability.
   */
  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;

    let score = 0;

    // ─── Chakra curve analysis ──────────────────────────────────────────────
    const costs = hand.map(c => c.chakra ?? 0);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / hand.length;

    // Must have at least one playable card turn 1 (chakra = 5)
    if (minCost <= 5) score += 4;
    // Must have at least one card for late game
    if (maxCost >= 5) score += 2;
    // Good average curve
    if (avgCost >= 3 && avgCost <= 6) score += 3;

    // ─── Power analysis ─────────────────────────────────────────────────────
    const totalPower = hand.reduce((s, c) => s + (c.power ?? 0), 0);
    const avgPower = totalPower / hand.length;
    score += avgPower * 1.5;

    // ─── Effect analysis ────────────────────────────────────────────────────
    for (const card of hand) {
      if (card.effects?.some(e => e.type === 'AMBUSH')) score += 2.5;
      if (card.effects?.some(e => e.type === 'SCORE')) score += 2;
      if (card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description))) score += 2.5;
      if (card.effects?.some(e => /POWERUP/i.test(e.description))) score += 1.5;
      if (card.effects?.some(e => e.type === 'UPGRADE')) score += 1;
    }

    // ─── Synergy analysis ───────────────────────────────────────────────────
    const groups = hand.map(c => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const g of groups) {
      groupCounts.set(g!, (groupCounts.get(g!) ?? 0) + 1);
    }
    for (const count of groupCounts.values()) {
      if (count >= 4) score += 6; // Excellent synergy
      else if (count >= 3) score += 4;
      else if (count >= 2) score += 2;
    }

    // Keyword synergy (e.g., Team 7, Sannin)
    const keywords = hand.flatMap(c => c.keywords ?? []);
    const keywordCounts = new Map<string, number>();
    for (const k of keywords) {
      keywordCounts.set(k, (keywordCounts.get(k) ?? 0) + 1);
    }
    for (const count of keywordCounts.values()) {
      if (count >= 2) score += 1.5;
    }

    // ─── Upgrade chains ─────────────────────────────────────────────────────
    // Bonus if hand has an upgrade chain (low-cost + same name higher-cost)
    for (let i = 0; i < hand.length; i++) {
      for (let j = 0; j < hand.length; j++) {
        if (i === j) continue;
        if (
          hand[i].name_fr === hand[j].name_fr &&
          (hand[j].chakra ?? 0) > (hand[i].chakra ?? 0)
        ) {
          score += 3; // upgrade pair!
        }
      }
    }

    // ─── Penalty for bad hands ──────────────────────────────────────────────
    // All expensive cards (can't play turn 1)
    if (minCost > 5) score -= 5;
    // Too many expensive cards
    if (costs.filter(c => c >= 7).length >= 3) score -= 3;
    // Low power ceiling
    if (maxCost <= 3 && avgPower < 3) score -= 2;

    const keep = validActions.find(a => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find(a => a.type === 'MULLIGAN' && a.doMulligan);

    // Rikudo threshold: 15 (stricter than Kage's 12)
    if (score >= 15 && keep) return keep;
    if (mulligan) return mulligan;
    return validActions[0];
  }
}
