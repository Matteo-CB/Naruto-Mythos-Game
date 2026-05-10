

import type { GameState, GameAction, PlayerID } from '../../engine/types';
import { GameEngine } from '../../engine/GameEngine';
import { deepClone } from '../../engine/utils/deepClone';
import { shuffle } from '../../engine/utils/shuffle';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { FeatureExtractor } from './FeatureExtractor';
import type { NeuralEvaluator } from './NeuralEvaluator';



function actionKey(action: GameAction): string {
  switch (action.type) {
    case 'PLAY_CHARACTER':
      return `PC-${action.cardIndex}-${action.missionIndex}`;
    case 'PLAY_HIDDEN':
      return `PH-${action.cardIndex}-${action.missionIndex}`;
    case 'REVEAL_CHARACTER':
      return `RC-${action.missionIndex}-${action.characterInstanceId}`;
    case 'UPGRADE_CHARACTER':
      return `UC-${action.cardIndex}-${action.missionIndex}-${action.targetInstanceId}`;
    case 'PASS':
      return 'PASS';
    case 'MULLIGAN':
      return `MUL-${action.doMulligan}`;
    case 'SELECT_TARGET':
      return `ST-${action.pendingActionId}-${action.selectedTargets.sort().join(',')}`;
    case 'DECLINE_OPTIONAL_EFFECT':
      return `DOE-${action.pendingEffectId}`;
    case 'FORFEIT':
      return 'FF';
    case 'ADVANCE_PHASE':
      return 'AP';
    default:
      return JSON.stringify(action);
  }
}



class MCTSNode {
  visits = 0;
  totalValue = 0;
  children: Map<string, MCTSNode> = new Map();
  
  expandedKeys: Set<string> = new Set();
  depth: number;

  constructor(depth = 0) {
    this.depth = depth;
  }

  get value(): number {
    return this.visits === 0 ? 0.5 : this.totalValue / this.visits;
  }

  
  ucb1Score(child: MCTSNode, isAITurn: boolean, c: number): number {
    if (child.visits === 0) return Infinity;
    const exploitation = isAITurn ? child.value : (1 - child.value);
    const exploration = c * Math.sqrt(Math.log(Math.max(1, this.visits)) / child.visits);
    return exploitation + exploration;
  }
}



export interface ISMCTSConfig {
  
  simulations: number;
  
  maxDepth: number;
  
  explorationC: number;
  
  evaluator: NeuralEvaluator | null;
  
  maxBranching: number;
  
  useBatchedEval: boolean;
}




export class NeuralISMCTS {
  private config: ISMCTSConfig;

