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
  playerName?: string; // display name of the player who must choose
  selectionType?: 'TARGET_CHARACTER' | 'CHOOSE_FROM_HAND'; // type of selection
  handCards?: Array<{ index: number; card: { name_fr: string; chakra?: number; power?: number; image_file?: string } }>; // for hand selection
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
  playerDisplayNames: { player1: string; player2: string };

  // Animation queue
  animationQueue: AnimationEvent[];
  isAnimating: boolean;

  // Target selection
  pendingTargetSelection: PendingTargetSelection | null;

  // Actions
  startAIGame: (config: GameConfig, difficulty: AIDifficulty, playerName?: string) => void;
  startOnlineGame: (visibleState: VisibleGameState, playerRole: PlayerID, playerName?: string, opponentName?: string) => void;
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
      const imgPath = card?.image_file?.replace(/\\/g, '/');
      return {
        type: 'card-play',
        data: {
          cardName: card?.name_fr || 'Card',
          cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
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
          cardImage: null,
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
          const imgPath = char.card.image_file?.replace(/\\/g, '/');
          return {
            type: 'card-reveal',
            data: {
              cardName: char.card.name_fr,
              cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
              player,
            },
          };
        }
      }
      return {
        type: 'card-reveal',
        data: { cardName: 'Card', cardImage: null, player },
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
      const imgPath = card?.image_file?.replace(/\\/g, '/');
      return {
        type: 'card-upgrade',
        data: {
          cardName: card?.name_fr || 'Card',
          cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
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
      const imgPath = card?.image_file?.replace(/\\/g, '/');
      return {
        type: 'card-play',
        data: {
          cardName: card?.name_fr || 'Card',
          cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
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
          cardImage: null,
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
          const imgPath = char.card.image_file?.replace(/\\/g, '/');
          return {
            type: 'card-reveal',
            data: {
              cardName: char.card.name_fr,
              cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
              player: aiPlayer,
            },
          };
        }
      }
      return {
        type: 'card-reveal',
        data: { cardName: 'Card', cardImage: null, player: aiPlayer },
      };
    }

    case 'UPGRADE_CHARACTER': {
      const card = aiState.hand[action.cardIndex];
      const mission = gameState.activeMissions[action.missionIndex];
      let previousName = '';
      if (mission) {
        const chars = aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
        const target = chars.find(c => c.instanceId === action.targetInstanceId);
        if (target) previousName = target.card.name_fr;
      }
      const imgPath = card?.image_file?.replace(/\\/g, '/');
      return {
        type: 'card-upgrade',
        data: {
          cardName: card?.name_fr || 'Card',
          cardImage: imgPath ? (imgPath.startsWith('/') ? imgPath : `/${imgPath}`) : null,
          previousName,
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
  playerDisplayNames: { player1: 'Player 1', player2: 'Player 2' },
  animationQueue: [],
  isAnimating: false,
  pendingTargetSelection: null,

  startOnlineGame: (visibleState: VisibleGameState, playerRole: PlayerID, playerName?: string, opponentName?: string) => {
    const humanName = playerName || 'Player';
    const oppName = opponentName || 'Opponent';
    const playerDisplayNames = {
      player1: playerRole === 'player1' ? humanName : oppName,
      player2: playerRole === 'player2' ? humanName : oppName,
    };
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
      playerDisplayNames,
      animationQueue: [],
      pendingTargetSelection: null,
    });
  },

  updateOnlineState: (visibleState: VisibleGameState) => {
    const humanPlayer = get().humanPlayer;
    const pendingForMe = visibleState.pendingActions.filter((a) => a.player === humanPlayer);

    if (pendingForMe.length > 0) {
      const pendingAction = pendingForMe[0];
      const pendingEffect = visibleState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);

      // Determine selection type for UI
      const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
        pendingAction.type === 'DISCARD_CARD' ||
        pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

      // Build hand card info for hand selection UI
      let handCards: PendingTargetSelection['handCards'];
      if (isHandSelection) {
        const playerHand = visibleState.myState.hand;
        handCards = pendingAction.options.map((indexStr) => {
          const idx = parseInt(indexStr, 10);
          const card = playerHand[idx];
          return {
            index: idx,
            card: card ? {
              name_fr: card.name_fr,
              chakra: card.chakra,
              power: card.power,
              image_file: card.image_file,
            } : { name_fr: '???' },
          };
        });
      }

      set({
        visibleState,
        isProcessing: false,
        pendingTargetSelection: {
          validTargets: pendingAction.options,
          description: pendingAction.description,
          selectionType: isHandSelection ? 'CHOOSE_FROM_HAND' : 'TARGET_CHARACTER',
          handCards,
          onSelect: (targetId: string) => {
            get().performAction({
              type: 'SELECT_TARGET',
              pendingActionId: pendingAction.id,
              selectedTargets: [targetId],
            });
          },
          onDecline: pendingEffect?.isOptional ? () => {
            if (pendingEffect) {
              get().performAction({
                type: 'DECLINE_OPTIONAL_EFFECT',
                pendingEffectId: pendingEffect.id,
              });
            }
          } : undefined,
        },
      });
    } else {
      set({ visibleState, isProcessing: false, pendingTargetSelection: null });
    }
  },

  endOnlineGame: (winner: string) => {
    set({
      gameOver: true,
      winner: winner as PlayerID,
    });
  },

  startAIGame: (config: GameConfig, difficulty: AIDifficulty, playerName?: string) => {
    const state = GameEngine.createGame(config);
    const humanPlayer: PlayerID = config.player1.isAI ? 'player2' : 'player1';
    const aiPlayerSide: PlayerID = humanPlayer === 'player1' ? 'player2' : 'player1';
    const ai = new AIPlayer(difficulty, aiPlayerSide);

    const visible = GameEngine.getVisibleState(state, humanPlayer);

    // Build display names
    const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const humanName = playerName || 'Player';
    const aiName = `AI (${difficultyLabel})`;
    const playerDisplayNames = {
      player1: humanPlayer === 'player1' ? humanName : aiName,
      player2: humanPlayer === 'player2' ? humanName : aiName,
    };

    set({
      gameState: state,
      visibleState: visible,
      humanPlayer,
      aiPlayer: ai,
      isAIGame: true,
      isOnlineGame: false,
      isProcessing: false,
      gameOver: false,
      winner: null,
      playerDisplayNames,
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

    // Check if there are pending target selections for the human player
    const humanPending = newState.pendingActions.filter((p) => p.player === humanPlayer);
    if (humanPending.length > 0) {
      const pendingAction = humanPending[0];
      const pendingEffect = newState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);

      // Determine selection type for UI
      const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
        pendingAction.type === 'DISCARD_CARD' ||
        pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

      // Build hand card info for hand selection UI
      let handCards: PendingTargetSelection['handCards'];
      if (isHandSelection) {
        const tst = pendingEffect?.targetSelectionType ?? '';
        // Sakura 109: indices are into the discard pile
        // Sakura 135: indices are into drawn cards stored at end of discard pile (use JSON description)
        if (tst === 'SAKURA109_CHOOSE_DISCARD') {
          const playerDiscard = newState[humanPlayer].discardPile;
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = playerDiscard[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SAKURA135_CHOOSE_CARD') {
          // Cards are stored at end of discard pile; description JSON has topCards info
          let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
          try { topCardsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').topCards ?? []; } catch { /* ignore */ }
          const playerDiscard = newState[humanPlayer].discardPile;
          const numDrawn = topCardsInfo.length;
          const drawnCards = playerDiscard.slice(playerDiscard.length - numDrawn);
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = drawnCards[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else {
          const playerHand = newState[humanPlayer].hand;
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = playerHand[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        }
      }

      set({
        isProcessing: false,
        pendingTargetSelection: {
          validTargets: pendingAction.options,
          description: pendingAction.description,
          selectionType: isHandSelection ? 'CHOOSE_FROM_HAND' : 'TARGET_CHARACTER',
          handCards,
          onSelect: (targetId: string) => {
            get().performAction({
              type: 'SELECT_TARGET',
              pendingActionId: pendingAction.id,
              selectedTargets: [targetId],
            });
          },
          onDecline: pendingEffect?.isOptional ? () => {
            if (pendingEffect) {
              get().performAction({
                type: 'DECLINE_OPTIONAL_EFFECT',
                pendingEffectId: pendingEffect.id,
              });
            }
          } : undefined,
        },
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
      // Check if AI has pending target selections to resolve first
      const aiPending = currentState.pendingActions.filter((p) => p.player === aiPlayer.player);
      if (aiPending.length > 0) {
        // AI auto-resolves: pick first valid target (simple for Easy/Medium, could be smarter)
        const pendingAction = aiPending[0];
        if (pendingAction.options.length > 0) {
          const selectedTarget = pendingAction.options[0]; // Pick first option
          currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
            type: 'SELECT_TARGET',
            pendingActionId: pendingAction.id,
            selectedTargets: [selectedTarget],
          });
          iterations++;
          continue;
        }
      }

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
      const onSelect = pendingTargetSelection.onSelect;
      // Clear BEFORE calling onSelect — performAction may set a NEW
      // pendingTargetSelection for chained effects (e.g. MAIN → AMBUSH).
      // Clearing after would wipe out the new pending.
      set({ pendingTargetSelection: null });
      onSelect(targetId);
    }
  },

  declineTarget: () => {
    const { pendingTargetSelection } = get();
    if (pendingTargetSelection?.onDecline) {
      const onDecline = pendingTargetSelection.onDecline;
      // Clear BEFORE calling onDecline — same chained-effect reasoning.
      set({ pendingTargetSelection: null });
      onDecline();
    } else {
      set({ pendingTargetSelection: null });
    }
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
      playerDisplayNames: { player1: 'Player 1', player2: 'Player 2' },
      animationQueue: [],
      isAnimating: false,
      pendingTargetSelection: null,
    });
  },
}));
