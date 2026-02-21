import type { GameState, PlayerID, CharacterInPlay, EffectType, PendingEffect, PendingAction } from '../engine/types';
import type { EffectContext, EffectResult } from './EffectTypes';
import { getEffectHandler } from './EffectRegistry';
import { deepClone } from '../engine/utils/deepClone';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';
import { triggerOnDefeatEffects } from './onDefeatTriggers';
import { checkNinjaHoundsTrigger } from './moveTriggers';

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
        try {
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
        } catch (err) {
          console.error(`[EffectEngine] MAIN handler error for ${topCard.id}:`, err);
        }
      }
    }

    // If this is an upgrade, also resolve UPGRADE effects
    if (isUpgrade) {
      const hasUpgradeEffect = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
      if (hasUpgradeEffect) {
        const handler = getEffectHandler(topCard.id, 'UPGRADE');
        if (handler) {
          try {
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
          } catch (err) {
            console.error(`[EffectEngine] UPGRADE handler error for ${topCard.id}:`, err);
          }
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
        try {
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
        } catch (err) {
          console.error(`[EffectEngine] MAIN handler error for ${topCard.id} (reveal):`, err);
        }
      }
    }

    // Resolve AMBUSH effects
    const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
    if (hasAmbushEffect) {
      const handler = getEffectHandler(topCard.id, 'AMBUSH');
      if (handler) {
        try {
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
        } catch (err) {
          console.error(`[EffectEngine] AMBUSH handler error for ${topCard.id}:`, err);
        }
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
        try {
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
        } catch (err) {
          console.error(`[EffectEngine] SCORE handler error for mission ${mission.card.id}:`, err);
        }
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
          try {
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
          } catch (err) {
            console.error(`[EffectEngine] SCORE handler error for char ${topCard.id}:`, err);
          }
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
    const tst = result.targetSelectionType ?? '';
    if (tst === 'PUT_CARD_ON_DECK') {
      actionType = 'PUT_CARD_ON_DECK';
    } else if (
      tst === 'DISCARD_CARD' ||
      tst === 'KIMIMARO_CHOOSE_DISCARD' ||
      tst === 'CHOJI_CHOOSE_DISCARD' ||
      tst === 'MSS03_OPPONENT_DISCARD'
    ) {
      actionType = 'DISCARD_CARD';
    } else if (
      tst === 'CHOOSE_CARD_FROM_LIST' ||
      tst === 'MSS08_CHOOSE_CARD' ||
      tst === 'JIRAIYA_CHOOSE_SUMMON' ||
      tst === 'SAKURA109_CHOOSE_DISCARD' ||
      tst === 'SAKURA135_CHOOSE_CARD'
    ) {
      actionType = 'CHOOSE_CARD_FROM_LIST';
    }

    // Extract human-readable description (some handlers store JSON with a .text field)
    let actionDescription = result.description ?? '';
    try {
      const parsed = JSON.parse(actionDescription);
      if (parsed && typeof parsed.text === 'string') {
        actionDescription = parsed.text;
      }
    } catch { /* not JSON, use as-is */ }

    const pendingAction: PendingAction = {
      id: actionId,
      type: actionType,
      player: result.selectingPlayer ?? player,
      description: actionDescription,
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

      // --- MSS 08: Set a Trap ---
      case 'MSS08_CHOOSE_CARD':
        newState = EffectEngine.mss08ChooseCard(newState, pendingEffect, targetId);
        break;
      case 'MSS08_CHOOSE_MISSION':
        newState = EffectEngine.mss08ChooseMission(newState, pendingEffect, targetId);
        break;

      // --- MSS 01: Call for Support ---
      case 'MSS01_POWERUP_TARGET':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 2);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'SCORE_POWERUP', `MSS 01 (Call for Support): POWERUP 2 on selected target.`,
          'game.log.score.powerup', { card: 'Appel de soutien', amount: 2, target: targetId },
        );
        break;

      // --- MSS 03: Find the Traitor ---
      case 'MSS03_OPPONENT_DISCARD':
        newState = EffectEngine.mss03OpponentDiscard(newState, pendingEffect, targetId);
        break;

      // --- MSS 04: Assassination ---
      case 'MSS04_DEFEAT_HIDDEN':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'SCORE_DEFEAT', `MSS 04 (Assassination): Defeated hidden enemy character.`,
          'game.log.score.defeat', { card: 'Assassinat', target: targetId },
        );
        break;

      // --- MSS 05: Bring it Back ---
      case 'MSS05_RETURN_TO_HAND':
        newState = EffectEngine.mss05ReturnToHand(newState, pendingEffect, targetId);
        break;

      // --- MSS 07: I Have to Go (character selection) ---
      case 'MSS07_MOVE_HIDDEN':
        newState = EffectEngine.mss07ChooseCharacter(newState, pendingEffect, targetId);
        break;

      // --- MSS 07: I Have to Go (destination selection) ---
      case 'MSS07_CHOOSE_DESTINATION':
        newState = EffectEngine.mss07ChooseDestination(newState, pendingEffect, targetId);
        break;

      // --- Jiraiya 007 ---
      case 'JIRAIYA_CHOOSE_SUMMON':
        newState = EffectEngine.jiraiyaChooseSummon(newState, pendingEffect, targetId);
        break;
      case 'JIRAIYA_CHOOSE_MISSION':
        newState = EffectEngine.jiraiyaChooseMission(newState, pendingEffect, targetId);
        break;

      // --- Asuma 023 ---
      case 'ASUMA_CHOOSE_TEAM10':
        newState = EffectEngine.asumaChooseTeam10(newState, pendingEffect, targetId);
        break;
      case 'ASUMA_CHOOSE_DESTINATION':
        newState = EffectEngine.asumaChooseDestination(newState, pendingEffect, targetId);
        break;

      // --- Iruka 047 ---
      case 'IRUKA_CHOOSE_NARUTO':
        newState = EffectEngine.irukaChooseNaruto(newState, pendingEffect, targetId);
        break;
      case 'IRUKA_CHOOSE_DESTINATION':
        newState = EffectEngine.irukaChooseDestination(newState, pendingEffect, targetId);
        break;

      // --- Kidomaru 059 ---
      case 'KIDOMARU_CHOOSE_CHARACTER':
        newState = EffectEngine.kidomaruChooseCharacter(newState, pendingEffect, targetId);
        break;
      case 'KIDOMARU_CHOOSE_DESTINATION':
        newState = EffectEngine.kidomaruChooseDestination(newState, pendingEffect, targetId);
        break;

      // --- Sakura 109 (R) ---
      case 'SAKURA109_CHOOSE_DISCARD':
        newState = EffectEngine.sakura109ChooseFromDiscard(newState, pendingEffect, targetId);
        break;
      case 'SAKURA109_CHOOSE_MISSION':
        newState = EffectEngine.sakura109ChooseMission(newState, pendingEffect, targetId);
        break;

      // --- Sakura 135 (S) ---
      case 'SAKURA135_CHOOSE_CARD':
        newState = EffectEngine.sakura135ChooseCard(newState, pendingEffect, targetId);
        break;
      case 'SAKURA135_CHOOSE_MISSION':
        newState = EffectEngine.sakura135ChooseMission(newState, pendingEffect, targetId);
        break;

      // --- Choji 112 (R) ---
      case 'CHOJI_CHOOSE_DISCARD':
        newState = EffectEngine.chojiChooseDiscard(newState, pendingEffect, targetId);
        break;

      // --- Itachi 143 (M) ---
      case 'ITACHI143_CHOOSE_FRIENDLY':
        newState = EffectEngine.itachi143MoveFriendly(newState, pendingEffect, targetId);
        break;
      case 'ITACHI143_CHOOSE_ENEMY':
        newState = EffectEngine.itachi143MoveEnemy(newState, pendingEffect, targetId);
        break;

      // --- Gaara 139 (S) ---
      case 'DEFEAT_ENEMY_BY_COST':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Itachi 140 (S) UPGRADE ---
      case 'DEFEAT_BY_COST_UPGRADE':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Ino 020 (UC) ---
      case 'TAKE_CONTROL_ENEMY_THIS_MISSION':
        newState = EffectEngine.takeControlOfEnemy(newState, pendingEffect, targetId);
        break;

      // --- Kisame 093 (UC) ---
      case 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY':
        newState = EffectEngine.stealTokensFromTarget(newState, pendingEffect, targetId, pendingEffect.isUpgrade ? 99 : 2);
        break;

      // =============================================
      // DEFEAT types
      // =============================================
      case 'NEJI116_DEFEAT_TARGET':
      case 'KURENAI116B_DEFEAT_TARGET':
      case 'KIBA113_DEFEAT_TARGET':
      case 'KANKURO119_DEFEAT_TARGET':
      case 'JIROBO122_DEFEAT_TARGET':
      case 'KIDOMARU124_DEFEAT_TARGET':
      case 'OROCHIMARU126_DEFEAT_WEAKEST':
      case 'TENTEN_118_DEFEAT_HIDDEN_IN_MISSION':
      case 'KIBA149_CHOOSE_DEFEAT_TARGET':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // =============================================
      // HIDE types
      // =============================================
      case 'KIBA113_HIDE_TARGET':
      case 'UKON124B_HIDE_TARGET':
      case 'SHIKAMARU111_HIDE_ENEMY':
      case 'KIBA149_CHOOSE_HIDE_TARGET':
      case 'SHIKAMARU150_CHOOSE_HIDE':
      case 'NARUTO141_CHOOSE_HIDE_TARGET':
      case 'JIRAIYA_HIDE_ENEMY_COST_3':
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // =============================================
      // MOVE types (character selection — use moveCharacterToMission)
      // =============================================
      case 'JIRAIYA105_MOVE_ENEMY':
      case 'KANKURO119_MOVE_CHARACTER':
      case 'TEMARI121_MOVE_FRIENDLY':
      case 'TEMARI121_MOVE_ANY':
      case 'ITACHI128_MOVE_FRIENDLY':
      case 'ITACHI152_CHOOSE_MOVE':
        newState = EffectEngine.moveCharacterToMission(newState, targetId);
        break;

      // --- MOVE types (destination selection — use moveSelfToMission) ---
      case 'KURENAI116B_MOVE_SELF':
      case 'KAKASHI137_MOVE_SELF':
      case 'PAKKUN_MOVE_DESTINATION':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      // --- Shikamaru 022 — move enemy character (two-stage: char then destination) ---
      case 'SHIKAMARU_MOVE_ENEMY': {
        // Stage 1: player chose which enemy character to move. Now prompt for destination.
        const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (charResult) {
          const validMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== charResult.missionIndex) validMissions.push(String(i));
          }
          if (validMissions.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validMissions[0], 10),
              charResult.player, 'Shikamaru Nara', '022/130',
            );
          } else if (validMissions.length > 1) {
            const effectId = generateInstanceId();
            const actionId = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: 'SHIKAMARU_MOVE_ENEMY_DESTINATION',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validMissions,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Shikamaru Nara (022): Choose a mission to move the enemy character to.',
              options: validMissions,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId,
            });
          }
        }
        break;
      }
      case 'SHIKAMARU_MOVE_ENEMY_DESTINATION': {
        const destMission = parseInt(targetId, 10);
        if (!isNaN(destMission)) {
          let charInstanceId = '';
          try { charInstanceId = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (charInstanceId) {
            const charRes = EffectEngine.findCharByInstanceId(newState, charInstanceId);
            if (charRes) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, charInstanceId, destMission,
                charRes.player, 'Shikamaru Nara', '022/130',
              );
            }
          }
        }
        break;
      }

      // --- Ino 110 (R) — move weakest enemy (two-stage: char then destination, optional hide on upgrade) ---
      case 'INO110_CHOOSE_ENEMY': {
        // Stage 1: player chose which weakest enemy to move. Now prompt for destination.
        const ino110Char = EffectEngine.findCharByInstanceId(newState, targetId);
        if (ino110Char) {
          const validDests: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== ino110Char.missionIndex) validDests.push(String(i));
          }
          if (validDests.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDests[0], 10),
              ino110Char.player, 'Ino Yamanaka', '110/130',
            );
            // If upgrade, also hide the moved character
            if (pendingEffect.isUpgrade) {
              newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
            }
          } else if (validDests.length > 1) {
            const ino110EffId = generateInstanceId();
            const ino110ActId = generateInstanceId();
            newState.pendingEffects.push({
              id: ino110EffId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: 'INO110_CHOOSE_DESTINATION',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validDests,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
            });
            newState.pendingActions.push({
              id: ino110ActId,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Ino Yamanaka (110): Choose a mission to move the enemy character to.',
              options: validDests,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: ino110EffId,
            });
          }
        }
        break;
      }
      case 'INO110_CHOOSE_DESTINATION': {
        const ino110Dest = parseInt(targetId, 10);
        if (!isNaN(ino110Dest)) {
          let ino110CharId = '';
          try { ino110CharId = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (ino110CharId) {
            const ino110CharRes = EffectEngine.findCharByInstanceId(newState, ino110CharId);
            if (ino110CharRes) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, ino110CharId, ino110Dest,
                ino110CharRes.player, 'Ino Yamanaka', '110/130',
              );
              // If upgrade, also hide the moved character
              if (pendingEffect.isUpgrade) {
                newState = EffectEngine.hideCharacterWithLog(newState, ino110CharId, pendingEffect.sourcePlayer);
              }
            }
          }
        }
        break;
      }

      // =============================================
      // POWERUP types
      // =============================================
      case 'HINATA114_POWERUP_TARGET':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 2);
        break;

      // =============================================
      // REMOVE TOKENS types
      // =============================================
      case 'HINATA114_REMOVE_TOKENS':
        newState = EffectEngine.removeTokensFromTarget(newState, targetId, 99);
        break;

      // =============================================
      // DISCARD FROM HAND types
      // =============================================
      case 'ASUMA113B_CHOOSE_DISCARD': {
        // Stage 1: discard card, then defeat a character with Power <= discarded card's Power
        const handIndex_a = parseInt(targetId, 10);
        if (!isNaN(handIndex_a)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_a);
          const discardedCard_a = newState[pendingEffect.sourcePlayer].discardPile[newState[pendingEffect.sourcePlayer].discardPile.length - 1];
          const maxPower = discardedCard_a?.power ?? 0;
          // Find characters with effective power <= discarded card's power
          const defeatTargets: string[] = [];
          for (const mission of newState.activeMissions) {
            for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
              if (char.instanceId === pendingEffect.sourceInstanceId) continue;
              const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
              const effectivePower = char.isHidden ? 0 : (topCard.power + char.powerTokens);
              if (effectivePower <= maxPower) {
                defeatTargets.push(char.instanceId);
              }
            }
          }
          if (defeatTargets.length === 1) {
            newState = EffectEngine.defeatCharacter(newState, defeatTargets[0], pendingEffect.sourcePlayer);
          } else if (defeatTargets.length > 1) {
            const effectId = generateInstanceId();
            const actionId = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: `Asuma Sarutobi (113b): Defeat a character with Power ${maxPower} or less.`,
              targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: defeatTargets,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: `Asuma Sarutobi (113b): Choose a character with Power ${maxPower} or less to defeat.`,
              options: defeatTargets,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId,
            });
          }
        }
        break;
      }

      case 'GUY119B_CHOOSE_DISCARD': {
        // Guy 119b: discard a card, then move non-hidden enemies with total Power <= discarded card's Power
        const handIndex_g = parseInt(targetId, 10);
        if (!isNaN(handIndex_g)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_g);
          const discardedCard_g = newState[pendingEffect.sourcePlayer].discardPile[newState[pendingEffect.sourcePlayer].discardPile.length - 1];
          const maxPower_g = discardedCard_g?.power ?? 0;
          // Auto-move: find non-hidden enemies with power <= maxPower and move them
          const enemySide_g: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
            const mission = newState.activeMissions[mIdx];
            const toMove = mission[enemySide_g].filter(c => {
              if (c.isHidden) return false;
              const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              return (topCard.power + c.powerTokens) <= maxPower_g;
            });
            for (const char of toMove) {
              // Move to a different mission (first available)
              for (let destIdx = 0; destIdx < newState.activeMissions.length; destIdx++) {
                if (destIdx !== mIdx) {
                  newState = EffectEngine.moveCharToMissionDirectPublic(
                    newState, char.instanceId, destIdx,
                    pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1',
                    'Might Guy', '119b/130',
                  );
                  break;
                }
              }
            }
          }
        }
        break;
      }

      case 'KIMIMARO123_CHOOSE_DISCARD': {
        // Kimimaro 123 UPGRADE: discard a card, then defeat a character with cost 5 or less
        const handIndex_k = parseInt(targetId, 10);
        if (!isNaN(handIndex_k)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_k);
          // Find characters with cost <= 5 in play to defeat
          const defeatTargets_k: string[] = [];
          for (const mission of newState.activeMissions) {
            for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
              if (char.instanceId === pendingEffect.sourceInstanceId) continue;
              const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
              if ((topCard.chakra ?? 0) <= 5) {
                defeatTargets_k.push(char.instanceId);
              }
            }
          }
          if (defeatTargets_k.length === 1) {
            newState = EffectEngine.defeatCharacter(newState, defeatTargets_k[0], pendingEffect.sourcePlayer);
          } else if (defeatTargets_k.length > 1) {
            const effectId = generateInstanceId();
            const actionId = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: 'Kimimaro (123) UPGRADE: Choose a character with cost 5 or less to defeat.',
              targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: defeatTargets_k,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Kimimaro (123) UPGRADE: Choose a character with cost 5 or less to defeat.',
              options: defeatTargets_k,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId,
            });
          }
        }
        break;
      }

      case 'NARUTO141_CHOOSE_DISCARD': {
        // Naruto 141: discard a card from hand, then hide an enemy with Power 4 or less in this mission
        const handIndex_n = parseInt(targetId, 10);
        if (!isNaN(handIndex_n)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_n);
          // Find enemies with Power <= 4 in this mission
          const enemySide_n: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const thisMission = newState.activeMissions[pendingEffect.sourceMissionIndex];
          if (thisMission) {
            const hideTargets_n = thisMission[enemySide_n].filter(c => {
              if (c.isHidden) return false;
              const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              return (topCard.power + c.powerTokens) <= 4;
            }).map(c => c.instanceId);
            if (hideTargets_n.length === 1) {
              newState = EffectEngine.hideCharacterWithLog(newState, hideTargets_n[0], pendingEffect.sourcePlayer);
            } else if (hideTargets_n.length > 1) {
              const effectId = generateInstanceId();
              const actionId = generateInstanceId();
              newState.pendingEffects.push({
                id: effectId,
                sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: 'Naruto Uzumaki (141): Choose an enemy with Power 4 or less to hide.',
                targetSelectionType: 'NARUTO141_CHOOSE_HIDE_TARGET',
                sourcePlayer: pendingEffect.sourcePlayer,
                requiresTargetSelection: true,
                validTargets: hideTargets_n,
                isOptional: true,
                isMandatory: false,
                resolved: false,
                isUpgrade: false,
              });
              newState.pendingActions.push({
                id: actionId,
                type: 'SELECT_TARGET',
                player: pendingEffect.sourcePlayer,
                description: 'Naruto Uzumaki (141): Choose an enemy with Power 4 or less to hide.',
                options: hideTargets_n,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: effectId,
              });
            }
          }
        }
        break;
      }

      case 'SASUKE142_CHOOSE_DISCARD': {
        // Sasuke 142: discard a card, then POWERUP (X+1) where X = enemies in this mission
        const handIndex_s = parseInt(targetId, 10);
        if (!isNaN(handIndex_s)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_s);
          // Count enemy characters in this mission
          const enemySide_s: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const thisMission_s = newState.activeMissions[pendingEffect.sourceMissionIndex];
          if (thisMission_s) {
            const enemyCount = thisMission_s[enemySide_s].length;
            const powerupAmount = enemyCount + 1;
            newState = EffectEngine.applyPowerupToTarget(newState, pendingEffect.sourceInstanceId, powerupAmount);
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_POWERUP',
              `Sasuke Uchiwa (142): POWERUP ${powerupAmount} (X+1, X=${enemyCount} enemy characters in this mission).`,
              'game.log.effect.powerupSelf',
              { card: 'SASUKE UCHIWA', id: '142/130', amount: powerupAmount },
            );
          }
        }
        break;
      }

      // =============================================
      // PLAY SUMMON types
      // =============================================
      case 'JIRAIYA105_CHOOSE_SUMMON':
        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 3);
        break;

      case 'JIRAIYA132_CHOOSE_SUMMON':
        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 5);
        break;

      // =============================================
      // SPECIAL types
      // =============================================
      case 'TAYUYA125_CHOOSE_SOUND':
        newState = EffectEngine.playCharFromHandWithReduction(newState, pendingEffect, targetId, 2, 'Sound Village', 'Tayuya', '125/130');
        break;

      case 'ICHIBI130_CHOOSE_MISSION': {
        // Ichibi 130 UPGRADE: defeat all hidden enemies in the selected mission
        const missionIdx_i = parseInt(targetId, 10);
        if (!isNaN(missionIdx_i) && missionIdx_i >= 0 && missionIdx_i < newState.activeMissions.length) {
          const enemySide_i: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const mission_i = newState.activeMissions[missionIdx_i];
          const hiddenEnemies = mission_i[enemySide_i].filter((c: CharacterInPlay) => c.isHidden);
          let defeatedCount = 0;
          for (const hidden of hiddenEnemies) {
            newState = EffectEngine.defeatCharacter(newState, hidden.instanceId, pendingEffect.sourcePlayer);
            defeatedCount++;
          }
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DEFEAT',
            `Ichibi (130) UPGRADE: Defeated ${defeatedCount} hidden enemy character(s) in mission ${missionIdx_i + 1}.`,
            'game.log.effect.defeat',
            { card: 'ICHIBI', id: '130/130', target: `${defeatedCount} hidden enemies` },
          );
        }
        break;
      }

      case 'KAKASHI148_COPY_EFFECT': {
        // Kakashi 148 AMBUSH: copy a Team 7 character's instant effect
        // Find the target character and execute their MAIN effect handler
        const copyCharResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (copyCharResult) {
          const copyTopCard = copyCharResult.character.stack.length > 0
            ? copyCharResult.character.stack[copyCharResult.character.stack.length - 1]
            : copyCharResult.character.card;
          // Try to execute the target's MAIN effect
          const copyHandler = getEffectHandler(copyTopCard.id, 'MAIN');
          if (copyHandler) {
            const sourceCharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
            if (sourceCharResult) {
              const copyCtx: EffectContext = {
                state: newState,
                sourcePlayer: pendingEffect.sourcePlayer,
                sourceCard: sourceCharResult.character,
                sourceMissionIndex: sourceCharResult.missionIndex,
                triggerType: 'MAIN',
                isUpgrade: false,
              };
              try {
                const copyResult = copyHandler(copyCtx);
                if (copyResult.requiresTargetSelection && copyResult.validTargets && copyResult.validTargets.length > 0) {
                  newState = EffectEngine.createPendingTargetSelection(
                    copyResult.state, pendingEffect.sourcePlayer, sourceCharResult.character,
                    sourceCharResult.missionIndex, 'MAIN', false, copyResult, [],
                  );
                } else {
                  newState = copyResult.state;
                }
              } catch (err) {
                console.error(`[EffectEngine] Kakashi 148 copy error for ${copyTopCard.id}:`, err);
              }
            }
          }
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            `Kakashi Hatake (148): Copied the effect of ${copyTopCard.name_fr}.`,
            'game.log.effect.copyEffect',
            { card: 'KAKASHI HATAKE', id: '148/130', target: copyTopCard.name_fr },
          );
        }
        break;
      }

      case 'KABUTO_CHOOSE_MISSION': {
        // Kabuto 052: place the stolen hidden card on the selected mission
        const missionIdx_kb = parseInt(targetId, 10);
        if (!isNaN(missionIdx_kb) && missionIdx_kb >= 0 && missionIdx_kb < newState.activeMissions.length) {
          const player_kb = pendingEffect.sourcePlayer;
          const friendlySide_kb: 'player1Characters' | 'player2Characters' =
            player_kb === 'player1' ? 'player1Characters' : 'player2Characters';
          const opponent_kb = player_kb === 'player1' ? 'player2' : 'player1';
          // Recover the stolen card from _pendingHiddenCard
          const stolenCard = (newState as any)._pendingHiddenCard;
          const originalOwner = (newState as any)._pendingOriginalOwner || opponent_kb;
          if (stolenCard) {
            const newChar_kb: CharacterInPlay = {
              instanceId: generateInstanceId(),
              card: stolenCard,
              isHidden: true,
              powerTokens: 0,
              stack: [stolenCard],
              controlledBy: player_kb,
              originalOwner: originalOwner,
              missionIndex: missionIdx_kb,
            };
            const missions_kb = [...newState.activeMissions];
            const mission_kb = { ...missions_kb[missionIdx_kb] };
            mission_kb[friendlySide_kb] = [...mission_kb[friendlySide_kb], newChar_kb];
            missions_kb[missionIdx_kb] = mission_kb;
            newState.activeMissions = missions_kb;
            newState[player_kb].charactersInPlay = EffectEngine.countCharsForPlayer(newState, player_kb);
            // Clean up temporary state
            delete (newState as any)._pendingHiddenCard;
            delete (newState as any)._pendingOriginalOwner;
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, player_kb,
              'EFFECT',
              `Kabuto Yakushi (052): Placed stolen card hidden on mission ${missionIdx_kb + 1}.`,
              'game.log.effect.kabutoSteal',
              { card: 'KABUTO YAKUSHI', id: '052/130', mission: String(missionIdx_kb + 1) },
            );
          }
        }
        break;
      }

      case 'GENERIC_CHOOSE_PLAY_MISSION': {
        // Stage 2 for playCharFromHandWithReduction: place the card on the chosen mission
        const missionIdx_gen = parseInt(targetId, 10);
        if (!isNaN(missionIdx_gen)) {
          let cost_gen = 0;
          let cardName_gen = '';
          let cardId_gen = '';
          let costReduction_gen = 0;
          try {
            const desc = JSON.parse(pendingEffect.effectDescription);
            cost_gen = desc.cost ?? 0;
            cardName_gen = desc.cardName ?? '';
            cardId_gen = desc.cardId ?? '';
            costReduction_gen = desc.costReduction ?? 0;
          } catch { /* ignore */ }
          newState = EffectEngine.genericPlaceOnMission(
            newState, pendingEffect.sourcePlayer, missionIdx_gen, cost_gen,
            cardName_gen, cardId_gen, costReduction_gen,
          );
        }
        break;
      }

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

  /** Hide a character and log the action */
  static hideCharacterWithLog(state: GameState, targetInstanceId: string, sourcePlayer: PlayerID): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetInstanceId);
    if (!charResult) return state;
    if (charResult.character.isHidden) return state;

    let newState = EffectEngine.hideCharacter(state, targetInstanceId);
    const targetName = charResult.character.card.name_fr;
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_HIDE',
        `Hid ${targetName}.`,
        'game.log.effect.hide',
        { card: '???', id: '', target: targetName, mission: String(charResult.missionIndex + 1) },
      ),
    };
    return newState;
  }

  /** Discard a card from a player's hand by index. Returns updated state with card moved to discard pile. */
  static discardFromHand(state: GameState, player: PlayerID, handIndex: number): GameState {
    const newState = deepClone(state);
    const ps = newState[player];
    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const discardedCard = ps.hand.splice(handIndex, 1)[0];
    ps.discardPile.push(discardedCard);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_DISCARD',
      `Discarded ${discardedCard.name_fr} from hand.`,
      'game.log.effect.discardSelf',
      { card: discardedCard.name_fr, id: '', target: discardedCard.name_fr },
    );

    return newState;
  }

  /** Play a Summon card from hand with a specified cost reduction. Two-stage: picks card, then mission. */
  static playSummonFromHandWithReduction(state: GameState, pending: PendingEffect, targetId: string, costReduction: number): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const chosenCard = ps.hand[handIndex];
    const cost = Math.max(0, chosenCard.chakra - costReduction);

    if (ps.chakra < cost) return state;

    // Remove card from hand, pay cost
    ps.hand.splice(handIndex, 1);
    ps.chakra -= cost;

    // Find valid missions (no same-name character already there)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const hasSameName = mission[friendlySide].some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === chosenCard.name_fr;
      });
      if (!hasSameName) validMissions.push(String(i));
    }

    if (validMissions.length === 0) {
      // Refund — no valid mission
      ps.hand.push(chosenCard);
      ps.chakra += cost;
      return state;
    }

    // Store chosen card in discard temporarily for stage 2 to recover
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      // Auto-resolve single mission
      return EffectEngine.jiraiyaPlaceOnMission(newState, player, parseInt(validMissions[0], 10), cost);
    }

    // Create stage 2: choose mission
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost }),
      targetSelectionType: 'JIRAIYA_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Choose a mission to play the Summon character on (cost reduced by ${costReduction}).`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Play a character card from hand with a specified cost reduction (e.g., Tayuya Sound Village). Two-stage if multiple missions. */
  static playCharFromHandWithReduction(
    state: GameState, pending: PendingEffect, targetId: string,
    costReduction: number, _groupFilter: string, cardName: string, cardId: string,
  ): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const chosenCard = ps.hand[handIndex];
    const cost = Math.max(0, chosenCard.chakra - costReduction);

    if (ps.chakra < cost) return state;

    // Remove card from hand, pay cost
    ps.hand.splice(handIndex, 1);
    ps.chakra -= cost;

    // Find valid missions (no same-name character already there)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const hasSameName = mission[friendlySide].some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === chosenCard.name_fr;
      });
      if (!hasSameName) validMissions.push(String(i));
    }

    if (validMissions.length === 0) {
      // Refund — no valid mission
      ps.hand.push(chosenCard);
      ps.chakra += cost;
      return state;
    }

    // Store chosen card in discard temporarily for auto-place to recover
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.genericPlaceOnMission(newState, player, parseInt(validMissions[0], 10), cost, cardName, cardId, costReduction);
    }

    // Create stage 2: choose mission
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost, cardName, cardId, costReduction }),
      targetSelectionType: 'GENERIC_CHOOSE_PLAY_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `${cardName} (${cardId}): Choose a mission to play the character on (cost reduced by ${costReduction}).`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Generic helper: place the card (last in discard) onto a mission as a face-visible character */
  private static genericPlaceOnMission(state: GameState, player: PlayerID, missionIndex: number, cost: number, cardName: string, cardId: string, costReduction: number): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const charInPlay: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: card as any,
      isHidden: false,
      powerTokens: 0,
      stack: [card as any],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };
    mission[friendlySide] = [...mission[friendlySide], charInPlay];
    missions[missionIndex] = mission;

    ps.charactersInPlay = EffectEngine.countCharsForPlayer({ ...state, activeMissions: missions }, player);

    state.activeMissions = missions;
    state.log = logAction(
      state.log, state.turn, 'action', player,
      'EFFECT', `${cardName} (${cardId}): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${cost} chakra (reduced by ${costReduction}).`,
      'game.log.effect.playSummon',
      { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
    );

    return state;
  }

  /** Public wrapper for moveCharToMissionDirect */
  static moveCharToMissionDirectPublic(
    state: GameState, charInstanceId: string, destMissionIndex: number,
    charOwner: PlayerID, effectCardName: string, effectCardId: string,
  ): GameState {
    return EffectEngine.moveCharToMissionDirect(state, charInstanceId, destMissionIndex, charOwner, effectCardName, effectCardId);
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
  // MSS 08 — Set a Trap (two-stage)
  // =====================================

  /** MSS 08 Stage 1: player chose which card from hand. Store it and prompt for mission. */
  static mss08ChooseCard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    // Remove card from hand
    const chosenCard = ps.hand.splice(handIndex, 1)[0];

    // Store the card temporarily in the discard pile (we'll move it in stage 2)
    // Actually, store it in a pending way — push to discard pile temporarily
    // and record the card id for stage 2
    ps.discardPile.push(chosenCard);

    // Create stage 2: choose mission
    const missionIndices = newState.activeMissions.map((_, i) => String(i));
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cardName: chosenCard.name_fr, cardId: chosenCard.id }),
      targetSelectionType: 'MSS08_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: missionIndices,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `MSS 08 (Set a Trap): Choose a mission to place ${chosenCard.name_fr} as a hidden character.`,
      options: missionIndices,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** MSS 08 Stage 2: player chose which mission. Place the card as hidden there. */
  static mss08ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (missionIndex < 0 || missionIndex >= newState.activeMissions.length) return state;

    // Recover the card from the discard pile (it was the last card pushed)
    const chosenCard = ps.discardPile.pop();
    if (!chosenCard) return state;

    ps.charactersInPlay += 1;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const newCharacter: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: chosenCard as any,
      isHidden: true,
      powerTokens: 0,
      stack: [chosenCard as any],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const mission = { ...newState.activeMissions[missionIndex] };
    mission[friendlySide] = [...mission[friendlySide], newCharacter];
    newState.activeMissions = [...newState.activeMissions];
    newState.activeMissions[missionIndex] = mission;

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'SCORE_PLACE_HIDDEN',
      `MSS 08 (Set a Trap): Placed ${chosenCard.name_fr} as hidden character on mission ${missionIndex + 1}.`,
      'game.log.score.placeHidden',
      { card: 'Tendre un piege', mission: `mission ${missionIndex + 1}` },
    );

    return newState;
  }

  // =====================================
  // MSS 03 — Find the Traitor (opponent discard)
  // =====================================

  /** MSS 03: Opponent chose a card to discard from hand. */
  static mss03OpponentDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    // The opponent is the one discarding; sourcePlayer is the mission winner
    const opponentId = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';
    const ps = newState[opponentId];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const [discarded] = ps.hand.splice(handIndex, 1);
    ps.discardPile.push(discarded);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, pending.sourcePlayer,
      'SCORE_DISCARD',
      `MSS 03 (Find the Traitor): Opponent discarded ${discarded.name_fr} from hand.`,
      'game.log.score.discard',
      { card: 'Trouver le traitre', count: 1 },
    );

    return newState;
  }

  // =====================================
  // MSS 05 — Bring it Back (return to hand)
  // =====================================

  /** MSS 05: Player chose a character to return to hand. */
  static mss05ReturnToHand(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    // Find the character across missions
    let targetMissionIdx = -1;
    let targetCharIdx = -1;
    let target: CharacterInPlay | null = null;

    for (let i = 0; i < newState.activeMissions.length; i++) {
      const chars = newState.activeMissions[i][friendlySide];
      for (let j = 0; j < chars.length; j++) {
        if (chars[j].instanceId === targetId) {
          targetMissionIdx = i;
          targetCharIdx = j;
          target = chars[j];
          break;
        }
      }
      if (target) break;
    }

    if (!target || targetMissionIdx === -1 || targetCharIdx === -1) return state;

    // Remove from mission
    const mission = { ...newState.activeMissions[targetMissionIdx] };
    const chars = [...mission[friendlySide]];
    chars.splice(targetCharIdx, 1);
    mission[friendlySide] = chars;
    newState.activeMissions = [...newState.activeMissions];
    newState.activeMissions[targetMissionIdx] = mission;

    // Return the entire character stack to player's hand
    const ps = newState[player];
    const cardsToReturn = target.stack.length > 0 ? [...target.stack] : [target.card];
    ps.hand = [...ps.hand, ...cardsToReturn];
    ps.charactersInPlay = Math.max(0, ps.charactersInPlay - 1);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'SCORE_RETURN',
      `MSS 05 (Bring it Back): Returned ${target.card.name_fr} to hand (mandatory).`,
      'game.log.score.returnToHand',
      { card: 'Ramener', target: target.card.name_fr },
    );

    return newState;
  }

  // =====================================
  // MSS 07 — I Have to Go (move hidden, two-stage)
  // =====================================

  /** MSS 07 Stage 1: Player chose a hidden character to move. Now prompt for destination mission. */
  static mss07ChooseCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    const fromMissionIndex = charResult.missionIndex;

    // Collect other missions
    const otherMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== fromMissionIndex) otherMissions.push(String(i));
    }

    if (otherMissions.length === 0) return state;

    if (otherMissions.length === 1) {
      // Only one destination: auto-resolve
      return EffectEngine.mss07ApplyMove(newState, targetId, fromMissionIndex, parseInt(otherMissions[0], 10), pending.sourcePlayer);
    }

    // Multiple destinations: prompt for mission selection
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ charId: targetId, fromMissionIndex }),
      targetSelectionType: 'MSS07_CHOOSE_DESTINATION',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: otherMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: 'MSS 07 (I Have to Go): Choose a mission to move the hidden character to.',
      options: otherMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** MSS 07 Stage 2: Player chose a destination mission. Apply the move. */
  static mss07ChooseDestination(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMission = parseInt(targetId, 10);
    if (isNaN(destMission)) return state;

    let charId = '';
    let fromMissionIndex = -1;
    try {
      const parsed = JSON.parse(pending.effectDescription);
      charId = parsed.charId ?? '';
      fromMissionIndex = parsed.fromMissionIndex ?? -1;
    } catch { /* ignore */ }

    if (!charId || fromMissionIndex === -1) return state;

    return EffectEngine.mss07ApplyMove(state, charId, fromMissionIndex, destMission, pending.sourcePlayer);
  }

  /** MSS 07 helper: move a hidden character from one mission to another. */
  static mss07ApplyMove(state: GameState, charInstanceId: string, fromMissionIndex: number, toMissionIndex: number, sourcePlayer: PlayerID): GameState {
    const newState = deepClone(state);
    const friendlySide: 'player1Characters' | 'player2Characters' =
      sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    const mission = newState.activeMissions[fromMissionIndex];
    const chars = mission[friendlySide];
    const charIndex = chars.findIndex((c: CharacterInPlay) => c.instanceId === charInstanceId);

    if (charIndex === -1) return state;

    const targetChar = chars[charIndex];

    // Remove from source mission
    const sourceMission = { ...newState.activeMissions[fromMissionIndex] };
    const sourceChars = [...sourceMission[friendlySide]];
    sourceChars.splice(charIndex, 1);
    sourceMission[friendlySide] = sourceChars;
    newState.activeMissions[fromMissionIndex] = sourceMission;

    // Add to target mission
    const targetMission = { ...newState.activeMissions[toMissionIndex] };
    const movedChar = { ...targetChar, missionIndex: toMissionIndex };
    targetMission[friendlySide] = [...targetMission[friendlySide], movedChar];
    newState.activeMissions[toMissionIndex] = targetMission;

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'SCORE_MOVE',
      `MSS 07 (I Have to Go): Moved hidden ${targetChar.card.name_fr} from mission ${fromMissionIndex} to mission ${toMissionIndex}.`,
      'game.log.score.moveHidden',
      { card: 'Je dois partir', target: targetChar.card.name_fr },
    );

    return newState;
  }

  // =====================================
  // Jiraiya 007 — Play Summon (two-stage)
  // =====================================

  /** Jiraiya Stage 1: player chose a Summon card from hand. Store it and prompt for mission. */
  static jiraiyaChooseSummon(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    const chosenCard = ps.hand[handIndex];
    const cost = Math.max(0, chosenCard.chakra - 1);

    if (ps.chakra < cost) return state;

    // Remove card from hand, pay cost
    ps.hand.splice(handIndex, 1);
    ps.chakra -= cost;

    // Find valid missions (no same-name character already there)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const hasSameName = mission[friendlySide].some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === chosenCard.name_fr;
      });
      if (!hasSameName) validMissions.push(String(i));
    }

    if (validMissions.length === 0) {
      // Refund — no valid mission
      ps.hand.push(chosenCard);
      ps.chakra += cost;
      return state;
    }

    // Store chosen card in discard temporarily for stage 2 to recover
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      // Auto-resolve single mission
      return EffectEngine.jiraiyaPlaceOnMission(newState, player, parseInt(validMissions[0], 10), cost);
    }

    // Create stage 2: choose mission
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost }),
      targetSelectionType: 'JIRAIYA_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Jiraiya (007): Choose a mission to play the Summon character on.`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Jiraiya Stage 2: player chose a mission. Place the Summon there. */
  static jiraiyaChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let cost = 0;
    try { cost = JSON.parse(pending.effectDescription).cost ?? 0; } catch { /* ignore */ }
    return EffectEngine.jiraiyaPlaceOnMission(newState, player, missionIndex, cost);
  }

  /** Jiraiya helper: place the Summon card (last in discard) onto a mission */
  private static jiraiyaPlaceOnMission(state: GameState, player: PlayerID, missionIndex: number, cost: number): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const charInPlay: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: card as any,
      isHidden: false,
      powerTokens: 0,
      stack: [card as any],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };
    mission[friendlySide] = [...mission[friendlySide], charInPlay];
    missions[missionIndex] = mission;

    ps.charactersInPlay = EffectEngine.countCharsForPlayer({ ...state, activeMissions: missions }, player);

    state.activeMissions = missions;
    state.log = logAction(
      state.log, state.turn, 'action', player,
      'EFFECT', `Jiraiya plays ${card.name_fr} as Summon on mission ${missionIndex + 1} for ${cost} chakra.`,
      'game.log.effect.playSummon', { card: 'Jiraya', id: '007/130', target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
    );

    return state;
  }

  // =====================================
  // Asuma 023 — Move Team 10 (two-stage)
  // =====================================

  /** Asuma Stage 1: player chose which Team 10 char to move. Prompt for destination. */
  static asumaChooseTeam10(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    // Find valid destination missions (any other than the character's current)
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex) validMissions.push(String(i));
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      // Auto-resolve: move to the only other mission
      return EffectEngine.moveCharToMissionDirect(newState, targetId, parseInt(validMissions[0], 10), player, 'Asuma Sarutobi', '023/130');
    }

    // Create stage 2: choose destination
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ charInstanceId: targetId }),
      targetSelectionType: 'ASUMA_CHOOSE_DESTINATION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: 'Asuma Sarutobi (023): Choose a mission to move the Team 10 character to.',
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Asuma Stage 2: move the previously selected char to the chosen mission. */
  static asumaChooseDestination(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMission = parseInt(targetId, 10);
    if (isNaN(destMission)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let charInstanceId = '';
    try { charInstanceId = JSON.parse(pending.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
    if (!charInstanceId) return state;
    return EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Asuma Sarutobi', '023/130');
  }

  // =====================================
  // Iruka 047 — Move Naruto (two-stage)
  // =====================================

  /** Iruka Stage 1: player chose which Naruto to move. Prompt for destination. */
  static irukaChooseNaruto(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    // Find valid destination missions (any other than Naruto's current mission)
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex) validMissions.push(String(i));
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      return EffectEngine.moveCharToMissionDirect(newState, targetId, parseInt(validMissions[0], 10), player, 'Iruka Umino', '047/130');
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ charInstanceId: targetId }),
      targetSelectionType: 'IRUKA_CHOOSE_DESTINATION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: 'Iruka Umino (047): Choose a mission to move Naruto Uzumaki to.',
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Iruka Stage 2: move Naruto to the chosen mission. */
  static irukaChooseDestination(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMission = parseInt(targetId, 10);
    if (isNaN(destMission)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let charInstanceId = '';
    try { charInstanceId = JSON.parse(pending.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
    if (!charInstanceId) return state;
    return EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Iruka Umino', '047/130');
  }

  // =====================================
  // Kidomaru 059 — Multi-move (multi-stage)
  // =====================================

  /** Kidomaru Stage 1: player chose which character to move. Prompt for destination. */
  static kidomaruChooseCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    // Parse moves remaining
    let movesRemaining = 1;
    try {
      const desc = JSON.parse(pending.effectDescription);
      movesRemaining = desc.movesRemaining ?? 1;
    } catch { /* ignore */ }

    // Find valid destination missions
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex) validMissions.push(String(i));
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      // Auto-resolve destination, then check for more moves
      let result = EffectEngine.moveCharToMissionDirect(
        newState, targetId, parseInt(validMissions[0], 10), player, 'Kidomaru', '059/130',
      );
      const remaining = movesRemaining - 1;
      if (remaining > 0) {
        result = EffectEngine.createKidomaruNextMove(result, pending, player, remaining);
      }
      return result;
    }

    // Create stage 2: choose destination
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ charInstanceId: targetId, movesRemaining }),
      targetSelectionType: 'KIDOMARU_CHOOSE_DESTINATION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Kidomaru (059): Choose a mission to move the character to (${movesRemaining} move(s) remaining).`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Kidomaru Stage 2: move the char to chosen mission, then prompt for next move if remaining > 0. */
  static kidomaruChooseDestination(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMission = parseInt(targetId, 10);
    if (isNaN(destMission)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    let charInstanceId = '';
    let movesRemaining = 1;
    try {
      const desc = JSON.parse(pending.effectDescription);
      charInstanceId = desc.charInstanceId ?? '';
      movesRemaining = desc.movesRemaining ?? 1;
    } catch { /* ignore */ }

    if (!charInstanceId) return state;

    let result = EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Kidomaru', '059/130');

    const remaining = movesRemaining - 1;
    if (remaining > 0) {
      result = EffectEngine.createKidomaruNextMove(result, pending, player, remaining);
    }

    return result;
  }

  /** Create the next KIDOMARU_CHOOSE_CHARACTER pending if moves remain */
  private static createKidomaruNextMove(state: GameState, prevPending: PendingEffect, player: PlayerID, movesRemaining: number): GameState {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    // Find movable characters
    const validTargets: string[] = [];
    if (state.activeMissions.length > 1) {
      for (let i = 0; i < state.activeMissions.length; i++) {
        for (const char of state.activeMissions[i][friendlySide]) {
          validTargets.push(char.instanceId);
        }
      }
    }

    if (validTargets.length === 0) return state;

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    state.pendingEffects.push({
      id: effectId,
      sourceCardId: prevPending.sourceCardId,
      sourceInstanceId: prevPending.sourceInstanceId,
      sourceMissionIndex: prevPending.sourceMissionIndex,
      effectType: prevPending.effectType,
      effectDescription: JSON.stringify({ text: `Choose a character to move (${movesRemaining} remaining).`, movesRemaining }),
      targetSelectionType: 'KIDOMARU_CHOOSE_CHARACTER',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });

    state.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Kidomaru (059): Choose a friendly character to move (${movesRemaining} move(s) remaining).`,
      options: validTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return state;
  }

  // =====================================
  // Sakura 109 (R) — Play from discard (two-stage)
  // =====================================

  /** Sakura 109 Stage 1: player chose a Leaf Village char from discard. Pay cost, prompt for mission. */
  static sakura109ChooseFromDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const discardIndex = parseInt(targetId, 10);
    if (isNaN(discardIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (discardIndex < 0 || discardIndex >= ps.discardPile.length) return state;

    const chosenCard = ps.discardPile[discardIndex];
    const isUpgrade = pending.isUpgrade;
    const costReduction = isUpgrade ? 2 : 0;
    const cost = Math.max(0, chosenCard.chakra - costReduction);

    if (ps.chakra < cost) return state;

    // Pay cost, remove from discard
    ps.chakra -= cost;
    ps.discardPile.splice(discardIndex, 1);

    // Find valid missions
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const hasSameName = mission[friendlySide].some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === chosenCard.name_fr;
      });
      if (!hasSameName) validMissions.push(String(i));
    }

    if (validMissions.length === 0) {
      // Refund
      ps.chakra += cost;
      ps.discardPile.splice(discardIndex, 0, chosenCard);
      return state;
    }

    // Store card temporarily in discard pile end for stage 2
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.sakura109Place(newState, player, parseInt(validMissions[0], 10), cost, isUpgrade);
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost, isUpgrade }),
      targetSelectionType: 'SAKURA109_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Sakura Haruno (109): Choose a mission to play ${chosenCard.name_fr} on.`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Sakura 109 Stage 2: place the chosen card on the selected mission. */
  static sakura109ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let cost = 0;
    let isUpgrade = false;
    try { const d = JSON.parse(pending.effectDescription); cost = d.cost ?? 0; isUpgrade = d.isUpgrade ?? false; } catch { /* ignore */ }
    return EffectEngine.sakura109Place(newState, player, missionIndex, cost, isUpgrade);
  }

  /** Sakura 109 helper: place the card (last in discard) on the mission. */
  private static sakura109Place(state: GameState, player: PlayerID, missionIndex: number, cost: number, isUpgrade: boolean): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const newChar: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: card as any,
      isHidden: false,
      powerTokens: 0,
      stack: [card as any],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };
    mission[friendlySide] = [...mission[friendlySide], newChar];
    missions[missionIndex] = mission;
    state.activeMissions = missions;

    ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

    const costDesc = isUpgrade ? ` (cost reduced by 2, paid ${cost})` : ` (paid ${cost})`;
    state.log = logAction(
      state.log, state.turn, state.phase, player,
      'EFFECT_PLAY',
      `Sakura Haruno (109): Played ${card.name_fr} from discard pile to mission ${missionIndex + 1}${costDesc}.`,
      'game.log.effect.playFromDiscard',
      { card: 'SAKURA HARUNO', id: '109/130', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
    );

    return state;
  }

  // =====================================
  // Sakura 135 (S) — Top 3 cards (two-stage)
  // =====================================

  /** Sakura 135 Stage 1: player chose a card from the top 3. Discard others, prompt for mission. */
  static sakura135ChooseCard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const cardIndex = parseInt(targetId, 10);
    if (isNaN(cardIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    // The handler drew top 3 from deck and stored them at the end of the discard pile.
    // The description JSON has card info + costReduction.
    let costReduction = 0;
    try { costReduction = JSON.parse(pending.effectDescription).costReduction ?? 0; } catch { /* ignore */ }

    // Recover drawn cards from end of discard pile using info from description.
    let topCardsInfo: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean }> = [];
    try { topCardsInfo = JSON.parse(pending.effectDescription).topCards ?? []; } catch { /* ignore */ }

    const numDrawn = topCardsInfo.length;
    if (numDrawn === 0 || cardIndex < 0 || cardIndex >= numDrawn) return state;

    // The drawn cards are stored at the end of the discard pile
    const drawnCards = ps.discardPile.splice(ps.discardPile.length - numDrawn, numDrawn);

    if (cardIndex >= drawnCards.length) return state;

    const chosenCard = drawnCards[cardIndex];
    const otherCards = drawnCards.filter((_, i) => i !== cardIndex);

    // Discard the non-chosen cards
    ps.discardPile.push(...otherCards);

    // Check if we can afford the chosen card
    const cost = Math.max(0, (chosenCard.chakra ?? 0) - costReduction);
    if (ps.chakra < cost) {
      // Can't afford — discard all including the chosen one
      ps.discardPile.push(chosenCard);
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT_NO_CHAKRA',
        `Sakura Haruno (135): Cannot afford to play ${chosenCard.name_fr} (cost ${cost}). All cards discarded.`,
        'game.log.effect.noChakra',
        { card: 'SAKURA HARUNO', id: '135/130' },
      );
      return newState;
    }

    // Pay cost
    ps.chakra -= cost;

    // Find valid missions
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const hasSameName = mission[friendlySide].some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === chosenCard.name_fr;
      });
      if (!hasSameName) validMissions.push(String(i));
    }

    if (validMissions.length === 0) {
      // No valid mission — discard
      ps.discardPile.push(chosenCard);
      ps.chakra += cost;
      return newState;
    }

    // Store chosen card at end of discard for stage 2
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.sakura135Place(newState, player, parseInt(validMissions[0], 10), cost, costReduction > 0);
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost, isUpgrade: costReduction > 0 }),
      targetSelectionType: 'SAKURA135_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: costReduction > 0,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      description: `Sakura Haruno (135): Choose a mission to play ${chosenCard.name_fr} on.`,
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Sakura 135 Stage 2: place the chosen card on the selected mission. */
  static sakura135ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let cost = 0;
    let isUpgrade = false;
    try { const d = JSON.parse(pending.effectDescription); cost = d.cost ?? 0; isUpgrade = d.isUpgrade ?? false; } catch { /* ignore */ }
    return EffectEngine.sakura135Place(newState, player, missionIndex, cost, isUpgrade);
  }

  /** Sakura 135 helper: place card (last in discard) on mission. */
  private static sakura135Place(state: GameState, player: PlayerID, missionIndex: number, cost: number, isUpgrade: boolean): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const newChar: CharacterInPlay = {
      instanceId: generateInstanceId(),
      card: card as any,
      isHidden: false,
      powerTokens: 0,
      stack: [card as any],
      controlledBy: player,
      originalOwner: player,
      missionIndex,
    };

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };
    mission[friendlySide] = [...mission[friendlySide], newChar];
    missions[missionIndex] = mission;
    state.activeMissions = missions;

    ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

    const costDesc = isUpgrade ? ` (cost reduced by 4, paid ${cost})` : ` (paid ${cost})`;
    state.log = logAction(
      state.log, state.turn, state.phase, player,
      'EFFECT_PLAY',
      `Sakura Haruno (135): Played ${card.name_fr} from top of deck to mission ${missionIndex + 1}${costDesc}.`,
      'game.log.effect.playFromDeck',
      { card: 'SAKURA HARUNO', id: '135/130', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
    );

    return state;
  }

  // =====================================
  // Choji 112 (R) — Discard + POWERUP
  // =====================================

  /** Choji: player chose which card to discard. Apply POWERUP X. If upgrade, create second prompt. */
  static chojiChooseDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    // Discard the selected card
    const discardedCard = ps.hand.splice(handIndex, 1)[0];
    ps.discardPile.push(discardedCard);

    const discardedCost = discardedCard.chakra ?? 0;

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_DISCARD',
      `Choji Akimichi (112): Discarded ${discardedCard.name_fr} (cost ${discardedCost}) from hand.`,
      'game.log.effect.discard',
      { card: 'CHOJI AKIMICHI', id: '112/130', target: discardedCard.name_fr, cost: discardedCost },
    );

    // Apply POWERUP X on Choji
    if (discardedCost > 0) {
      const charResult = EffectEngine.findCharByInstanceId(newState, pending.sourceInstanceId);
      if (charResult) {
        const mission = newState.activeMissions[charResult.missionIndex];
        const friendlySide: 'player1Characters' | 'player2Characters' =
          player === 'player1' ? 'player1Characters' : 'player2Characters';
        const chars = [...mission[friendlySide]];
        const selfIdx = chars.findIndex(c => c.instanceId === pending.sourceInstanceId);
        if (selfIdx !== -1) {
          chars[selfIdx] = { ...chars[selfIdx], powerTokens: chars[selfIdx].powerTokens + discardedCost };
          const newMission = { ...mission, [friendlySide]: chars };
          newState.activeMissions = [...newState.activeMissions];
          newState.activeMissions[charResult.missionIndex] = newMission;
        }

        newState.log = logAction(
          newState.log, newState.turn, newState.phase, player,
          'EFFECT_POWERUP',
          `Choji Akimichi (112): POWERUP ${discardedCost} (cost of discarded card).`,
          'game.log.effect.powerupSelf',
          { card: 'CHOJI AKIMICHI', id: '112/130', amount: discardedCost },
        );
      }
    }

    // If upgrade and hand is not empty, create second discard prompt
    if (pending.isUpgrade && ps.hand.length > 0) {
      const handIndices = ps.hand.map((_, i) => String(i));
      const effectId = generateInstanceId();
      const actionId = generateInstanceId();

      newState.pendingEffects.push({
        id: effectId,
        sourceCardId: pending.sourceCardId,
        sourceInstanceId: pending.sourceInstanceId,
        sourceMissionIndex: pending.sourceMissionIndex,
        effectType: pending.effectType,
        effectDescription: 'Choji Akimichi (112): Choose a second card to discard for POWERUP (UPGRADE).',
        targetSelectionType: 'CHOJI_CHOOSE_DISCARD',
        sourcePlayer: player,
        requiresTargetSelection: true,
        validTargets: handIndices,
        isOptional: true,
        isMandatory: false,
        resolved: false,
        isUpgrade: false, // The second discard is NOT an upgrade anymore
      });

      newState.pendingActions.push({
        id: actionId,
        type: 'DISCARD_CARD',
        player,
        description: 'Choji Akimichi (112): Choose a second card to discard for POWERUP (UPGRADE effect).',
        options: handIndices,
        minSelections: 1,
        maxSelections: 1,
        sourceEffectId: effectId,
      });
    }

    return newState;
  }

  // =====================================
  // Ino 020 — Take control of enemy character
  // =====================================

  /** Ino 020: take control of an enemy character in this mission. */
  static takeControlOfEnemy(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const missionIndex = charResult.missionIndex;
    const mission = newState.activeMissions[missionIndex];

    const enemySide = charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

    const targetIdx = mission[enemySide].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (targetIdx === -1) return state;

    const targetChar = { ...mission[enemySide][targetIdx], controlledBy: player };
    const targetName = targetChar.card.name_fr;

    mission[enemySide] = mission[enemySide].filter((_: CharacterInPlay, i: number) => i !== targetIdx);
    mission[friendlySide] = [...mission[friendlySide], targetChar];

    // Update character counts
    newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
    newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_TAKE_CONTROL',
      `Ino Yamanaka (020): Takes control of ${targetName} in this mission.`,
      'game.log.effect.takeControl',
      { card: 'INO YAMANAKA', id: '020/130', target: targetName },
    );

    return newState;
  }

  // =====================================
  // Itachi 143 (M) — Move character to this mission
  // =====================================

  /** Itachi 143 MAIN: move a friendly character to Itachi's mission. */
  static itachi143MoveFriendly(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, player, 'Itachi Uchiwa', '143/130');
  }

  /** Itachi 143 AMBUSH: move an enemy character to Itachi's mission. */
  static itachi143MoveEnemy(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const opponent = player === 'player1' ? 'player2' : 'player1';
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, opponent, 'Itachi Uchiwa', '143/130');
  }

  // =====================================
  // Shared: Move character to a specific mission
  // =====================================

  /** Move a character (by instanceId) to a specific mission. Used by multiple handlers. */
  private static moveCharToMissionDirect(
    state: GameState,
    charInstanceId: string,
    destMissionIndex: number,
    charOwner: PlayerID,
    effectCardName: string,
    effectCardId: string,
  ): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, charInstanceId);
    if (!charResult) return state;
    if (charResult.missionIndex === destMissionIndex) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';

    // Remove from source mission
    const missions = [...state.activeMissions];
    const sourceMission = { ...missions[charResult.missionIndex] };
    sourceMission[friendlySide] = sourceMission[friendlySide].filter(c => c.instanceId !== charInstanceId);
    missions[charResult.missionIndex] = sourceMission;

    // Add to destination mission
    const destMission = { ...missions[destMissionIndex] };
    const movedChar = { ...charResult.character, missionIndex: destMissionIndex };
    destMission[friendlySide] = [...destMission[friendlySide], movedChar];
    missions[destMissionIndex] = destMission;

    state.activeMissions = missions;
    state.log = logAction(
      state.log, state.turn, state.phase, charOwner,
      'EFFECT_MOVE',
      `${effectCardName} (${effectCardId}): Moved ${charResult.character.card.name_fr} from mission ${charResult.missionIndex + 1} to mission ${destMissionIndex + 1}.`,
      'game.log.effect.move',
      { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr, mission: `mission ${destMissionIndex + 1}` },
    );

    // Check Ninja Hounds 100 trigger
    state = checkNinjaHoundsTrigger(state, movedChar, destMissionIndex, charOwner);

    return state;
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
