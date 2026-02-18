import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';

/**
 * Easy AI: Picks random legal actions.
 * No strategic evaluation. Provides a casual opponent.
 */
export class EasyAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'easy';

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    // For mulligan, slightly favor keeping (60% keep, 40% mulligan)
    if (state.phase === 'mulligan') {
      const keepAction = validActions.find(
        (a) => a.type === 'MULLIGAN' && !a.doMulligan,
      );
      const mulliganAction = validActions.find(
        (a) => a.type === 'MULLIGAN' && a.doMulligan,
      );

      if (keepAction && mulliganAction) {
        return Math.random() < 0.6 ? keepAction : mulliganAction;
      }
    }

    // Add a slight bias toward playing cards over passing (70/30)
    const playActions = validActions.filter((a) => a.type !== 'PASS');
    const passAction = validActions.find((a) => a.type === 'PASS');

    if (playActions.length > 0 && passAction) {
      if (Math.random() < 0.7) {
        return playActions[Math.floor(Math.random() * playActions.length)];
      }
      return passAction;
    }

    // Pure random
    return validActions[Math.floor(Math.random() * validActions.length)];
  }
}
