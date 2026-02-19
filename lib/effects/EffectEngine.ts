import type { GameState, PlayerID, CharacterInPlay, EffectType, PendingEffect, PendingAction } from '../engine/types';
import type { EffectContext, EffectResult } from './EffectTypes';
import { getEffectHandler } from './EffectRegistry';
import { deepClone } from '../engine/utils/deepClone';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';
import { triggerOnDefeatEffects } from './onDefeatTriggers';

/**
 * Central effect resolver.
 * Dispatches effects to their registered handlers.
 * When a handler requires target selection, creates a PendingEffect + PendingAction
 * in the game state and pauses further effect processing.
 */
export class EffectEngine {
  /**
   * Resolve effects when a character is played face-visible.
   * Triggers MAIN effects (and UPGRADE if isUpgrade).
   */
  static resolvePlayEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
    isUpgrade: boolean,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    // Resolve MAIN effects
    const hasMainEffect = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
    );
    if (hasMainEffect) {
      const handler = getEffectHandler(topCard.id, 'MAIN');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'MAIN',
          isUpgrade,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          // Handler needs target selection — create pending and pause
          const remainingEffectTypes: EffectType[] = [];
          if (isUpgrade) {
            const hasUpgradeEffect = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
            if (hasUpgradeEffect) remainingEffectTypes.push('UPGRADE');
          }
          newState = EffectEngine.createPendingTargetSelection(
            newState, player, character, missionIndex, 'MAIN', isUpgrade,
            result, remainingEffectTypes,
          );
          return newState;
        }
        newState = result.state;
      }
    }

    // If this is an upgrade, also resolve UPGRADE effects
    if (isUpgrade) {
      const hasUpgradeEffect = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
      if (hasUpgradeEffect) {
        const handler = getEffectHandler(topCard.id, 'UPGRADE');
        if (handler) {
          const ctx: EffectContext = {
            state: newState,
            sourcePlayer: player,
            sourceCard: character,
            sourceMissionIndex: missionIndex,
            triggerType: 'UPGRADE',
            isUpgrade: true,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            newState = EffectEngine.createPendingTargetSelection(
              newState, player, character, missionIndex, 'UPGRADE', true,
              result, [],
            );
            return newState;
          }
          newState = result.state;
        }
      }
    }

    return newState;
  }

  /**
   * Resolve effects when a hidden character is revealed.
   * Triggers MAIN and AMBUSH effects.
   */
  static resolveRevealEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    // Resolve MAIN effects
    const hasMainEffect = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
    );
    if (hasMainEffect) {
      const handler = getEffectHandler(topCard.id, 'MAIN');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'MAIN',
          isUpgrade: false,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          // Check if AMBUSH also needs to be processed after this
          const remainingEffectTypes: EffectType[] = [];
          const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
          if (hasAmbushEffect) remainingEffectTypes.push('AMBUSH');

          newState = EffectEngine.createPendingTargetSelection(
            newState, player, character, missionIndex, 'MAIN', false,
            result, remainingEffectTypes,
          );
          return newState;
        }
        newState = result.state;
      }
    }

    // Resolve AMBUSH effects
    const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
    if (hasAmbushEffect) {
      const handler = getEffectHandler(topCard.id, 'AMBUSH');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'AMBUSH',
          isUpgrade: false,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          newState = EffectEngine.createPendingTargetSelection(
            newState, player, character, missionIndex, 'AMBUSH', false,
            result, [],
          );
          return newState;
        }
        newState = result.state;
      }
    }

    return newState;
  }

  /**
   * Resolve SCORE effects when a mission is won.
   */
  static resolveScoreEffects(
    state: GameState,
    player: PlayerID,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const mission = newState.activeMissions[missionIndex];

    // Mission card SCORE effects
    const hasMissionScore = (mission.card.effects ?? []).some((e) => e.type === 'SCORE');
    if (hasMissionScore) {
      const handler = getEffectHandler(mission.card.id, 'SCORE');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: null as unknown as CharacterInPlay,
          sourceMissionIndex: missionIndex,
          triggerType: 'SCORE',
          isUpgrade: false,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          newState = EffectEngine.createPendingTargetSelection(
            newState, player, null as unknown as CharacterInPlay, missionIndex, 'SCORE', false,
            result, [],
          );
          return newState;
        }
        newState = result.state;
      }
    }

    // Winner's character SCORE effects
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of chars) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      const hasCharScore = (topCard.effects ?? []).some((e) => e.type === 'SCORE');
      if (hasCharScore) {
        const handler = getEffectHandler(topCard.id, 'SCORE');
        if (handler) {
          const ctx: EffectContext = {
            state: newState,
            sourcePlayer: player,
            sourceCard: char,
            sourceMissionIndex: missionIndex,
            triggerType: 'SCORE',
            isUpgrade: false,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            newState = EffectEngine.createPendingTargetSelection(
              newState, player, char, missionIndex, 'SCORE', false,
              result, [],
            );
            return newState;
          }
          newState = result.state;
        }
      }
    }

    return newState;
  }

  /**
   * Create a PendingEffect and PendingAction from a handler result that needs target selection.
   */
  static createPendingTargetSelection(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay | null,
    missionIndex: number,
    effectType: EffectType,
    isUpgrade: boolean,
    result: EffectResult,
    remainingEffectTypes: EffectType[],
  ): GameState {
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    const topCard = character
      ? (character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card)
      : null;

    const pendingEffect: PendingEffect = {
      id: effectId,
      sourceCardId: topCard?.id ?? '',
      sourceInstanceId: character?.instanceId ?? '',
      sourceMissionIndex: missionIndex,
      effectType,
      effectDescription: result.description ?? '',
      targetSelectionType: result.targetSelectionType ?? '',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: result.validTargets ?? [],
      isOptional: true, // All effects with target selection are optional per game rules
      isMandatory: false,
      resolved: false,
      isUpgrade,
      remainingEffectTypes: remainingEffectTypes.length > 0 ? remainingEffectTypes : undefined,
    };

    // Determine PendingAction type based on targetSelectionType
    let actionType: PendingAction['type'] = 'SELECT_TARGET';
    if (result.targetSelectionType === 'PUT_CARD_ON_DECK') {
      actionType = 'PUT_CARD_ON_DECK';
    } else if (result.targetSelectionType === 'DISCARD_CARD' || result.targetSelectionType === 'KIMIMARO_CHOOSE_DISCARD') {
      actionType = 'DISCARD_CARD';
    } else if (result.targetSelectionType === 'CHOOSE_CARD_FROM_LIST') {
      actionType = 'CHOOSE_CARD_FROM_LIST';
    }

    const pendingAction: PendingAction = {
      id: actionId,
      type: actionType,
      player,
      description: result.description ?? '',
      options: result.validTargets ?? [],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    };

    const newState = { ...state };
    newState.pendingEffects = [...state.pendingEffects, pendingEffect];
    newState.pendingActions = [...state.pendingActions, pendingAction];
    return newState;
  }

  /**
   * Apply a targeted effect after the player has selected a target.
   * Dispatches to the correct effect application logic based on targetSelectionType.
   */
  static applyTargetedEffect(
    state: GameState,
    pendingEffect: PendingEffect,
    selectedTargets: string[],
  ): GameState {
    let newState = deepClone(state);
    const targetId = selectedTargets[0]; // Most effects select 1 target

    switch (pendingEffect.targetSelectionType) {
      case 'POWERUP_2_LEAF_VILLAGE':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 2);
        break;

      case 'REMOVE_POWER_TOKENS_ENEMY':
        newState = EffectEngine.removeTokensFromTarget(newState, targetId, 2);
        break;

      case 'STEAL_POWER_TOKENS_ENEMY_THIS_MISSION':
        newState = EffectEngine.stealTokensFromTarget(newState, pendingEffect, targetId, 2);
        break;

      case 'MOVE_TEAM10_CHARACTER':
      case 'MOVE_NARUTO_CHARACTER':
        newState = EffectEngine.moveCharacterToMission(newState, targetId);
        break;

      case 'MOVE_SELF_TO_MISSION':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      case 'OROCHIMARU_LOOK_AND_STEAL':
        newState = EffectEngine.orochimaruLookAndSteal(newState, pendingEffect, targetId);
        break;

      case 'LOOK_AT_HIDDEN_CHARACTER':
        // Dosu MAIN: just looking at a hidden character (info reveal)
        newState.log = logAction(
          newState.log, newState.turn, 'action', pendingEffect.sourcePlayer,
          'EFFECT', `Looked at a hidden character.`,
          'game.log.effect.lookAtHidden',
          { card: 'Dosu Kinuta', id: pendingEffect.sourceCardId, target: '???' },
        );
        break;

      case 'DEFEAT_HIDDEN_CHARACTER':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      case 'PLAY_SUMMON_FROM_HAND':
        newState = EffectEngine.playSummonFromHand(newState, pendingEffect, targetId);
        break;

      case 'KIMIMARO_DISCARD_AND_HIDE':
        newState = EffectEngine.kimimaroDiscardAndHide(newState, pendingEffect, targetId);
        break;

      case 'KIMIMARO_CHOOSE_DISCARD':
        newState = EffectEngine.kimimaroChooseDiscard(newState, pendingEffect, targetId);
        break;

      case 'MOVE_X_FRIENDLY_CHARACTERS':
        newState = EffectEngine.moveCharacterToMission(newState, targetId);
        break;

      case 'PUT_CARD_ON_DECK':
        newState = EffectEngine.putCardOnDeck(newState, pendingEffect, targetId);
        break;

      default:
        // Unknown target selection type — log warning
        break;
    }

    // Remove the resolved pending effect and action
    newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
    newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);

    // Process remaining effects (continuation) if any
    if (pendingEffect.remainingEffectTypes && pendingEffect.remainingEffectTypes.length > 0) {
      newState = EffectEngine.processRemainingEffects(newState, pendingEffect);
    }

    return newState;
  }

  /**
   * After resolving a pending effect, continue processing remaining effect types.
   */
  static processRemainingEffects(state: GameState, resolvedPending: PendingEffect): GameState {
    let newState = state;
    const remaining = resolvedPending.remainingEffectTypes ?? [];

    // Find the character in its current location
    const charResult = EffectEngine.findCharByInstanceId(newState, resolvedPending.sourceInstanceId);
    if (!charResult) return newState;

    const { character, missionIndex } = charResult;
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    for (const effectType of remaining) {
      const hasEffect = (topCard.effects ?? []).some((e) => e.type === effectType);
      if (!hasEffect) continue;

      const handler = getEffectHandler(topCard.id, effectType);
      if (!handler) continue;

      const ctx: EffectContext = {
        state: newState,
        sourcePlayer: resolvedPending.sourcePlayer,
        sourceCard: character,
        sourceMissionIndex: missionIndex,
        triggerType: effectType,
        isUpgrade: resolvedPending.isUpgrade,
      };

      const result = handler(ctx);

      if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
        // Another pending needed
        const remainingAfterThis = remaining.slice(remaining.indexOf(effectType) + 1);
        newState = EffectEngine.createPendingTargetSelection(
          newState, resolvedPending.sourcePlayer, character, missionIndex,
          effectType, resolvedPending.isUpgrade, result, remainingAfterThis,
        );
        return newState;
      }
      newState = result.state;
    }

    return newState;
  }

  // =====================================
  // Effect Application Helper Methods
  // =====================================

  /** Add power tokens to a character by instanceId */
  static applyPowerupToTarget(state: GameState, targetId: string, amount: number): GameState {
    const newState = { ...state };
    newState.activeMissions = state.activeMissions.map((mission) => ({
      ...mission,
      player1Characters: mission.player1Characters.map((char) =>
        char.instanceId === targetId ? { ...char, powerTokens: char.powerTokens + amount } : char,
      ),
      player2Characters: mission.player2Characters.map((char) =>
        char.instanceId === targetId ? { ...char, powerTokens: char.powerTokens + amount } : char,
      ),
    }));
    return newState;
  }

  /** Remove up to N power tokens from a character */
  static removeTokensFromTarget(state: GameState, targetId: string, maxRemove: number): GameState {
    const newState = { ...state };
    newState.activeMissions = state.activeMissions.map((mission) => ({
      ...mission,
      player1Characters: mission.player1Characters.map((char) =>
        char.instanceId === targetId
          ? { ...char, powerTokens: Math.max(0, char.powerTokens - maxRemove) }
          : char,
      ),
      player2Characters: mission.player2Characters.map((char) =>
        char.instanceId === targetId
          ? { ...char, powerTokens: Math.max(0, char.powerTokens - maxRemove) }
          : char,
      ),
    }));
    return newState;
  }

  /** Steal up to N power tokens from target enemy, add to source character */
  static stealTokensFromTarget(state: GameState, pending: PendingEffect, targetId: string, maxSteal: number): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const stolen = Math.min(charResult.character.powerTokens, maxSteal);
    let newState = EffectEngine.removeTokensFromTarget(state, targetId, stolen);
    newState = EffectEngine.applyPowerupToTarget(newState, pending.sourceInstanceId, stolen);
    return newState;
  }

  /** Move a character to a different mission. targetId format: "instanceId:missionIndex" */
  static moveCharacterToMission(state: GameState, targetId: string): GameState {
    const parts = targetId.split(':');
    if (parts.length < 2) return state;
    const instanceId = parts[0];
    const destMissionIndex = parseInt(parts[1], 10);
    if (isNaN(destMissionIndex)) return state;

    const charResult = EffectEngine.findCharByInstanceId(state, instanceId);
    if (!charResult) return state;
    if (charResult.missionIndex === destMissionIndex) return state;

    const newState = deepClone(state);
    const srcMission = newState.activeMissions[charResult.missionIndex];
    const destMission = newState.activeMissions[destMissionIndex];
    if (!srcMission || !destMission) return state;

    // Remove from source mission
    const isP1 = charResult.player === 'player1';
    const srcKey = isP1 ? 'player1Characters' : 'player2Characters';
    const charIdx = srcMission[srcKey].findIndex((c: CharacterInPlay) => c.instanceId === instanceId);
    if (charIdx === -1) return state;

    const [movedChar] = srcMission[srcKey].splice(charIdx, 1);
    movedChar.missionIndex = destMissionIndex;

    // Add to destination mission
    destMission[srcKey].push(movedChar);

    // Ninja Hounds 100 trigger: when moved to a different mission, look at a hidden character there
    const movedTopCard = movedChar.stack.length > 0 ? movedChar.stack[movedChar.stack.length - 1] : movedChar.card;
    if (movedTopCard.number === 100 && !movedChar.isHidden) {
      const hasNHEffect = (movedTopCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moves to a different mission'),
      );
      if (hasNHEffect) {
        // Look at a hidden character in the destination mission
        const allCharsInDest = [...destMission.player1Characters, ...destMission.player2Characters];
        const hiddenInDest = allCharsInDest.find(
          (c) => c.isHidden && c.instanceId !== movedChar.instanceId,
        );
        if (hiddenInDest) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase,
            charResult.player,
            'EFFECT',
            `Ninja Hounds (100): Moved to mission ${destMissionIndex} - looked at hidden ${hiddenInDest.card.name_fr}.`,
            'game.log.effect.lookAtHidden',
            { card: 'Chiens Ninjas', id: '100/130', target: hiddenInDest.card.name_fr },
          );
        }
      }
    }

    return newState;
  }

  /** Move the source character (Pakkun) to a selected mission. targetId is the mission index as string */
  static moveSelfToMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMissionIndex = parseInt(targetId, 10);
    if (isNaN(destMissionIndex)) return state;

    return EffectEngine.moveCharacterToMission(state, `${pending.sourceInstanceId}:${destMissionIndex}`);
  }

  /** Orochimaru AMBUSH: look at hidden enemy, if cost <= 3 steal control */
  static orochimaruLookAndSteal(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || !charResult.character.isHidden) return state;

    const newState = deepClone(state);
    const mission = newState.activeMissions[charResult.missionIndex];
    const enemyKey = charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyKey = pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    const targetCharIdx = mission[enemyKey].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (targetCharIdx === -1) return state;

    const targetChar = mission[enemyKey][targetCharIdx];
    const actualCost = targetChar.card.chakra;

    // Log the look
    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Orochimaru looks at hidden enemy: ${targetChar.card.name_fr} (cost ${actualCost}).`,
      'game.log.effect.lookAtHidden',
      { card: 'Orochimaru', id: '050/130', target: targetChar.card.name_fr },
    );

    // If cost <= 3, steal control
    if (actualCost <= 3) {
      mission[enemyKey].splice(targetCharIdx, 1);
      targetChar.controlledBy = pending.sourcePlayer;
      mission[friendlyKey].push(targetChar);

      newState.log = logAction(
        newState.log, newState.turn, 'action', pending.sourcePlayer,
        'EFFECT', `Orochimaru steals ${targetChar.card.name_fr}!`,
        'game.log.effect.takeControl',
        { card: 'Orochimaru', id: '050/130', target: targetChar.card.name_fr },
      );
    }

    return newState;
  }

  /**
   * Defeat a character (remove from play, add to owner's discard).
   * Handles:
   * 1. Defeat replacement checks (Hayate 048, Gaara 075, Gemma 049)
   * 2. On-defeat triggers (Tsunade 003, Sasuke 136) via shared triggerOnDefeatEffects
   */
  static defeatCharacter(state: GameState, targetId: string, sourcePlayer?: PlayerID): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const effectSource = sourcePlayer ?? (charResult.player === 'player1' ? 'player2' : 'player1');

    // Check for defeat replacement (Hayate, Gaara 075, Gemma)
    const replacement = EffectEngine.checkDefeatReplacement(
      state, charResult.character, charResult.player, charResult.missionIndex, true,
    );
    if (replacement.replaced) {
      if (replacement.replacement === 'hide') {
        return EffectEngine.hideCharacter(state, targetId);
      }
      if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
        let newState = EffectEngine.defeatCharacterDirect(state, replacement.sacrificeInstanceId);
        // Find the sacrificed character for on-defeat triggers
        const sacrificeResult = EffectEngine.findCharByInstanceId(state, replacement.sacrificeInstanceId);
        if (sacrificeResult) {
          newState = triggerOnDefeatEffects(newState, sacrificeResult.character, sacrificeResult.player);
        }
        return newState;
      }
    }

    // Normal defeat
    let newState = EffectEngine.defeatCharacterDirect(state, targetId);
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, effectSource,
        'EFFECT_DEFEAT', `${charResult.character.card.name_fr} was defeated.`,
        'game.log.effect.defeat',
        { card: '???', id: '', target: charResult.character.card.name_fr },
      ),
    };
    // Trigger on-defeat effects (Tsunade 003, Sasuke 136)
    newState = triggerOnDefeatEffects(newState, charResult.character, charResult.player);
    return newState;
  }

  /** Directly defeat a character (no replacement check) */
  static defeatCharacterDirect(state: GameState, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const newState = deepClone(state);
    const mission = newState.activeMissions[charResult.missionIndex];
    const key = charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';

    const idx = mission[key].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (idx === -1) return state;

    const defeated = mission[key].splice(idx, 1)[0];

    // Add all cards in the stack to the original owner's discard pile
    const owner = defeated.originalOwner;
    for (const card of defeated.stack) {
      newState[owner].discardPile.push(card);
    }

    // Update character count
    newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
    newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');

    return newState;
  }

  /** Hide a character (flip face-down) */
  static hideCharacter(state: GameState, targetId: string): GameState {
    const newState = deepClone(state);
    for (const mission of newState.activeMissions) {
      for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
        if (char.instanceId === targetId) {
          char.isHidden = true;
          return newState;
        }
      }
    }
    return state;
  }

  /** Jiraiya: play a Summon card from hand. targetId format: "cardIndex:missionIndex" */
  static playSummonFromHand(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const parts = targetId.split(':');
    if (parts.length < 2) return state;
    const cardIndex = parseInt(parts[0], 10);
    const missionIndex = parseInt(parts[1], 10);
    if (isNaN(cardIndex) || isNaN(missionIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (cardIndex < 0 || cardIndex >= ps.hand.length) return state;
    const card = ps.hand[cardIndex];
    if (!card.keywords?.includes('Summon')) return state;

    // Cost with 1 reduction
    const cost = Math.max(0, card.chakra - 1);
    if (ps.chakra < cost) return state;
    ps.chakra -= cost;

    // Remove from hand
    ps.hand.splice(cardIndex, 1);

    // Create character in play
    const charInPlay: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card,
      isHidden: false,
      powerTokens: 0,
      stack: [card],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const mission = newState.activeMissions[missionIndex];
    const key = player === 'player1' ? 'player1Characters' : 'player2Characters';
    mission[key].push(charInPlay);

    ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

    newState.log = logAction(
      newState.log, newState.turn, 'action', player,
      'EFFECT', `Jiraiya's effect: plays ${card.name_fr} as Summon on mission ${missionIndex + 1} for ${cost} chakra.`,
      'game.log.effect.playSummon',
      { card: 'Jiraya', id: '007/130', target: card.name_fr, mission: missionIndex + 1, cost },
    );

    return newState;
  }

  /** Kimimaro step 2: hide the selected target character */
  static kimimaroDiscardAndHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    // targetId is now just an instanceId (discard was already done in step 1)
    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return newState;

    const topCard = charResult.character.stack.length > 0
      ? charResult.character.stack[charResult.character.stack.length - 1]
      : charResult.character.card;

    if ((topCard.chakra ?? 0) <= 3 && !charResult.character.isHidden) {
      const hiddenState = EffectEngine.hideCharacter(newState, targetId);
      hiddenState.log = logAction(
        hiddenState.log, hiddenState.turn, hiddenState.phase, player,
        'EFFECT_HIDE',
        `Kimimaro (055): Hid ${topCard.name_fr}.`,
        'game.log.effect.hide',
        { card: 'Kimimaro', id: '055/130', target: topCard.name_fr, mission: String(charResult.missionIndex + 1) },
      );
      return hiddenState;
    }

    return newState;
  }

  /**
   * Kimimaro step 1: player chose which card to discard.
   * Now discard it, then create a second pending to choose hide target.
   */
  static kimimaroChooseDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    // Discard the selected card
    const discardedCard = ps.hand.splice(handIndex, 1)[0];
    ps.discardPile.push(discardedCard);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_DISCARD',
      `Kimimaro (055): Discarded ${discardedCard.name_fr}.`,
      'game.log.effect.discardCards',
      { card: 'Kimimaro', id: '055/130', count: 1 },
    );

    // Find valid hide targets (cost <= 3, not hidden, not Kimimaro himself)
    const opponent = player === 'player1' ? 'player2' : 'player1';
    const enemySide = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
    const validHideTargets: string[] = [];

    for (const mission of newState.activeMissions) {
      for (const char of mission[enemySide]) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
      for (const char of mission[friendlySide]) {
        if (char.isHidden) continue;
        if (char.instanceId === pending.sourceInstanceId) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
    }

    if (validHideTargets.length === 0) {
      return newState; // No valid target — card was discarded but no hide
    }

    if (validHideTargets.length === 1) {
      // Auto-hide the only valid target
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT_HIDE',
        `Kimimaro (055): Hid a character.`,
        'game.log.effect.hide',
        { card: 'Kimimaro', id: '055/130', target: validHideTargets[0], mission: '' },
      );
      return EffectEngine.hideCharacter(newState, validHideTargets[0]);
    }

    // Multiple targets — create a new pending for hide target selection
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: 'Choose a character to hide (cost 3 or less).',
      targetSelectionType: 'KIMIMARO_DISCARD_AND_HIDE',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validHideTargets,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: pending.isUpgrade,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: 'Kimimaro (055): Choose a character to hide (cost 3 or less).',
      options: validHideTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Haku: put a card from hand on top of deck. targetId is hand index as string */
  static putCardOnDeck(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const card = ps.hand.splice(handIndex, 1)[0];
    ps.deck.unshift(card); // Put on top of deck

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_PUT_ON_DECK',
      `Put ${card.name_fr} back on top of deck.`,
      'game.log.effect.putOnDeck',
      { card: card.name_fr, id: pending.sourceCardId },
    );

    return newState;
  }

  // =====================================
  // Utility Methods
  // =====================================

  /** Find a character across all missions by instanceId */
  static findCharByInstanceId(
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

  /** Count all characters for a player across all missions */
  static countCharsForPlayer(state: GameState, player: PlayerID): number {
    let count = 0;
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      count += chars.length;
    }
    return count;
  }

  /**
   * Check if a defeat should be replaced by another action (e.g., Hayate hides instead).
   */
  static checkDefeatReplacement(
    state: GameState,
    targetChar: CharacterInPlay,
    targetPlayer: PlayerID,
    missionIndex: number,
    isEnemyEffect: boolean,
  ): { replaced: boolean; replacement: 'hide' | 'sacrifice'; sacrificeInstanceId?: string } {
    if (targetChar.isHidden) {
      return { replaced: false, replacement: 'hide' };
    }

    const topCard = targetChar.stack.length > 0 ? targetChar.stack[targetChar.stack.length - 1] : targetChar.card;

    // Hayate 048: If this character would be defeated, hide it instead
    if (topCard.number === 48) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    // Gaara 075: If this character would be moved or defeated by enemy effects, hide instead
    if (topCard.number === 75 && isEnemyEffect) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated by enemy') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    // Gemma 049: If friendly Leaf Village in this mission would be hidden/defeated by enemy effects,
    // can defeat this character instead (sacrifice)
    if (isEnemyEffect) {
      const mission = state.activeMissions[missionIndex];
      const friendlyChars = targetPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

      for (const friendly of friendlyChars) {
        if (friendly.isHidden || friendly.instanceId === targetChar.instanceId) continue;
        const fTopCard = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;

        if (fTopCard.number === 49) {
          const hasSacrifice = (fTopCard.effects ?? []).some(
            (e) =>
              e.type === 'MAIN' &&
              e.description.includes('[⧗]') &&
              e.description.includes('Leaf Village') &&
              e.description.includes('defeat this character instead'),
          );
          if (hasSacrifice && targetChar.card.group === 'Leaf Village') {
            return { replaced: true, replacement: 'sacrifice', sacrificeInstanceId: friendly.instanceId };
          }
        }
      }
    }

    return { replaced: false, replacement: 'hide' };
  }
}
