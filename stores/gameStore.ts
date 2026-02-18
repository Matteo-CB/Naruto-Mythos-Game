'use client';

import { create } from 'zustand';
import type { GameState, GameAction, PlayerID, VisibleGameState, GameConfig } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';
import { AIPlayer, type AIDifficulty } from '@/lib/ai/AIPlayer';
import { useSocketStore } from '@/lib/socket/client';

interface AnimationEvent {
  id: string;
  type: 'card-play' | 'card-reveal' | 'card-defeat' | 'card-hide' | 'card-move' |
        'card-upgrade' | 'power-token' | 'chakra-gain' | 'mission-score' |
        'edge-transfer' | 'turn-transition' | 'card-deal' | 'game-end';
  data: Record<string, unknown>;
  timestamp: number;
}

interface PendingTargetSelection {
  validTargets: string[]; // instanceIds
  description: string;
  onSelect: (targetId: string) => void;
  onDecline?: () => void; // for optional effects
}

interface GameStore {
  // Game state
  gameState: GameState | null;
  visibleState: VisibleGameState | null;
  humanPlayer: PlayerID;
  aiPlayer: AIPlayer | null;
  isAIGame: boolean;
  isOnlineGame: boolean;
  isProcessing: boolean;
  gameOver: boolean;
  winner: PlayerID | null;

  // Animation queue
  animationQueue: AnimationEvent[];
  isAnimating: boolean;

  // Target selection
  pendingTargetSelection: PendingTargetSelection | null;

  // Actions
  startAIGame: (config: GameConfig, difficulty: AIDifficulty) => void;
  startOnlineGame: (visibleState: VisibleGameState, playerRole: PlayerID) => void;
  updateOnlineState: (visibleState: VisibleGameState) => void;
  endOnlineGame: (winner: string) => void;
  performAction: (action: GameAction) => void;
  processAITurn: () => void;
  addAnimation: (event: Omit<AnimationEvent, 'id' | 'timestamp'>) => void;
  completeAnimation: (id: string) => void;
  setAnimating: (animating: boolean) => void;
  setPendingTargetSelection: (selection: PendingTargetSelection | null) => void;
  selectTarget: (targetId: string) => void;
  declineTarget: () => void;
  resetGame: () => void;
}

let animationIdCounter = 0;

/**
 * Helper to extract animation data from an action and the current game state.
 */
function getAnimationForAction(
  action: GameAction,
  gameState: GameState,
  player: PlayerID,
): Omit<AnimationEvent, 'id' | 'timestamp'> | null {
  const playerState = gameState[player];

  switch (action.type) {
    case 'PLAY_CHARACTER': {
      const card = playerState.hand[action.cardIndex];
      const mission = gameState.activeMissions[action.missionIndex];
      const missionRank = mission?.rank || '';
      return {
        type: 'card-play',
        data: {
          cardName: card?.name_fr || 'Card',
          missionRank,
          hidden: false,
          player,
        },
      };
    }

    case 'PLAY_HIDDEN': {
      const mission = gameState.activeMissions[action.missionIndex];
      const missionRank = mission?.rank || '';
      return {
        type: 'card-play',
        data: {
          cardName: 'Hidden Card',
          missionRank,
          hidden: true,
          player,
        },
      };
    }

    case 'REVEAL_CHARACTER': {
      // Find the character being revealed
      const mission = gameState.activeMissions[action.missionIndex];
      if (mission) {
        const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
        const char = chars.find(c => c.instanceId === action.characterInstanceId);
        if (char) {
          return {
            type: 'card-reveal',
            data: {
              cardName: char.card.name_fr,
              player,
            },
          };
        }
      }
      return {
        type: 'card-reveal',
        data: { cardName: 'Card', player },
      };
    }

    case 'UPGRADE_CHARACTER': {
      const card = playerState.hand[action.cardIndex];
      const mission = gameState.activeMissions[action.missionIndex];
      let previousName = '';
      if (mission) {
        const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
        const target = chars.find(c => c.instanceId === action.targetInstanceId);
        if (target) {
          previousName = target.card.name_fr;
        }
      }
      return {
        type: 'card-upgrade',
        data: {
          cardName: card?.name_fr || 'Card',
          previousName,
          player,
        },
      };
    }

    case 'PASS':
      // No animation for passing
      return null;

    case 'MULLIGAN':
      // No animation for mulligan
      return null;

    case 'SELECT_TARGET':
      // No animation for target selection itself
      return null;

    case 'DECLINE_OPTIONAL_EFFECT':
      // No animation for declining
      return null;

    default:
      return null;
  }
}

