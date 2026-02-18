import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { MissionEvaluator } from '../evaluation/MissionEvaluator';
import { ChakraEvaluator } from '../evaluation/ChakraEvaluator';

/**
 * Medium AI: Greedy strategy.
 * Always plays the highest-power card it can afford on the most valuable mission.
 * No look-ahead, no opponent modeling.
 */
export class MediumAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'medium';

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    // Mulligan: keep if we have at least 2 playable cards (cost <= 5)
    if (state.phase === 'mulligan') {
      const hand = state[player].hand;
      const playableCount = hand.filter((c) => c.chakra <= 5).length;
      const keepAction = validActions.find(
        (a) => a.type === 'MULLIGAN' && !a.doMulligan,
      );
      const mulliganAction = validActions.find(
        (a) => a.type === 'MULLIGAN' && a.doMulligan,
      );

      if (playableCount >= 2 && keepAction) return keepAction;
      if (mulliganAction) return mulliganAction;
      return validActions[0];
    }

    // Score each action
    const scoredActions = validActions
      .map((action) => ({
        action,
        score: this.scoreAction(action, state, player),
      }))
      .sort((a, b) => b.score - a.score);

    return scoredActions[0].action;
  }

  private scoreAction(action: GameAction, state: GameState, player: PlayerID): number {
    switch (action.type) {
      case 'PLAY_CHARACTER':
        return this.scorePlayCharacter(action, state, player);

      case 'PLAY_HIDDEN':
        return this.scorePlayHidden(action, state, player);

      case 'REVEAL_CHARACTER':
        return this.scoreReveal(action, state, player);

      case 'UPGRADE_CHARACTER':
        return this.scoreUpgrade(action, state, player);

      case 'PASS':
        return this.scorePass(state, player);

      case 'SELECT_TARGET':
        return 10; // Always select targets when required

      default:
        return 0;
    }
  }

  private scorePlayCharacter(
    action: Extract<GameAction, { type: 'PLAY_CHARACTER' }>,
    state: GameState,
    player: PlayerID,
  ): number {
    const card = state[player].hand[action.cardIndex];
    if (!card) return -100;

    const mission = state.activeMissions[action.missionIndex];
    if (!mission) return -100;

    // Base score: card power
    let score = card.power * 5;

    // Bonus for playing on highest-value mission
    const missionValue = mission.basePoints + mission.rankBonus;
    score += missionValue * 3;

    // Prefer missions where we're already competitive or can win
    const missionScore = MissionEvaluator.evaluateSingleMission(state, mission, player);
    score += missionScore * 2;

    // Bonus for effects
    if (card.effects && card.effects.length > 0) {
      score += card.effects.length * 2;
      // Extra bonus for SCORE effects
      if (card.effects.some((e) => e.type === 'SCORE')) {
        score += 4;
      }
      // Bonus for POWERUP effects (generate power tokens)
      for (const effect of card.effects) {
        const powerupMatch = effect.description.match(/POWERUP\s+(\d+)/i);
        if (powerupMatch) {
          score += parseInt(powerupMatch[1], 10) * 3;
        }
      }
      // Bonus for CHAKRA +X effects (compounding income advantage)
      for (const effect of card.effects) {
        const chakraMatch = effect.description.match(/CHAKRA\s*\+(\d+)/i);
        if (chakraMatch) {
          const turnsLeft = 4 - state.turn + 1;
          score += parseInt(chakraMatch[1], 10) * turnsLeft * 2;
        }
      }
    }

    // Chakra efficiency
    score += ChakraEvaluator.evaluateCardEfficiency(card) * 2;

    return score;
  }

  private scorePlayHidden(
    action: Extract<GameAction, { type: 'PLAY_HIDDEN' }>,
    state: GameState,
    player: PlayerID,
  ): number {
    const card = state[player].hand[action.cardIndex];
    if (!card) return -100;

    // Hidden play is cheap (1 chakra) but provides no immediate power
    let score = 5; // Base value for board presence

    // Better to hide expensive cards (can reveal later for full value)
    if (card.chakra >= 4) {
      score += 3;
    }

    // AMBUSH cards are much better as hidden
    if (card.effects?.some((e) => e.type === 'AMBUSH')) {
      score += 8;
    }

    // Prefer placing on missions we want to contest
    const mission = state.activeMissions[action.missionIndex];
    if (mission) {
      score += (mission.basePoints + mission.rankBonus) * 0.5;
    }

    return score;
  }

  private scoreReveal(
    action: Extract<GameAction, { type: 'REVEAL_CHARACTER' }>,
    state: GameState,
    player: PlayerID,
  ): number {
    // Find the hidden character
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      const char = chars.find((c) => c.instanceId === action.characterInstanceId);
      if (char) {
        let score = char.card.power * 4;

        // AMBUSH bonus
        if (char.card.effects?.some((e) => e.type === 'AMBUSH')) {
          score += 10;
        }

        // Mission value multiplier
        const missionValue = mission.basePoints + mission.rankBonus;
        score += missionValue * 2;

        return score;
      }
    }

    return 0;
  }

  private scoreUpgrade(
    action: Extract<GameAction, { type: 'UPGRADE_CHARACTER' }>,
    state: GameState,
    player: PlayerID,
  ): number {
    const card = state[player].hand[action.cardIndex];
    if (!card) return -100;

    // Upgrades are usually strong
    let score = card.power * 4;

    // UPGRADE effects are very valuable
    if (card.effects?.some((e) => e.type === 'UPGRADE')) {
      score += 8;
    }

    // Cheaper effective cost (only pay difference) makes them efficient
    score += 5;

    return score;
  }

  private scorePass(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    // If we have no chakra, passing is fine
    if (state[player].chakra <= 0) return 3;

    // If opponent already passed, we should play more if possible
    if (state[opponent].hasPassed) return -5;

    // Edge token consideration: first passer gets Edge
    if (state.edgeHolder !== player) {
      return 2; // Slight incentive to pass first to get Edge
    }

    // Default: low score, prefer playing
    return -2;
  }
}
