import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { NeuralISMCTS } from '../neural/NeuralISMCTS';

export class MediumAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'medium';

  private mcts = new NeuralISMCTS({
    simulations: 150,
    maxDepth: 3,
    explorationC: 1.6,
    evaluator: null,
    maxBranching: 8,
    useBatchedEval: false,
  });

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) return { type: 'PASS' };
    if (validActions.length === 1) return validActions[0];

    if (state.phase === 'mulligan') {
      const hand = state[player].hand;
      const playable = hand.filter((card) => (card.chakra ?? 0) <= 5).length;
      const synergy = countGroupSynergy(hand.map((c) => c.group ?? ''));
      const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
      const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);

      if (playable >= 2 && synergy >= 2 && keep) return keep;
      return mulligan ?? validActions[0];
    }

    return this.mcts.chooseActionSync(state, player, validActions);
  }
}

function countGroupSynergy(groups: string[]): number {
  const counts = new Map<string, number>();
  for (const g of groups) {
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let best = 0;
  for (const c of counts.values()) if (c > best) best = c;
  return best;
}
