'use client';

import { create } from 'zustand';
import type { GameState, GameAction, PlayerID, VisibleGameState, GameConfig } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';
import { AIPlayer, type AIDifficulty } from '@/lib/ai/AIPlayer';
import { aiSelectTarget } from '@/lib/ai/targetSelection';
import { useSocketStore } from '@/lib/socket/client';
import { validatePlayCharacter, validatePlayHidden } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { deepClone } from '@/lib/engine/utils/deepClone';
import { resetIdCounter } from '@/lib/engine/utils/id';

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
  descriptionKey?: string; // i18n key for translated description
  descriptionParams?: Record<string, string | number>; // interpolation params
  playerName?: string; // display name of the player who must choose
  selectionType?: 'TARGET_CHARACTER' | 'CHOOSE_FROM_HAND' | 'INFO_REVEAL' | 'CHOOSE_EFFECT' | 'DRAW_CARD' | 'CONFIRM_HIDE' | 'CONFIRM_DEFEAT'; // type of selection
  effectChoices?: Array<{ effectType: string; description: string }>; // for effect copy choice (Kakashi/Sakon)
  handCards?: Array<{ index: number; card: { name_fr: string; chakra?: number; power?: number; image_file?: string } }>; // for hand selection
  revealedCard?: { name_fr: string; chakra: number; power: number; image_file?: string; canSteal: boolean; revealTitleKey?: string; revealResultKey?: string }; // for info reveal (Orochimaru, Itachi, etc.)
  revealedCards?: Array<{ name_fr: string; chakra: number; power: number; image_file?: string; isSummon?: boolean; isDiscarded?: boolean }>; // for multi-card reveal (Tayuya 065, Sasuke 014, Itachi 091)
  // Dedicated confirm UIs (DRAW_CARD / CONFIRM_HIDE / CONFIRM_DEFEAT)
  deckSize?: number; // for DRAW_CARD: shows deck size
  confirmCardData?: { name_fr: string; name_en?: string; image_file?: string; chakra?: number; power?: number }; // for CONFIRM_HIDE / CONFIRM_DEFEAT
  onSelect: (targetId: string) => void;
  onDecline?: () => void; // for optional effects
  declineLabelKey?: string; // i18n key for the decline button label (overrides default 'game.board.skip')
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

  // Replay
  replayInitialState: GameState | null;

  // Animation queue
  animationQueue: AnimationEvent[];
  isAnimating: boolean;

  // Target selection
  pendingTargetSelection: PendingTargetSelection | null;

  // Sealed deck data (for saving after game)
  sealedDeckCardIds: string[] | null;
  sealedDeckMissionIds: string[] | null;

  // AI replay config
  lastAIGameConfig: { config: GameConfig; difficulty: AIDifficulty; playerName?: string } | null;

  // Action error feedback (e.g., name uniqueness violation)
  actionError: string | null;
  actionErrorKey: string | null;
  actionErrorParams: Record<string, string | number> | null;

  // Actions
  startAIGame: (config: GameConfig, difficulty: AIDifficulty, playerName?: string) => void;
  replayAIGame: () => void;
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
  clearActionError: () => void;
  setSealedDeck: (cardIds: string[], missionIds: string[]) => void;
  resetGame: () => void;
  endAIGameAsForfeit: () => void;
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
  replayInitialState: null,
  animationQueue: [],
  isAnimating: false,
  pendingTargetSelection: null,
  actionError: null,
  actionErrorKey: null,
  actionErrorParams: null,
  sealedDeckCardIds: null,
  sealedDeckMissionIds: null,
  lastAIGameConfig: null,

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
      const isEffectChoice = pendingAction.type === 'CHOOSE_EFFECT';
      const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
        pendingAction.type === 'DISCARD_CARD' ||
        pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

      // Build effect choices for copy-effect UI
      let effectChoices: PendingTargetSelection['effectChoices'];
      if (isEffectChoice) {
        effectChoices = pendingAction.options.map((opt) => {
          const sepIdx = opt.indexOf('::');
          return {
            effectType: sepIdx >= 0 ? opt.substring(0, sepIdx) : opt,
            description: sepIdx >= 0 ? opt.substring(sepIdx + 2) : '',
          };
        });
      }

      // Build hand card info for hand selection UI
      let handCards: PendingTargetSelection['handCards'];
      if (isHandSelection) {
        const tst = pendingEffect?.targetSelectionType ?? '';
        if (tst === 'KABUTO053_CHOOSE_FROM_DISCARD' || tst === 'SAKURA109_CHOOSE_DISCARD' || tst === 'RECOVER_FROM_DISCARD') {
          const playerDiscard = visibleState.myState.discardPile;
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
          // Cards drawn from deck are stored at end of discard pile; effectDescription JSON has info
          let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
          try { topCardsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').topCards ?? []; } catch { /* ignore */ }
          const playerDiscard = visibleState.myState.discardPile;
          const numDrawn = topCardsInfo.length || 3;
          const drawnCards = playerDiscard.slice(playerDiscard.length - numDrawn);
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = idx >= 0 && idx < drawnCards.length ? drawnCards[idx] : null;
            const info = idx >= 0 && idx < topCardsInfo.length ? topCardsInfo[idx] : null;
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : info ? {
                name_fr: info.name,
                chakra: info.chakra,
                power: info.power,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'TSUNADE104_CHOOSE_CHAKRA') {
          handCards = pendingAction.options.map((amountStr) => {
            const amount = parseInt(amountStr, 10);
            return {
              index: amount,
              card: {
                name_fr: amount === 0 ? 'Passer (0)' : `POWERUP ${amount}`,
                name_en: amount === 0 ? 'Skip (0)' : `POWERUP ${amount}`,
                chakra: amount,
                power: amount,
              },
            };
          });
        } else if (tst === 'SASUKE_014_DISCARD_OPPONENT') {
          // Source player selects from opponent's hand — card info stored in effectDescription
          let oppCards: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string }> = [];
          try { oppCards = JSON.parse(pendingEffect?.effectDescription ?? '{}').opponentCards ?? []; } catch { /* ignore */ }
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = oppCards[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                name_en: card.name_en,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SASUKE014_CHOOSE_HAND_CARD') {
          // Opponent's hand cards shown as face-down (card backs)
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            return {
              index: idx,
              card: { name_fr: `Carte ${idx + 1}`, image_file: '/images/card-back.webp' },
            };
          });
        } else {
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
      }

      // Detect dedicated confirm UIs
      const isSakura011Draw = pendingEffect?.targetSelectionType === 'SAKURA011_DRAW';
      const isKiba113ConfirmHide = pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_HIDE_AKAMARU' || pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU';

      // Detect info reveal types (Orochimaru, Itachi 091, Dosu look, Tayuya 065, etc.)
      const isOroReveal = pendingEffect?.targetSelectionType === 'OROCHIMARU_REVEAL_RESULT';
      const isItachi091Reveal = pendingEffect?.targetSelectionType === 'ITACHI091_HAND_REVEAL';
      const isDosuLookReveal = pendingEffect?.targetSelectionType === 'DOSU_LOOK_REVEAL';
      const isSasuke014Reveal = pendingEffect?.targetSelectionType === 'SASUKE014_HAND_REVEAL';
      const isTayuya065Reveal = pendingEffect?.targetSelectionType === 'TAYUYA065_UPGRADE_REVEAL';
      const isInfoReveal = isOroReveal || isItachi091Reveal || isDosuLookReveal || isSasuke014Reveal || isTayuya065Reveal;
      let revealedCard: PendingTargetSelection['revealedCard'];
      let revealedCards: PendingTargetSelection['revealedCards'];
      if (isInfoReveal && pendingEffect) {
        try {
          const rd = JSON.parse(pendingEffect.effectDescription);
          if (isOroReveal) {
            revealedCard = {
              name_fr: rd.cardName,
              chakra: rd.cardCost,
              power: rd.cardPower,
              image_file: rd.cardImageFile,
              canSteal: rd.canSteal,
            };
          } else if (isItachi091Reveal) {
            revealedCard = {
              name_fr: '',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.itachi091RevealTitle',
              revealResultKey: rd.isUpgrade
                ? 'game.effect.itachi091DiscardResult'
                : 'game.effect.itachi091RevealResult',
            };
            revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string; isDiscarded?: boolean }) => ({
              name_fr: c.name_fr,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
              isDiscarded: c.isDiscarded ?? false,
            }));
          } else if (isDosuLookReveal) {
            revealedCard = {
              name_fr: rd.cardName,
              chakra: rd.cardCost,
              power: rd.cardPower,
              image_file: rd.cardImageFile,
              canSteal: false,
              revealTitleKey: 'game.effect.dosuLookRevealTitle',
              revealResultKey: 'game.effect.dosuLookRevealResult',
            };
          } else if (isSasuke014Reveal) {
            revealedCard = {
              name_fr: '',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.sasuke014RevealTitle',
              revealResultKey: rd.isUpgrade
                ? 'game.effect.sasuke014DiscardResult'
                : 'game.effect.sasuke014RevealResult',
            };
            revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string }) => ({
              name_fr: c.name_fr,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
            }));
          } else if (isTayuya065Reveal) {
            revealedCard = {
              name_fr: 'Tayuya',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.tayuya065UpgradeRevealTitle',
              revealResultKey: rd.drawnCount > 0
                ? 'game.effect.tayuya065UpgradeRevealDrawn'
                : 'game.effect.tayuya065UpgradeRevealNone',
            };
            revealedCards = (rd.topCards ?? []).map((c: { name: string; chakra: number; power: number; image_file?: string; isSummon: boolean }) => ({
              name_fr: c.name,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
              isSummon: c.isSummon,
            }));
          }
        } catch { /* ignore */ }
      }

      // Build dedicated confirm UI data
      let deckSize: number | undefined;
      let confirmCardData: PendingTargetSelection['confirmCardData'];
      if (isSakura011Draw) {
        deckSize = visibleState.myState.deck?.length ?? 0;
      }
      if (isKiba113ConfirmHide && pendingEffect) {
        try {
          const cd = JSON.parse(pendingEffect.effectDescription);
          confirmCardData = {
            name_fr: cd.name_fr ?? '',
            name_en: cd.name_en,
            image_file: cd.image_file,
            chakra: cd.chakra,
            power: cd.power,
          };
        } catch { /* ignore */ }
      }

      set({
        visibleState,
        isProcessing: false,
        pendingTargetSelection: {
          validTargets: pendingAction.options,
          description: pendingAction.description,
          descriptionKey: pendingAction.descriptionKey,
          descriptionParams: pendingAction.descriptionParams,
          selectionType: isInfoReveal ? 'INFO_REVEAL' : isEffectChoice ? 'CHOOSE_EFFECT' : isHandSelection ? 'CHOOSE_FROM_HAND' : isSakura011Draw ? 'DRAW_CARD' : isKiba113ConfirmHide ? (pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU' ? 'CONFIRM_DEFEAT' : 'CONFIRM_HIDE') : 'TARGET_CHARACTER',
          effectChoices,
          handCards,
          revealedCard,
          revealedCards,
          deckSize,
          confirmCardData,
          playerName: get().playerDisplayNames[get().humanPlayer],
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
          declineLabelKey: pendingEffect?.targetSelectionType === 'DOSU069_OPPONENT_CHOICE'
            ? 'game.effect.dosu069Defeat'
            : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE'
              ? 'game.effect.gemma049DeclineDefeat'
              : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE'
                ? 'game.effect.gemma049DeclineHide'
                : undefined,
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

    // replayInitialState will be captured AFTER mulligans complete (deterministic point)
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
      replayInitialState: null,
      animationQueue: [],
      pendingTargetSelection: null,
      lastAIGameConfig: { config, difficulty, playerName },
    });

    // If AI goes first during mulligan, let it decide
    if (state.phase === 'mulligan') {
      // AI auto-decides mulligan
      const aiAction = ai.getAction(state);
      if (aiAction) {
        try {
          const newState = GameEngine.applyAction(state, aiPlayerSide, aiAction);
          const newVisible = GameEngine.getVisibleState(newState, humanPlayer);
          set({ gameState: newState, visibleState: newVisible });
        } catch (err) {
          console.error('[gameStore] AI mulligan error:', err);
        }
      }
    }
  },

  replayAIGame: () => {
    const { lastAIGameConfig } = get();
    if (!lastAIGameConfig) return;
    resetIdCounter();
    get().startAIGame(lastAIGameConfig.config, lastAIGameConfig.difficulty, lastAIGameConfig.playerName);
  },

  performAction: (action: GameAction) => {
    const { gameState, humanPlayer, aiPlayer, isAIGame, isOnlineGame, addAnimation } = get();

    // Online mode: send action to server via socket, don't apply locally
    if (isOnlineGame) {
      const socketState = useSocketStore.getState();
      if (socketState.socket && socketState.connected) {
        set({ isProcessing: true });
        socketState.performAction(action);

        // Safety timeout: if server doesn't respond in 10s, unblock the UI
        setTimeout(() => {
          if (get().isProcessing && get().isOnlineGame) {
            console.warn('[gameStore] Online action timeout — unblocking UI');
            set({ isProcessing: false });
          }
        }, 10000);
      } else {
        console.error('[gameStore] Cannot perform online action: socket not connected');
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

    let newState: GameState;
    try {
      newState = GameEngine.applyAction(gameState, humanPlayer, action);
    } catch (err) {
      console.error('[gameStore] performAction error:', err);
      set({ isProcessing: false });
      return;
    }

    // Detect rejected play actions.
    // Use log length instead of hand size: MAIN effects (e.g. Ebisu draw) can restore
    // hand size after a card is played, causing false "action not allowed" errors.
    // Every successful action adds at least one log entry; rejected actions add none.
    if (action.type === 'PLAY_CHARACTER' || action.type === 'PLAY_HIDDEN' || action.type === 'UPGRADE_CHARACTER') {
      const logGrew = newState.log.length > gameState.log.length;
      if (!logGrew) {
        // Action was rejected — get the specific validation reason
        let errorReason = '';
        let errorKey: string | null = null;
        let errorParams: Record<string, string | number> | null = null;
        if (action.type === 'PLAY_CHARACTER' && action.cardIndex < gameState[humanPlayer].hand.length) {
          const card = gameState[humanPlayer].hand[action.cardIndex];
          const effCost = calculateEffectiveCost(gameState, humanPlayer, card, action.missionIndex, false);
          const result = validatePlayCharacter(gameState, humanPlayer, card, action.missionIndex, effCost);
          errorReason = result.reason ?? '';
          errorKey = result.reasonKey ?? null;
          errorParams = result.reasonParams ?? null;
        } else if (action.type === 'PLAY_HIDDEN' && action.cardIndex < gameState[humanPlayer].hand.length) {
          const card = gameState[humanPlayer].hand[action.cardIndex];
          const result = validatePlayHidden(gameState, humanPlayer, card, action.missionIndex);
          errorReason = result.reason ?? '';
          errorKey = result.reasonKey ?? null;
          errorParams = result.reasonParams ?? null;
        } else if (action.type === 'UPGRADE_CHARACTER' && action.cardIndex < gameState[humanPlayer].hand.length) {
          errorReason = 'Invalid upgrade target.';
          errorKey = 'game.error.invalidUpgradeTarget';
        }
        set({
          isProcessing: false,
          actionError: errorReason || 'Action not allowed.',
          actionErrorKey: errorKey || 'game.error.actionNotAllowed',
          actionErrorParams: errorParams,
        });
        // Auto-clear error after 4 seconds
        setTimeout(() => {
          if (get().actionError) set({ actionError: null, actionErrorKey: null, actionErrorParams: null });
        }, 4000);
        return;
      }
    }

    // Capture replay initial state when mulligans complete (deterministic snapshot)
    // Mulligans use shuffle() which is non-deterministic, so we must capture AFTER.
    // Also reset the instance ID counter so all post-mulligan IDs are deterministic
    // from a known starting point, ensuring replay reconstruction matches.
    if (gameState.phase === 'mulligan' && newState.phase !== 'mulligan' && !get().replayInitialState) {
      resetIdCounter();
      const snapshot = deepClone(newState);
      snapshot.actionHistory = []; // Clear — replay starts from this point
      set({ replayInitialState: snapshot });
      // Reset actionHistory so only post-mulligan actions are recorded
      newState.actionHistory = [];
    }

    // Cap log at 500 entries to prevent unbounded growth
    if (newState.log.length > 500) {
      newState = { ...newState, log: newState.log.slice(-500) };
    }

    // Clear any previous error on successful action
    const newVisible = GameEngine.getVisibleState(newState, humanPlayer);

    set({
      gameState: newState,
      visibleState: newVisible,
      actionError: null,
      actionErrorKey: null,
      actionErrorParams: null,
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

    // Mission scoring complete — show scored state briefly, then auto-advance to End Phase
    if (newState.missionScoringComplete) {
      set({ isProcessing: false });
      setTimeout(() => {
        const currentGs = get().gameState;
        if (!currentGs || !currentGs.missionScoringComplete) return;
        const hp = get().humanPlayer;
        const advanced = GameEngine.applyAction(currentGs, hp, { type: 'ADVANCE_PHASE' });
        const vis = GameEngine.getVisibleState(advanced, hp);
        set({ gameState: advanced, visibleState: vis });
        if (advanced.phase === 'gameOver') {
          get().addAnimation({ type: 'game-end', data: { winner: GameEngine.getWinner(advanced) } });
          set({ gameOver: true, winner: GameEngine.getWinner(advanced), isProcessing: false });
        } else if (get().isAIGame && get().aiPlayer) {
          setTimeout(() => get().processAITurn(), 500);
        } else {
          set({ isProcessing: false });
        }
      }, 1500);
      return;
    }

    // Check if there are pending target selections for the human player
    const humanPending = newState.pendingActions.filter((p) => p.player === humanPlayer);
    if (humanPending.length > 0) {
      const pendingAction = humanPending[0];
      const pendingEffect = newState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);

      // Determine selection type for UI
      const isEffectChoice = pendingAction.type === 'CHOOSE_EFFECT';
      const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
        pendingAction.type === 'DISCARD_CARD' ||
        pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

      // Build effect choices for copy-effect UI
      let effectChoices: PendingTargetSelection['effectChoices'];
      if (isEffectChoice) {
        effectChoices = pendingAction.options.map((opt) => {
          const sepIdx = opt.indexOf('::');
          return {
            effectType: sepIdx >= 0 ? opt.substring(0, sepIdx) : opt,
            description: sepIdx >= 0 ? opt.substring(sepIdx + 2) : '',
          };
        });
      }

      // Build hand card info for hand selection UI
      let handCards: PendingTargetSelection['handCards'];
      if (isHandSelection) {
        const tst = pendingEffect?.targetSelectionType ?? '';
        // Sakura 109: indices are into the discard pile
        // Sakura 135: indices are into drawn cards stored at end of discard pile (use JSON description)
        if (tst === 'TSUNADE104_CHOOSE_CHAKRA') {
          handCards = pendingAction.options.map((amountStr) => {
            const amount = parseInt(amountStr, 10);
            return {
              index: amount,
              card: {
                name_fr: amount === 0 ? 'Passer (0)' : `POWERUP ${amount}`,
                name_en: amount === 0 ? 'Skip (0)' : `POWERUP ${amount}`,
                chakra: amount,
                power: amount,
              },
            };
          });
        } else if (tst === 'SAKURA109_CHOOSE_DISCARD' || tst === 'KABUTO053_CHOOSE_FROM_DISCARD') {
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
          // Cards are stored at end of discard pile; effectDescription JSON has topCards info
          let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
          try { topCardsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').topCards ?? []; } catch { /* ignore */ }
          const playerDiscard = newState[humanPlayer].discardPile;
          const numDrawn = topCardsInfo.length || 3;
          const drawnCards = playerDiscard.slice(playerDiscard.length - numDrawn);
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = idx >= 0 && idx < drawnCards.length ? drawnCards[idx] : null;
            const info = idx >= 0 && idx < topCardsInfo.length ? topCardsInfo[idx] : null;
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : info ? {
                name_fr: info.name,
                chakra: info.chakra,
                power: info.power,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SASUKE_014_DISCARD_OPPONENT') {
          // Source player selects from opponent's hand — card info stored in effectDescription
          let oppCards: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string }> = [];
          try { oppCards = JSON.parse(pendingEffect?.effectDescription ?? '{}').opponentCards ?? []; } catch { /* ignore */ }
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = oppCards[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr,
                name_en: card.name_en,
                chakra: card.chakra,
                power: card.power,
                image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SASUKE014_CHOOSE_HAND_CARD') {
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            return {
              index: idx,
              card: { name_fr: `Carte ${idx + 1}`, image_file: '/images/card-back.webp' },
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

      // Detect dedicated confirm UIs
      const isSakura011Draw = pendingEffect?.targetSelectionType === 'SAKURA011_DRAW';
      const isKiba113ConfirmHide = pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_HIDE_AKAMARU' || pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU';

      // Detect info reveal types (Orochimaru, Itachi 091, Dosu look, Sasuke 014, Tayuya 065, etc.)
      const isOroReveal = pendingEffect?.targetSelectionType === 'OROCHIMARU_REVEAL_RESULT';
      const isItachi091Reveal = pendingEffect?.targetSelectionType === 'ITACHI091_HAND_REVEAL';
      const isDosuLookReveal = pendingEffect?.targetSelectionType === 'DOSU_LOOK_REVEAL';
      const isSasuke014Reveal = pendingEffect?.targetSelectionType === 'SASUKE014_HAND_REVEAL';
      const isTayuya065Reveal = pendingEffect?.targetSelectionType === 'TAYUYA065_UPGRADE_REVEAL';
      const isInfoReveal = isOroReveal || isItachi091Reveal || isDosuLookReveal || isSasuke014Reveal || isTayuya065Reveal;
      let revealedCard: PendingTargetSelection['revealedCard'];
      let revealedCards: PendingTargetSelection['revealedCards'];
      if (isInfoReveal && pendingEffect) {
        try {
          const rd = JSON.parse(pendingEffect.effectDescription);
          if (isOroReveal) {
            revealedCard = {
              name_fr: rd.cardName,
              chakra: rd.cardCost,
              power: rd.cardPower,
              image_file: rd.cardImageFile,
              canSteal: rd.canSteal,
            };
          } else if (isItachi091Reveal) {
            revealedCard = {
              name_fr: '',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.itachi091RevealTitle',
              revealResultKey: rd.isUpgrade
                ? 'game.effect.itachi091DiscardResult'
                : 'game.effect.itachi091RevealResult',
            };
            revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string; isDiscarded?: boolean }) => ({
              name_fr: c.name_fr,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
              isDiscarded: c.isDiscarded ?? false,
            }));
          } else if (isDosuLookReveal) {
            revealedCard = {
              name_fr: rd.cardName,
              chakra: rd.cardCost,
              power: rd.cardPower,
              image_file: rd.cardImageFile,
              canSteal: false,
              revealTitleKey: 'game.effect.dosuLookRevealTitle',
              revealResultKey: 'game.effect.dosuLookRevealResult',
            };
          } else if (isSasuke014Reveal) {
            revealedCard = {
              name_fr: '',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.sasuke014RevealTitle',
              revealResultKey: rd.isUpgrade
                ? 'game.effect.sasuke014DiscardResult'
                : 'game.effect.sasuke014RevealResult',
            };
            revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string }) => ({
              name_fr: c.name_fr,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
            }));
          } else if (isTayuya065Reveal) {
            revealedCard = {
              name_fr: 'Tayuya',
              chakra: 0,
              power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.tayuya065UpgradeRevealTitle',
              revealResultKey: rd.drawnCount > 0
                ? 'game.effect.tayuya065UpgradeRevealDrawn'
                : 'game.effect.tayuya065UpgradeRevealNone',
            };
            revealedCards = (rd.topCards ?? []).map((c: { name: string; chakra: number; power: number; image_file?: string; isSummon: boolean }) => ({
              name_fr: c.name,
              chakra: c.chakra,
              power: c.power,
              image_file: c.image_file,
              isSummon: c.isSummon,
            }));
          }
        } catch { /* ignore */ }
      }

      // Build dedicated confirm UI data
      let deckSize: number | undefined;
      let confirmCardData: PendingTargetSelection['confirmCardData'];
      if (isSakura011Draw) {
        deckSize = newState[humanPlayer].deck?.length ?? 0;
      }
      if (isKiba113ConfirmHide && pendingEffect) {
        try {
          const cd = JSON.parse(pendingEffect.effectDescription);
          confirmCardData = {
            name_fr: cd.name_fr ?? '',
            name_en: cd.name_en,
            image_file: cd.image_file,
            chakra: cd.chakra,
            power: cd.power,
          };
        } catch { /* ignore */ }
      }

      set({
        isProcessing: false,
        pendingTargetSelection: {
          validTargets: pendingAction.options,
          description: pendingAction.description,
          descriptionKey: pendingAction.descriptionKey,
          descriptionParams: pendingAction.descriptionParams,
          selectionType: isInfoReveal ? 'INFO_REVEAL' : isEffectChoice ? 'CHOOSE_EFFECT' : isHandSelection ? 'CHOOSE_FROM_HAND' : isSakura011Draw ? 'DRAW_CARD' : isKiba113ConfirmHide ? (pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU' ? 'CONFIRM_DEFEAT' : 'CONFIRM_HIDE') : 'TARGET_CHARACTER',
          effectChoices,
          handCards,
          revealedCard,
          revealedCards,
          deckSize,
          confirmCardData,
          playerName: get().playerDisplayNames[get().humanPlayer],
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
          declineLabelKey: pendingEffect?.targetSelectionType === 'DOSU069_OPPONENT_CHOICE'
            ? 'game.effect.dosu069Defeat'
            : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE'
              ? 'game.effect.gemma049DeclineDefeat'
              : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE'
                ? 'game.effect.gemma049DeclineHide'
                : undefined,
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

    try {
      while (iterations < maxIterations) {
        // Check if AI has pending target selections to resolve first
        const aiPending = currentState.pendingActions.filter((p) => p.player === aiPlayer.player);
        if (aiPending.length > 0) {
          const pendingAction = aiPending[0];
          if (pendingAction.options.length > 0) {
            // Check if this is an optional effect the Easy AI might decline
            const pendingEffectForOpt = currentState.pendingEffects.find(
              (e) => e.id === pendingAction.sourceEffectId,
            );

            // Special handling for DOSU069_OPPONENT_CHOICE: AI decides whether to pay or let character be defeated
            if (pendingEffectForOpt?.targetSelectionType === 'DOSU069_OPPONENT_CHOICE' && pendingEffectForOpt.isOptional) {
              let shouldDecline = false;
              try {
                const parsed = JSON.parse(pendingEffectForOpt.effectDescription);
                const revealCost = parsed.revealCost ?? 0;
                const aiChakra = currentState[aiPlayer.player].chakra;
                // Easy: always decline, Medium: decline if cost > 60% chakra, Hard/Expert: decline if cost > 80% chakra
                if (aiPlayer.difficulty === 'easy') {
                  shouldDecline = true;
                } else if (aiPlayer.difficulty === 'medium') {
                  shouldDecline = revealCost > aiChakra * 0.6 || revealCost >= aiChakra;
                } else {
                  // Hard/Expert: decline if paying would leave very little chakra
                  shouldDecline = revealCost >= aiChakra || (aiChakra - revealCost) < 2;
                }
              } catch { shouldDecline = Math.random() < 0.5; }
              if (shouldDecline) {
                currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
                  type: 'DECLINE_OPTIONAL_EFFECT',
                  pendingEffectId: pendingEffectForOpt.id,
                });
                iterations++;
                continue;
              }
            } else if (pendingEffectForOpt?.isOptional && aiPlayer.difficulty === 'easy') {
              // Easy AI: 50% chance to decline optional effects
              if (Math.random() < 0.5) {
                currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
                  type: 'DECLINE_OPTIONAL_EFFECT',
                  pendingEffectId: pendingEffectForOpt.id,
                });
                iterations++;
                continue;
              }
            }

            // Smart AI target selection based on difficulty
            const selectedTarget = aiSelectTarget(
              pendingAction.options,
              pendingAction,
              currentState,
              aiPlayer.player,
              aiPlayer.difficulty,
            );
            currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
              type: 'SELECT_TARGET',
              pendingActionId: pendingAction.id,
              selectedTargets: [selectedTarget],
            });
            iterations++;
            continue;
          } else {
            // No valid targets — decline the optional effect or force-cleanup
            const pendingEffect = currentState.pendingEffects.find(
              (e) => e.id === pendingAction.sourceEffectId,
            );
            if (pendingEffect?.isOptional) {
              currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
                type: 'DECLINE_OPTIONAL_EFFECT',
                pendingEffectId: pendingEffect.id,
              });
            } else {
              // Non-optional effect with no valid targets — force cleanup to prevent freeze
              console.warn('[gameStore] AI: force-cleaning non-optional pending with no targets:', pendingAction.id);
              currentState = {
                ...currentState,
                pendingActions: currentState.pendingActions.filter((p) => p.id !== pendingAction.id),
                pendingEffects: pendingEffect
                  ? currentState.pendingEffects.filter((e) => e.id !== pendingEffect.id)
                  : currentState.pendingEffects,
              };
            }
            iterations++;
            continue;
          }
        }

        // If human has pending actions (from AI card effects), break to let them resolve
        const humanPending = currentState.pendingActions.filter((p) => p.player === humanPlayer);
        if (humanPending.length > 0) break;

        // Mission scoring complete — break to show scored state, then auto-advance
        if (currentState.missionScoringComplete) break;

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
    } catch (err) {
      console.error('[gameStore] processAITurn error:', err);
      // Force cleanup any dangling AI pending actions to prevent game freeze
      const danglingAIPending = currentState.pendingActions.filter((p) => p.player === aiPlayer.player);
      if (danglingAIPending.length > 0) {
        console.warn('[gameStore] Cleaning up', danglingAIPending.length, 'dangling AI pending actions after error');
        const danglingEffectIds = new Set(danglingAIPending.map((p) => p.sourceEffectId));
        currentState = {
          ...currentState,
          pendingActions: currentState.pendingActions.filter((p) => p.player !== aiPlayer.player),
          pendingEffects: currentState.pendingEffects.filter((e) => !danglingEffectIds.has(e.id)),
        };
      }
    }

    // Safety: if we hit max iterations with AI pending actions still present, clean up
    if (iterations >= maxIterations) {
      const stuckPending = currentState.pendingActions.filter((p) => p.player === aiPlayer.player);
      if (stuckPending.length > 0) {
        console.warn('[gameStore] AI hit max iterations with', stuckPending.length, 'pending actions — force cleanup');
        const stuckEffectIds = new Set(stuckPending.map((p) => p.sourceEffectId));
        currentState = {
          ...currentState,
          pendingActions: currentState.pendingActions.filter((p) => p.player !== aiPlayer.player),
          pendingEffects: currentState.pendingEffects.filter((e) => !stuckEffectIds.has(e.id)),
        };
      }
    }

    // Queue all collected AI animations
    for (const anim of aiAnimations) {
      addAnimation(anim);
    }

    const visible = GameEngine.getVisibleState(currentState, humanPlayer);

    // Mission scoring complete — show scored state, then auto-advance to End Phase
    if (currentState.missionScoringComplete) {
      set({
        gameState: currentState,
        visibleState: visible,
        isProcessing: false,
      });
      setTimeout(() => {
        const currentGs = get().gameState;
        if (!currentGs || !currentGs.missionScoringComplete) return;
        const hp = get().humanPlayer;
        const advanced = GameEngine.applyAction(currentGs, hp, { type: 'ADVANCE_PHASE' });
        const vis = GameEngine.getVisibleState(advanced, hp);
        set({ gameState: advanced, visibleState: vis });
        if (advanced.phase === 'gameOver') {
          get().addAnimation({ type: 'game-end', data: { winner: GameEngine.getWinner(advanced) } });
          set({ gameOver: true, winner: GameEngine.getWinner(advanced), isProcessing: false });
        } else if (get().isAIGame && get().aiPlayer) {
          setTimeout(() => get().processAITurn(), 500);
        } else {
          set({ isProcessing: false });
        }
      }, 1500);
      return;
    }

    // Check if there are pending target selections for the human player
    // (e.g. SCORE effects from mission phase that need human input)
    const humanPendingAfterAI = currentState.pendingActions.filter((p) => p.player === humanPlayer);
    if (humanPendingAfterAI.length > 0) {
      const pendingAction = humanPendingAfterAI[0];
      const pendingEffect = currentState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);

      const isEffectChoice = pendingAction.type === 'CHOOSE_EFFECT';
      const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
        pendingAction.type === 'DISCARD_CARD' ||
        pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

      let effectChoices: PendingTargetSelection['effectChoices'];
      if (isEffectChoice) {
        effectChoices = pendingAction.options.map((opt) => {
          const sepIdx = opt.indexOf('::');
          return {
            effectType: sepIdx >= 0 ? opt.substring(0, sepIdx) : opt,
            description: sepIdx >= 0 ? opt.substring(sepIdx + 2) : '',
          };
        });
      }

      let handCards: PendingTargetSelection['handCards'];
      if (isHandSelection) {
        const tst = pendingEffect?.targetSelectionType ?? '';
        if (tst === 'TSUNADE104_CHOOSE_CHAKRA') {
          handCards = pendingAction.options.map((amountStr) => {
            const amount = parseInt(amountStr, 10);
            return {
              index: amount,
              card: {
                name_fr: amount === 0 ? 'Passer (0)' : `POWERUP ${amount}`,
                name_en: amount === 0 ? 'Skip (0)' : `POWERUP ${amount}`,
                chakra: amount,
                power: amount,
              },
            };
          });
        } else if (tst === 'SAKURA109_CHOOSE_DISCARD' || tst === 'KABUTO053_CHOOSE_FROM_DISCARD') {
          const playerDiscard = currentState[humanPlayer].discardPile;
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = playerDiscard[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr, chakra: card.chakra, power: card.power, image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SAKURA135_CHOOSE_CARD') {
          let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
          try { topCardsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').topCards ?? []; } catch { /* ignore */ }
          const playerDiscard = currentState[humanPlayer].discardPile;
          const numDrawn = topCardsInfo.length || 3;
          const drawnCards = playerDiscard.slice(playerDiscard.length - numDrawn);
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = idx >= 0 && idx < drawnCards.length ? drawnCards[idx] : null;
            const info = idx >= 0 && idx < topCardsInfo.length ? topCardsInfo[idx] : null;
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr, chakra: card.chakra, power: card.power, image_file: card.image_file,
              } : info ? {
                name_fr: info.name, chakra: info.chakra, power: info.power,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SASUKE_014_DISCARD_OPPONENT') {
          // Source player selects from opponent's hand — card info stored in effectDescription
          let oppCards: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string }> = [];
          try { oppCards = JSON.parse(pendingEffect?.effectDescription ?? '{}').opponentCards ?? []; } catch { /* ignore */ }
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = oppCards[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr, name_en: card.name_en, chakra: card.chakra, power: card.power, image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        } else if (tst === 'SASUKE014_CHOOSE_HAND_CARD') {
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            return {
              index: idx,
              card: { name_fr: `Carte ${idx + 1}`, image_file: '/images/card-back.webp' },
            };
          });
        } else {
          const playerHand = currentState[humanPlayer].hand;
          handCards = pendingAction.options.map((indexStr) => {
            const idx = parseInt(indexStr, 10);
            const card = playerHand[idx];
            return {
              index: idx,
              card: card ? {
                name_fr: card.name_fr, chakra: card.chakra, power: card.power, image_file: card.image_file,
              } : { name_fr: '???' },
            };
          });
        }
      }

      // Detect dedicated confirm UIs
      const isSakura011DrawAI = pendingEffect?.targetSelectionType === 'SAKURA011_DRAW';
      const isKiba113ConfirmHideAI = pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_HIDE_AKAMARU' || pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU';

      // Detect info reveal types (Orochimaru, Itachi 091, Dosu look, Sasuke 014, Tayuya 065, etc.)
      const isOroRevealAI = pendingEffect?.targetSelectionType === 'OROCHIMARU_REVEAL_RESULT';
      const isItachi091RevealAI = pendingEffect?.targetSelectionType === 'ITACHI091_HAND_REVEAL';
      const isDosuLookRevealAI = pendingEffect?.targetSelectionType === 'DOSU_LOOK_REVEAL';
      const isSasuke014RevealAI = pendingEffect?.targetSelectionType === 'SASUKE014_HAND_REVEAL';
      const isTayuya065RevealAI = pendingEffect?.targetSelectionType === 'TAYUYA065_UPGRADE_REVEAL';
      const isInfoRevealAI = isOroRevealAI || isItachi091RevealAI || isDosuLookRevealAI || isSasuke014RevealAI || isTayuya065RevealAI;
      let revealedCardAI: PendingTargetSelection['revealedCard'];
      let revealedCardsAI: PendingTargetSelection['revealedCards'];
      if (isInfoRevealAI && pendingEffect) {
        try {
          const rd = JSON.parse(pendingEffect.effectDescription);
          if (isOroRevealAI) {
            revealedCardAI = {
              name_fr: rd.cardName, chakra: rd.cardCost, power: rd.cardPower,
              image_file: rd.cardImageFile, canSteal: rd.canSteal,
            };
          } else if (isItachi091RevealAI) {
            revealedCardAI = {
              name_fr: '', chakra: 0, power: 0, canSteal: false,
              revealTitleKey: 'game.effect.itachi091RevealTitle',
              revealResultKey: rd.isUpgrade ? 'game.effect.itachi091DiscardResult' : 'game.effect.itachi091RevealResult',
            };
            revealedCardsAI = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string; isDiscarded?: boolean }) => ({
              name_fr: c.name_fr, chakra: c.chakra, power: c.power, image_file: c.image_file, isDiscarded: c.isDiscarded ?? false,
            }));
          } else if (isDosuLookRevealAI) {
            revealedCardAI = {
              name_fr: rd.cardName, chakra: rd.cardCost, power: rd.cardPower,
              image_file: rd.cardImageFile, canSteal: false,
              revealTitleKey: 'game.effect.dosuLookRevealTitle',
              revealResultKey: 'game.effect.dosuLookRevealResult',
            };
          } else if (isSasuke014RevealAI) {
            revealedCardAI = {
              name_fr: '', chakra: 0, power: 0, canSteal: false,
              revealTitleKey: 'game.effect.sasuke014RevealTitle',
              revealResultKey: rd.isUpgrade ? 'game.effect.sasuke014DiscardResult' : 'game.effect.sasuke014RevealResult',
            };
            revealedCardsAI = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string }) => ({
              name_fr: c.name_fr, chakra: c.chakra, power: c.power, image_file: c.image_file,
            }));
          } else if (isTayuya065RevealAI) {
            revealedCardAI = {
              name_fr: 'Tayuya', chakra: 0, power: 0,
              canSteal: false,
              revealTitleKey: 'game.effect.tayuya065UpgradeRevealTitle',
              revealResultKey: rd.drawnCount > 0 ? 'game.effect.tayuya065UpgradeRevealDrawn' : 'game.effect.tayuya065UpgradeRevealNone',
            };
            revealedCardsAI = (rd.topCards ?? []).map((c: { name: string; chakra: number; power: number; image_file?: string; isSummon: boolean }) => ({
              name_fr: c.name, chakra: c.chakra, power: c.power, image_file: c.image_file, isSummon: c.isSummon,
            }));
          }
        } catch { /* ignore */ }
      }

      // Build dedicated confirm UI data
      let deckSizeAI: number | undefined;
      let confirmCardDataAI: PendingTargetSelection['confirmCardData'];
      if (isSakura011DrawAI) {
        deckSizeAI = currentState[humanPlayer].deck?.length ?? 0;
      }
      if (isKiba113ConfirmHideAI && pendingEffect) {
        try {
          const cd = JSON.parse(pendingEffect.effectDescription);
          confirmCardDataAI = {
            name_fr: cd.name_fr ?? '',
            name_en: cd.name_en,
            image_file: cd.image_file,
            chakra: cd.chakra,
            power: cd.power,
          };
        } catch { /* ignore */ }
      }

      set({
        gameState: currentState,
        visibleState: visible,
        isProcessing: false,
        pendingTargetSelection: {
          validTargets: pendingAction.options,
          description: pendingAction.description,
          descriptionKey: pendingAction.descriptionKey,
          descriptionParams: pendingAction.descriptionParams,
          selectionType: isInfoRevealAI ? 'INFO_REVEAL' : isEffectChoice ? 'CHOOSE_EFFECT' : isHandSelection ? 'CHOOSE_FROM_HAND' : isSakura011DrawAI ? 'DRAW_CARD' : isKiba113ConfirmHideAI ? (pendingEffect?.targetSelectionType === 'KIBA113_CONFIRM_DEFEAT_AKAMARU' ? 'CONFIRM_DEFEAT' : 'CONFIRM_HIDE') : 'TARGET_CHARACTER',
          effectChoices,
          handCards,
          revealedCard: revealedCardAI,
          revealedCards: revealedCardsAI,
          deckSize: deckSizeAI,
          confirmCardData: confirmCardDataAI,
          playerName: get().playerDisplayNames[humanPlayer],
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
          declineLabelKey: pendingEffect?.targetSelectionType === 'DOSU069_OPPONENT_CHOICE'
            ? 'game.effect.dosu069Defeat'
            : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE'
              ? 'game.effect.gemma049DeclineDefeat'
              : pendingEffect?.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE'
                ? 'game.effect.gemma049DeclineHide'
                : undefined,
        },
      });
      return;
    }

    // Check if game ended during pending action resolution in the AI loop
    // (e.g. End Phase pending → resolve → endGame, but loop exited before line 787 check)
    if (currentState.phase === 'gameOver') {
      for (const anim of aiAnimations) {
        addAnimation(anim);
      }
      addAnimation({
        type: 'game-end',
        data: { winner: GameEngine.getWinner(currentState) },
      });
      set({
        gameState: currentState,
        visibleState: visible,
        gameOver: true,
        winner: GameEngine.getWinner(currentState),
        isProcessing: false,
      });
      return;
    }

    set({
      gameState: currentState,
      visibleState: visible,
      isProcessing: false,
    });
  },

  addAnimation: (event) => {
    const id = `anim-${++animationIdCounter}`;
    const now = Date.now();
    const animEvent: AnimationEvent = {
      ...event,
      id,
      timestamp: now,
    };
    set((state) => ({
      // Prune old events (>10s) to prevent unbounded queue growth
      animationQueue: [
        ...state.animationQueue.filter((a) => now - a.timestamp < 10_000),
        animEvent,
      ],
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

  clearActionError: () => {
    set({ actionError: null });
  },

  setSealedDeck: (cardIds: string[], missionIds: string[]) => {
    set({ sealedDeckCardIds: cardIds, sealedDeckMissionIds: missionIds });
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
      replayInitialState: null,
      animationQueue: [],
      isAnimating: false,
      pendingTargetSelection: null,
      actionError: null,
      sealedDeckCardIds: null,
      sealedDeckMissionIds: null,
    });
  },

  endAIGameAsForfeit: () => {
    const { humanPlayer } = get();
    const winner = humanPlayer === 'player1' ? 'player2' : 'player1';
    set({ gameOver: true, winner });
  },
}));
