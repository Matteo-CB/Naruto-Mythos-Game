/**
 * Impossible AI — Niveau Impossible
 *
 * ISMCTS 3000 simulations + réseau de neurones (GPU NVIDIA si disponible).
 * Profondeur 8 → peut voir ~2 tours complets d'avance.
 * Exploration réduite (c=1.2) pour maximiser l'exploitation des bonnes lignes.
 * Le niveau le plus fort possible — quasi-imbattable avec le modèle entraîné.
 *
 * Sans modèle: ~800ms par action (heuristique)
 * Avec modèle GPU: ~1-2s par action (NN evaluation)
 *
 * Pour activer le réseau de neurones:
 *   1. npx ts-node scripts/selfplay.ts --games 5000
 *   2. cd ai_training && python train.py --data ../scripts/training_data.json --gpu
 *   3. python export_onnx.py
 *   4. npm install onnxruntime-node
 */

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';
import { NeuralEvaluator } from '../neural/NeuralEvaluator';

export class ImpossibleAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'impossible';
  static readonly DEFAULT_SIMULATIONS = 2200;

  private mcts: NeuralISMCTS;
  private evaluator: NeuralEvaluator;
  private modelPath?: string;

  constructor(modelPath?: string, simulations?: number) {
    this.modelPath = modelPath;
    this.evaluator = NeuralEvaluator.getInstance(modelPath);
    this.mcts = new NeuralISMCTS({
      simulations: simulations ?? ImpossibleAI.DEFAULT_SIMULATIONS,
      maxDepth: 8,
      explorationC: 1.2, // moins d'exploration, plus d'exploitation
      evaluator: this.evaluator,
      maxBranching: 15,
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

    await this.evaluator.load(this.modelPath);

    if (this.evaluator.isReady()) {
      return this.mcts.chooseActionAsync(state, player, validActions);
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }

  private decideMulligan(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    const hand = state[player].hand;
    let score = 0;

    const costs = hand.map(c => c.chakra ?? 0);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / hand.length;
    const avgPower = hand.reduce((s, c) => s + (c.power ?? 0), 0) / hand.length;

    // Courbe de mana idéale
    if (minCost <= 5) score += 4;
    if (maxCost >= 5) score += 2;
    if (avgCost >= 3 && avgCost <= 6) score += 3;
    score += avgPower * 1.5;

    // Effets de haute valeur
    for (const card of hand) {
      if (card.effects?.some(e => e.type === 'AMBUSH')) score += 2.5;
      if (card.effects?.some(e => e.type === 'SCORE')) score += 2;
      if (card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description))) score += 2.5;
      if (card.effects?.some(e => /POWERUP/i.test(e.description))) score += 1.5;
    }

    // Synergies de groupe
    const groups = hand.map(c => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const g of groups) groupCounts.set(g!, (groupCounts.get(g!) ?? 0) + 1);
    for (const count of groupCounts.values()) {
      if (count >= 4) score += 6;
      else if (count >= 3) score += 4;
      else if (count >= 2) score += 2;
    }

    // Chaînes d'évolution dans la main
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (hand[i].name_fr === hand[j].name_fr) {
          score += 3;
        }
      }
    }

    // Pénalités
    if (minCost > 5) score -= 6; // aucune carte jouable tour 1
    if (costs.filter(c => c >= 7).length >= 3) score -= 4;

    const keep = validActions.find(a => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find(a => a.type === 'MULLIGAN' && a.doMulligan);

    // Seuil élevé — Impossible garde seulement les très bonnes mains
    if (score >= 16 && keep) return keep;
    return mulligan ?? validActions[0];
  }
}
