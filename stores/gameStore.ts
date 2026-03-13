'use client';

import { create } from 'zustand';
import type { GameState, GameAction, PlayerID, VisibleGameState, GameConfig, CharacterInPlay } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';
import { AIPlayer, type AIDifficulty } from '@/lib/ai/AIPlayer';
import { aiSelectTarget } from '@/lib/ai/targetSelection';
import { useSocketStore } from '@/lib/socket/client';
import { validatePlayCharacter, validatePlayHidden } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { deepClone } from '@/lib/engine/utils/deepClone';
import { resetIdCounter } from '@/lib/engine/utils/id';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUIStore } from '@/stores/uiStore';

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
  selectionType?: 'TARGET_CHARACTER' | 'CHOOSE_FROM_HAND' | 'INFO_REVEAL' | 'CHOOSE_EFFECT' | 'DRAW_CARD' | 'CONFIRM_HIDE' | 'CONFIRM_DEFEAT' | 'EFFECT_PLAY_UPGRADE_OR_FRESH' | 'EFFECT_CONFIRM' | 'CHOOSE_EFFECT_ORDER'; // type of selection
  effectChoices?: Array<{ effectType: string; description: string }>; // for effect copy choice (Kakashi/Sakon)
  handCards?: Array<{ index: number; card: { name_fr: string; name_en?: string; title_fr?: string; title_en?: string; chakra?: number; power?: number; image_file?: string; missionLabel?: string; id?: string; cardId?: string; number?: number; rarity?: string; keywords?: string[]; group?: string; effects?: Array<{ type: string; description: string }>; card_type?: string }; targetId?: string }>; // for hand selection
  revealedCard?: { name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; canSteal: boolean; revealTitleKey?: string; revealResultKey?: string }; // for info reveal (Orochimaru, Itachi, etc.)
  revealedCards?: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; isSummon?: boolean; isMatch?: boolean; isDiscarded?: boolean }>; // for multi-card reveal (Tayuya 065, Kiba 026, Sasuke 014, Itachi 091)
  // Dedicated confirm UIs (DRAW_CARD / CONFIRM_HIDE / CONFIRM_DEFEAT)
  deckSize?: number; // for DRAW_CARD: shows deck size
  confirmCardData?: { name_fr: string; name_en?: string; image_file?: string; chakra?: number; power?: number }; // for CONFIRM_HIDE / CONFIRM_DEFEAT
  // Effect ordering choice (multiple simultaneous effects)
  effectOrderChoices?: Array<{ effectId: string; sourceCardName: string; sourceCardImage?: string; effectType: string; description: string; descriptionKey?: string }>;
  onSelect: (targetId: string) => void;
  onDecline?: () => void; // for optional effects
  declineLabelKey?: string; // i18n key for the decline button label (overrides default 'game.board.skip')
  // Multi-select support (Kiba 026 / Tayuya 065 UPGRADE choose)
  isMultiSelect?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

interface GameStore {
  // Game state
  gameState: GameState | null;
  visibleState: VisibleGameState | null;
  humanPlayer: PlayerID;
  aiPlayer: AIPlayer | null;
  isAIGame: boolean;
  isHotseatGame: boolean;
  isSandboxMode: boolean;
  hotseatSwitchPending: boolean;
  hotseatNextPlayer: PlayerID | null;
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
  startHotseatGame: (config: GameConfig, player1Name: string, player2Name: string, sandbox?: boolean) => void;
  confirmHotseatSwitch: () => void;
  replayAIGame: () => void;
  startOnlineGame: (visibleState: VisibleGameState, playerRole: PlayerID, playerName?: string, opponentName?: string) => void;
  updateOnlineState: (visibleState: VisibleGameState) => void;
  endOnlineGame: (winner: string) => void;
  performAction: (action: GameAction) => void;
  processAITurn: () => void | Promise<void>;
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

  // Sandbox actions (free mode only)
  sandboxDrawCard: (deckIndex: number) => void;
  sandboxAddChakra: (amount: number) => void;
  sandboxDiscardFromHand: (handIndex: number) => void;
  sandboxDefeatCharacter: (missionIndex: number, instanceId: string) => void;
  sandboxMoveCharacter: (fromMission: number, instanceId: string, toMission: number) => void;
  sandboxMoveToTopDeck: (deckIndex: number) => void;
}

let animationIdCounter = 0;

// AI watchdog timer - detects if the AI is stuck and forces a retry
let aiWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

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

/**
 * Data source abstraction for building pending target selection UI.
 * Online mode provides VisibleGameState, local modes provide full GameState.
 */
interface PendingSelectionDataSource {
  playerHand: Array<{ name_fr: string; name_en?: string; chakra?: number; power?: number; image_file?: string }>;
  playerDiscard: Array<{ name_fr: string; name_en?: string; chakra?: number; power?: number; image_file?: string }>;
  playerDeckSize: number;
  activeMissions: Array<{ rank?: string }>;
}

interface PendingActionData {
  id: string;
  player: PlayerID;
  type: string;
  options: string[];
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string | number>;
  sourceEffectId?: string;
  minSelections?: number;
  maxSelections?: number;
}

interface PendingEffectData {
  id: string;
  targetSelectionType?: string;
  effectDescription: string;
  isOptional?: boolean;
}

