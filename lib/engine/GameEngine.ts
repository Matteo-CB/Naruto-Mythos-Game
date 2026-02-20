import type {
  GameState,
  GameConfig,
  GameAction,
  PlayerID,
  PlayerState,
  CharacterCard,
  MissionCard,
  ActiveMission,
  CharacterInPlay,
  VisibleGameState,
  VisibleOpponentState,
  VisibleMission,
  VisibleCharacter,
  TurnNumber,
} from './types';
import {
  INITIAL_HAND_SIZE,
  TOTAL_TURNS,
} from './types';
import { deepClone } from './utils/deepClone';
import { shuffle } from './utils/shuffle';
import { generateGameId } from './utils/id';
import { logSystem } from './utils/gameLog';
import { executeStartPhase } from './phases/StartPhase';
import { executeAction, getValidActionsForPlayer } from './phases/ActionPhase';
import { executeMissionPhase } from './phases/MissionPhase';
import { executeEndPhase } from './phases/EndPhase';
import { EffectEngine } from '../effects/EffectEngine';
import { calculateCharacterPower } from './phases/PowerCalculation';

export class GameEngine {
  /**
   * Create a new game from two player configurations.
   * Handles: random starting player, mission deck construction, initial draw, mulligan setup.
   */
  static createGame(config: GameConfig): GameState {
    const gameId = generateGameId();

    // Randomly determine starting player (Edge token holder)
    const startingPlayer: PlayerID = Math.random() < 0.5 ? 'player1' : 'player2';

    // Each player shuffles their 3 mission cards, randomly selects 2
    const p1Missions = shuffle(config.player1.missionCards);
    const p2Missions = shuffle(config.player2.missionCards);
    const p1SelectedMissions = p1Missions.slice(0, 2);
    const p2SelectedMissions = p2Missions.slice(0, 2);
    const p1UnusedMission = p1Missions[2] || null;
    const p2UnusedMission = p2Missions[2] || null;

    // Combine selected missions and shuffle to form the mission deck
    const missionDeck = shuffle([...p1SelectedMissions, ...p2SelectedMissions]);

    // Each player shuffles their character deck
    const p1Deck = shuffle([...config.player1.deck]);
    const p2Deck = shuffle([...config.player2.deck]);

    // Each player draws 5 cards
    const p1Hand = p1Deck.splice(0, INITIAL_HAND_SIZE);
    const p2Hand = p2Deck.splice(0, INITIAL_HAND_SIZE);

    const player1: PlayerState = {
      id: 'player1',
      userId: config.player1.userId,
      isAI: config.player1.isAI,
      aiDifficulty: config.player1.aiDifficulty,
      deck: p1Deck,
      hand: p1Hand,
      discardPile: [],
      missionCards: config.player1.missionCards,
      chakra: 0,
      missionPoints: 0,
      hasPassed: false,
      hasMulliganed: false,
      charactersInPlay: 0,
      unusedMission: p1UnusedMission,
    };

    const player2: PlayerState = {
      id: 'player2',
      userId: config.player2.userId,
      isAI: config.player2.isAI,
      aiDifficulty: config.player2.aiDifficulty,
      deck: p2Deck,
      hand: p2Hand,
      discardPile: [],
      missionCards: config.player2.missionCards,
      chakra: 0,
      missionPoints: 0,
      hasPassed: false,
      hasMulliganed: false,
      charactersInPlay: 0,
      unusedMission: p2UnusedMission,
    };

    const state: GameState = {
      gameId,
      turn: 1 as TurnNumber,
      phase: 'mulligan',
      activePlayer: startingPlayer,
      edgeHolder: startingPlayer,
      firstPasser: null,
      player1,
      player2,
      missionDeck,
      activeMissions: [],
      log: [],
      pendingEffects: [],
      pendingActions: [],
      turnMissionRevealed: false,
    };

    return {
      ...state,
      log: logSystem(state.log, 1, 'setup', 'GAME_START', `Game created. ${startingPlayer} has the Edge token.`,
        'game.log.gameStart', { player: startingPlayer }),
    };
  }