/**
 * Helper to extract animation data for an AI action.
 * For AI actions, we may not always know card names (hidden info),
 * so we use what we can determine.
 */
function getAnimationForAIAction(
  action: GameAction,
  gameState: GameState,
  aiPlayer: PlayerID,
): Omit<AnimationEvent, 'id' | 'timestamp'> | null {
  const aiState = gameState[aiPlayer];

  switch (action.type) {
    case 'PLAY_CHARACTER': {
      const card = aiState.hand[action.cardIndex];
      const mission = gameState.activeMissions[action.missionIndex];
      const missionRank = mission?.rank || '';
      return {
        type: 'card-play',
        data: {
          cardName: card?.name_fr || 'Card',
          missionRank,
          hidden: false,
          player: aiPlayer,
        },
      };
    }

    case 'PLAY_HIDDEN': {
      const mission = gameState.activeMissions[action.missionIndex];
      const missionRank = mission?.rank || '';
      return {
        type: 'card-play',
        data: {
          cardName: 'Hidden Card',
          missionRank,
          hidden: true,
          player: aiPlayer,
        },
      };
    }

    case 'REVEAL_CHARACTER': {
      const mission = gameState.activeMissions[action.missionIndex];
      if (mission) {
        const chars = aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
        const char = chars.find(c => c.instanceId === action.characterInstanceId);
        if (char) {
          return {
            type: 'card-reveal',
            data: {
              cardName: char.card.name_fr,
              player: aiPlayer,
            },
          };
        }
      }
      return {
        type: 'card-reveal',
        data: { cardName: 'Card', player: aiPlayer },
      };
    }

    case 'UPGRADE_CHARACTER': {
      const card = aiState.hand[action.cardIndex];
      return {
        type: 'card-upgrade',
        data: {
          cardName: card?.name_fr || 'Card',
          player: aiPlayer,
        },
      };
    }

    case 'PASS':
      return null;

    default:
      return null;
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  visibleState: null,
  humanPlayer: 'player1',
  aiPlayer: null,
  isAIGame: false,
  isOnlineGame: false,
  isProcessing: false,
  gameOver: false,
  winner: null,
  animationQueue: [],
  isAnimating: false,
  pendingTargetSelection: null,

  startOnlineGame: (visibleState: VisibleGameState, playerRole: PlayerID) => {
    set({
      gameState: null,
      visibleState,
      humanPlayer: playerRole,
      aiPlayer: null,
      isAIGame: false,
      isOnlineGame: true,
      isProcessing: false,
      gameOver: false,
      winner: null,
      animationQueue: [],
      pendingTargetSelection: null,
    });
  },

  updateOnlineState: (visibleState: VisibleGameState) => {
    set({ visibleState, isProcessing: false });
  },

  endOnlineGame: (winner: string) => {
    set({
      gameOver: true,
      winner: winner as PlayerID,
    });
  },

  startAIGame: (config: GameConfig, difficulty: AIDifficulty) => {
    const state = GameEngine.createGame(config);
    const humanPlayer: PlayerID = config.player1.isAI ? 'player2' : 'player1';
    const aiPlayerSide: PlayerID = humanPlayer === 'player1' ? 'player2' : 'player1';
    const ai = new AIPlayer(difficulty, aiPlayerSide);

    const visible = GameEngine.getVisibleState(state, humanPlayer);

    set({
      gameState: state,
      visibleState: visible,
      humanPlayer,
      aiPlayer: ai,
      isAIGame: true,
      isProcessing: false,
      gameOver: false,
      winner: null,
      animationQueue: [],
      pendingTargetSelection: null,
    });

    // If AI goes first during mulligan, let it decide
    if (state.phase === 'mulligan') {
      // AI auto-decides mulligan
      const aiAction = ai.getAction(state);
      if (aiAction) {
        const newState = GameEngine.applyAction(state, aiPlayerSide, aiAction);
        const newVisible = GameEngine.getVisibleState(newState, humanPlayer);
        set({ gameState: newState, visibleState: newVisible });
      }
    }
  },

  performAction: (action: GameAction) => {
    const { gameState, humanPlayer, aiPlayer, isAIGame, isOnlineGame, addAnimation } = get();

    // Online mode: send action to server via socket, don't apply locally
    if (isOnlineGame) {
      const socketState = useSocketStore.getState();
      if (socketState.socket) {
        set({ isProcessing: true });
        socketState.performAction(action);
      }
      return;
    }

    if (!gameState || get().isProcessing) return;

    set({ isProcessing: true });

    // Queue animation for this action BEFORE applying
    const animEvent = getAnimationForAction(action, gameState, humanPlayer);
    if (animEvent) {
      addAnimation(animEvent);
    }

    const newState = GameEngine.applyAction(gameState, humanPlayer, action);
    const newVisible = GameEngine.getVisibleState(newState, humanPlayer);

    set({
      gameState: newState,
      visibleState: newVisible,
    });

    // Check if game is over
    if (newState.phase === 'gameOver') {
      addAnimation({
        type: 'game-end',
        data: { winner: GameEngine.getWinner(newState) },
      });
      set({
        gameOver: true,
        winner: GameEngine.getWinner(newState),
        isProcessing: false,
      });
      return;
    }

    // Process AI response if needed
    if (isAIGame && aiPlayer) {
      // Delay scales with whether there was an animation
      const delay = animEvent ? 1000 : 500;
      setTimeout(() => {
        get().processAITurn();
      }, delay);
    } else {
      set({ isProcessing: false });
    }
  },

  processAITurn: () => {
    const { gameState, humanPlayer, aiPlayer, addAnimation } = get();
    if (!gameState || !aiPlayer) {
      set({ isProcessing: false });
      return;
    }

    // Let AI take actions until it's the human's turn or game ends
    let currentState = gameState;
    let iterations = 0;
    const maxIterations = 20; // Safety limit
    const aiAnimations: Array<Omit<AnimationEvent, 'id' | 'timestamp'>> = [];

    while (iterations < maxIterations) {
      // Check if it's the AI's turn
      const aiActions = GameEngine.getValidActions(currentState, aiPlayer.player);
      if (aiActions.length === 0) break;

      // Check if human also needs to act (during mulligan both can act)
      if (currentState.phase !== 'mulligan') {
        const humanActions = GameEngine.getValidActions(currentState, humanPlayer);
        if (humanActions.length > 0 && currentState.activePlayer === humanPlayer) break;
      }

      const aiAction = aiPlayer.getAction(currentState);
      if (!aiAction) break;

      // Capture animation for this AI action
      const animEvent = getAnimationForAIAction(aiAction, currentState, aiPlayer.player);
      if (animEvent) {
        aiAnimations.push(animEvent);
      }

      currentState = GameEngine.applyAction(currentState, aiPlayer.player, aiAction);

      if (currentState.phase === 'gameOver') {
        // Queue all AI animations
        for (const anim of aiAnimations) {
          addAnimation(anim);
        }
        addAnimation({
          type: 'game-end',
          data: { winner: GameEngine.getWinner(currentState) },
        });

        const visible = GameEngine.getVisibleState(currentState, humanPlayer);
        set({
          gameState: currentState,
          visibleState: visible,
          gameOver: true,
          winner: GameEngine.getWinner(currentState),
          isProcessing: false,
        });
        return;
      }

      iterations++;
    }

    // Queue all collected AI animations
    for (const anim of aiAnimations) {
      addAnimation(anim);
    }

    const visible = GameEngine.getVisibleState(currentState, humanPlayer);
    set({
      gameState: currentState,
      visibleState: visible,
      isProcessing: false,
    });
  },

  addAnimation: (event) => {
    const id = `anim-${++animationIdCounter}`;
    const animEvent: AnimationEvent = {
      ...event,
      id,
      timestamp: Date.now(),
    };
    set((state) => ({
      animationQueue: [...state.animationQueue, animEvent],
    }));
  },

  completeAnimation: (id) => {
    set((state) => ({
      animationQueue: state.animationQueue.filter((a) => a.id !== id),
    }));
  },

  setAnimating: (animating) => {
    set({ isAnimating: animating });
  },

  setPendingTargetSelection: (selection) => {
    set({ pendingTargetSelection: selection });
  },

  selectTarget: (targetId: string) => {
    const { pendingTargetSelection } = get();
    if (pendingTargetSelection) {
      pendingTargetSelection.onSelect(targetId);
      set({ pendingTargetSelection: null });
    }
  },

  declineTarget: () => {
    const { pendingTargetSelection } = get();
    if (pendingTargetSelection?.onDecline) {
      pendingTargetSelection.onDecline();
    }
    set({ pendingTargetSelection: null });
  },

  resetGame: () => {
    // Disconnect socket if leaving an online game
    if (get().isOnlineGame) {
      useSocketStore.getState().disconnect();
    }
    set({
      gameState: null,
      visibleState: null,
      aiPlayer: null,
      isAIGame: false,
      isOnlineGame: false,
      isProcessing: false,
      gameOver: false,
      winner: null,
      animationQueue: [],
      isAnimating: false,
      pendingTargetSelection: null,
    });
  },
}));
