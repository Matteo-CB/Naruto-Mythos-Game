import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { GameEngine } from '../../engine/GameEngine';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { deepClone } from '../../engine/utils/deepClone';

/**
 * Hard AI: Minimax with alpha-beta pruning.
 * Looks ahead 3 plies to evaluate the best move.
 * Considers opponent's likely responses and manages resources strategically.
 */
export class HardAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'hard';
  private readonly maxDepth = 3;
  private readonly maxBranching = 8; // Limit branching factor for performance

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    // Mulligan: evaluate hand quality
    if (state.phase === 'mulligan') {
      return this.decideMulligan(state, player, validActions);
    }

    // Use minimax for action phase
    let bestAction = validActions[0];
    let bestScore = -Infinity;

    // Pre-sort actions by quick heuristic to improve pruning
    const sortedActions = this.presortActions(validActions, state, player);

    for (const action of sortedActions) {
      try {
        const newState = GameEngine.applyAction(state, player, action);
        const score = this.minimax(
          newState,
          this.maxDepth - 1,
          -Infinity,
          Infinity,
          false,
          player,
        );

        if (score > bestScore) {
          bestScore = score;
          bestAction = action;
        }
      } catch {
        // Skip invalid actions that cause errors
        continue;
      }
    }

    return bestAction;
  }

  /**
   * Minimax with alpha-beta pruning.
   */
  private minimax(
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    aiPlayer: PlayerID,
  ): number {
    // Terminal conditions
    if (depth === 0 || state.phase === 'gameOver') {
      return BoardEvaluator.evaluateTerminal(state, aiPlayer);
    }

    const currentPlayer = isMaximizing ? aiPlayer : (aiPlayer === 'player1' ? 'player2' : 'player1');
    const actions = GameEngine.getValidActions(state, currentPlayer);

    if (actions.length === 0) {
      return BoardEvaluator.evaluate(state, aiPlayer);
    }

    // Limit branching factor
    const limitedActions = this.limitActions(actions, state, currentPlayer);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const action of limitedActions) {
        try {
          const newState = GameEngine.applyAction(state, currentPlayer, action);
          const evalScore = this.minimax(newState, depth - 1, alpha, beta, false, aiPlayer);
          maxEval = Math.max(maxEval, evalScore);
          alpha = Math.max(alpha, evalScore);
          if (beta <= alpha) break; // Beta cutoff
        } catch {
          continue;
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const action of limitedActions) {
        try {
          const newState = GameEngine.applyAction(state, currentPlayer, action);
          const evalScore = this.minimax(newState, depth - 1, alpha, beta, true, aiPlayer);
          minEval = Math.min(minEval, evalScore);
          beta = Math.min(beta, evalScore);
          if (beta <= alpha) break; // Alpha cutoff
        } catch {
          continue;
        }
      }
      return minEval;
    }
  }

  /**
   * Pre-sort actions by heuristic for better alpha-beta pruning.
   */
  private presortActions(actions: GameAction[], state: GameState, player: PlayerID): GameAction[] {
    return [...actions].sort((a, b) => {
      return this.quickScore(b, state, player) - this.quickScore(a, state, player);
    });
  }

  /**
   * Quick heuristic scoring for action ordering.
   */
  private quickScore(action: GameAction, state: GameState, player: PlayerID): number {
    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        if (!card) return 0;
        return card.power * 3 + (card.effects?.length ?? 0) * 2;
      }
      case 'UPGRADE_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        if (!card) return 0;
        return card.power * 4 + 5;
      }
      case 'REVEAL_CHARACTER':
        return 15; // Reveals are often strong
      case 'PLAY_HIDDEN':
        return 5; // Low cost, moderate value
      case 'PASS':
        return -1;
      default:
        return 0;
    }
  }

  /**
   * Limit the number of actions explored for performance.
   */
  private limitActions(actions: GameAction[], state: GameState, player: PlayerID): GameAction[] {
    if (actions.length <= this.maxBranching) return actions;

    // Sort by quick heuristic and take top N
    const sorted = this.presortActions(actions, state, player);
    return sorted.slice(0, this.maxBranching);
  }

  /**
   * Smart mulligan: evaluate hand based on curve and playability.
   */
  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;

    // Score the hand
    let handScore = 0;

    // Count of playable cards in early turns (cost <= 3)
    const earlyPlays = hand.filter((c) => c.chakra <= 3).length;
    handScore += earlyPlays * 3;

    // Mid-game cards (cost 4-6)
    const midPlays = hand.filter((c) => c.chakra >= 4 && c.chakra <= 6).length;
    handScore += midPlays * 2;

    // Cards with effects
    const effectCards = hand.filter((c) => c.effects && c.effects.length > 0).length;
    handScore += effectCards * 1;

    // Total power
    const totalPower = hand.reduce((sum, c) => sum + c.power, 0);
    handScore += totalPower * 0.5;

    // Penalty for all expensive cards (can't play early)
    if (earlyPlays === 0) {
      handScore -= 5;
    }

    // Keep if score is decent (threshold: 8)
    const keepAction = validActions.find(
      (a) => a.type === 'MULLIGAN' && !a.doMulligan,
    );
    const mulliganAction = validActions.find(
      (a) => a.type === 'MULLIGAN' && a.doMulligan,
    );

    if (handScore >= 8 && keepAction) return keepAction;
    if (mulliganAction) return mulliganAction;
    return validActions[0];
  }
}
