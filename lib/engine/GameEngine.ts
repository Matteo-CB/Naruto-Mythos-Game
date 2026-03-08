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
import { generateGameId, generateInstanceId, resetIdCounter } from './utils/id';
import { logSystem, logAction } from './utils/gameLog';
import { executeStartPhase } from './phases/StartPhase';
import { executeAction, getValidActionsForPlayer } from './phases/ActionPhase';
import { executeMissionPhase, resumeMissionScoring } from './phases/MissionPhase';
import { executeEndPhase, handleRockLee117Move, handleAkamaru028Return, handleGiantSpider103EndOfRound, returnCharacterToHand } from './phases/EndPhase';
import { EffectEngine } from '../effects/EffectEngine';
import { calculateCharacterPower } from './phases/PowerCalculation';

export class GameEngine {
  /**
   * Create a new game from two player configurations.
   * Handles: random starting player, mission deck construction, initial draw, mulligan setup.
   */
  static createGame(config: GameConfig): GameState {
    // Reset instance ID counter so IDs are deterministic from game start.
    // This ensures replay reconstruction generates the same IDs.
    resetIdCounter();
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
      missionScoredThisTurn: false,
      consecutiveTimeouts: { player1: 0, player2: 0 },
      actionHistory: [],
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

    // Track action for replay
    if (!newState.actionHistory) newState.actionHistory = [];
    newState.actionHistory.push({ player, action });

    // FORFEIT can happen in any phase — handle before the phase switch
    if (action.type === 'FORFEIT') {
      newState.phase = 'gameOver';
      newState.forfeitedBy = player;
      return newState;
    }

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
          // After resolving a pending effect, switch active player (same logic as executeAction)
          // but only when all pending effects/actions are resolved
          if (newState.phase === 'action' &&
              newState.pendingEffects.length === 0 &&
              newState.pendingActions.length === 0 &&
              !newState.player1.hasPassed &&
              !newState.player2.hasPassed) {
            // If a forced-choice sequence was tracked (e.g. Dosu069 → opponent choice),
            // give the turn to the recorded resolver player (the opponent of the Dosu player).
            // This correctly handles chains: even if the reveal triggers MAIN/AMBUSH pending
            // effects that are then resolved, the turn still goes to the right player.
            if (newState.pendingForcedResolver) {
              newState.activePlayer = newState.pendingForcedResolver;
              newState.pendingForcedResolver = undefined;
            } else {
              const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
              newState.activePlayer = otherPlayer;
            }
          }
        } else {
          newState = executeAction(newState, player, action);
        }
        // ActionPhase sets phase to 'mission' when both pass, to avoid circular dependency.
        // We complete the transition here (only if no pending effects remain).
        if (newState.phase === 'mission' && newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
          newState = GameEngine.transitionToMissionPhase(newState);
        }
        break;