  constructor(config: ISMCTSConfig) {
    this.config = config;
  }

  
  chooseActionSync(
    state: GameState,
    aiPlayer: PlayerID,
    validActions: GameAction[],
  ): GameAction {
    if (validActions.length === 1) return validActions[0];

    const root = new MCTSNode(0);
    let failedSims = 0;

    for (let i = 0; i < this.config.simulations; i++) {
      try {
        const determinized = this.determinize(state, aiPlayer);
        this.simulate(root, determinized, aiPlayer, 0);
      } catch {
        failedSims++;
        
        
        if (failedSims > this.config.simulations * 0.8 && i > 20) {
          break;
        }
      }
    }

    
    
    if (failedSims > this.config.simulations * 0.6) {
      return this.heuristicFallback(validActions);
    }

    return this.pickBestAction(root, validActions);
  }

  
  async chooseActionAsync(
    state: GameState,
    aiPlayer: PlayerID,
    validActions: GameAction[],
  ): Promise<GameAction> {
    if (validActions.length === 1) return validActions[0];

    const root = new MCTSNode(0);
    const batchSize = 64;
    const totalSims = this.config.simulations;

    if (!this.config.useBatchedEval || !this.config.evaluator?.isReady()) {
      
      return this.chooseActionSync(state, aiPlayer, validActions);
    }

    
    for (let start = 0; start < totalSims; start += batchSize) {
      const batch = Math.min(batchSize, totalSims - start);
      const leafStates: GameState[] = [];
      const leafPaths: MCTSNode[][] = [];

      
      for (let i = 0; i < batch; i++) {
        try {
          const determinized = this.determinize(state, aiPlayer);
          const { path, leafState } = this.simulateCollectLeaf(root, determinized, aiPlayer, 0);
          leafStates.push(leafState);
          leafPaths.push(path);
        } catch {
          
        }
      }

      if (leafStates.length === 0) continue;

      
      const evaluator = this.config.evaluator!;
      let nnValues: number[] = [];

      try {
        const featureBatch = leafStates.map(s => {
          if (s.phase === 'gameOver') return null;
          return FeatureExtractor.extract(s, aiPlayer);
        });

        const nonNullIndices = featureBatch
          .map((f, i) => (f ? i : -1))
          .filter(i => i >= 0);
        const nonNullFeatures = nonNullIndices.map(i => featureBatch[i]!);

        if (nonNullFeatures.length > 0) {
          nnValues = await evaluator.evaluateBatch(nonNullFeatures);
        }

        
        for (let i = 0; i < leafStates.length; i++) {
          const leafState = leafStates[i];
          const path = leafPaths[i];

          let value: number;
          if (leafState.phase === 'gameOver') {
            value = this.terminalValue(leafState, aiPlayer);
          } else {
            const nnIdx = nonNullIndices.indexOf(i);
            if (nnIdx >= 0) {
              
              const p1WinProb = nnValues[nnIdx];
              value = aiPlayer === 'player1' ? p1WinProb : (1 - p1WinProb);
            } else {
              value = this.heuristicValue(leafState, aiPlayer);
            }
          }

          
          for (const node of path) {
            node.visits++;
            node.totalValue += value;
          }
        }
      } catch {
        
        for (let i = 0; i < leafStates.length; i++) {
          const leafState = leafStates[i];
          const path = leafPaths[i];
          const value = leafState.phase === 'gameOver'
            ? this.terminalValue(leafState, aiPlayer)
            : this.heuristicValue(leafState, aiPlayer);
          for (const node of path) {
            node.visits++;
            node.totalValue += value;
          }
        }
      }
    }

    return this.pickBestAction(root, validActions);
  }

  

  
  private simulate(
    node: MCTSNode,
    state: GameState,
    aiPlayer: PlayerID,
    depth: number,
  ): number {
    
    if (state.phase === 'gameOver') {
      const v = this.terminalValue(state, aiPlayer);
      node.visits++;
      node.totalValue += v;
      return v;
    }

    
    if (depth >= this.config.maxDepth) {
      const v = this.heuristicValue(state, aiPlayer);
      node.visits++;
      node.totalValue += v;
      return v;
    }

    const actingPlayer = this.getDecisionPlayer(state);

    let actions: GameAction[];
    try {
      actions = GameEngine.getValidActions(state, actingPlayer);
    } catch {
      const v = this.heuristicValue(state, aiPlayer);
      node.visits++;
      node.totalValue += v;
      return v;
    }

    if (actions.length === 0) {
      const autoAdvanced = this.tryAutoAdvance(state, actingPlayer);
      if (autoAdvanced) {
        return this.simulate(node, autoAdvanced, aiPlayer, depth + 1);
      }

      const v = this.heuristicValue(state, aiPlayer);
      node.visits++;
      node.totalValue += v;
      return v;
    }

    
    let limitedActions: GameAction[];
    try {
      limitedActions = this.limitBranching(actions, state, actingPlayer);
    } catch {
      limitedActions = actions.length > this.config.maxBranching
        ? actions.slice(0, this.config.maxBranching)
        : actions;
    }

    
    const untriedActions = limitedActions.filter(a => !node.expandedKeys.has(actionKey(a)));

    let selectedAction: GameAction;
    let childNode: MCTSNode;

    if (untriedActions.length > 0) {
      
      selectedAction = untriedActions[Math.floor(Math.random() * untriedActions.length)];
      const key = actionKey(selectedAction);
      node.expandedKeys.add(key);
      childNode = new MCTSNode(depth + 1);
      node.children.set(key, childNode);
    } else {
      
      const isAITurn = actingPlayer === aiPlayer;
      let bestScore = -Infinity;
      selectedAction = limitedActions[0];
      childNode = node.children.get(actionKey(limitedActions[0])) ?? new MCTSNode(depth + 1);

      for (const action of limitedActions) {
        const key = actionKey(action);
        const child = node.children.get(key);
        if (!child) continue;

        const score = node.ucb1Score(child, isAITurn, this.config.explorationC);
        if (score > bestScore) {
          bestScore = score;
          selectedAction = action;
          childNode = child;
        }
      }
    }

    
    let newState: GameState;
    try {
      newState = GameEngine.applyAction(state, actingPlayer, selectedAction);
    } catch {
      const v = this.heuristicValue(state, aiPlayer);
      node.visits++;
      node.totalValue += v;
      return v;
    }

    
    const value = this.simulate(childNode, newState, aiPlayer, depth + 1);

    
    node.visits++;
    node.totalValue += value;

    return value;
  }

  
  private simulateCollectLeaf(
    node: MCTSNode,
    state: GameState,
    aiPlayer: PlayerID,
    depth: number,
  ): { path: MCTSNode[]; leafState: GameState } {
    const path: MCTSNode[] = [node];
    let currentState = state;
    let currentNode = node;

    while (true) {
      
      if (currentState.phase === 'gameOver' || path.length > this.config.maxDepth) {
        break;
      }

      let actions: GameAction[];
      const actingPlayer = this.getDecisionPlayer(currentState);
      try {
        actions = GameEngine.getValidActions(currentState, actingPlayer);
      } catch {
        break;
      }

      if (actions.length === 0) {
        const autoAdvanced = this.tryAutoAdvance(currentState, actingPlayer);
        if (autoAdvanced) {
          currentState = autoAdvanced;
          continue;
        }
        break;
      }

      let limitedActions: GameAction[];
      try {
        limitedActions = this.limitBranching(actions, currentState, actingPlayer);
      } catch {
        limitedActions = actions.length > this.config.maxBranching
          ? actions.slice(0, this.config.maxBranching)
          : actions;
      }
      const untriedActions = limitedActions.filter(
        a => !currentNode.expandedKeys.has(actionKey(a))
      );

      let selectedAction: GameAction;
      let childNode: MCTSNode;

      if (untriedActions.length > 0) {
        
        selectedAction = untriedActions[Math.floor(Math.random() * untriedActions.length)];
        const key = actionKey(selectedAction);
        currentNode.expandedKeys.add(key);
        childNode = new MCTSNode(path.length);
        currentNode.children.set(key, childNode);
      } else {
        
        const isAITurn = actingPlayer === aiPlayer;
        let bestScore = -Infinity;
        selectedAction = limitedActions[0];
        childNode = currentNode.children.get(actionKey(limitedActions[0])) ?? new MCTSNode(path.length);

        for (const action of limitedActions) {
          const key = actionKey(action);
          const child = currentNode.children.get(key);
          if (!child) continue;

          const score = currentNode.ucb1Score(child, isAITurn, this.config.explorationC);
          if (score > bestScore) {
            bestScore = score;
            selectedAction = action;
            childNode = child;
          }
        }
      }

      
      try {
        currentState = GameEngine.applyAction(currentState, actingPlayer, selectedAction);
      } catch {
        break;
      }

      path.push(childNode);
      currentNode = childNode;
    }

    return { path, leafState: currentState };
  }

  

