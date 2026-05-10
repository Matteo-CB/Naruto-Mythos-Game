import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { GameEngine } from '../../engine/GameEngine';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';

const NOISE_RATE = 0.35;

export class EasyAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'easy';

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) return { type: 'PASS' };
    if (validActions.length === 1) return validActions[0];

    if (state.phase === 'mulligan') {
      const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
      const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);
      if (!keep || !mulligan) return validActions[0];
      return Math.random() < 0.6 ? keep : mulligan;
    }

    if (Math.random() < NOISE_RATE) {
      const pool = validActions.filter((a) => a.type !== 'PASS');
      const target = pool.length > 0 ? pool : validActions;
      return target[Math.floor(Math.random() * target.length)];
    }

    let bestAction = validActions[0];
    let bestScore = -Infinity;
    for (const action of validActions) {
      try {
        const next = GameEngine.applyAction(state, player, action);
        const score = BoardEvaluator.evaluate(next, player);
        if (score > bestScore) {
          bestScore = score;
          bestAction = action;
        }
      } catch {
        continue;
      }
    }
    return bestAction;
  }
}