  /**
   * Apply an action to the game state. Returns a new state.
   * This is the main reducer - validates the action, applies it, handles phase transitions.
   */
  static applyAction(state: GameState, player: PlayerID, action: GameAction): GameState {
    let newState = deepClone(state);

    switch (newState.phase) {
      case 'mulligan':
        newState = GameEngine.handleMulligan(newState, player, action);
        break;

      case 'start':
        // Start phase is automatic - no player actions needed
        // This shouldn't normally be called
        break;

      case 'action':
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          // Handle pending effect target selections during action phase
          newState = GameEngine.handlePendingAction(newState, player, action);
        } else {
          newState = executeAction(newState, player, action);
        }
        // ActionPhase sets phase to 'mission' when both pass, to avoid circular dependency.
        // We complete the transition here (only if no pending effects remain).
        if (newState.phase === 'mission' && newState.pendingActions.length === 0) {
          newState = GameEngine.transitionToMissionPhase(newState);
        }
        break;

      case 'mission':
        // Mission phase is automatic - triggered by both passing
        // Handle target selections for SCORE effects
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          newState = GameEngine.handlePendingAction(newState, player, action);
          // Auto-advance to end phase when all SCORE effects are resolved
          if (newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
            newState = GameEngine.transitionToEndPhase(newState);
          }
        }
        break;

      case 'end':
        // End phase is automatic
        break;