      case 'mission':
        // ADVANCE_PHASE: UI has shown the scored state, now advance to End Phase
        if (action.type === 'ADVANCE_PHASE') {
          newState.missionScoringComplete = undefined;
          newState = GameEngine.transitionToEndPhase(newState);
          break;
        }
        // Handle target selections for SCORE effects
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          newState = GameEngine.handlePendingAction(newState, player, action);
          // After resolving the pending action, resume scoring remaining missions/effects
          if (newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
            if (newState.missionScoringProgress) {
              // Resume scoring from where we left off
              newState = resumeMissionScoring(newState);
              // If resumption created new pending actions, wait for resolution
              if (newState.pendingActions.length > 0) break;
            }
            // All SCORE effects resolved — pause for UI to show results
            newState.missionScoringComplete = true;
          }
        }
        break;

      case 'end':
        // Handle pending actions from end-of-round effects (Rock Lee 117/151 move, Akamaru 028 return, Kidômaru 060)
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          newState = GameEngine.handlePendingAction(newState, player, action);
          // After resolving, check if more end-phase effects need processing
          if (newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
            // Continue processing remaining Rock Lee moves
            newState = handleRockLee117Move(newState);
            if (newState.pendingActions.length > 0) break; // More choices needed

            // Continue processing Akamaru 028 optional returns
            newState = handleAkamaru028Return(newState);
            if (newState.pendingActions.length > 0) break; // More choices needed

            // Continue processing Giant Spider 103 optional end-of-round hides
            newState = handleGiantSpider103EndOfRound(newState);
            if (newState.pendingActions.length > 0) break; // More choices needed

            // All end-of-round effects resolved — finish end phase transition
            newState.endPhaseMovedIds = undefined;
            newState.endPhaseAkamaru028Ids = undefined;
            newState.endPhaseGiantSpider103Ids = undefined;
            if (newState.turn >= TOTAL_TURNS) {
              newState = GameEngine.endGame(newState);
            } else {
              newState.turn = (newState.turn + 1) as TurnNumber;
              newState = GameEngine.transitionToStartPhase(newState);
            }
          }
        } else if (action.type === 'ADVANCE_PHASE' && newState.pendingActions.length === 0) {
          // Fallback: force advance when stuck in end phase with no pending actions (e.g., during replay)
          // Clear any stale pending effects that don't have matching actions
          newState.pendingEffects = [];
          newState.endPhaseMovedIds = undefined;
          newState.endPhaseAkamaru028Ids = undefined;
          newState.endPhaseGiantSpider103Ids = undefined;
          if (newState.turn >= TOTAL_TURNS) {
            newState = GameEngine.endGame(newState);
          } else {
            newState.turn = (newState.turn + 1) as TurnNumber;
            newState = GameEngine.transitionToStartPhase(newState);
          }
        }
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
    newState.missionScoredThisTurn = false;
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
    // Guard: prevent double execution of mission scoring in the same turn
    if (state.missionScoredThisTurn) {
      console.warn('[GameEngine] transitionToMissionPhase called twice in the same turn — skipping');
      return GameEngine.transitionToEndPhase(state);
    }

    let newState = deepClone(state);
    newState.phase = 'mission';
    newState.missionScoredThisTurn = true;

    // Execute mission scoring
    newState = executeMissionPhase(newState);

    // If there are pending actions from SCORE effects, wait for resolution
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // All scoring done — pause so UI can show SCORE results (POWERUP tokens, etc.)
    // before End Phase removes them. The caller sends ADVANCE_PHASE to proceed.
    newState.missionScoringComplete = true;
    return newState;
  }

  /**
   * Transition to end phase and execute cleanup.
   */
  static transitionToEndPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'end';
    newState.missionScoringProgress = undefined;

    // Execute end phase logic
    newState = executeEndPhase(newState);

    // If there are pending actions from end-of-round effects (Rock Lee 117/151 move), wait
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // Process Akamaru 028 optional returns
    newState = handleAkamaru028Return(newState);
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // Process Giant Spider 103 optional end-of-round hides
    newState = handleGiantSpider103EndOfRound(newState);
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // Clean up end phase tracking
    newState.endPhaseMovedIds = undefined;
    newState.endPhaseAkamaru028Ids = undefined;
    newState.endPhaseGiantSpider103Ids = undefined;

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
      let newState = deepClone(state);
      const effectIdx = newState.pendingEffects.findIndex((p) => p.id === action.pendingEffectId);
      if (effectIdx === -1) return state;

      const effect = newState.pendingEffects[effectIdx];
      if (!effect.isOptional) return state;

      // Special case: Gaara 120 — declining means "skip this mission, continue to remaining missions"
      if (effect.targetSelectionType === 'GAARA120_CHOOSE_DEFEAT') {
        let gDesc: { defeatedCount?: number; nextMissionIndex?: number; isUpgrade?: boolean; sourceInstanceId?: string; sourceMissionIndex?: number } = {};
        try { gDesc = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const { defeatedCount = 0, nextMissionIndex = 0, isUpgrade = false, sourceInstanceId, sourceMissionIndex } = gDesc;

        // Remove the declined effect and action
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const enemySide_g: 'player1Characters' | 'player2Characters' =
          effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

        // Continue checking remaining missions from nextMissionIndex
        let chainedToNext = false;
        for (let mi = nextMissionIndex; mi < newState.activeMissions.length; mi++) {
          const mission_g = newState.activeMissions[mi];
          const validTargets_g: string[] = [];
          for (const c of mission_g[enemySide_g]) {
            if (c.isHidden) {
              validTargets_g.push(c.instanceId); // hidden = power 0 ≤ 1
              continue;
            }
            const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            const power = (topCard.power ?? 0) + c.powerTokens;
            if (power <= 1) validTargets_g.push(c.instanceId);
          }
          if (validTargets_g.length === 0) continue;

          // Prompt for this mission (isOptional: true — player can skip)
          const chainData = JSON.stringify({ defeatedCount, nextMissionIndex: mi + 1, isUpgrade, sourceInstanceId, sourceMissionIndex, missionIndex: mi });
          const effId = generateInstanceId();
          const actId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: effId,
            sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: chainData,
            targetSelectionType: 'GAARA120_CHOOSE_DEFEAT',
            sourcePlayer: effect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: validTargets_g,
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: effect.isUpgrade,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: actId,
            type: 'SELECT_TARGET' as const,
            player: effect.sourcePlayer,
            description: `Gaara (120): Choose an enemy character with Power 1 or less to defeat in mission ${mi + 1}.`,
            descriptionKey: 'game.effect.desc.gaara120ChooseDefeat',
            descriptionParams: { mission: String(mi + 1) },
            options: validTargets_g,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effId,
          }];
          chainedToNext = true;
          break;
        }

        // If no remaining missions need prompting, apply UPGRADE powerup if applicable
        if (!chainedToNext && isUpgrade && defeatedCount > 0 && sourceInstanceId && sourceMissionIndex != null) {
          const friendlySide_g: 'player1Characters' | 'player2Characters' =
            effect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const upgMissions = [...newState.activeMissions];
          const upgMission = { ...upgMissions[sourceMissionIndex] };
          const upgChars = [...upgMission[friendlySide_g]];
          const selfIdx = upgChars.findIndex((c: CharacterInPlay) => c.instanceId === sourceInstanceId);
          if (selfIdx !== -1) {
            upgChars[selfIdx] = { ...upgChars[selfIdx], powerTokens: upgChars[selfIdx].powerTokens + defeatedCount };
            upgMission[friendlySide_g] = upgChars;
            upgMissions[sourceMissionIndex] = upgMission;
            newState = { ...newState, activeMissions: upgMissions };
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effect.sourcePlayer,
              'EFFECT_POWERUP',
              `Gaara (120): POWERUP ${defeatedCount} (upgrade, from missions skipped then completed).`,
              'game.log.effect.powerupSelf',
              { card: 'GAARA', id: 'KS-120-R', amount: defeatedCount },
            );
          }
        }
        return newState;
      }

      // Special case: Dosu 069 — declining means the opponent lets the character be defeated
      if (effect.targetSelectionType === 'DOSU069_OPPONENT_CHOICE') {
        let parsed: { targetInstanceId?: string; sourcePlayer?: string } = {};
        try { parsed = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const defeatTargetId = parsed.targetInstanceId ?? (effect.validTargets?.[0] ?? '');
        const dosuPlayer = (parsed.sourcePlayer ?? effect.sourcePlayer) as import('./types').PlayerID;
        if (defeatTargetId) {
          // Defeat the character
          const defeated = EffectEngine.defeatCharacter(newState, defeatTargetId, dosuPlayer);
          // Remove the effect and action
          defeated.pendingEffects = defeated.pendingEffects.filter((e) => e.id !== effect.id);
          defeated.pendingActions = defeated.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
          defeated.log = logAction(
            defeated.log, defeated.turn, defeated.phase, dosuPlayer,
            'EFFECT_DEFEAT',
            `Dosu Kinuta (069): Hidden character was defeated (opponent chose not to reveal).`,
            'game.log.effect.dosu069AutoDefeat',
            { card: 'DOSU KINUTA', id: 'KS-069-UC' },
          );
          if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
            return EffectEngine.processRemainingEffects(defeated, effect);
          }
          return defeated;
        }
      }

      // Special case: Gemma 049 sacrifice (defeat) — declining means the original target gets defeated
      if (effect.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE') {
        let parsed049: { targetInstanceId?: string; effectSource?: string } = {};
        try { parsed049 = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const defeatTargetId049 = parsed049.targetInstanceId ?? '';
        const effectSource049 = (parsed049.effectSource ?? (effect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as import('./types').PlayerID;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (defeatTargetId049) {
          // Use defeatCharacterDirect to avoid re-triggering Gemma check
          newState = EffectEngine.defeatCharacterDirect(newState, defeatTargetId049);
          const charResult049 = EffectEngine.findCharByInstanceId(state, defeatTargetId049);
          if (charResult049) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effectSource049,
              'EFFECT_DEFEAT', `${charResult049.character.card.name_fr} was defeated (Gemma sacrifice declined).`,
              'game.log.effect.defeat',
              { card: '???', id: '', target: charResult049.character.card.name_fr },
            );
          }
        }
        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      // Special case: Gemma 049 sacrifice (hide) — declining means the original target gets hidden
      if (effect.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE') {
        let parsed049h: { targetInstanceId?: string; effectSource?: string } = {};
        try { parsed049h = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const hideTargetId049 = parsed049h.targetInstanceId ?? '';
        const effectSource049h = (parsed049h.effectSource ?? (effect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as import('./types').PlayerID;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (hideTargetId049) {
          newState = EffectEngine.hideCharacter(newState, hideTargetId049);
          const charResult049h = EffectEngine.findCharByInstanceId(state, hideTargetId049);
          if (charResult049h) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effectSource049h,
              'EFFECT_HIDE', `${charResult049h.character.card.name_fr} was hidden (Gemma sacrifice declined).`,
              'game.log.effect.hide',
              { card: '???', id: '', target: charResult049h.character.card.name_fr, mission: String(charResult049h.missionIndex + 1) },
            );
          }
        }
        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      // Special case: Kiba 113/149 UPGRADE confirmation declined → continue with hide mode
      if (effect.targetSelectionType === 'KIBA113_CONFIRM_UPGRADE' || effect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE') {
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        if (effect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE') {
          newState = EffectEngine.kiba149ExecuteStep1(newState, effect, false);
        } else {
          newState = EffectEngine.kiba113QueueAkamaruChoice(newState, effect, false);
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      // Special case: Giant Spider 103 — declining the hide still returns Giant Spider to hand
      if (effect.targetSelectionType === 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET') {
        let k103Data: { giantSpiderInstanceId?: string } = {};
        try { k103Data = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        if (k103Data.giantSpiderInstanceId) {
          newState = returnCharacterToHand(newState, k103Data.giantSpiderInstanceId, effect.sourcePlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, effect.sourcePlayer,
            'END_RETURN',
            'Giant Spider (103): Returns to hand at end of round.',
            'game.log.effect.giantSpider103Return',
            { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
          );
        }
      }

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
      discardPile: oppState.discardPile,  // Public information per rules
      chakra: oppState.chakra,
      missionPoints: oppState.missionPoints,
      hasPassed: oppState.hasPassed,
      charactersInPlay: oppState.charactersInPlay,
    };

    const visibleMissions: VisibleMission[] = state.activeMissions.map((mission) => {
      const makeVisible = (chars: CharacterInPlay[], side: PlayerID): VisibleCharacter[] =>
        chars.map((c) => {
          const isOwn = c.controlledBy === player;
          // Can see if: own card, OR not hidden, OR was revealed at least once (public info).
          const canSee = isOwn || !c.isHidden || c.wasRevealedAtLeastOnce;
          const power = calculateCharacterPower(state, c, side);
          const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return {
            instanceId: c.instanceId,
            isHidden: c.isHidden,
            wasRevealedAtLeastOnce: c.wasRevealedAtLeastOnce,
            isOwn,
            card: canSee ? c.card : undefined,
            topCard: canSee ? topCard : undefined,
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
        (e) => e.sourcePlayer === player || e.selectingPlayer === player || !e.requiresTargetSelection,
      ),
      pendingActions: state.pendingActions.filter((a) => a.player === player),
      forfeitedBy: state.forfeitedBy,
    };
  }

  /**
   * Get the winner of the game (only valid in gameOver phase).
   */
  static getWinner(state: GameState): PlayerID | null {
    if (state.phase !== 'gameOver') return null;

    // Forfeit: the other player wins
    if (state.forfeitedBy) {
      return state.forfeitedBy === 'player1' ? 'player2' : 'player1';
    }

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
