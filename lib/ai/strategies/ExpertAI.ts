import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { GameEngine } from '../../engine/GameEngine';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { MissionEvaluator } from '../evaluation/MissionEvaluator';
import { ChakraEvaluator } from '../evaluation/ChakraEvaluator';
import { deepClone } from '../../engine/utils/deepClone';
import { shuffle } from '../../engine/utils/shuffle';

/**
 * Expert AI: Expectimax with Monte Carlo sampling.
 * Handles hidden information through sampling possible opponent hands.
 * Plans across multiple turns and evaluates SCORE effect timing.
 */
export class ExpertAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'expert';
  private readonly simulations = 30;
  private readonly maxDepth = 3;
  private readonly maxBranching = 8;

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    // Mulligan: sophisticated hand evaluation
    if (state.phase === 'mulligan') {
      return this.decideMulligan(state, player, validActions);
    }

    // Use Monte Carlo expectimax
    const scores = new Map<number, number>();

    for (let i = 0; i < validActions.length; i++) {
      scores.set(i, 0);
    }

    // Run simulations with different possible opponent hands
    const numSims = Math.min(this.simulations, Math.max(10, 50 - validActions.length * 2));

    for (let sim = 0; sim < numSims; sim++) {
      // Create a sampled state with random opponent hand assignment
      const sampledState = this.sampleHiddenInfo(state, player);

      for (let i = 0; i < validActions.length; i++) {
        const action = validActions[i];
        try {
          const newState = GameEngine.applyAction(sampledState, player, action);
          const score = this.expectimax(
            newState,
            this.maxDepth - 1,
            true, // isChance (opponent picks next)
            player,
          );
          scores.set(i, (scores.get(i) ?? 0) + score);
        } catch {
          scores.set(i, (scores.get(i) ?? 0) - 1000);
        }
      }
    }

    // Find the action with the highest average score
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < validActions.length; i++) {
      const avgScore = (scores.get(i) ?? 0) / numSims;

      // Add strategic bonuses
      const strategicBonus = this.getStrategicBonus(validActions[i], state, player);
      const totalScore = avgScore + strategicBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestIndex = i;
      }
    }

    return validActions[bestIndex];
  }

  /**
   * Expectimax search. Chance nodes model opponent uncertainty.
   */
  private expectimax(
    state: GameState,
    depth: number,
    isChance: boolean,
    aiPlayer: PlayerID,
  ): number {
    if (depth === 0 || state.phase === 'gameOver') {
      return BoardEvaluator.evaluateTerminal(state, aiPlayer);
    }

    const currentPlayer = isChance
      ? (aiPlayer === 'player1' ? 'player2' : 'player1')
      : aiPlayer;

    const actions = GameEngine.getValidActions(state, currentPlayer);
    if (actions.length === 0) {
      return BoardEvaluator.evaluate(state, aiPlayer);
    }

    const limitedActions = this.limitActions(actions, state, currentPlayer, aiPlayer);

    if (isChance) {
      // Chance node: average over opponent's possible actions (weighted by heuristic)
      let totalScore = 0;
      const weights = limitedActions.map((a) =>
        Math.max(1, this.quickScore(a, state, currentPlayer)),
      );
      const totalWeight = weights.reduce((s, w) => s + w, 0);

      for (let i = 0; i < limitedActions.length; i++) {
        try {
          const newState = GameEngine.applyAction(state, currentPlayer, limitedActions[i]);
          const score = this.expectimax(newState, depth - 1, false, aiPlayer);
          totalScore += score * (weights[i] / totalWeight);
        } catch {
          continue;
        }
      }

      return totalScore;
    } else {
      // Max node: pick the best action for the AI
      let bestScore = -Infinity;
      for (const action of limitedActions) {
        try {
          const newState = GameEngine.applyAction(state, currentPlayer, action);
          const score = this.expectimax(newState, depth - 1, true, aiPlayer);
          bestScore = Math.max(bestScore, score);
        } catch {
          continue;
        }
      }
      return bestScore === -Infinity ? BoardEvaluator.evaluate(state, aiPlayer) : bestScore;
    }
  }

  /**
   * Sample hidden information: assign random cards to opponent's hand.
   * After sanitization, opponent's hand is empty ([]). We reconstruct a plausible
   * hand by building a pool of "unknown cards" (cards not visible on the board)
   * and sampling from it.
   */
  private sampleHiddenInfo(state: GameState, aiPlayer: PlayerID): GameState {
    const sampled = deepClone(state);
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';

    // After sanitization, opponent hand is empty but we know handSize from the board
    // Build a pool of unknown cards: all cards not currently visible on the board
    const visibleCardIds = new Set<string>();

    // Our own hand cards are known
    for (const card of sampled[aiPlayer].hand) {
      visibleCardIds.add(card.id + '_' + card.name_fr);
    }

    // All visible characters on the board are known
    for (const mission of sampled.activeMissions) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (!char.isHidden) {
            const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            visibleCardIds.add(topCard.id + '_' + topCard.name_fr);
          }
        }
      }
    }

    // Our discard pile is known
    for (const card of sampled[aiPlayer].discardPile) {
      visibleCardIds.add(card.id + '_' + card.name_fr);
    }

    // Build the unknown pool: opponent's deck cards could be in their hand
    // Since we can't access the actual deck (sanitized), use our own deck as a proxy pool
    const unknownPool = shuffle([...sampled[aiPlayer].deck]);

    // Estimate opponent's hand size (typically state tracks this)
    // The opponent hand was sanitized to [], but we can infer hand size from game phase
    const estimatedHandSize = Math.min(unknownPool.length, 5); // Conservative estimate

    // Assign random cards to opponent's hand for this simulation
    if (unknownPool.length > 0 && sampled[opponent].hand.length === 0) {
      sampled[opponent].hand = unknownPool.slice(0, estimatedHandSize);
    }

    return sampled;
  }

  /**
   * Strategic bonuses for specific action patterns.
   */
  private getStrategicBonus(action: GameAction, state: GameState, player: PlayerID): number {
    let bonus = 0;
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        if (!card) break;
        const mission = state.activeMissions[action.missionIndex];
        if (!mission) break;

        // Bonus for SCORE effects on high-value missions
        if (card.effects?.some((e) => e.type === 'SCORE')) {
          bonus += (mission.basePoints + mission.rankBonus) * 2;
        }

        // Bonus for POWERUP effects (power tokens = strong board advantage)
        for (const effect of card.effects ?? []) {
          const powerupMatch = effect.description.match(/POWERUP\s+(\d+)/i);
          if (powerupMatch) {
            const tokenValue = parseInt(powerupMatch[1], 10);
            bonus += tokenValue * 3;
          }
        }

        // Bonus for CHAKRA +X on early turns (compounding advantage)
        const chakraMatch = card.effects?.find((e) =>
          e.description.match(/CHAKRA\s*\+/i),
        );
        if (chakraMatch && state.turn <= 2) {
          bonus += 8;
        }

        // Bonus for playing cards that synergize with existing characters
        const myChars = player === 'player1'
          ? mission.player1Characters
          : mission.player2Characters;
        for (const existing of myChars) {
          // Same group synergy
          if (existing.card.group === card.group && card.group) {
            bonus += 2;
          }
          // Keyword synergy (e.g., Kiba + Akamaru)
          if (card.keywords?.some((k) => existing.card.keywords?.includes(k))) {
            bonus += 3;
          }
        }

        break;
      }

      case 'PLAY_HIDDEN': {
        const card = state[player].hand[action.cardIndex];
        if (!card) break;

        // Strong AMBUSH cards should be hidden
        if (card.effects?.some((e) => e.type === 'AMBUSH')) {
          bonus += 10;
        }

        // High-cost cards as hidden is great (save chakra for later reveal)
        if (card.chakra >= 5) {
          bonus += 4;
        }

        break;
      }

      case 'REVEAL_CHARACTER': {
        // Timing consideration: reveal when opponent has committed
        if (state[opponent].hasPassed) {
          bonus += 5; // Opponent can't respond
        }

        break;
      }

      case 'PASS': {
        // Edge token management
        if (state.edgeHolder !== player && state.firstPasser === null) {
          bonus += 5; // We'd get the Edge
        }

        // Passing when ahead on all missions is strategic
        const spread = MissionEvaluator.calculatePointSpread(state, player);
        if (spread > 5) {
          bonus += 3; // We're ahead, no need to overcommit
        }

        // Penalty for passing with lots of chakra (wasteful since it resets to 0)
        if (state[player].chakra > 5) {
          bonus -= state[player].chakra * 0.5;
        }

        break;
      }
    }

    return bonus;
  }

  /**
   * Quick heuristic for action ordering and chance-node weighting.
   */
  private quickScore(action: GameAction, state: GameState, player: PlayerID): number {
    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        return card ? card.power * 3 + (card.effects?.length ?? 0) * 2 : 0;
      }
      case 'UPGRADE_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        return card ? card.power * 4 + 5 : 0;
      }
      case 'REVEAL_CHARACTER':
        return 15;
      case 'PLAY_HIDDEN':
        return 5;
      case 'PASS':
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Limit branching factor while preserving action diversity.
   */
  private limitActions(
    actions: GameAction[],
    state: GameState,
    currentPlayer: PlayerID,
    aiPlayer: PlayerID,
  ): GameAction[] {
    if (actions.length <= this.maxBranching) return actions;

    // Sort by heuristic, keep top actions
    const sorted = [...actions].sort(
      (a, b) => this.quickScore(b, state, currentPlayer) - this.quickScore(a, state, currentPlayer),
    );

    // Always include PASS if available
    const result = sorted.slice(0, this.maxBranching);
    const hasPass = result.some((a) => a.type === 'PASS');
    if (!hasPass) {
      const passAction = actions.find((a) => a.type === 'PASS');
      if (passAction) {
        result[result.length - 1] = passAction;
      }
    }

    return result;
  }

  /**
   * Expert mulligan: evaluate hand for curve, synergy, and game plan.
   */
  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;

    let score = 0;

    // Mana curve evaluation
    const costDistribution = [0, 0, 0, 0]; // 0-2, 3-4, 5-6, 7+
    for (const card of hand) {
      if (card.chakra <= 2) costDistribution[0]++;
      else if (card.chakra <= 4) costDistribution[1]++;
      else if (card.chakra <= 6) costDistribution[2]++;
      else costDistribution[3]++;
    }

    // Ideal: at least 1 cheap, 2 mid, 1-2 expensive
    if (costDistribution[0] >= 1) score += 3;
    if (costDistribution[1] >= 2) score += 4;
    if (costDistribution[2] >= 1) score += 2;

    // Penalty for too many expensive cards
    if (costDistribution[3] >= 3) score -= 5;

    // Bonus for cards with effects
    for (const card of hand) {
      if (card.effects && card.effects.length > 0) score += 1;
      if (card.effects?.some((e) => e.type === 'AMBUSH')) score += 2;
      if (card.effects?.some((e) => e.type === 'SCORE')) score += 1.5;
    }

    // Synergy bonus: cards that work together
    const groups = hand.map((c) => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const g of groups) {
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    }
    for (const count of groupCounts.values()) {
      if (count >= 2) score += 2;
      if (count >= 3) score += 3;
    }

    // Total power potential
    const totalPower = hand.reduce((sum, c) => sum + c.power, 0);
    score += totalPower * 0.3;

    // Keep threshold: 10
    const keepAction = validActions.find(
      (a) => a.type === 'MULLIGAN' && !a.doMulligan,
    );
    const mulliganAction = validActions.find(
      (a) => a.type === 'MULLIGAN' && a.doMulligan,
    );

    if (score >= 10 && keepAction) return keepAction;
    if (mulliganAction) return mulliganAction;
    return validActions[0];
  }
}