      case 'gameOver':
        // Game is over - no actions accepted
        break;
    }

    return newState;
  }

  /**
   * Handle mulligan decisions. Once both players have decided, transition to start phase.
   */
  static handleMulligan(state: GameState, player: PlayerID, action: GameAction): GameState {
    if (action.type !== 'MULLIGAN') return state;

    const playerState = state[player];
    if (playerState.hasMulliganed) return state; // Already mulliganed

    let newState = deepClone(state);
    const ps = newState[player];

    if (action.doMulligan) {
      // Return all cards to deck, shuffle, draw 5 new
      ps.deck = shuffle([...ps.deck, ...ps.hand]);
      ps.hand = ps.deck.splice(0, INITIAL_HAND_SIZE);
      newState.log = logSystem(newState.log, 1, 'mulligan', 'MULLIGAN', `${player} mulligans their hand.`,
        'game.log.mulligan', { player });
    } else {
      newState.log = logSystem(newState.log, 1, 'mulligan', 'KEEP_HAND', `${player} keeps their hand.`,
        'game.log.keepHand', { player });
    }

    ps.hasMulliganed = true;

    // Check if both players have decided
    const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
    if (newState[otherPlayer].hasMulliganed) {
      // Both decided - move to start phase of turn 1
      newState = GameEngine.transitionToStartPhase(newState);
    }

    return newState;
  }

  /**
   * Transition to start phase and execute it automatically.
   */
  static transitionToStartPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'start';
    newState.turnMissionRevealed = false;
    newState.player1.hasPassed = false;
    newState.player2.hasPassed = false;
    newState.firstPasser = null;

    // Execute start phase logic
    newState = executeStartPhase(newState);

    // Transition to action phase
    newState.phase = 'action';
    newState.activePlayer = newState.edgeHolder;

    return newState;
  }

  /**
   * Transition to mission phase and execute scoring.
   */
  static transitionToMissionPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'mission';

    // Execute mission scoring
    newState = executeMissionPhase(newState);

    // If there are pending actions from SCORE effects, wait for resolution
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // Otherwise transition to end phase
    return GameEngine.transitionToEndPhase(newState);
  }

  /**
   * Transition to end phase and execute cleanup.
   */
  static transitionToEndPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'end';

    // Execute end phase logic
    newState = executeEndPhase(newState);

    // Check if game is over
    if (newState.turn >= TOTAL_TURNS) {
      return GameEngine.endGame(newState);
    }

    // Advance to next turn
    newState.turn = (newState.turn + 1) as TurnNumber;

    // Transition to start phase of next turn
    return GameEngine.transitionToStartPhase(newState);
  }

  /**
   * End the game and determine the winner.
   */
  static endGame(state: GameState): GameState {
    const newState = deepClone(state);
    newState.phase = 'gameOver';

    const p1Points = newState.player1.missionPoints;
    const p2Points = newState.player2.missionPoints;

    let winner: string;
    if (p1Points > p2Points) {
      winner = 'player1';
    } else if (p2Points > p1Points) {
      winner = 'player2';
    } else {
      // Tie - edge holder wins
      winner = newState.edgeHolder;
    }

    const winnerPts = winner === 'player1' ? p1Points : p2Points;
    const loserPts = winner === 'player1' ? p2Points : p1Points;
    newState.log = logSystem(
      newState.log,
      newState.turn,
      'gameOver',
      'GAME_END',
      `Game over! ${winner} wins with ${winnerPts} points vs ${loserPts} points.`,
      'game.log.gameEnd',
      { winner, winnerPts, loserPts },
    );

    return newState;
  }

  /**
   * Handle pending target selections and effect resolutions.
   */
  static handlePendingAction(state: GameState, player: PlayerID, action: GameAction): GameState {
    if (action.type === 'SELECT_TARGET') {
      const newState = deepClone(state);
      const pendingAction = newState.pendingActions.find((p) => p.id === action.pendingActionId);
      if (!pendingAction) return state;
      if (pendingAction.player !== player) return state;

      // Find the associated PendingEffect
      const pendingEffect = newState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);
      if (!pendingEffect) {
        // No effect found — just remove the pending action
        newState.pendingActions = newState.pendingActions.filter((p) => p.id !== action.pendingActionId);
        return newState;
      }

      // Apply the targeted effect via EffectEngine
      // applyTargetedEffect handles removing the pending effect/action and processing continuations
      return EffectEngine.applyTargetedEffect(newState, pendingEffect, action.selectedTargets);
    }

    if (action.type === 'DECLINE_OPTIONAL_EFFECT') {
      const newState = deepClone(state);
      const effectIdx = newState.pendingEffects.findIndex((p) => p.id === action.pendingEffectId);
      if (effectIdx === -1) return state;

      const effect = newState.pendingEffects[effectIdx];
      if (!effect.isOptional) return state;

      // Remove the effect and its associated action
      newState.pendingEffects.splice(effectIdx, 1);
      newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

      // Process remaining effects (continuation) if any
      if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
        return EffectEngine.processRemainingEffects(newState, effect);
      }

      return newState;
    }

    return state;
  }

  /**
   * Get all valid actions for a player in the current state.
   */
  static getValidActions(state: GameState, player: PlayerID): GameAction[] {
    switch (state.phase) {
      case 'mulligan': {
        const ps = state[player];
        if (ps.hasMulliganed) return [];
        return [
          { type: 'MULLIGAN', doMulligan: true },
          { type: 'MULLIGAN', doMulligan: false },
        ];
      }

      case 'action': {
        // If there are pending target selections for this player, those must be resolved first
        const pendingForPlayer = state.pendingActions.filter((p) => p.player === player);
        if (pendingForPlayer.length > 0) {
          const actions: GameAction[] = [];
          for (const p of pendingForPlayer) {
            for (const opt of p.options) {
              actions.push({
                type: 'SELECT_TARGET' as const,
                pendingActionId: p.id,
                selectedTargets: [opt],
              });
            }
          }
          // Also allow declining optional effects
          const pendingEffects = state.pendingEffects.filter(
            (e) => e.sourcePlayer === player && e.isOptional && !e.resolved,
          );
          for (const e of pendingEffects) {
            actions.push({
              type: 'DECLINE_OPTIONAL_EFFECT' as const,
              pendingEffectId: e.id,
            });
          }
          return actions;
        }
        return getValidActionsForPlayer(state, player);
      }

      case 'mission':
      case 'end': {
        // Handle pending actions (SELECT_TARGET + DECLINE for optional effects)
        const actions: GameAction[] = state.pendingActions
          .filter((p) => p.player === player)
          .flatMap((p) => {
            return p.options.map((opt) => ({
              type: 'SELECT_TARGET' as const,
              pendingActionId: p.id,
              selectedTargets: [opt],
            }));
          });
        // Also allow declining optional effects (same pattern as action phase)
        const pendingEffects = state.pendingEffects.filter(
          (e) => e.sourcePlayer === player && e.isOptional && !e.resolved,
        );
        for (const e of pendingEffects) {
          actions.push({
            type: 'DECLINE_OPTIONAL_EFFECT' as const,
            pendingEffectId: e.id,
          });
        }
        return actions;
      }

      default:
        return [];
    }
  }

  /**
   * Get the game state visible to a specific player.
   * Filters hidden information (opponent's hand, face-down cards).
   */
  static getVisibleState(state: GameState, player: PlayerID): VisibleGameState {
    const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myState = state[player];
    const oppState = state[otherPlayer];

    const opponentVisible: VisibleOpponentState = {
      id: otherPlayer,
      handSize: oppState.hand.length,
      deckSize: oppState.deck.length,
      discardPileSize: oppState.discardPile.length,
      chakra: oppState.chakra,
      missionPoints: oppState.missionPoints,
      hasPassed: oppState.hasPassed,
      charactersInPlay: oppState.charactersInPlay,
    };

    const visibleMissions: VisibleMission[] = state.activeMissions.map((mission) => {
      const makeVisible = (chars: CharacterInPlay[], side: PlayerID): VisibleCharacter[] =>
        chars.map((c) => {
          const isOwn = c.controlledBy === player;
          const canSee = isOwn || !c.isHidden;
          const power = calculateCharacterPower(state, c, side);
          return {
            instanceId: c.instanceId,
            isHidden: c.isHidden,
            isOwn,
            card: canSee ? c.card : undefined,
            powerTokens: c.powerTokens,
            controlledBy: c.controlledBy,
            originalOwner: c.originalOwner,
            missionIndex: c.missionIndex,
            stackSize: c.stack.length,
            effectivePower: power,
          };
        });

      return {
        ...mission,
        player1Characters: makeVisible(mission.player1Characters, 'player1'),
        player2Characters: makeVisible(mission.player2Characters, 'player2'),
      };
    });

    return {
      gameId: state.gameId,
      turn: state.turn,
      phase: state.phase,
      activePlayer: state.activePlayer,
      edgeHolder: state.edgeHolder,
      firstPasser: state.firstPasser,
      myPlayer: player,
      myState: deepClone(myState),
      opponentState: opponentVisible,
      activeMissions: visibleMissions,
      missionDeckSize: state.missionDeck.length,
      log: state.log,
      pendingEffects: state.pendingEffects.filter(
        (e) => e.sourcePlayer === player || !e.requiresTargetSelection,
      ),
      pendingActions: state.pendingActions.filter((a) => a.player === player),
    };
  }

  /**
   * Get the winner of the game (only valid in gameOver phase).
   */
  static getWinner(state: GameState): PlayerID | null {
    if (state.phase !== 'gameOver') return null;

    const p1Points = state.player1.missionPoints;
    const p2Points = state.player2.missionPoints;

    if (p1Points > p2Points) return 'player1';
    if (p2Points > p1Points) return 'player2';
    return state.edgeHolder; // Tie goes to edge holder
  }

  /**
   * Count all characters in play for a given player across all missions.
   */
  static countCharactersInPlay(state: GameState, player: PlayerID): number {
    let count = 0;
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      count += chars.length;
    }
    return count;
  }

  /**
   * Get all characters controlled by a player across all missions.
   */
  static getPlayerCharacters(state: GameState, player: PlayerID): CharacterInPlay[] {
    const chars: CharacterInPlay[] = [];
    for (const mission of state.activeMissions) {
      const missionChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      chars.push(...missionChars);
    }
    return chars;
  }

  /**
   * Find a character in play by its instance ID.
   */
  static findCharacterByInstanceId(
    state: GameState,
    instanceId: string,
  ): { character: CharacterInPlay; missionIndex: number; player: PlayerID } | null {
    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      for (const char of mission.player1Characters) {
        if (char.instanceId === instanceId) {
          return { character: char, missionIndex: i, player: 'player1' };
        }
      }
      for (const char of mission.player2Characters) {
        if (char.instanceId === instanceId) {
          return { character: char, missionIndex: i, player: 'player2' };
        }
      }
    }
    return null;
  }
}