/** Extract full card data for HandCardSelector so details/zoom work properly. */
function fullCardData(card: { name_fr: string; name_en?: string; title_fr?: string; title_en?: string; chakra?: number; power?: number; image_file?: string; id?: string; cardId?: string; number?: number; rarity?: string; keywords?: string[]; group?: string; effects?: Array<{ type: string; description: string }>; card_type?: string }) {
  return {
    name_fr: card.name_fr, name_en: card.name_en, title_fr: card.title_fr, title_en: card.title_en,
    chakra: card.chakra, power: card.power, image_file: card.image_file,
    id: card.id, cardId: card.cardId, number: card.number, rarity: card.rarity,
    keywords: card.keywords, group: card.group, effects: card.effects, card_type: card.card_type,
  };
}

/**
 * Shared utility: builds PendingTargetSelection UI from pending action/effect data.
 * Replaces 4 duplicated code paths (updateOnlineState, confirmHotseatSwitch, performAction, processAITurn).
 */
function buildPendingTargetSelectionUI(
  pendingAction: PendingActionData,
  pendingEffect: PendingEffectData | undefined,
  dataSource: PendingSelectionDataSource,
  playerName: string,
  onSelect: (targetId: string) => void,
  onDecline: () => void,
): PendingTargetSelection {
  const tst = pendingEffect?.targetSelectionType ?? '';

  // Determine selection type flags
  const isEffectChoice = pendingAction.type === 'CHOOSE_EFFECT';
  const isHandSelection = pendingAction.type === 'PUT_CARD_ON_DECK' ||
    pendingAction.type === 'DISCARD_CARD' ||
    pendingAction.type === 'CHOOSE_CARD_FROM_LIST';

  // Build effect choices for copy-effect UI (Kakashi/Sakon)
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
    if (tst === 'KABUTO053_CHOOSE_FROM_DISCARD' || tst === 'SAKURA109_CHOOSE_DISCARD' || tst === 'RECOVER_FROM_DISCARD') {
      handCards = pendingAction.options.map((indexStr) => {
        const idx = parseInt(indexStr, 10);
        const card = dataSource.playerDiscard[idx];
        return {
          index: idx,
          card: card ? fullCardData(card) : { name_fr: '???' },
        };
      });
    } else if (tst === 'SAKURA135_CHOOSE_CARD') {
      let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
      try { topCardsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').topCards ?? []; } catch { /* ignore */ }
      const numDrawn = topCardsInfo.length || 3;
      const drawnCards = dataSource.playerDiscard.slice(dataSource.playerDiscard.length - numDrawn);
      handCards = pendingAction.options.map((indexStr) => {
        const idx = parseInt(indexStr, 10);
        const card = idx >= 0 && idx < drawnCards.length ? drawnCards[idx] : null;
        const info = idx >= 0 && idx < topCardsInfo.length ? topCardsInfo[idx] : null;
        return {
          index: idx,
          card: card ? fullCardData(card) : info ? {
            name_fr: info.name, chakra: info.chakra, power: info.power,
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
            chakra: amount, power: amount,
          },
        };
      });
    } else if (tst === 'CHOOSE_TOKEN_AMOUNT_REMOVE' || tst === 'CHOOSE_TOKEN_AMOUNT_STEAL') {
      const isSteal = tst === 'CHOOSE_TOKEN_AMOUNT_STEAL';
      handCards = pendingAction.options.map((amountStr) => {
        const amount = parseInt(amountStr, 10);
        return {
          index: amount,
          card: {
            name_fr: isSteal ? `Voler ${amount} jeton(s)` : `Retirer ${amount} jeton(s)`,
            name_en: isSteal ? `Steal ${amount} token(s)` : `Remove ${amount} token(s)`,
            chakra: 0, power: amount,
          },
        };
      });
    } else if (tst === 'SASUKE_014_DISCARD_OPPONENT') {
      let oppCards: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string }> = [];
      try { oppCards = JSON.parse(pendingEffect?.effectDescription ?? '{}').cards ?? []; } catch { /* ignore */ }
      handCards = pendingAction.options.map((indexStr) => {
        const idx = parseInt(indexStr, 10);
        const card = oppCards[idx];
        return {
          index: idx,
          card: card ? fullCardData(card) : { name_fr: '???' },
        };
      });
    } else if (tst === 'ITACHI091_CHOOSE_DISCARD') {
      let oppCards091: Array<{ name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string }> = [];
      try { oppCards091 = JSON.parse(pendingEffect?.effectDescription ?? '{}').cards ?? []; } catch { /* ignore */ }
      handCards = pendingAction.options.map((indexStr) => {
        const idx = parseInt(indexStr, 10);
        const card = oppCards091[idx];
        return {
          index: idx,
          card: card ? fullCardData(card) : { name_fr: '???' },
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
    } else if (tst === 'TAYUYA125_CHOOSE_SOUND') {
      // Tayuya 125 UPGRADE: mix of hand indices and board:instanceId targets
      let hiddenCharsInfo125: Array<{ instanceId: string; name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; missionIndex: number }> = [];
      try { hiddenCharsInfo125 = JSON.parse(pendingEffect?.effectDescription ?? '{}').hiddenChars ?? []; } catch { /* ignore */ }
      const missionRanks125 = dataSource.activeMissions.map((m) => m.rank || '?');
      handCards = pendingAction.options.map((optStr, optIdx) => {
        if (optStr.startsWith('board:')) {
          const instId = optStr.slice(6);
          const hInfo = hiddenCharsInfo125.find((h) => h.instanceId === instId);
          const mLabel = hInfo ? (missionRanks125[hInfo.missionIndex] || `M${hInfo.missionIndex + 1}`) : '?';
          return {
            index: optIdx,
            targetId: optStr,
            card: hInfo ? {
              name_fr: hInfo.name_fr, name_en: hInfo.name_en, chakra: hInfo.chakra, power: hInfo.power,
              image_file: hInfo.image_file, missionLabel: `Mission ${mLabel} (hidden)`,
            } : { name_fr: '???', missionLabel: '?' },
          };
        } else {
          const idx = parseInt(optStr, 10);
          const card = dataSource.playerHand[idx];
          return {
            index: optIdx,
            targetId: optStr,
            card: card ? fullCardData(card) : { name_fr: '???' },
          };
        }
      });
    } else if (
      tst === 'JIRAIYA_CHOOSE_SUMMON' || tst === 'JIRAIYA008_CHOOSE_SUMMON' ||
      tst === 'JIRAIYA105_CHOOSE_SUMMON' || tst === 'JIRAIYA132_CHOOSE_SUMMON' ||
      tst === 'HIRUZEN002_CHOOSE_CARD'
    ) {
      let hiddenCharsInfo: Array<{ instanceId: string; name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; missionIndex: number }> = [];
      try { hiddenCharsInfo = JSON.parse(pendingEffect?.effectDescription ?? '{}').hiddenChars ?? []; } catch { /* ignore */ }
      const missionRanks = dataSource.activeMissions.map((m) => m.rank || '?');
      handCards = pendingAction.options.map((optStr, optIdx) => {
        if (optStr.startsWith('HIDDEN_')) {
          const instId = optStr.slice(7);
          const hInfo = hiddenCharsInfo.find((h) => h.instanceId === instId);
          const mLabel = hInfo ? (missionRanks[hInfo.missionIndex] || `M${hInfo.missionIndex + 1}`) : '?';
          return {
            index: optIdx,
            targetId: optStr,
            card: hInfo ? {
              name_fr: hInfo.name_fr, name_en: hInfo.name_en, chakra: hInfo.chakra, power: hInfo.power,
              image_file: hInfo.image_file, missionLabel: `Mission ${mLabel}`,
            } : { name_fr: '???', missionLabel: '?' },
          };
        } else {
          const rawIdx = optStr.startsWith('HAND_') ? optStr.slice(5) : optStr;
          const idx = parseInt(rawIdx, 10);
          const card = dataSource.playerHand[idx];
          return {
            index: optIdx,
            targetId: optStr,
            card: card ? fullCardData(card) : { name_fr: '???' },
          };
        }
      });
    } else {
      handCards = pendingAction.options.map((indexStr) => {
        const idx = parseInt(indexStr, 10);
        const card = dataSource.playerHand[idx];
        return {
          index: idx,
          card: card ? fullCardData(card) : { name_fr: '???' },
        };
      });
    }
  }

  // Detect dedicated confirm UIs
  const isSakura011Draw = tst === 'SAKURA011_DRAW' || tst === 'HAKU088_CONFIRM_DRAW';
  const isKiba113ConfirmHide = tst === 'KIBA113_CONFIRM_HIDE_AKAMARU' || tst === 'KIBA113_CONFIRM_DEFEAT_AKAMARU';
  const isEffectConfirm = tst.includes('_CONFIRM_') && !isKiba113ConfirmHide && !isSakura011Draw;

  // Detect info reveal types
  const isOroReveal = tst === 'OROCHIMARU_REVEAL_RESULT';
  const isItachi091Reveal = tst === 'ITACHI091_HAND_REVEAL';
  const isDosuLookReveal = tst === 'DOSU_LOOK_REVEAL';
  const isSasuke014Reveal = tst === 'SASUKE014_HAND_REVEAL' || tst === 'SASUKE014_UPGRADE_HAND_REVEAL';
  const isTayuya065Reveal = tst === 'TAYUYA065_UPGRADE_REVEAL';
  const isKiba026Reveal = tst === 'KIBA026_UPGRADE_REVEAL';
  const isTayuya065Choose = tst === 'TAYUYA065_UPGRADE_CHOOSE';
  const isKiba026Choose = tst === 'KIBA026_UPGRADE_CHOOSE';
  const isMultiSelectChoose = isTayuya065Choose || isKiba026Choose;
  const isInfoReveal = isOroReveal || isItachi091Reveal || isDosuLookReveal || isSasuke014Reveal || isTayuya065Reveal || isKiba026Reveal;

  let revealedCard: PendingTargetSelection['revealedCard'];
  let revealedCards: PendingTargetSelection['revealedCards'];
  if (isInfoReveal && pendingEffect) {
    try {
      const rd = JSON.parse(pendingEffect.effectDescription);
      if (isOroReveal) {
        revealedCard = {
          name_fr: rd.cardName, chakra: rd.cardCost, power: rd.cardPower,
          image_file: rd.cardImageFile, canSteal: rd.canSteal,
        };
      } else if (isItachi091Reveal) {
        revealedCard = {
          name_fr: '', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.itachi091RevealTitle',
          revealResultKey: 'game.effect.itachi091RevealResult',
        };
        revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string; isDiscarded?: boolean }) => ({
          name_fr: c.name_fr, chakra: c.chakra, power: c.power, image_file: c.image_file, isDiscarded: c.isDiscarded ?? false,
        }));
      } else if (isDosuLookReveal) {
        revealedCard = {
          name_fr: rd.cardName, chakra: rd.cardCost, power: rd.cardPower,
          image_file: rd.cardImageFile, canSteal: false,
          revealTitleKey: 'game.effect.dosuLookRevealTitle',
          revealResultKey: 'game.effect.dosuLookRevealResult',
        };
      } else if (isSasuke014Reveal) {
        revealedCard = {
          name_fr: '', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.sasuke014RevealTitle',
          revealResultKey: 'game.effect.sasuke014RevealResult',
        };
        revealedCards = (rd.cards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string }) => ({
          name_fr: c.name_fr, chakra: c.chakra, power: c.power, image_file: c.image_file,
        }));
      } else if (isTayuya065Reveal) {
        revealedCard = {
          name_fr: 'Tayuya', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.tayuya065UpgradeRevealTitle',
          revealResultKey: rd.drawnCount > 0 ? 'game.effect.tayuya065UpgradeRevealDrawn' : 'game.effect.tayuya065UpgradeRevealNone',
        };
        revealedCards = (rd.topCards ?? []).map((c: { name: string; chakra: number; power: number; image_file?: string; isSummon: boolean }) => ({
          name_fr: c.name, chakra: c.chakra, power: c.power, image_file: c.image_file, isSummon: c.isSummon,
        }));
      } else if (isKiba026Reveal) {
        revealedCard = {
          name_fr: 'Kiba Inuzuka', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.kiba026UpgradeRevealTitle',
          revealResultKey: rd.topCards?.some((c: { isMatch?: boolean }) => c.isMatch)
            ? 'game.effect.kiba026UpgradeRevealFound' : 'game.effect.kiba026UpgradeRevealNone',
        };
        revealedCards = (rd.topCards ?? []).map((c: { name_fr: string; chakra: number; power: number; image_file?: string; isMatch?: boolean }) => ({
          name_fr: c.name_fr, chakra: c.chakra, power: c.power, image_file: c.image_file, isMatch: c.isMatch,
        }));
      }
    } catch { /* ignore */ }
  }

  // Build revealedCards for multi-select CHOOSE types (Kiba 026 / Tayuya 065 UPGRADE)
  if (isMultiSelectChoose && pendingEffect) {
    try {
      const rd = JSON.parse(pendingEffect.effectDescription);
      if (isKiba026Choose) {
        revealedCard = {
          name_fr: 'Kiba Inuzuka', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.kiba026UpgradeChooseTitle',
          revealResultKey: 'game.effect.kiba026UpgradeChooseHint',
        };
      } else {
        revealedCard = {
          name_fr: 'Tayuya', chakra: 0, power: 0, canSteal: false,
          revealTitleKey: 'game.effect.tayuya065UpgradeChooseTitle',
          revealResultKey: 'game.effect.tayuya065UpgradeChooseHint',
        };
      }
      revealedCards = (rd.topCards ?? []).map((c: { name_fr?: string; name?: string; chakra: number; power: number; image_file?: string; isSummon?: boolean; isMatch?: boolean }) => ({
        name_fr: c.name_fr ?? c.name ?? '???', chakra: c.chakra, power: c.power,
        image_file: c.image_file, isSummon: c.isSummon, isMatch: c.isMatch,
      }));
    } catch { /* ignore */ }
  }

  // Build dedicated confirm UI data
  let deckSize: number | undefined;
  let confirmCardData: PendingTargetSelection['confirmCardData'];
  if (isSakura011Draw) {
    deckSize = dataSource.playerDeckSize;
  }
  if (isKiba113ConfirmHide && pendingEffect) {
    try {
      const cd = JSON.parse(pendingEffect.effectDescription);
      confirmCardData = {
        name_fr: cd.name_fr ?? '', name_en: cd.name_en,
        image_file: cd.image_file, chakra: cd.chakra, power: cd.power,
      };
    } catch { /* ignore */ }
  }

  // Determine selection type
  const selectionType: PendingTargetSelection['selectionType'] = isInfoReveal
    ? 'INFO_REVEAL'
    : isEffectChoice ? 'CHOOSE_EFFECT'
    : isHandSelection ? 'CHOOSE_FROM_HAND'
    : isSakura011Draw ? 'DRAW_CARD'
    : isKiba113ConfirmHide ? (tst === 'KIBA113_CONFIRM_DEFEAT_AKAMARU' ? 'CONFIRM_DEFEAT' : 'CONFIRM_HIDE')
    : (tst === 'EFFECT_PLAY_UPGRADE_OR_FRESH' || tst === 'HIRUZEN002_UPGRADE_OR_FRESH') ? 'EFFECT_PLAY_UPGRADE_OR_FRESH'
    : isEffectConfirm ? 'EFFECT_CONFIRM'
    : 'TARGET_CHARACTER';

  // Build decline label key for specific effects
  let declineLabelKey: string | undefined;
  if (tst === 'DOSU069_OPPONENT_CHOICE') {
    declineLabelKey = 'game.effect.dosu069Defeat';
  } else if (tst === 'GEMMA049_SACRIFICE_CHOICE') {
    declineLabelKey = 'game.effect.gemma049DeclineDefeat';
  } else if (tst === 'GEMMA049_SACRIFICE_HIDE_CHOICE') {
    declineLabelKey = 'game.effect.gemma049DeclineHide';
  } else if (tst === 'GEMMA049_CHOOSE_PROTECT_HIDE') {
    declineLabelKey = 'game.effect.gemma049DeclineHide';
  } else if (tst === 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT') {
    declineLabelKey = 'game.effect.dosu069Defeat';
  }

  return {
    validTargets: pendingAction.options,
    description: pendingAction.description,
    descriptionKey: pendingAction.descriptionKey,
    descriptionParams: pendingAction.descriptionParams,
    selectionType,
    effectChoices,
    handCards,
    revealedCard,
    revealedCards,
    deckSize,
    confirmCardData,
    playerName,
    onSelect,
    onDecline: isMultiSelectChoose ? onDecline : (pendingEffect?.isOptional ? onDecline : undefined),
    declineLabelKey: isMultiSelectChoose ? 'game.board.skip' : declineLabelKey,
    isMultiSelect: isMultiSelectChoose || undefined,
    minSelections: isMultiSelectChoose ? (pendingAction.minSelections ?? 0) : undefined,
    maxSelections: isMultiSelectChoose ? (pendingAction.maxSelections ?? 1) : undefined,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  visibleState: null,
  humanPlayer: 'player1',
  aiPlayer: null,
  isAIGame: false,
  isHotseatGame: false,
  isSandboxMode: false,
  hotseatSwitchPending: false,
  hotseatNextPlayer: null,
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

      const dataSource: PendingSelectionDataSource = {
        playerHand: visibleState.myState.hand ?? [],
        playerDiscard: visibleState.myState.discardPile ?? [],
        playerDeckSize: visibleState.myState.deck?.length ?? 0,
        activeMissions: (visibleState.activeMissions ?? []).map((m: any) => ({ rank: m.rank })),
      };

      const pendingSelection = buildPendingTargetSelectionUI(
        pendingAction, pendingEffect, dataSource,
        get().playerDisplayNames[humanPlayer],
        (targetId: string) => {
          get().performAction({
            type: 'SELECT_TARGET',
            pendingActionId: pendingAction.id,
            selectedTargets: [targetId],
          });
        },
        () => {
          if (pendingEffect) {
            get().performAction({
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pendingEffect.id,
            });
          }
        },
      );

      set({
        visibleState,
        isProcessing: false,
        pendingTargetSelection: pendingSelection,
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
    // Disable training mode when starting a normal AI game
    // (training page will re-enable it explicitly after calling startAIGame)
    useTrainingStore.getState().disable();

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

  startHotseatGame: (config: GameConfig, player1Name: string, player2Name: string, sandbox?: boolean) => {
    useTrainingStore.getState().disable();
    const state = GameEngine.createGame(config);
    const visible = GameEngine.getVisibleState(state, 'player1');

    set({
      gameState: state,
      visibleState: visible,
      humanPlayer: 'player1',
      aiPlayer: null,
      isAIGame: false,
      isHotseatGame: true,
      isSandboxMode: !!sandbox,
      hotseatSwitchPending: false,
      hotseatNextPlayer: null,
      isOnlineGame: false,
      isProcessing: false,
      gameOver: false,
      winner: null,
      playerDisplayNames: { player1: player1Name, player2: player2Name },
      replayInitialState: null,
      animationQueue: [],
      pendingTargetSelection: null,
      lastAIGameConfig: null,
    });
  },

  confirmHotseatSwitch: () => {
    const { gameState, hotseatNextPlayer, playerDisplayNames } = get();
    if (!gameState || !hotseatNextPlayer) return;

    const newPlayer = hotseatNextPlayer;
    const visible = GameEngine.getVisibleState(gameState, newPlayer);

    set({
      humanPlayer: newPlayer,
      visibleState: visible,
      hotseatSwitchPending: false,
      hotseatNextPlayer: null,
      pendingTargetSelection: null,
    });

    // Check for pending actions for the new player
    const pendingActions = gameState.pendingActions.filter((p) => p.player === newPlayer);
    if (pendingActions.length > 0) {
      // Detect multiple simultaneous effects from DIFFERENT source cards
      // When 2+ pending effects exist with different sourceInstanceIds, the player should choose order
      if (pendingActions.length >= 2) {
        const pendingEffectsForPlayer = pendingActions
          .map((pa) => gameState.pendingEffects.find((e) => e.id === pa.sourceEffectId))
          .filter((e): e is NonNullable<typeof e> => !!e);
        const uniqueSourceIds = new Set(pendingEffectsForPlayer.map((e) => e.sourceInstanceId));
        if (uniqueSourceIds.size >= 2) {
          // Multiple effects from different cards — show effect order choice
          const effectOrderChoices = pendingActions.map((pa) => {
            const pe = gameState.pendingEffects.find((e) => e.id === pa.sourceEffectId);
            const charResult = pe?.sourceInstanceId
              ? (() => {
                  for (const m of gameState.activeMissions) {
                    for (const c of [...m.player1Characters, ...m.player2Characters]) {
                      if (c.instanceId === pe.sourceInstanceId) {
                        const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
                        return top;
                      }
                    }
                  }
                  return null;
                })()
              : null;
            return {
              effectId: pe?.id ?? pa.id,
              sourceCardName: charResult?.name_fr ?? pe?.sourceCardId ?? '???',
              sourceCardImage: charResult?.image_file ?? undefined,
              effectType: pe?.effectType ?? 'MAIN',
              description: pa.description,
              descriptionKey: pa.descriptionKey,
            };
          });

          const orderSelection: PendingTargetSelection = {
            validTargets: effectOrderChoices.map((c) => c.effectId),
            description: 'Multiple effects triggered simultaneously. Choose which to resolve first.',
            descriptionKey: 'game.effect.desc.chooseEffectOrder',
            playerName: playerDisplayNames[newPlayer],
            selectionType: 'CHOOSE_EFFECT_ORDER',
            effectOrderChoices,
            onSelect: (effectId: string) => {
              get().performAction({
                type: 'REORDER_EFFECTS',
                selectedEffectId: effectId,
              });
            },
          };

          set({ isProcessing: false, pendingTargetSelection: orderSelection });
          return;
        }
      }

      const pa = pendingActions[0];
      const pe = gameState.pendingEffects.find((e) => e.id === pa.sourceEffectId);

      const dataSource: PendingSelectionDataSource = {
        playerHand: gameState[newPlayer].hand ?? [],
        playerDiscard: gameState[newPlayer].discardPile ?? [],
        playerDeckSize: gameState[newPlayer].deck?.length ?? 0,
        activeMissions: (gameState.activeMissions ?? []).map((m) => ({ rank: m.rank })),
      };

      const pendingSelection = buildPendingTargetSelectionUI(
        pa, pe, dataSource, playerDisplayNames[newPlayer],
        (targetId: string) => {
          get().performAction({
            type: 'SELECT_TARGET',
            pendingActionId: pa.id,
            selectedTargets: [targetId],
          });
        },
        () => {
          if (pe) {
            get().performAction({
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pe.id,
            });
          }
        },
      );

      set({ isProcessing: false, pendingTargetSelection: pendingSelection });
      return;
    }

    set({ isProcessing: false });
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
        // For mulligan, don't block UI - the MulliganDialog uses hasMulliganed from server state
        const skipProcessingBlock = action.type === 'MULLIGAN';
        if (!skipProcessingBlock) {
          set({ isProcessing: true });
        }
        socketState.performAction(action);

        // Safety timeout: if server doesn't respond in 10s, unblock the UI
        if (!skipProcessingBlock) {
          setTimeout(() => {
            if (get().isProcessing && get().isOnlineGame) {
              console.warn('[gameStore] Online action timeout - unblocking UI');
              set({ isProcessing: false });
            }
          }, 10000);
        }
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
        // Action was rejected - get the specific validation reason
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
      snapshot.actionHistory = []; // Clear - replay starts from this point
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

    // Mission scoring complete - show scored state briefly, then auto-advance to End Phase
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
          setTimeout(() => {
            void get().processAITurn();
          }, 500);
        } else {
          // Check for pending actions (e.g., Rock Lee 117 end-phase move with multiple destinations)
          const humanPendingEndPhase = advanced.pendingActions.filter((p: { player: string }) => p.player === hp);
          if (humanPendingEndPhase.length > 0) {
            const pa = humanPendingEndPhase[0];
            const pe = advanced.pendingEffects.find((e: { id: string }) => e.id === pa.sourceEffectId);
            const ds: PendingSelectionDataSource = {
              playerHand: advanced[hp].hand ?? [],
              playerDiscard: advanced[hp].discardPile ?? [],
              playerDeckSize: advanced[hp].deck?.length ?? 0,
              activeMissions: (advanced.activeMissions ?? []).map((m: { rank: string }) => ({ rank: m.rank })),
            };
            const sel = buildPendingTargetSelectionUI(
              pa, pe, ds, get().playerDisplayNames[hp],
              (targetId: string) => {
                get().performAction({
                  type: 'SELECT_TARGET',
                  pendingActionId: pa.id,
                  selectedTargets: [targetId],
                });
              },
              () => {
                if (pe) {
                  get().performAction({
                    type: 'DECLINE_OPTIONAL_EFFECT',
                    pendingEffectId: pe.id,
                  });
                }
              },
            );
            set({ isProcessing: false, pendingTargetSelection: sel });
          } else if (get().isHotseatGame) {
            const nextPlayer = advanced.activePlayer;
            if (nextPlayer !== hp) {
              set({ hotseatNextPlayer: nextPlayer, isProcessing: false });
              setTimeout(() => get().confirmHotseatSwitch(), 400);
            } else {
              set({ isProcessing: false });
            }
          } else if (get().isAIGame && get().aiPlayer) {
            setTimeout(() => {
              void get().processAITurn();
            }, 500);
          } else {
            set({ isProcessing: false });
          }
        }
      }, 1500);
      return;
    }

    // Check if there are pending target selections for the human player
    const humanPending = newState.pendingActions.filter((p) => p.player === humanPlayer);
    if (humanPending.length > 0) {
      const pendingAction = humanPending[0];
      const pendingEffect = newState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);

      const dataSource: PendingSelectionDataSource = {
        playerHand: newState[humanPlayer].hand ?? [],
        playerDiscard: newState[humanPlayer].discardPile ?? [],
        playerDeckSize: newState[humanPlayer].deck?.length ?? 0,
        activeMissions: (newState.activeMissions ?? []).map((m) => ({ rank: m.rank })),
      };

      const pendingSelection = buildPendingTargetSelectionUI(
        pendingAction, pendingEffect, dataSource,
        get().playerDisplayNames[humanPlayer],
        (targetId: string) => {
          get().performAction({
            type: 'SELECT_TARGET',
            pendingActionId: pendingAction.id,
            selectedTargets: [targetId],
          });
        },
        () => {
          if (pendingEffect) {
            get().performAction({
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pendingEffect.id,
            });
          }
        },
      );

      set({ isProcessing: false, pendingTargetSelection: pendingSelection });
      return;
    }

    // Hotseat: check if the other player needs to act next
    if (get().isHotseatGame) {
      const otherPlayer: PlayerID = humanPlayer === 'player1' ? 'player2' : 'player1';
      const otherPending = newState.pendingActions.filter((p) => p.player === otherPlayer);

      // During mulligan: if current player has mulliganed but the other hasn't, switch
      const mulliganSwitch = newState.phase === 'mulligan' &&
        newState[humanPlayer].hasMulliganed && !newState[otherPlayer].hasMulliganed;

      const needsSwitch = otherPending.length > 0 || mulliganSwitch ||
        (newState.phase !== 'mulligan' && newState.activePlayer !== humanPlayer && (newState.phase as string) !== 'gameOver');

      if (needsSwitch) {
        set({ hotseatNextPlayer: otherPlayer, isProcessing: false });
        setTimeout(() => get().confirmHotseatSwitch(), 400);
      } else {
        set({ isProcessing: false });
      }
      return;
    }

    // Process AI response if needed
    if (isAIGame && aiPlayer) {
      // Delay scales with whether there was an animation
      const delay = animEvent ? 1000 : 500;
      setTimeout(() => {
        void get().processAITurn();
      }, delay);
    } else {
      set({ isProcessing: false });
    }
  },

  processAITurn: async () => {
    const { gameState, humanPlayer, aiPlayer, addAnimation } = get();
    if (!gameState || !aiPlayer) {
      set({ isProcessing: false });
      return;
    }

    // Clear any existing watchdog and set a new one.
    // If processAITurn doesn't complete within 8s, force retry.
    if (aiWatchdogTimer) clearTimeout(aiWatchdogTimer);
    aiWatchdogTimer = setTimeout(() => {
      const s = get();
      if (!s.isAIGame || s.gameOver || !s.gameState || !s.aiPlayer) return;
      const gs = s.gameState;
      // Only intervene if it's the AI's turn and the game appears stuck
      if (gs.activePlayer === s.aiPlayer.player && gs.phase !== 'gameOver' && !s.isProcessing) {
        console.warn('[gameStore] AI watchdog: game appears stuck, forcing processAITurn retry');
        // Clean stale pending effects that have no matching pending actions
        if (gs.pendingEffects.length > 0 && gs.pendingActions.length === 0) {
          set({ gameState: { ...gs, pendingEffects: [] } });
        }
        void get().processAITurn();
      }
    }, 8000);

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
          // Handle simultaneous effects from different source cards — AI just picks first
          if (aiPending.length >= 2) {
            const aiPendingEffects = aiPending
              .map((pa) => currentState.pendingEffects.find((e) => e.id === pa.sourceEffectId))
              .filter((e): e is NonNullable<typeof e> => !!e);
            const uniqueSources = new Set(aiPendingEffects.map((e) => e.sourceInstanceId));
            if (uniqueSources.size >= 2) {
              // AI auto-selects first effect (FIFO order)
              currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
                type: 'REORDER_EFFECTS',
                selectedEffectId: aiPendingEffects[0].id,
              });
              iterations++;
              continue;
            }
          }
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
                // Easy: always decline, Medium: decline if cost > 60% chakra, Hard/Impossible: decline if cost > 80% chakra
                if (aiPlayer.difficulty === 'easy') {
                  shouldDecline = true;
                } else if (aiPlayer.difficulty === 'medium') {
                  shouldDecline = revealCost > aiChakra * 0.6 || revealCost >= aiChakra;
                } else {
                  // Hard/Impossible: decline if paying would leave very little chakra
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
            // No valid targets - decline the optional effect or force-cleanup
            const pendingEffect = currentState.pendingEffects.find(
              (e) => e.id === pendingAction.sourceEffectId,
            );
            if (pendingEffect?.isOptional) {
              currentState = GameEngine.applyAction(currentState, aiPlayer.player, {
                type: 'DECLINE_OPTIONAL_EFFECT',
                pendingEffectId: pendingEffect.id,
              });
            } else {
              // Non-optional effect with no valid targets - force cleanup to prevent freeze
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

        // Mission scoring complete - break to show scored state, then auto-advance
        if (currentState.missionScoringComplete) break;

        // Check if it's the AI's turn
        const aiActions = GameEngine.getValidActions(currentState, aiPlayer.player);
        if (aiActions.length === 0) break;

        // Check if human also needs to act (during mulligan both can act)
        if (currentState.phase !== 'mulligan') {
          const humanActions = GameEngine.getValidActions(currentState, humanPlayer);
          if (humanActions.length > 0 && currentState.activePlayer === humanPlayer) break;
        }

        const aiAction = await aiPlayer.getActionAsync(currentState);
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
        console.warn('[gameStore] AI hit max iterations with', stuckPending.length, 'pending actions - force cleanup');
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

    // Mission scoring complete - show scored state, then auto-advance to End Phase
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
          setTimeout(() => {
            void get().processAITurn();
          }, 500);
        } else {
          // Check for pending actions (e.g., Rock Lee 117 end-phase move)
          const humanPendingEnd = advanced.pendingActions.filter((p: { player: string }) => p.player === hp);
          if (humanPendingEnd.length > 0) {
            const pa2 = humanPendingEnd[0];
            const pe2 = advanced.pendingEffects.find((e: { id: string }) => e.id === pa2.sourceEffectId);
            const ds2: PendingSelectionDataSource = {
              playerHand: advanced[hp].hand ?? [],
              playerDiscard: advanced[hp].discardPile ?? [],
              playerDeckSize: advanced[hp].deck?.length ?? 0,
              activeMissions: (advanced.activeMissions ?? []).map((m: { rank: string }) => ({ rank: m.rank })),
            };
            const sel2 = buildPendingTargetSelectionUI(
              pa2, pe2, ds2, get().playerDisplayNames[hp],
              (targetId: string) => {
                get().performAction({
                  type: 'SELECT_TARGET',
                  pendingActionId: pa2.id,
                  selectedTargets: [targetId],
                });
              },
              () => {
                if (pe2) {
                  get().performAction({
                    type: 'DECLINE_OPTIONAL_EFFECT',
                    pendingEffectId: pe2.id,
                  });
                }
              },
            );
            set({ isProcessing: false, pendingTargetSelection: sel2 });
          } else if (get().isAIGame && get().aiPlayer) {
            setTimeout(() => {
              void get().processAITurn();
            }, 500);
          } else {
            set({ isProcessing: false });
          }
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

      const dataSource: PendingSelectionDataSource = {
        playerHand: currentState[humanPlayer].hand ?? [],
        playerDiscard: currentState[humanPlayer].discardPile ?? [],
        playerDeckSize: currentState[humanPlayer].deck?.length ?? 0,
        activeMissions: (currentState.activeMissions ?? []).map((m) => ({ rank: m.rank })),
      };

      const pendingSelection = buildPendingTargetSelectionUI(
        pendingAction, pendingEffect, dataSource,
        get().playerDisplayNames[humanPlayer],
        (targetId: string) => {
          get().performAction({
            type: 'SELECT_TARGET',
            pendingActionId: pendingAction.id,
            selectedTargets: [targetId],
          });
        },
        () => {
          if (pendingEffect) {
            get().performAction({
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: pendingEffect.id,
            });
          }
        },
      );

      set({
        gameState: currentState,
        visibleState: visible,
        isProcessing: false,
        pendingTargetSelection: pendingSelection,
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

    // Safety: if it's still the AI's turn after the loop exits, schedule another
    // processAITurn call. This handles edge cases where phase transitions, effect
    // cleanup, or max iterations left the AI as the active player with no immediate
    // actions but more work to do (e.g., start phase auto-transition).
    const humanPendingAfterLoop = currentState.pendingActions.filter((p) => p.player === humanPlayer);
    const isGameDone = (currentState.phase as string) === 'gameOver';
    const stillAITurn = !isGameDone &&
      currentState.activePlayer === aiPlayer.player &&
      !currentState.missionScoringComplete &&
      humanPendingAfterLoop.length === 0;

    if (stillAITurn) {
      setTimeout(() => {
        const s = get();
        if (s.gameState && !s.isProcessing && !s.gameOver && s.isAIGame) {
          void get().processAITurn();
        }
      }, 1000);
    }
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
      // Clear BEFORE calling onSelect - performAction may set a NEW
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
      // Clear BEFORE calling onDecline - same chained-effect reasoning.
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
    // Reset UI state for new game
    useUIStore.getState().resetHandOrder();
    useUIStore.getState().setCoinFlipComplete(false);
    set({
      gameState: null,
      visibleState: null,
      aiPlayer: null,
      isAIGame: false,
      isHotseatGame: false,
      isSandboxMode: false,
      hotseatSwitchPending: false,
      hotseatNextPlayer: null,
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

  // ─── Sandbox actions (free mode only) ───

  sandboxDrawCard: (deckIndex: number) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    const ps = s[humanPlayer];
    if (deckIndex < 0 || deckIndex >= ps.deck.length) return;
    const [card] = ps.deck.splice(deckIndex, 1);
    ps.hand.push(card);
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },

  sandboxAddChakra: (amount: number) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    s[humanPlayer].chakra += amount;
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },

  sandboxDiscardFromHand: (handIndex: number) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    const ps = s[humanPlayer];
    if (handIndex < 0 || handIndex >= ps.hand.length) return;
    const [card] = ps.hand.splice(handIndex, 1);
    ps.discardPile.push(card);
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },

  sandboxDefeatCharacter: (missionIndex: number, instanceId: string) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    const mission = s.activeMissions[missionIndex];
    if (!mission) return;
    // Search in both player1 and player2 characters
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const idx = mission[side].findIndex((c: CharacterInPlay) => c.instanceId === instanceId);
      if (idx !== -1) {
        const [char] = mission[side].splice(idx, 1);
        // Discard all cards in the stack to owner's discard
        const owner = char.originalOwner || char.controlledBy;
        s[owner].discardPile.push(char.card);
        if (char.stack) {
          for (const stackCard of char.stack) {
            s[owner].discardPile.push(stackCard);
          }
        }
        break;
      }
    }
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },

  sandboxMoveCharacter: (fromMission: number, instanceId: string, toMission: number) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    if (fromMission === toMission) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    const srcMission = s.activeMissions[fromMission];
    const dstMission = s.activeMissions[toMission];
    if (!srcMission || !dstMission) return;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const idx = srcMission[side].findIndex((c: CharacterInPlay) => c.instanceId === instanceId);
      if (idx !== -1) {
        const [char] = srcMission[side].splice(idx, 1);
        dstMission[side].push(char);
        break;
      }
    }
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },

  sandboxMoveToTopDeck: (deckIndex: number) => {
    const { isSandboxMode, gameState, humanPlayer } = get();
    if (!isSandboxMode || !gameState) return;
    const s = JSON.parse(JSON.stringify(gameState)) as GameState;
    const ps = s[humanPlayer];
    if (deckIndex < 0 || deckIndex >= ps.deck.length) return;
    const [card] = ps.deck.splice(deckIndex, 1);
    ps.deck.unshift(card);
    set({ gameState: s, visibleState: GameEngine.getVisibleState(s, humanPlayer) });
  },
}));