  private terminalValue(state: GameState, aiPlayer: PlayerID): number {
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';
    const myPts = state[aiPlayer].missionPoints;
    const oppPts = state[opponent].missionPoints;

    if (myPts > oppPts) return 1.0;
    if (oppPts > myPts) return 0.0;
    return state.edgeHolder === aiPlayer ? 1.0 : 0.0;
  }

  private heuristicValue(state: GameState, aiPlayer: PlayerID): number {
    const rawScore = BoardEvaluator.evaluate(state, aiPlayer);
    
    
    
    
    return 1 / (1 + Math.exp(-rawScore / 80));
  }

  

  
  private getDecisionPlayer(state: GameState): PlayerID {
    if (state.phase === 'mulligan') {
      return state.player1.hasMulliganed ? 'player2' : 'player1';
    }

    const pendingAction = state.pendingActions[0];
    if (pendingAction) {
      return pendingAction.player;
    }

    const optionalEffect = state.pendingEffects.find(
      (effect) => effect.isOptional && !effect.resolved,
    );
    if (optionalEffect) {
      return optionalEffect.sourcePlayer;
    }

    return state.activePlayer;
  }

  private tryAutoAdvance(state: GameState, actingPlayer: PlayerID): GameState | null {
    
    
    if (state.pendingEffects.length > 0 && state.pendingActions.length === 0) {
      return { ...state, pendingEffects: [] };
    }

    if (
      (state.phase === 'mission' || state.phase === 'end') &&
      state.pendingActions.length === 0 &&
      state.pendingEffects.length === 0
    ) {
      try {
        return GameEngine.applyAction(state, actingPlayer, { type: 'ADVANCE_PHASE' });
      } catch {
        return null;
      }
    }

    return null;
  }

