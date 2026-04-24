import type { GameState, GameAction, PlayerID } from '../../engine/types';
import type { AIStrategy, AIDifficulty } from '../AIPlayer';
import { GameEngine } from '../../engine/GameEngine';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { MissionEvaluator } from '../evaluation/MissionEvaluator';
import { ChakraEvaluator } from '../evaluation/ChakraEvaluator';
import { deepClone } from '../../engine/utils/deepClone';
import { shuffle } from '../../engine/utils/shuffle';


export class ExpertAI implements AIStrategy {
  readonly difficulty: AIDifficulty = 'impossible';
  private readonly simulations = 30;
  private readonly maxDepth = 3;
  private readonly maxBranching = 8;

  chooseAction(state: GameState, player: PlayerID, validActions: GameAction[]): GameAction {
    if (validActions.length === 0) {
      return { type: 'PASS' };
    }

    
    if (state.phase === 'mulligan') {
      return this.decideMulligan(state, player, validActions);
    }

    
    const scores = new Map<number, number>();

    for (let i = 0; i < validActions.length; i++) {
      scores.set(i, 0);
    }

    
    const numSims = Math.min(this.simulations, Math.max(10, 50 - validActions.length * 2));

    for (let sim = 0; sim < numSims; sim++) {
      
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

    
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < validActions.length; i++) {
      const avgScore = (scores.get(i) ?? 0) / numSims;

      
      const strategicBonus = this.getStrategicBonus(validActions[i], state, player);
      const totalScore = avgScore + strategicBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestIndex = i;
      }
    }

    return validActions[bestIndex];
  }

  
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

  
  private sampleHiddenInfo(state: GameState, aiPlayer: PlayerID): GameState {
    const sampled = deepClone(state);
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';

    
    
    const visibleCardIds = new Set<string>();

    
    for (const card of sampled[aiPlayer].hand) {
      visibleCardIds.add(card.id + '_' + card.name_fr);
    }

    
    for (const mission of sampled.activeMissions) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (!char.isHidden) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            visibleCardIds.add(topCard.id + '_' + topCard.name_fr);
          }
        }
      }
    }

    
    for (const card of sampled[aiPlayer].discardPile) {
      visibleCardIds.add(card.id + '_' + card.name_fr);
    }

    
    
    const unknownPool = shuffle([...sampled[aiPlayer].deck]);

    
    
    const estimatedHandSize = Math.min(unknownPool.length, 5); // Conservative estimate

    
    if (unknownPool.length > 0 && sampled[opponent].hand.length === 0) {
      sampled[opponent].hand = unknownPool.slice(0, estimatedHandSize);
    }

    return sampled;
  }

  
  private getStrategicBonus(action: GameAction, state: GameState, player: PlayerID): number {
    let bonus = 0;
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        if (!card) break;
        const mission = state.activeMissions[action.missionIndex];
        if (!mission) break;

        
        if (card.effects?.some((e) => e.type === 'SCORE')) {
          bonus += (mission.basePoints + mission.rankBonus) * 2;
        }

        
        for (const effect of card.effects ?? []) {
          const powerupMatch = effect.description.match(/POWERUP\s+(\d+)/i);
          if (powerupMatch) {
            const tokenValue = parseInt(powerupMatch[1], 10);
            bonus += tokenValue * 3;
          }
        }

        
        const chakraMatch = card.effects?.find((e) =>
          e.description.match(/CHAKRA\s*\+/i),
        );
        if (chakraMatch && state.turn <= 2) {
          bonus += 8;
        }

        
        const myChars = player === 'player1'
          ? mission.player1Characters
          : mission.player2Characters;
        for (const existing of myChars) {
          
          if (existing.card.group === card.group && card.group) {
            bonus += 2;
          }
          
          if (card.keywords?.some((k) => existing.card.keywords?.includes(k))) {
            bonus += 3;
          }
        }

        break;
      }

      case 'PLAY_HIDDEN': {
        const card = state[player].hand[action.cardIndex];
        if (!card) break;

        
        if (card.effects?.some((e) => e.type === 'AMBUSH')) {
          bonus += 10;
        }

        
        if (card.chakra >= 5) {
          bonus += 4;
        }

        break;
      }

      case 'REVEAL_CHARACTER': {
        
        if (state[opponent].hasPassed) {
          bonus += 5; // Opponent can't respond
        }

        break;
      }

      case 'PASS': {
        
        if (state.edgeHolder !== player && state.firstPasser === null) {
          bonus += 3; // Reduced from 5 — edge is nice but playing is usually better
        }

        
        const spread = MissionEvaluator.calculatePointSpread(state, player);
        if (spread > 8) {
          bonus += 2; // Only slight bonus when clearly dominating
        }

        
        
        if (state[player].chakra > 0) {
          const playableCards = state[player].hand.filter(
            c => (c.chakra ?? 0) <= state[player].chakra,
          ).length;
          const canHide = state[player].hand.length > 0 && state[player].chakra >= 1;

          
          bonus -= state[player].chakra * 1.0;
          bonus -= playableCards * 3;
          if (canHide && playableCards === 0) bonus -= 2;

          
          if (state.turn >= 3) {
            bonus -= playableCards * 2;
            bonus -= state[player].chakra * 0.5;
          }
        }

        break;
      }
    }

    return bonus;
  }

  
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

  
  private limitActions(
    actions: GameAction[],
    state: GameState,
    currentPlayer: PlayerID,
    aiPlayer: PlayerID,
  ): GameAction[] {
    if (actions.length <= this.maxBranching) return actions;

    
    const sorted = [...actions].sort(
      (a, b) => this.quickScore(b, state, currentPlayer) - this.quickScore(a, state, currentPlayer),
    );

    
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

  
  private decideMulligan(
    state: GameState,
    player: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    const hand = state[player].hand;

    let score = 0;

    
    const costDistribution = [0, 0, 0, 0]; // 0-2, 3-4, 5-6, 7+
    for (const card of hand) {
      if (card.chakra <= 2) costDistribution[0]++;
      else if (card.chakra <= 4) costDistribution[1]++;
      else if (card.chakra <= 6) costDistribution[2]++;
      else costDistribution[3]++;
    }

    
    if (costDistribution[0] >= 1) score += 3;
    if (costDistribution[1] >= 2) score += 4;
    if (costDistribution[2] >= 1) score += 2;

    
    if (costDistribution[3] >= 3) score -= 5;

    
    for (const card of hand) {
      if (card.effects && card.effects.length > 0) score += 1;
      if (card.effects?.some((e) => e.type === 'AMBUSH')) score += 2;
      if (card.effects?.some((e) => e.type === 'SCORE')) score += 1.5;
    }

    
    const groups = hand.map((c) => c.group).filter(Boolean);
    const groupCounts = new Map<string, number>();
    for (const g of groups) {
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    }
    for (const count of groupCounts.values()) {
      if (count >= 2) score += 2;
      if (count >= 3) score += 3;
    }

    
    const totalPower = hand.reduce((sum, c) => sum + c.power, 0);
    score += totalPower * 0.3;

    
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
