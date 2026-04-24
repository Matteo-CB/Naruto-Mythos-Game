

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

    
    const costs = hand.map(c => c.chakra ?? 0);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / hand.length;

    
    if (minCost <= 5) score += 4;
    
    if (maxCost >= 5) score += 2;
    
    if (avgCost >= 3 && avgCost <= 6) score += 3;

    
    const totalPower = hand.reduce((s, c) => s + (c.power ?? 0), 0);
    const avgPower = totalPower / hand.length;
    score += avgPower * 1.5;

    
    for (const card of hand) {
      if (card.effects?.some(e => e.type === 'AMBUSH')) score += 2.5;
      if (card.effects?.some(e => e.type === 'SCORE')) score += 2;
      if (card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description))) score += 2.5;
      if (card.effects?.some(e => /POWERUP/i.test(e.description))) score += 1.5;
      if (card.effects?.some(e => e.type === 'UPGRADE')) score += 1;
    }

    
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

    
    const keywords = hand.flatMap(c => c.keywords ?? []);
    const keywordCounts = new Map<string, number>();
    for (const k of keywords) {
      keywordCounts.set(k, (keywordCounts.get(k) ?? 0) + 1);
    }
    for (const count of keywordCounts.values()) {
      if (count >= 2) score += 1.5;
    }

    
    
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

    
    
    if (minCost > 5) score -= 5;
    
    if (costs.filter(c => c >= 7).length >= 3) score -= 3;
    
    if (maxCost <= 3 && avgPower < 3) score -= 2;

    const keep = validActions.find(a => a.type === 'MULLIGAN' && !a.doMulligan);
    const mulligan = validActions.find(a => a.type === 'MULLIGAN' && a.doMulligan);

    
    if (score >= 15 && keep) return keep;
    if (mulligan) return mulligan;
    return validActions[0];
  }
}