  private isHiddenHandPlaceholder(hand: GameState['player1']['hand']): boolean {
    return hand.every((card) => card.cardId === '__hidden_hand__');
  }

  private limitBranching(actions: GameAction[], state: GameState, actingPlayer: PlayerID): GameAction[] {
    if (actions.length <= this.config.maxBranching) return actions;

    const scored = actions.map(a => ({ action: a, score: this.quickScore(a, state, actingPlayer) }));
    scored.sort((a, b) => b.score - a.score);

    const result = scored.slice(0, this.config.maxBranching).map(s => s.action);

    
    if (!result.some(a => a.type === 'PASS')) {
      const pass = actions.find(a => a.type === 'PASS');
      if (pass) result[result.length - 1] = pass;
    }

    return result;
  }

  private quickScore(action: GameAction, state: GameState, actingPlayer: PlayerID): number {
    const p = actingPlayer;
    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[p].hand[action.cardIndex];
        if (!card) return 0;
        return (card.power ?? 0) * 3 + (card.effects?.length ?? 0) * 2 + 5;
      }
      case 'UPGRADE_CHARACTER': {
        const card = state[p].hand[action.cardIndex];
        return card ? (card.power ?? 0) * 4 + 10 : 0;
      }
      case 'REVEAL_CHARACTER':
        return 12;
      case 'PLAY_HIDDEN':
        return 4;
      case 'PASS':
        return 1;
      default:
        return 2;
    }
  }

  
  private pickBestAction(root: MCTSNode, validActions: GameAction[]): GameAction {
    let bestAction = validActions[0];
    let bestVisits = -1;
    const hasNonPass = validActions.some(a => a.type !== 'PASS');

    for (const action of validActions) {
      const key = actionKey(action);
      const child = root.children.get(key);
      if (!child) continue;

      let effectiveVisits = child.visits;

      
      
      
      
      if (action.type === 'PASS' && hasNonPass && child.visits > 0) {
        if (child.value < 0.55) {
          
          effectiveVisits = Math.floor(child.visits * 0.5);
        } else {
          
          effectiveVisits = Math.floor(child.visits * 0.7);
        }
      }

      if (effectiveVisits > bestVisits) {
        bestVisits = effectiveVisits;
        bestAction = action;
      }
    }

    
    if (bestVisits <= 0 && validActions.length > 1) {
      console.warn('[ISMCTS] Empty tree — all simulations failed. Using heuristic fallback.');
      return this.heuristicFallback(validActions);
    }

    return bestAction;
  }

  
  private heuristicFallback(
    validActions: GameAction[],
  ): GameAction {
    
    for (const action of validActions) {
      if (action.type !== 'PASS') {
        return action;
      }
    }
    return validActions[0];
  }


  private determinize(state: GameState, aiPlayer: PlayerID): GameState {
    const cloned = deepClone(state);
    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';
    const oppState = cloned[opponent];

    const handIsPlaceholder = oppState.hand.length > 0 && this.isHiddenHandPlaceholder(oppState.hand);
    const handIsEmpty = oppState.hand.length === 0;

    if (!handIsPlaceholder && !handIsEmpty) return cloned;

    const oppDeck = oppState.deck ?? [];
    const oppDiscard = oppState.discardPile ?? [];
    const handSize = oppState.hand.length;

    if (handSize === 0) return cloned;

    const pool = shuffle([...oppDeck]);
    if (pool.length === 0) {
      cloned[opponent].hand = [];
      return cloned;
    }

    const take = Math.min(pool.length, handSize);
    const sampledHand = pool.slice(0, take);
    const remainingDeck = pool.slice(take);

    cloned[opponent] = {
      ...oppState,
      hand: sampledHand,
      deck: remainingDeck,
      discardPile: oppDiscard,
    };

    return cloned;
  }

  
  getActionStats(
    state: GameState,
    aiPlayer: PlayerID,
    validActions: GameAction[],
    simulations?: number,
  ): Array<{ action: GameAction; visits: number; winRate: number; key: string }> {
    const root = new MCTSNode(0);
    const sims = simulations ?? this.config.simulations;

    for (let i = 0; i < sims; i++) {
      const det = this.determinize(state, aiPlayer);
      this.simulate(root, det, aiPlayer, 0);
    }

    return validActions.map(action => {
      const key = actionKey(action);
      const child = root.children.get(key);
      return {
        action,
        key,
        visits: child?.visits ?? 0,
        winRate: child?.value ?? 0.5,
      };
    });
  }
}
