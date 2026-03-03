import type { GameState, PlayerID, CharacterInPlay, EffectType, PendingEffect, PendingAction } from '../engine/types';
import type { EffectContext, EffectResult } from './EffectTypes';
import { getEffectHandler } from './EffectRegistry';
import { deepClone } from '../engine/utils/deepClone';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';
import { triggerOnDefeatEffects } from './onDefeatTriggers';
import { checkNinjaHoundsTrigger, checkChoji018PostMoveTrigger } from './moveTriggers';
import { returnCharacterToHand } from '../engine/phases/EndPhase';
import { isProtectedFromEnemyHide, isImmuneToEnemyHideOrDefeat, canBeHiddenByEnemy } from './ContinuousEffects';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';

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

    // Cards where UPGRADE fires before MAIN when played as an upgrade.
    // KS-137-S (Kakashi 137): UPGRADE = move self, MAIN = hide upgraded char in (new) mission.
    // processRemainingEffects uses findCharByInstanceId so it picks up the new mission after the move.
    const UPGRADE_BEFORE_MAIN = new Set(['KS-137-S']);
    if (isUpgrade && UPGRADE_BEFORE_MAIN.has(topCard.id)) {
      const hasUpgradeFirst = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
      if (hasUpgradeFirst) {
        const upgradeHandler = getEffectHandler(topCard.id, 'UPGRADE');
        if (upgradeHandler) {
          try {
            const ctx: EffectContext = {
              state: newState,
              sourcePlayer: player,
              sourceCard: character,
              sourceMissionIndex: missionIndex,
              triggerType: 'UPGRADE',
              isUpgrade: true,
            };
            const result = upgradeHandler(ctx);
            const hasMainEffect2 = (topCard.effects ?? []).some(
              (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
            );
            if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
              // Queue MAIN to run after UPGRADE resolves
              const remainingAfterUpgrade: EffectType[] = hasMainEffect2 ? ['MAIN'] : [];
              newState = EffectEngine.createPendingTargetSelection(
                result.state, player, character, missionIndex, 'UPGRADE', true,
                result, remainingAfterUpgrade,
              );
              return newState;
            }
            newState = result.state;
            // UPGRADE resolved immediately — fall through to MAIN below
          } catch (err) {
            console.error(`[EffectEngine] UPGRADE-first handler error for ${topCard.id}:`, err);
          }
        }
      }
      // MAIN fires after UPGRADE (using findCharByInstanceId in processRemainingEffects
      // if UPGRADE created a pending; or here directly if UPGRADE resolved immediately).
      const hasMain137 = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
      );
      if (hasMain137) {
        const mainHandler = getEffectHandler(topCard.id, 'MAIN');
        if (mainHandler) {
          try {
            // Re-find the character in case UPGRADE moved it
            const charResult = EffectEngine.findCharByInstanceId(newState, character.instanceId);
            const updatedChar = charResult?.character ?? character;
            const updatedMissionIndex = charResult?.missionIndex ?? missionIndex;
            const ctx: EffectContext = {
              state: newState,
              sourcePlayer: player,
              sourceCard: updatedChar,
              sourceMissionIndex: updatedMissionIndex,
              triggerType: 'MAIN',
              isUpgrade: true,
            };
            const result = mainHandler(ctx);
            if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
              newState = EffectEngine.createPendingTargetSelection(
                result.state, player, updatedChar, updatedMissionIndex, 'MAIN', true,
                result, [],
              );
              return newState;
            }
            newState = result.state;
          } catch (err) {
            console.error(`[EffectEngine] MAIN (after UPGRADE-first) handler error for ${topCard.id}:`, err);
          }
        }
      }
      return newState;
    }

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
            // Use result.state to preserve any state changes the handler already made
            const remainingEffectTypes: EffectType[] = [];
            if (isUpgrade) {
              const hasUpgradeEffect = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
              if (hasUpgradeEffect) remainingEffectTypes.push('UPGRADE');
            }
            newState = EffectEngine.createPendingTargetSelection(
              result.state, player, character, missionIndex, 'MAIN', isUpgrade,
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
              // Use result.state to preserve any state changes the handler already made
              newState = EffectEngine.createPendingTargetSelection(
                result.state, player, character, missionIndex, 'UPGRADE', true,
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
   * Resolve effects when a hidden character is revealed AND upgrades an existing character.
   * Triggers MAIN + UPGRADE + AMBUSH effects (all three).
   */
  static resolveRevealUpgradeEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    // Build the ordered list of effect types from the card definition (top-to-bottom).
    // When revealed as an upgrade, MAIN, AMBUSH, and UPGRADE all trigger — in card order.
    const relevantTypes = new Set<string>(['MAIN', 'UPGRADE', 'AMBUSH']);
    const orderedTypes: EffectType[] = [];
    for (const effect of (topCard.effects ?? [])) {
      if (relevantTypes.has(effect.type) && !orderedTypes.includes(effect.type as EffectType)) {
        orderedTypes.push(effect.type as EffectType);
      }
    }

    for (let i = 0; i < orderedTypes.length; i++) {
      const effectType = orderedTypes[i];

      // Check if this effect type is actually present (MAIN has an extra filter for 'effect:' modifiers)
      const hasEffect = (topCard.effects ?? []).some((e) => {
        if (e.type !== effectType) return false;
        if (effectType === 'MAIN') {
          return !e.description.startsWith('effect:') && !e.description.startsWith('effect.');
        }
        return true;
      });
      if (!hasEffect) continue;

      const handler = getEffectHandler(topCard.id, effectType);
      if (!handler) continue;

      try {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: effectType,
          isUpgrade: true,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          // Queue remaining effect types (those after current position, in card order)
          const remainingEffectTypes = orderedTypes.slice(i + 1).filter((t) =>
            (topCard.effects ?? []).some((e) => e.type === t)
          );

          newState = EffectEngine.createPendingTargetSelection(
            result.state, player, character, missionIndex, effectType, true,
            result, remainingEffectTypes,
          );
          return newState;
        }
        newState = result.state;
      } catch (err) {
        console.error(`[EffectEngine] ${effectType} handler error for ${topCard.id} (reveal-upgrade):`, err);
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

    // Detect if the character was previously upgraded (stack has 2+ cards)
    const wasUpgraded = character.stack.length >= 2;

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
            isUpgrade: wasUpgraded,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            // Check if AMBUSH also needs to be processed after this
            const remainingEffectTypes: EffectType[] = [];
            const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
            if (hasAmbushEffect) remainingEffectTypes.push('AMBUSH');

            // Use result.state to preserve any state changes the handler already made
            newState = EffectEngine.createPendingTargetSelection(
              result.state, player, character, missionIndex, 'MAIN', wasUpgraded,
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
            isUpgrade: wasUpgraded,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            // Use result.state to preserve any state changes the handler already made
            newState = EffectEngine.createPendingTargetSelection(
              result.state, player, character, missionIndex, 'AMBUSH', wasUpgraded,
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
   * Resolve a single SCORE effect (mission card or character).
   * Returns { state, pending } — pending=true means a target selection was created.
   * Used by MissionPhase to track progress through SCORE effects.
   */
  static resolveScoreEffectSingle(
    state: GameState,
    player: PlayerID,
    missionIndex: number,
    cardId: string,
    character: CharacterInPlay | null,
  ): { state: GameState; pending: boolean } {
    let newState = deepClone(state);

    const handler = getEffectHandler(cardId, 'SCORE');
    if (!handler) {
      return { state: newState, pending: false };
    }

    try {
      const ctx: EffectContext = {
        state: newState,
        sourcePlayer: player,
        sourceCard: (character ?? null) as unknown as CharacterInPlay,
        sourceMissionIndex: missionIndex,
        triggerType: 'SCORE',
        isUpgrade: false,
      };
      const result = handler(ctx);

      if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
        // Use result.state (not newState) to preserve any state changes the handler already made
        // (e.g., Yashamaru self-defeat before requiring target selection for the second defeat)
        newState = EffectEngine.createPendingTargetSelection(
          result.state, player, (character ?? null) as unknown as CharacterInPlay, missionIndex, 'SCORE', false,
          result, [],
        );
        return { state: newState, pending: true };
      }
      return { state: result.state, pending: false };
    } catch (err) {
      console.error(`[EffectEngine] SCORE handler error for ${cardId}:`, err);
      return { state: newState, pending: false };
    }
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
    // Safeguard: if validTargets is empty, skip creating the pending effect entirely
    // This prevents stuck UI when a handler returns requiresTargetSelection with no valid targets
    if (!result.validTargets || result.validTargets.length === 0) {
      console.warn(`[EffectEngine] Skipping pending target selection with empty validTargets for ${result.targetSelectionType}`);
      return result.state;
    }

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
      isOptional: !result.isMandatory,
      isMandatory: result.isMandatory ?? false,
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
      tst === 'MSS03_OPPONENT_DISCARD' ||
      tst === 'SAKURA_012_DISCARD' ||
      tst === 'SASUKE_014_DISCARD_OWN' ||
      tst === 'SASUKE_014_DISCARD_OPPONENT' ||
      tst === 'ASUMA_024_DISCARD_FOR_POWERUP' ||
      tst === 'KIMIMARO056_CHOOSE_DISCARD' ||
      tst === 'NARUTO141_CHOOSE_DISCARD' ||
      tst === 'SASUKE142_CHOOSE_DISCARD' ||
      tst === 'KIN073_CHOOSE_DISCARD' ||
      tst === 'KABUTO053_CHOOSE_DISCARD'
    ) {
      actionType = 'DISCARD_CARD';
    } else if (
      tst === 'CHOOSE_CARD_FROM_LIST' ||
      tst === 'MSS08_CHOOSE_CARD' ||
      tst === 'JIRAIYA_CHOOSE_SUMMON' ||
      tst === 'JIRAIYA008_CHOOSE_SUMMON' ||
      tst === 'JIRAIYA105_CHOOSE_SUMMON' ||
      tst === 'JIRAIYA132_CHOOSE_SUMMON' ||
      tst === 'SAKURA109_CHOOSE_DISCARD' ||
      tst === 'SAKURA135_CHOOSE_CARD' ||
      tst === 'TAYUYA125_CHOOSE_SOUND' ||
      tst === 'RECOVER_FROM_DISCARD' ||
      tst === 'HIRUZEN002_CHOOSE_CARD' ||
      tst === 'ITACHI091_CHOOSE_DISCARD' ||
      tst === 'TSUNADE104_CHOOSE_CHAKRA'
    ) {
      actionType = 'CHOOSE_CARD_FROM_LIST';
    } else if (tst === 'COPY_EFFECT_CHOSEN') {
      actionType = 'CHOOSE_EFFECT';
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
      // Track who originally triggered this pending action so GameEngine can correctly
      // preserve the initiating player's turn when the opponent resolves a forced choice.
      originPlayer: player,
      description: actionDescription,
      descriptionKey: result.descriptionKey,
      descriptionParams: result.descriptionParams,
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

    // Kimimaro 056 continuous protection: if an enemy effect targets this character,
    // the opponent must pay 1 chakra (if able). The effect still happens regardless.
    newState = EffectEngine.applyKimimaro056Protection(newState, pendingEffect, targetId);

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

      case 'OROCHIMARU_REVEAL_RESULT':
        newState = EffectEngine.orochimaruExecuteSteal(newState, pendingEffect);
        break;

      case 'ITACHI091_HAND_REVEAL': {
        // After confirming hand reveal, if upgrade: chain choose-discard from opponent
        let parsed091: { isUpgrade?: boolean } = {};
        try { parsed091 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (parsed091.isUpgrade) {
          const opp091 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const oppHand091 = newState[opp091].hand;
          if (oppHand091.length > 0) {
            // Auto-discard if only 1 card
            if (oppHand091.length === 1) {
              const ps091 = { ...newState[opp091] };
              const hand091 = [...ps091.hand];
              const discarded091 = hand091.splice(0, 1)[0];
              ps091.hand = hand091;
              ps091.discardPile = [...ps091.discardPile, discarded091];
              newState = { ...newState, [opp091]: ps091 };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
                'EFFECT_DISCARD_FROM_HAND',
                `Itachi Uchiwa (091) UPGRADE: Discarded ${discarded091.name_fr} from opponent's hand.`,
                'game.log.effect.itachi091DiscardOpponent',
                { card: 'ITACHI UCHIWA', id: 'KS-091-UC', target: discarded091.name_fr },
              );
            } else {
              // Multiple cards — source player chooses which to discard
              const oppIndices091 = oppHand091.map((_: unknown, i: number) => String(i));
              const oppCards091 = oppHand091.map((c, i) => ({
                name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
                image_file: c.image_file, originalIndex: i,
              }));
              const charResult091 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
              const step2091: EffectResult = {
                state: newState,
                requiresTargetSelection: true,
                targetSelectionType: 'ITACHI091_CHOOSE_DISCARD',
                validTargets: oppIndices091,
                description: JSON.stringify({
                  text: 'Itachi (091) UPGRADE: Choose a card from opponent\'s hand to discard.',
                  cards: oppCards091,
                }),
                descriptionKey: 'game.effect.desc.itachi091ChooseDiscard',
              };
              return EffectEngine.createPendingTargetSelection(
                newState, pendingEffect.sourcePlayer,
                charResult091?.character ?? null,
                pendingEffect.sourceMissionIndex,
                'MAIN', false, step2091, [],
              );
            }
          }
        }
        break;
      }

      case 'LOOK_AT_HIDDEN_CHARACTER':
        newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, targetId);
        break;

      case 'DOSU_LOOK_REVEAL':
        // Acknowledgment only — no additional action needed
        break;

      case 'TAYUYA065_UPGRADE_REVEAL':
        // Acknowledgment only — no additional action needed
        break;

      case 'KIBA026_UPGRADE_REVEAL':
        // Acknowledgment only — draw and deck rearrangement already applied
        break;

      case 'SASUKE014_HAND_REVEAL':
        // Acknowledgment only — AMBUSH just shows opponent's hand
        break;

      case 'SASUKE014_UPGRADE_HAND_REVEAL': {
        // UPGRADE includes AMBUSH effect — opponent's hand was shown, now chain to discard flow
        const ps_sur = { ...newState[pendingEffect.sourcePlayer] };
        const opp_sur = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const oppHand_sur = newState[opp_sur].hand;

        if (ps_sur.hand.length > 0 && oppHand_sur.length > 0) {
          // Chain to SASUKE_014_DISCARD_OWN (discard from own hand, optional)
          const handIndices_sur = ps_sur.hand.map((_: unknown, i: number) => String(i));
          const charResult_sur = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          const step_sur: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'SASUKE_014_DISCARD_OWN',
            validTargets: handIndices_sur,
            isOptional: true,
            description: 'Sasuke Uchiwa (014) UPGRADE: Discard 1 of your cards to discard 1 from opponent\'s hand.',
            descriptionKey: 'game.effect.desc.sasuke014DiscardOwn',
          };
          return EffectEngine.createPendingTargetSelection(
            newState, pendingEffect.sourcePlayer,
            charResult_sur?.character ?? null,
            pendingEffect.sourceMissionIndex,
            'UPGRADE', true, step_sur, [],
          );
        }
        break;
      }

      case 'ITACHI091_CHOOSE_DISCARD': {
        // UPGRADE: source player chose which opponent card to discard
        const idx091 = parseInt(targetId, 10);
        const opp091d = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ps091d = { ...newState[opp091d] };
        if (idx091 >= 0 && idx091 < ps091d.hand.length) {
          const hand091d = [...ps091d.hand];
          const discarded091d = hand091d.splice(idx091, 1)[0];
          ps091d.hand = hand091d;
          ps091d.discardPile = [...ps091d.discardPile, discarded091d];
          newState = { ...newState, [opp091d]: ps091d };
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD_FROM_HAND',
            `Itachi Uchiwa (091) UPGRADE: Discarded ${discarded091d.name_fr} from opponent's hand.`,
            'game.log.effect.itachi091DiscardOpponent',
            { card: 'ITACHI UCHIWA', id: 'KS-091-UC', target: discarded091d.name_fr },
          );
        }
        break;
      }

      case 'DEFEAT_HIDDEN_CHARACTER':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      case 'KURENAI_DEFEAT_LOW_POWER':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Naruto Legendary: Two-stage hide/defeat ---
      case 'NARUTO_LEGENDARY_TARGET1': {
        const useDefeat_nl = pendingEffect.isUpgrade;
        const sourcePlayer_nl = pendingEffect.sourcePlayer;
        const enemySideKey_nl = sourcePlayer_nl === 'player1' ? 'player2Characters' : 'player1Characters';

        // Apply to target 1
        if (useDefeat_nl) {
          newState = EffectEngine.defeatCharacter(newState, targetId, sourcePlayer_nl);
          newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer_nl, 'EFFECT_DEFEAT',
            'Naruto Uzumaki (Legendary): Defeated enemy in this mission (upgrade).',
            'game.log.effect.defeat', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        } else {
          newState = EffectEngine.hideCharacter(newState, targetId);
          newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer_nl, 'EFFECT_HIDE',
            'Naruto Uzumaki (Legendary): Hid enemy in this mission.',
            'game.log.effect.hide', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        }

        // Now find candidates for target 2: enemy Power <= 2 in any mission (excluding target 1)
        const target2Candidates_nl: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[enemySideKey_nl]) {
            if (char.instanceId === targetId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            if (topCard.power + char.powerTokens <= 2) {
              target2Candidates_nl.push(char.instanceId);
            }
          }
        }

        if (target2Candidates_nl.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer_nl, 'EFFECT_NO_TARGET',
            'Naruto Uzumaki (Legendary): No valid second enemy with Power 2 or less in play.',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        } else {
          // Create second pending for target 2
          const effectId_nl = generateInstanceId();
          const actionId_nl = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: effectId_nl,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '',
            targetSelectionType: 'NARUTO_LEGENDARY_TARGET2',
            sourcePlayer: sourcePlayer_nl,
            requiresTargetSelection: true,
            validTargets: target2Candidates_nl,
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: pendingEffect.isUpgrade,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: actionId_nl,
            type: 'SELECT_TARGET' as PendingAction['type'],
            player: sourcePlayer_nl,
            description: useDefeat_nl
              ? 'Naruto Uzumaki (Legendary): Choose another enemy with Power 2 or less in play to defeat.'
              : 'Naruto Uzumaki (Legendary): Choose another enemy with Power 2 or less in play to hide.',
            descriptionKey: useDefeat_nl
              ? 'game.effect.desc.narutoLegendaryDefeatTarget2'
              : 'game.effect.desc.narutoLegendaryHideTarget2',
            options: target2Candidates_nl,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effectId_nl,
          }];
        }
        break;
      }

      case 'NARUTO_LEGENDARY_TARGET2': {
        const useDefeat_nl2 = pendingEffect.isUpgrade;
        const sourcePlayer_nl2 = pendingEffect.sourcePlayer;

        if (useDefeat_nl2) {
          newState = EffectEngine.defeatCharacter(newState, targetId, sourcePlayer_nl2);
          newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer_nl2, 'EFFECT_DEFEAT',
            'Naruto Uzumaki (Legendary): Defeated second enemy in play (upgrade).',
            'game.log.effect.defeat', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        } else {
          newState = EffectEngine.hideCharacter(newState, targetId);
          newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer_nl2, 'EFFECT_HIDE',
            'Naruto Uzumaki (Legendary): Hid second enemy in play.',
            'game.log.effect.hide', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        }
        break;
      }

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

      // --- Haku 088: player confirmed optional draw ---
      case 'HAKU088_CONFIRM_DRAW':
        newState = EffectEngine.haku088ConfirmDraw(newState, pendingEffect);
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

      // --- Gaara 153 (M) — same logic as 139 (S) ---
      case 'GAARA153_DEFEAT_BY_COST': {
        const gaara153Info = EffectEngine.findCharByInstanceId(newState, targetId);
        const gaara153DefeatedName = gaara153Info ? gaara153Info.character.card.name_fr : '';
        const gaara153DefeatedCost = gaara153Info
          ? (gaara153Info.character.stack.length > 0
              ? gaara153Info.character.stack[gaara153Info.character.stack.length - 1]
              : gaara153Info.character.card
            ).chakra
          : 0;

        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        if (pendingEffect.isUpgrade && gaara153DefeatedName) {
          const opponentPlayer153 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const gaara153EnemySide: 'player1Characters' | 'player2Characters' =
            opponentPlayer153 === 'player1' ? 'player1Characters' : 'player2Characters';

          const hideTargets153: string[] = [];
          for (let mi = 0; mi < newState.activeMissions.length; mi++) {
            for (const ch of newState.activeMissions[mi][gaara153EnemySide]) {
              if (ch.isHidden) continue;
              if (ch.instanceId === targetId) continue;
              const tc = ch.stack.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
              if (tc.name_fr === gaara153DefeatedName && tc.chakra < gaara153DefeatedCost) {
                hideTargets153.push(ch.instanceId);
              }
            }
          }

          if (hideTargets153.length > 0) {
            const charResult153 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
            if (charResult153) {
              const hideEffectId153 = generateInstanceId();
              const hideActionId153 = generateInstanceId();
              newState.pendingEffects = [...newState.pendingEffects, {
                id: hideEffectId153,
                sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: charResult153.missionIndex,
                effectType: 'UPGRADE' as const,
                effectDescription: `Gaara (153) UPGRADE: Hide an enemy ${gaara153DefeatedName} with cost less than ${gaara153DefeatedCost}.`,
                targetSelectionType: 'GAARA153_HIDE_SAME_NAME',
                sourcePlayer: pendingEffect.sourcePlayer,
                requiresTargetSelection: true,
                validTargets: hideTargets153,
                isOptional: true,
                isMandatory: false,
                resolved: false,
                isUpgrade: true,
              }];
              newState.pendingActions = [...newState.pendingActions, {
                id: hideActionId153,
                type: 'SELECT_TARGET' as const,
                player: pendingEffect.sourcePlayer,
                description: `Gaara (153) UPGRADE: Hide an enemy ${gaara153DefeatedName} with cost less than ${gaara153DefeatedCost}.`,
                descriptionKey: 'game.effect.desc.gaara153HideSameName',
                descriptionParams: { target: gaara153DefeatedName, cost: String(gaara153DefeatedCost) },
                options: hideTargets153,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: hideEffectId153,
              }];
            }
          }
        }
        break;
      }

      // --- Gaara 139 (S) ---
      case 'DEFEAT_ENEMY_BY_COST':
      case 'GAARA139_DEFEAT_BY_COST': {
        // Find the target character's name and cost BEFORE defeating
        const gaara139Info = EffectEngine.findCharByInstanceId(newState, targetId);
        const gaara139DefeatedName = gaara139Info ? gaara139Info.character.card.name_fr : '';
        const gaara139DefeatedCost = gaara139Info
          ? (gaara139Info.character.stack.length > 0
              ? gaara139Info.character.stack[gaara139Info.character.stack.length - 1]
              : gaara139Info.character.card
            ).chakra
          : 0;

        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        // If upgrade, chain hide effect for another enemy with same name and lower cost
        if (pendingEffect.isUpgrade && gaara139DefeatedName) {
          const opponentPlayer = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const gaara139EnemySide: 'player1Characters' | 'player2Characters' =
            opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

          const hideTargets: string[] = [];
          for (let mi = 0; mi < newState.activeMissions.length; mi++) {
            for (const ch of newState.activeMissions[mi][gaara139EnemySide]) {
              if (ch.isHidden) continue;
              if (ch.instanceId === targetId) continue;
              const tc = ch.stack.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
              if (tc.name_fr === gaara139DefeatedName && tc.chakra < gaara139DefeatedCost) {
                hideTargets.push(ch.instanceId);
              }
            }
          }

          if (hideTargets.length > 0) {
            // Chain hide effect
            const charResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
            if (charResult) {
              const hideEffectId = generateInstanceId();
              const hideActionId = generateInstanceId();
              newState.pendingEffects = [...newState.pendingEffects, {
                id: hideEffectId,
                sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: charResult.missionIndex,
                effectType: 'UPGRADE' as const,
                effectDescription: `Gaara (139) UPGRADE: Hide an enemy ${gaara139DefeatedName} with cost less than ${gaara139DefeatedCost}.`,
                targetSelectionType: 'GAARA139_HIDE_SAME_NAME',
                sourcePlayer: pendingEffect.sourcePlayer,
                requiresTargetSelection: true,
                validTargets: hideTargets,
                isOptional: true,
                isMandatory: false,
                resolved: false,
                isUpgrade: true,
              }];
              newState.pendingActions = [...newState.pendingActions, {
                id: hideActionId,
                type: 'SELECT_TARGET' as const,
                player: pendingEffect.sourcePlayer,
                description: `Gaara (139) UPGRADE: Hide an enemy ${gaara139DefeatedName} with cost less than ${gaara139DefeatedCost}.`,
                descriptionKey: 'game.effect.desc.gaara139HideSameName',
                descriptionParams: { target: gaara139DefeatedName, cost: String(gaara139DefeatedCost) },
                options: hideTargets,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: hideEffectId,
              }];
            }
          }
        }
        break;
      }

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
      case 'NEJI116_DEFEAT_POWER4':
      case 'NEJI116_DEFEAT_POWER6':
      case 'KURENAI116B_DEFEAT_TARGET':
      case 'KIBA113_DEFEAT_TARGET':
      case 'KANKURO119_DEFEAT_TARGET':
      case 'JIROBO122_DEFEAT_TARGET':
      case 'KIDOMARU124_DEFEAT_TARGET':
      case 'OROCHIMARU126_DEFEAT_WEAKEST':
      case 'KIBA149_CHOOSE_DEFEAT_TARGET':
      case 'SASUKE136_CHOOSE_ENEMY':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Tenten 118 (R/RA): Defeat hidden in mission, then if Power <= 3, defeat hidden in play ---
      case 'TENTEN_118_DEFEAT_HIDDEN_IN_MISSION': {
        // Check the defeated character's printed power BEFORE defeating
        const tenten118Char = EffectEngine.findCharByInstanceId(newState, targetId);
        let tenten118PrintedPower = 99;
        if (tenten118Char) {
          const tTop = tenten118Char.character.stack.length > 0
            ? tenten118Char.character.stack[tenten118Char.character.stack.length - 1]
            : tenten118Char.character.card;
          tenten118PrintedPower = tTop.power ?? 0;
        }

        // Defeat the first target
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        // If defeated character had printed Power <= 3, defeat another hidden character in play
        if (tenten118PrintedPower <= 3) {
          const hiddenTargets: string[] = [];
          for (const mission of newState.activeMissions) {
            for (const c of [...mission.player1Characters, ...mission.player2Characters]) {
              if (c.isHidden) {
                hiddenTargets.push(c.instanceId);
              }
            }
          }
          if (hiddenTargets.length === 1) {
            newState = EffectEngine.defeatCharacter(newState, hiddenTargets[0], pendingEffect.sourcePlayer);
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_DEFEAT', `Tenten (118): Defeated character had Power ${tenten118PrintedPower} (<=3), defeated another hidden character.`,
              'game.log.effect.tenten118SecondDefeat', { card: 'TENTEN', id: 'KS-118-R' });
          } else if (hiddenTargets.length > 1) {
            const tt118EffId = generateInstanceId();
            const tt118ActId = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: tt118EffId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: '',
              targetSelectionType: 'TENTEN_118_DEFEAT_HIDDEN_IN_PLAY',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: hiddenTargets,
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: false,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: tt118ActId,
              type: 'SELECT_TARGET' as PendingAction['type'],
              player: pendingEffect.sourcePlayer,
              description: `Tenten (118): Defeated character had Power ${tenten118PrintedPower} (<=3). Choose a hidden character in play to defeat.`,
              descriptionKey: 'game.effect.desc.tenten118DefeatHiddenInPlay',
              options: hiddenTargets,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: tt118EffId,
            }];
          } else {
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_NO_TARGET', `Tenten (118): Defeated character had Power ${tenten118PrintedPower} (<=3) but no other hidden characters in play.`,
              'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-118-R' });
          }
        }
        break;
      }

      case 'TENTEN_118_DEFEAT_HIDDEN_IN_PLAY':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Sasuke 136 S: Two-stage defeat (friendly then enemy) ---
      case 'SASUKE136_CHOOSE_FRIENDLY': {
        // Stage 1: defeat the chosen friendly character
        newState = EffectEngine.defeatFriendlyForSasuke136(newState, pendingEffect, targetId);
        break;
      }

      // =============================================
      // KIBA113: Player chose which Akamaru to hide/defeat, then prompt for enemy target
      // =============================================
      case 'KIBA113_CHOOSE_AKAMARU':
      case 'KIBA113_CHOOSE_AKAMARU_DEFEAT': {
        const isDefeatMode = pendingEffect.targetSelectionType === 'KIBA113_CHOOSE_AKAMARU_DEFEAT';
        let k113Data: { sourceMissionIndex: number } | null = null;
        try {
          k113Data = JSON.parse(pendingEffect.effectDescription);
        } catch { /* ignore */ }
        if (!k113Data) break;

        const srcMI = k113Data.sourceMissionIndex;
        const enemySide_k113 = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

        // Apply action to the chosen Akamaru (targetId)
        if (isDefeatMode) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DEFEAT', 'Kiba Inuzuka (113) UPGRADE: Defeated friendly Akamaru.',
            'game.log.effect.defeat',
            { card: 'KIBA INUZUKA', id: 'KS-113-R', target: 'Akamaru' },
          );
        } else {
          newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        }

        // Gather valid targets for step 2 in source mission: non-hidden enemies
        const srcMission_k113 = newState.activeMissions[srcMI];
        if (!srcMission_k113) break;
        const step2Targets: string[] = [];
        for (const char of srcMission_k113[enemySide_k113]) {
          if (!char.isHidden) {
            step2Targets.push(char.instanceId);
          }
        }

        if (step2Targets.length === 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kiba Inuzuka (113): No non-hidden enemy in this mission to target.',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-113-R' },
          );
          break;
        }

        const step2Type = isDefeatMode ? 'KIBA113_DEFEAT_TARGET' : 'KIBA113_HIDE_TARGET';
        const step2DescKey = isDefeatMode ? 'game.effect.desc.kiba113Defeat' : 'game.effect.desc.kiba113Hide';
        const step2Desc = isDefeatMode
          ? 'Kiba Inuzuka (113) UPGRADE: Choose an enemy character in this mission to defeat.'
          : 'Kiba Inuzuka (113): Choose an enemy character in this mission to hide.';

        const step2EffId = generateInstanceId();
        const step2ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: step2EffId,
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: srcMI,
          effectType: pendingEffect.effectType,
          effectDescription: '',
          targetSelectionType: step2Type,
          sourcePlayer: pendingEffect.sourcePlayer,
          requiresTargetSelection: true,
          validTargets: step2Targets,
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: isDefeatMode,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: step2ActId,
          type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: step2Desc,
          descriptionKey: step2DescKey,
          options: step2Targets,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: step2EffId,
        }];
        break;
      }

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
      case 'CHOJI018_HIDE_ENEMY':
      case 'GAARA139_HIDE_SAME_NAME':
      case 'GAARA153_HIDE_SAME_NAME':
      case 'KIBA026_OPPONENT_CHOOSE_HIDE': // legacy — kept for backward compat with old saved states
      case 'KIBA026_PLAYER_CHOOSE_HIDE':
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Naruto 133 S: Two-stage hide/defeat ---
      case 'NARUTO133_CHOOSE_TARGET1': {
        // Stage 1: hide or defeat the chosen enemy (Power ≤5 in this mission)
        newState = EffectEngine.naruto133ApplyTarget1(newState, pendingEffect, targetId);
        break;
      }
      case 'NARUTO133_CHOOSE_TARGET2': {
        // Stage 2: hide or defeat a second enemy (Power ≤2 in any mission)
        let parsed133t2: { useDefeat?: boolean } = {};
        try { parsed133t2 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (parsed133t2.useDefeat) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        } else {
          newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        }
        break;
      }

      // --- Naruto 108 R: Player chooses hide target ---
      case 'NARUTO108_CHOOSE_HIDE_TARGET': {
        // Hide the chosen target, then apply POWERUP if upgrade
        newState = EffectEngine.naruto108ApplyHide(newState, pendingEffect, targetId);
        break;
      }

      // --- Kyubi 134 S: Iterative multi-hide ---
      case 'KYUBI134_CHOOSE_HIDE_TARGETS': {
        newState = EffectEngine.kyubi134ApplyHide(newState, pendingEffect, targetId);
        break;
      }

      // =============================================
      // Itachi 128 — single-stage: move chosen friendly character to Itachi's mission
      // =============================================
      case 'ITACHI128_MOVE_TO_THIS_MISSION': {
        let parsed128: { destMissionIndex?: number } = {};
        try { parsed128 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const dest128 = parsed128.destMissionIndex ?? pendingEffect.sourceMissionIndex;
        const moveRes128 = EffectEngine.findCharByInstanceId(newState, targetId);
        if (moveRes128) {
          newState = EffectEngine.moveCharToMissionDirectPublic(
            newState, targetId, dest128,
            moveRes128.player, 'ITACHI UCHIWA', pendingEffect.sourceCardId,
          );
        }
        break;
      }

      // =============================================
      // MOVE types (two-stage: character selection → destination selection)
      // =============================================
      case 'JIRAIYA105_MOVE_ENEMY':
      case 'KANKURO119_MOVE_CHARACTER':
      case 'TEMARI121_MOVE_FRIENDLY':
      case 'TEMARI121_MOVE_ANY':
      case 'ITACHI152_CHOOSE_MOVE':
      case 'SHINO115_MOVE_FRIENDLY':
      case 'SAKON127_MOVE_FRIENDLY': {
        // Stage 1: player chose which character to move. Now prompt for destination mission.
        const moveCharResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (moveCharResult) {
          const validDestMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== moveCharResult.missionIndex) {
              // Check name uniqueness at destination
              if (EffectEngine.validateNameUniquenessForMove(newState, moveCharResult.character, i, moveCharResult.player)) {
                validDestMissions.push(String(i));
              }
            }
          }
          if (validDestMissions.length === 0) {
            // No valid destination — can't move
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_BLOCKED',
              `Cannot move ${moveCharResult.character.card.name_fr} — no valid destination mission.`,
              'game.log.effect.moveBlocked',
              { target: moveCharResult.character.card.name_fr },
            );
          } else if (validDestMissions.length === 1) {
            // Only one valid destination — auto-move
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDestMissions[0], 10),
              moveCharResult.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
            );
          } else {
            // Multiple valid destinations — prompt for selection
            const moveEffectId = generateInstanceId();
            const moveActionId = generateInstanceId();
            // Map the original type to a destination type
            const destType = pendingEffect.targetSelectionType + '_DESTINATION';
            newState.pendingEffects.push({
              id: moveEffectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: destType,
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validDestMissions,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
            });
            newState.pendingActions.push({
              id: moveActionId,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: `Choose a mission to move the character to.`,
              descriptionKey: 'game.effect.desc.chooseMissionMove',
              options: validDestMissions,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: moveEffectId,
            });
          }
        }
        break;
      }
      // Stage 2 destination handlers for the above move types
      case 'JIRAIYA105_MOVE_ENEMY_DESTINATION':
      case 'KANKURO119_MOVE_CHARACTER_DESTINATION':
      case 'TEMARI121_MOVE_FRIENDLY_DESTINATION':
      case 'TEMARI121_MOVE_ANY_DESTINATION':
      case 'ITACHI152_CHOOSE_MOVE_DESTINATION':
      case 'SHINO115_MOVE_FRIENDLY_DESTINATION':
      case 'SAKON127_MOVE_FRIENDLY_DESTINATION': {
        const destMissionIdx = parseInt(targetId, 10);
        if (!isNaN(destMissionIdx)) {
          let moveCharId = '';
          try { moveCharId = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (moveCharId) {
            const moveCharRes = EffectEngine.findCharByInstanceId(newState, moveCharId);
            if (moveCharRes) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, moveCharId, destMissionIdx,
                moveCharRes.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
              );
            }
          }
        }
        break;
      }

      // --- Rock Lee 117/151 end-of-round move ---
      case 'ROCK_LEE_END_MOVE':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      // --- Akamaru 028 optional end-of-round return to hand ---
      case 'AKAMARU028_RETURN_TO_HAND': {
        newState = returnCharacterToHand(newState, targetId, pendingEffect.sourcePlayer);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'END_RETURN',
          'Akamaru (028): Returned to hand at end of round.',
          'game.log.effect.akamaru028Return',
          { card: 'AKAMARU', id: 'KS-028-UC' },
        );
        break;
      }

      // --- Kyodaigumo 103 optional end-of-round: hide a character, then must return to hand ---
      case 'KYODAIGUMO103_CHOOSE_HIDE_TARGET': {
        // Hide the selected character
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        // Kyodaigumo must return to hand
        let k103Data: { kyodaigumoInstanceId?: string } = {};
        try { k103Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (k103Data.kyodaigumoInstanceId) {
          newState = returnCharacterToHand(newState, k103Data.kyodaigumoInstanceId, pendingEffect.sourcePlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'END_RETURN',
            'Kyodaigumo (103): Must return to hand after using end-of-round effect.',
            'game.log.effect.kyodaigumo103Return',
            { card: 'KYODAIGUMO', id: 'KS-103-UC' },
          );
        }
        break;
      }

      // --- MOVE types (destination selection — use moveSelfToMission) ---
      case 'KURENAI116B_MOVE_SELF':
      case 'KAKASHI137_MOVE_SELF':
      case 'PAKKUN_MOVE_DESTINATION':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      case 'KAKASHI137_HIDE_UPGRADED': {
        // Hide the selected upgraded character — use hideCharacterWithLog for proper protection checks
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }

      // --- Sasuke 107 R: Player chose destination mission for a character being moved ---
      case 'SASUKE107_CHOOSE_DESTINATION': {
        const destMission107 = parseInt(targetId, 10);
        if (isNaN(destMission107)) break;

        let parsed107: {
          charInstanceId?: string;
          remainingCharIds?: string[];
          movedCount?: number;
          isUpgrade?: boolean;
          sasukeInstanceId?: string;
          sourceMissionIndex?: number;
        } = {};
        try { parsed107 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const charId107 = parsed107.charInstanceId ?? '';
        const remaining107 = parsed107.remainingCharIds ?? [];
        let movedCount107 = parsed107.movedCount ?? 0;
        const isUpgrade107 = parsed107.isUpgrade ?? false;
        const sasukeId107 = parsed107.sasukeInstanceId ?? '';
        const srcMission107 = parsed107.sourceMissionIndex ?? 0;
        const player107 = pendingEffect.sourcePlayer;
        const friendlySide107: 'player1Characters' | 'player2Characters' =
          player107 === 'player1' ? 'player1Characters' : 'player2Characters';

        // Move the character to the chosen mission (with upgrade support)
        if (charId107) {
          // Find and remove from source mission
          let movedChar107: CharacterInPlay | null = null;
          for (let i = 0; i < newState.activeMissions.length; i++) {
            const chars = newState.activeMissions[i][friendlySide107];
            const idx = chars.findIndex((c) => c.instanceId === charId107);
            if (idx !== -1) {
              movedChar107 = chars[idx];
              chars.splice(idx, 1);
              break;
            }
          }

          if (movedChar107) {
            const movedTopCard107 = movedChar107.stack.length > 0
              ? movedChar107.stack[movedChar107.stack.length - 1]
              : movedChar107.card;
            const movedName107 = movedTopCard107.name_fr.toUpperCase();
            const destChars107 = newState.activeMissions[destMission107][friendlySide107];

            // Check for upgrade at destination
            const upgradeIdx107 = destChars107.findIndex((c) => {
              if (c.isHidden) return false;
              const ct = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              return ct.name_fr.toUpperCase() === movedName107
                && (movedTopCard107.chakra ?? 0) > (ct.chakra ?? 0);
            });

            if (upgradeIdx107 !== -1) {
              // Merge stacks (upgrade at destination)
              const existing = destChars107[upgradeIdx107];
              const movedStack = movedChar107.stack.length > 0 ? movedChar107.stack : [movedChar107.card];
              destChars107[upgradeIdx107] = {
                ...existing,
                card: movedTopCard107,
                stack: [...existing.stack, ...movedStack],
                powerTokens: existing.powerTokens + movedChar107.powerTokens,
              };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, player107,
                'EFFECT_MOVE',
                `Sasuke Uchiwa (107): Moved and upgraded ${movedChar107.card.name_fr} on mission ${destMission107 + 1}.`,
                'game.log.effect.move',
                { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: movedChar107.card.name_fr, from: srcMission107, to: destMission107 },
              );
            } else {
              // Place as new character
              movedChar107.missionIndex = destMission107;
              destChars107.push(movedChar107);
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, player107,
                'EFFECT_MOVE',
                `Sasuke Uchiwa (107): Moved ${movedChar107.card.name_fr} to mission ${destMission107 + 1}.`,
                'game.log.effect.move',
                { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: movedChar107.card.name_fr, from: srcMission107, to: destMission107 },
              );
            }

            movedCount107++;
          }
        }

        // Process remaining characters
        let nextIdx107 = 0;
        while (nextIdx107 < remaining107.length) {
          const nextCharId = remaining107[nextIdx107];
          // Check if char still exists
          let nextCharExists = false;
          let nextCharName = '';
          for (const m of newState.activeMissions) {
            const c = m[friendlySide107].find((ch) => ch.instanceId === nextCharId);
            if (c) { nextCharExists = true; nextCharName = c.card.name_fr; break; }
          }
          if (!nextCharExists) { nextIdx107++; continue; }

          // Get valid missions for this char
          const nextValidMissions: string[] = [];
          let nextChar107: CharacterInPlay | null = null;
          for (const m of newState.activeMissions) {
            const c = m[friendlySide107].find((ch) => ch.instanceId === nextCharId);
            if (c) { nextChar107 = c; break; }
          }
          if (!nextChar107) { nextIdx107++; continue; }

          const nextTopCard = nextChar107.stack.length > 0
            ? nextChar107.stack[nextChar107.stack.length - 1]
            : nextChar107.card;
          const nextName = nextTopCard.name_fr.toUpperCase();
          const nextCost = nextTopCard.chakra ?? 0;

          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i === srcMission107) continue;
            const destChars = newState.activeMissions[i][friendlySide107];
            const sameNameChar = destChars.find((c) => {
              if (c.isHidden) return false;
              const ct = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              return ct.name_fr.toUpperCase() === nextName;
            });
            if (!sameNameChar) {
              nextValidMissions.push(String(i));
            } else {
              const existingTop = sameNameChar.stack.length > 0
                ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
              if (nextCost > (existingTop.chakra ?? 0)) {
                nextValidMissions.push(String(i));
              }
            }
          }

          if (nextValidMissions.length === 0) {
            // Can't move — skip
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, player107,
              'EFFECT_NO_TARGET',
              `Sasuke Uchiwa (107): Cannot move ${nextCharName} — no valid destination.`,
              'game.log.effect.noTarget',
              { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
            );
            nextIdx107++;
            continue;
          }

          if (nextValidMissions.length === 1) {
            // Auto-move
            const autoDestIdx = parseInt(nextValidMissions[0], 10);
            let autoMovedChar: CharacterInPlay | null = null;
            for (let i = 0; i < newState.activeMissions.length; i++) {
              const chars = newState.activeMissions[i][friendlySide107];
              const cIdx = chars.findIndex((c) => c.instanceId === nextCharId);
              if (cIdx !== -1) {
                autoMovedChar = chars[cIdx];
                chars.splice(cIdx, 1);
                break;
              }
            }
            if (autoMovedChar) {
              const autoTopCard = autoMovedChar.stack.length > 0
                ? autoMovedChar.stack[autoMovedChar.stack.length - 1] : autoMovedChar.card;
              const autoName = autoTopCard.name_fr.toUpperCase();
              const autoDestChars = newState.activeMissions[autoDestIdx][friendlySide107];
              const autoUpIdx = autoDestChars.findIndex((c) => {
                if (c.isHidden) return false;
                const ct = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
                return ct.name_fr.toUpperCase() === autoName && (autoTopCard.chakra ?? 0) > (ct.chakra ?? 0);
              });
              if (autoUpIdx !== -1) {
                const existing = autoDestChars[autoUpIdx];
                const movedStack = autoMovedChar.stack.length > 0 ? autoMovedChar.stack : [autoMovedChar.card];
                autoDestChars[autoUpIdx] = {
                  ...existing,
                  card: autoTopCard,
                  stack: [...existing.stack, ...movedStack],
                  powerTokens: existing.powerTokens + autoMovedChar.powerTokens,
                };
              } else {
                autoMovedChar.missionIndex = autoDestIdx;
                autoDestChars.push(autoMovedChar);
              }
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, player107,
                'EFFECT_MOVE',
                `Sasuke Uchiwa (107): Moved ${nextCharName} to mission ${autoDestIdx + 1}.`,
                'game.log.effect.move',
                { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: nextCharName, from: srcMission107, to: autoDestIdx },
              );
              movedCount107++;
            }
            nextIdx107++;
            continue;
          }

          // Multiple valid missions — create new pending for player choice
          const nextEffectId = generateInstanceId();
          const nextActionId = generateInstanceId();
          newState.pendingEffects.push({
            id: nextEffectId,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              charInstanceId: nextCharId,
              remainingCharIds: remaining107.slice(nextIdx107 + 1),
              movedCount: movedCount107,
              isUpgrade: isUpgrade107,
              sasukeInstanceId: sasukeId107,
              sourceMissionIndex: srcMission107,
            }),
            targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION',
            sourcePlayer: player107,
            requiresTargetSelection: true,
            validTargets: nextValidMissions,
            isOptional: false,
            isMandatory: true,
            resolved: false,
            isUpgrade: isUpgrade107,
          });
          newState.pendingActions.push({
            id: nextActionId,
            type: 'SELECT_TARGET',
            player: player107,
            description: `Sasuke Uchiwa (107): Choose a mission to move ${nextCharName} to.`,
            descriptionKey: 'game.effect.desc.sasuke107ChooseDestination',
            descriptionParams: { target: nextCharName },
            options: nextValidMissions,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: nextEffectId,
          });
          break; // Stop processing — wait for player choice
        }

        // If we got through all remaining chars (or there were none left), apply POWERUP
        if (nextIdx107 >= remaining107.length && isUpgrade107 && movedCount107 > 0 && sasukeId107) {
          // Find Sasuke in source mission and add power tokens
          const sasukeMissions = newState.activeMissions;
          for (let i = 0; i < sasukeMissions.length; i++) {
            const chars = sasukeMissions[i][friendlySide107];
            const sIdx = chars.findIndex((c) => c.instanceId === sasukeId107);
            if (sIdx !== -1) {
              chars[sIdx] = {
                ...chars[sIdx],
                powerTokens: chars[sIdx].powerTokens + movedCount107,
              };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, player107,
                'EFFECT_POWERUP',
                `Sasuke Uchiwa (107) UPGRADE: POWERUP ${movedCount107} (characters moved).`,
                'game.log.effect.powerupSelf',
                { card: 'SASUKE UCHIWA', id: 'KS-107-R', amount: movedCount107 },
              );
              break;
            }
          }
        }
        break;
      }

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
              charResult.player, 'Shikamaru Nara', 'KS-022-UC',
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
              descriptionKey: 'game.effect.desc.shikamaru022MoveDest',
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
                charRes.player, 'Shikamaru Nara', 'KS-022-UC',
              );
            }
          }
        }
        break;
      }

      // --- Shizune 006 — move enemy with power 3 or less (two-stage: char then destination) ---
      case 'MOVE_ENEMY_POWER_3_OR_LESS': {
        const shizChar = EffectEngine.findCharByInstanceId(newState, targetId);
        if (shizChar) {
          const validMissions_sh: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== shizChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, shizChar.character, i, shizChar.player)) validMissions_sh.push(String(i));
          }
          if (validMissions_sh.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validMissions_sh[0], 10),
              shizChar.player, 'Shizune', 'KS-006-UC',
            );
          } else if (validMissions_sh.length > 1) {
            const effectId_sh = generateInstanceId();
            const actionId_sh = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId_sh,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: 'SHIZUNE006_MOVE_DESTINATION',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validMissions_sh,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId_sh,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Shizune (006): Choose a mission to move the enemy character to.',
              descriptionKey: 'game.effect.desc.shizune006MoveDest',
              options: validMissions_sh,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_sh,
            });
          }
        }
        break;
      }
      case 'SHIZUNE006_MOVE_DESTINATION': {
        const destMission_sh = parseInt(targetId, 10);
        if (!isNaN(destMission_sh)) {
          let charInstanceId_sh = '';
          try { charInstanceId_sh = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (charInstanceId_sh) {
            const charRes_sh = EffectEngine.findCharByInstanceId(newState, charInstanceId_sh);
            if (charRes_sh) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, charInstanceId_sh, destMission_sh,
                charRes_sh.player, 'Shizune', 'KS-006-UC',
              );
            }
          }
        }
        break;
      }

      // --- Zaku 071 — move enemy from this mission (two-stage: char then destination) ---
      case 'MOVE_ENEMY_FROM_THIS_MISSION': {
        // Stage 1: player chose which enemy character to move. Now prompt for destination.
        const zakuChar = EffectEngine.findCharByInstanceId(newState, targetId);
        if (zakuChar) {
          const validMissions_z: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== zakuChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, zakuChar.character, i, zakuChar.player)) validMissions_z.push(String(i));
          }
          if (validMissions_z.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validMissions_z[0], 10),
              zakuChar.player, 'Zaku Abumi', 'KS-071-UC',
            );
          } else if (validMissions_z.length > 1) {
            const effectId_z = generateInstanceId();
            const actionId_z = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId_z,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: 'ZAKU071_MOVE_DESTINATION',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validMissions_z,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId_z,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Zaku Abumi (071): Choose a mission to move the enemy character to.',
              descriptionKey: 'game.effect.desc.zaku071MoveDest',
              options: validMissions_z,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_z,
            });
          }
        }
        break;
      }
      case 'ZAKU071_MOVE_DESTINATION': {
        const destMission_z = parseInt(targetId, 10);
        if (!isNaN(destMission_z)) {
          let charInstanceId_z = '';
          try { charInstanceId_z = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (charInstanceId_z) {
            const charRes_z = EffectEngine.findCharByInstanceId(newState, charInstanceId_z);
            if (charRes_z) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, charInstanceId_z, destMission_z,
                charRes_z.player, 'Zaku Abumi', 'KS-071-UC',
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
        if (!ino110Char) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET',
            'Ino Yamanaka (110): Target character no longer in play.',
            'game.log.effect.noTarget',
            { card: 'INO YAMANAKA', id: 'KS-110-R' },
          );
          break;
        }
        {
          const validDests: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== ino110Char.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, ino110Char.character, i, ino110Char.player)) {
              validDests.push(String(i));
            }
          }
          if (validDests.length === 0) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_NO_TARGET',
              `Ino Yamanaka (110): No valid destination mission to move ${ino110Char.character.card.name_fr}.`,
              'game.log.effect.noTarget',
              { card: 'INO YAMANAKA', id: 'KS-110-R' },
            );
          } else if (validDests.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDests[0], 10),
              ino110Char.player, 'Ino Yamanaka', 'KS-110-R',
            );
            // If upgrade, also hide the moved character
            if (pendingEffect.isUpgrade) {
              newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
            }
          } else {
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
              descriptionKey: 'game.effect.desc.ino110MoveDest',
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
                ino110CharRes.player, 'Ino Yamanaka', 'KS-110-R',
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
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 1);
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
              descriptionKey: 'game.effect.desc.asuma113bDefeat',
              descriptionParams: { maxPower },
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
                    'Might Guy', 'KS-119b-R',
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
              descriptionKey: 'game.effect.desc.kimimaro123Defeat',
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
                descriptionKey: 'game.effect.desc.naruto141Hide',
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
              { card: 'SASUKE UCHIWA', id: 'KS-142-M', amount: powerupAmount },
            );
          }
        }
        break;
      }

      // =============================================
      // OPTIONAL CONFIRM types (player accepts or skips via popup)
      // =============================================

      case 'SASUKE146_GIVE_EDGE': {
        // Player confirmed: give Edge to opponent and POWERUP 3 on self
        const opponentId146: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        newState = { ...newState, edgeHolder: opponentId146 };
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_EDGE',
          'Sasuke Uchiwa (146): Gave the Edge token to opponent.',
          'game.log.effect.giveEdge',
          { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
        );
        // POWERUP 3 on Sasuke 146
        let parsedSasuke146: { sourceMissionIndex?: number } = {};
        try { parsedSasuke146 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const mIdx146 = parsedSasuke146.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const friendlySide146: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const missions146 = [...newState.activeMissions];
        const mission146 = { ...missions146[mIdx146] };
        const chars146 = [...mission146[friendlySide146]];
        const selfIdx146 = chars146.findIndex((c) => c.instanceId === pendingEffect.sourceInstanceId);
        if (selfIdx146 !== -1) {
          chars146[selfIdx146] = { ...chars146[selfIdx146], powerTokens: chars146[selfIdx146].powerTokens + 3 };
          mission146[friendlySide146] = chars146;
          missions146[mIdx146] = mission146;
          newState = {
            ...newState,
            activeMissions: missions146,
            log: logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_POWERUP',
              'Sasuke Uchiwa (146): POWERUP 3 on self.',
              'game.log.effect.powerupSelf',
              { card: 'SASUKE UCHIWA', id: 'KS-146-M', amount: 3 },
            ),
          };
        }
        break;
      }

      case 'SAKURA011_DRAW': {
        // Player confirmed (targetId = 'confirm' from new DRAW_CARD UI, or sourceCard.instanceId from old path)
        const ps011 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps011.deck.length > 0) {
          const deck011 = [...ps011.deck];
          const drawn011 = deck011.shift()!;
          ps011.deck = deck011;
          ps011.hand = [...ps011.hand, drawn011];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps011 };
        }
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW',
          'Sakura Haruno (011): Drew 1 card (Team 7 synergy).',
          'game.log.effect.draw',
          { card: 'SAKURA HARUNO', id: 'KS-011-C', count: '1' },
        );
        break;
      }

      // =============================================
      // PLAY SUMMON types
      // =============================================
      case 'JIRAIYA008_CHOOSE_SUMMON':
        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 2);
        break;

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
        newState = EffectEngine.playCharFromHandWithReduction(newState, pendingEffect, targetId, 2, 'Sound Village', 'Tayuya', 'KS-125-R');
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
            { card: 'ICHIBI', id: 'KS-130-R', target: `${defeatedCount} hidden enemies` },
          );
        }
        break;
      }

      case 'KAKASHI148_COPY_EFFECT': {
        // Kakashi 148 AMBUSH: copy a Team 7 character's instant effect (MAIN, AMBUSH, or UPGRADE)
        const k148Target = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!k148Target) break;

        const k148TopCard = k148Target.character.stack.length > 0
          ? k148Target.character.stack[k148Target.character.stack.length - 1]
          : k148Target.character.card;

        // Kakashi 148 can copy MAIN, AMBUSH, and UPGRADE (not continuous, not SCORE)
        const k148Copyable = (k148TopCard.effects ?? []).filter((eff) => {
          if (eff.type === 'SCORE') return false;
          if (eff.description.includes('[⧗]')) return false;
          if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
          return eff.type === 'MAIN' || eff.type === 'AMBUSH' || eff.type === 'UPGRADE';
        });

        if (k148Copyable.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', `Kakashi Hatake (148): ${k148TopCard.name_fr} has no copyable instant effect.`,
            'game.log.effect.copyFailed', { card: 'KAKASHI HATAKE', id: 'KS-148-M' });
          break;
        }

        if (k148Copyable.length === 1) {
          // Single copyable effect — execute directly
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, k148TopCard, k148Copyable[0].type as EffectType,
          );
        } else {
          // Multiple copyable effects — Stage 2: let the player choose which effect
          const choiceEffectId = generateInstanceId();
          const choiceActionId = generateInstanceId();
          const effectOptions = k148Copyable.map((eff) => `${eff.type}::${eff.description}`);
          newState.pendingEffects.push({
            id: choiceEffectId,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ charInstanceId: targetId, cardId: k148TopCard.id }),
            targetSelectionType: 'COPY_EFFECT_CHOSEN',
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: effectOptions,
            isOptional: false,
            isMandatory: true,
            resolved: false,
            isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: choiceActionId,
            type: 'CHOOSE_EFFECT',
            player: pendingEffect.sourcePlayer,
            description: `Choose which effect of ${k148TopCard.name_fr} to copy.`,
            descriptionKey: 'game.effect.desc.chooseEffectToCopy',
            descriptionParams: { target: k148TopCard.name_fr },
            options: effectOptions,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: choiceEffectId,
          });
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
              wasRevealedAtLeastOnce: false,
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
              { card: 'KABUTO YAKUSHI', id: 'KS-052-C', mission: String(missionIdx_kb + 1) },
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

      // =============================================
      // SIMPLE DEFEAT types (target = instanceId → defeat the character)
      // =============================================
      case 'DEFEAT_ANY_CHARACTER_THIS_MISSION':
      case 'DEFEAT_ENEMY_POWER_1_THIS_MISSION':
      case 'DEFEAT_ENEMY_SUMMON_THIS_MISSION':
      case 'DEFEAT_HIDDEN_CHARACTER_ANY':
      case 'TENTEN_DEFEAT_HIDDEN':
      case 'KIDOMARU060_DEFEAT_LOW_POWER':
      case 'ANKO_DEFEAT_HIDDEN_ENEMY':
      case 'OROCHIMARU051_DEFEAT_HIDDEN':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Gemma 049: Sacrifice choice (defeat protection) ---
      case 'GEMMA049_SACRIFICE_CHOICE': {
        // Player accepted — sacrifice Gemma to protect the original target from defeat
        let g049Data: { targetInstanceId?: string; sacrificeInstanceId?: string; effectSource?: string } = {};
        try { g049Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const gemmaId = g049Data.sacrificeInstanceId ?? targetId;
        const gemmaResult = EffectEngine.findCharByInstanceId(newState, gemmaId);
        newState = EffectEngine.defeatCharacterDirect(newState, gemmaId);
        if (gemmaResult) {
          newState = triggerOnDefeatEffects(newState, gemmaResult.character, gemmaResult.player);
        }
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_SACRIFICE',
          'Gemma Shiranui (049): Sacrificed to protect an ally from defeat.',
          'game.log.effect.gemma049Sacrifice',
          { card: 'GEMMA SHIRANUI', id: 'KS-049-C' },
        );
        break;
      }

      // --- Gemma 049: Sacrifice choice (hide protection) ---
      case 'GEMMA049_SACRIFICE_HIDE_CHOICE': {
        // Player accepted — sacrifice Gemma to protect the original target from being hidden
        let g049HideData: { targetInstanceId?: string; sacrificeInstanceId?: string; effectSource?: string } = {};
        try { g049HideData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const gemmaHideId = g049HideData.sacrificeInstanceId ?? targetId;
        const gemmaHideResult = EffectEngine.findCharByInstanceId(newState, gemmaHideId);
        newState = EffectEngine.defeatCharacterDirect(newState, gemmaHideId);
        if (gemmaHideResult) {
          newState = triggerOnDefeatEffects(newState, gemmaHideResult.character, gemmaHideResult.player);
        }
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_SACRIFICE',
          'Gemma Shiranui (049): Sacrificed to protect an ally from being hidden.',
          'game.log.effect.gemma049SacrificeHide',
          { card: 'GEMMA SHIRANUI', id: 'KS-049-C' },
        );
        break;
      }

      // =============================================
      // SIMPLE POWERUP types (target = instanceId → add power tokens)
      // =============================================
      case 'AKAMARU_028_POWERUP_KIBA': {
        const akRes = EffectEngine.findCharByInstanceId(newState, targetId);
        if (akRes) {
          const missions_ak = [...newState.activeMissions];
          const m_ak = { ...missions_ak[akRes.missionIndex] };
          const side_ak = akRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m_ak[side_ak] = m_ak[side_ak].map((c: CharacterInPlay) =>
            c.instanceId === targetId ? { ...c, powerTokens: c.powerTokens + 2 } : c
          );
          missions_ak[akRes.missionIndex] = m_ak;
          newState = { ...newState, activeMissions: missions_ak };
        }
        break;
      }
      case 'TAYUYA065_POWERUP_SOUND': {
        const tayRes = EffectEngine.findCharByInstanceId(newState, targetId);
        if (tayRes) {
          const missions_tay = [...newState.activeMissions];
          const m_tay = { ...missions_tay[tayRes.missionIndex] };
          const side_tay = tayRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m_tay[side_tay] = m_tay[side_tay].map((c: CharacterInPlay) =>
            c.instanceId === targetId ? { ...c, powerTokens: c.powerTokens + 2 } : c
          );
          missions_tay[tayRes.missionIndex] = m_tay;
          newState = { ...newState, activeMissions: missions_tay };
        }
        break;
      }
      case 'TENTEN_POWERUP_LEAF': {
        const ttRes = EffectEngine.findCharByInstanceId(newState, targetId);
        if (ttRes) {
          const missions_tt = [...newState.activeMissions];
          const m_tt = { ...missions_tt[ttRes.missionIndex] };
          const side_tt = ttRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m_tt[side_tt] = m_tt[side_tt].map((c: CharacterInPlay) =>
            c.instanceId === targetId ? { ...c, powerTokens: c.powerTokens + 1 } : c
          );
          missions_tt[ttRes.missionIndex] = m_tt;
          newState = { ...newState, activeMissions: missions_tt };
        }
        break;
      }

      // =============================================
      // NEJI 037: Remove all power tokens from target
      // =============================================
      case 'NEJI037_REMOVE_ALL_TOKENS': {
        const nejiRes = EffectEngine.findCharByInstanceId(newState, targetId);
        if (nejiRes) {
          const missions_nj = [...newState.activeMissions];
          const m_nj = { ...missions_nj[nejiRes.missionIndex] };
          const side_nj = nejiRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m_nj[side_nj] = m_nj[side_nj].map((c: CharacterInPlay) =>
            c.instanceId === targetId ? { ...c, powerTokens: 0 } : c
          );
          missions_nj[nejiRes.missionIndex] = m_nj;
          newState = { ...newState, activeMissions: missions_nj };
        }
        break;
      }

      // =============================================
      // SIMPLE DISCARD types (target = hand index → discard from hand)
      // =============================================
      case 'SAKURA_012_DISCARD': {
        const idx_sk = parseInt(targetId, 10);
        const ps_sk = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_sk >= 0 && idx_sk < ps_sk.hand.length) {
          const hand_sk = [...ps_sk.hand];
          const discarded = hand_sk.splice(idx_sk, 1)[0];
          ps_sk.hand = hand_sk;
          ps_sk.discardPile = [...ps_sk.discardPile, discarded];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_sk };
        }
        break;
      }
      case 'ASUMA_024_DISCARD_FOR_POWERUP': {
        // Discard from hand, then POWERUP 3 on self
        const idx_as = parseInt(targetId, 10);
        const ps_as = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_as >= 0 && idx_as < ps_as.hand.length) {
          const hand_as = [...ps_as.hand];
          const discarded_as = hand_as.splice(idx_as, 1)[0];
          ps_as.hand = hand_as;
          ps_as.discardPile = [...ps_as.discardPile, discarded_as];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_as };
          // Apply POWERUP 3 to the source character
          if (pendingEffect.sourceInstanceId) {
            const srcRes = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
            if (srcRes) {
              const missions_as = [...newState.activeMissions];
              const m_as = { ...missions_as[srcRes.missionIndex] };
              const side_as = srcRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
              m_as[side_as] = m_as[side_as].map((c: CharacterInPlay) =>
                c.instanceId === pendingEffect.sourceInstanceId ? { ...c, powerTokens: c.powerTokens + 3 } : c
              );
              missions_as[srcRes.missionIndex] = m_as;
              newState = { ...newState, activeMissions: missions_as };
            }
          }
        }
        break;
      }
      case 'SASUKE_014_DISCARD_OWN': {
        // Stage 1: discard own card from hand, then chain to choose opponent card
        const idx_ss = parseInt(targetId, 10);
        const ps_ss = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_ss >= 0 && idx_ss < ps_ss.hand.length) {
          const hand_ss = [...ps_ss.hand];
          const discarded_ss = hand_ss.splice(idx_ss, 1)[0];
          ps_ss.hand = hand_ss;
          ps_ss.discardPile = [...ps_ss.discardPile, discarded_ss];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_ss };

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD',
            `Sasuke Uchiwa (014) UPGRADE: Discarded ${discarded_ss.name_fr} from own hand.`,
            'game.log.effect.sasuke014DiscardOwn',
            { card: 'SASUKE UCHIWA', id: 'KS-014-UC', target: discarded_ss.name_fr },
          );

          // Stage 2: source player chooses which opponent card to discard
          const opponentPlayer_ss = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const oppHand_ss = newState[opponentPlayer_ss].hand;
          if (oppHand_ss.length > 0) {
            if (oppHand_ss.length === 1) {
              // Auto-discard if only 1 card
              const oppPs_ss = { ...newState[opponentPlayer_ss] };
              const oH = [...oppPs_ss.hand];
              const discardedOpp = oH.splice(0, 1)[0];
              oppPs_ss.hand = oH;
              oppPs_ss.discardPile = [...oppPs_ss.discardPile, discardedOpp];
              newState = { ...newState, [opponentPlayer_ss]: oppPs_ss };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
                'EFFECT_DISCARD_FROM_HAND',
                `Sasuke Uchiwa (014) UPGRADE: Discarded ${discardedOpp.name_fr} from opponent's hand.`,
                'game.log.effect.sasuke014DiscardOpponent',
                { card: 'SASUKE UCHIWA', id: 'KS-014-UC', target: discardedOpp.name_fr },
              );
            } else {
              // Multiple cards — source player chooses
              const oppIndices_ss = oppHand_ss.map((_: unknown, i: number) => String(i));
              const oppCards_ss = oppHand_ss.map((c, i) => ({
                name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
                image_file: c.image_file, originalIndex: i,
              }));
              const charResult_ss = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
              const step2_ss: EffectResult = {
                state: newState,
                requiresTargetSelection: true,
                targetSelectionType: 'SASUKE_014_DISCARD_OPPONENT',
                validTargets: oppIndices_ss,
                description: JSON.stringify({
                  text: 'Sasuke (014) UPGRADE: Choose a card from opponent\'s hand to discard.',
                  cards: oppCards_ss,
                }),
                descriptionKey: 'game.effect.desc.sasuke014DiscardOpponent',
              };
              return EffectEngine.createPendingTargetSelection(
                newState, pendingEffect.sourcePlayer,
                charResult_ss?.character ?? null,
                pendingEffect.sourceMissionIndex,
                'UPGRADE', true, step2_ss, [],
              );
            }
          }
        }
        break;
      }
      case 'KIMIMARO056_CHOOSE_DISCARD': {
        // Stage 1: discard from hand, then stage 2: hide a character with cost ≤ 4
        const idx_km = parseInt(targetId, 10);
        const ps_km = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_km >= 0 && idx_km < ps_km.hand.length) {
          const hand_km = [...ps_km.hand];
          const discarded_km = hand_km.splice(idx_km, 1)[0];
          ps_km.hand = hand_km;
          ps_km.discardPile = [...ps_km.discardPile, discarded_km];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_km };

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD',
            `Kimimaro (056) UPGRADE: Discarded ${discarded_km.name_fr} from hand.`,
            'game.log.effect.discard',
            { card: 'KIMIMARO', id: 'KS-056-UC', target: discarded_km.name_fr },
          );

          // Stage 2: find valid characters to hide (cost ≤ 4, not Kimimaro itself, not already hidden)
          // Filter out enemy chars immune to hide
          const validHideTargets_km: string[] = [];
          for (const mission_km of newState.activeMissions) {
            for (const side_km of ['player1Characters', 'player2Characters'] as const) {
              const sideOwner_km = side_km === 'player1Characters' ? 'player1' as const : 'player2' as const;
              const isEnemy_km = sideOwner_km !== pendingEffect.sourcePlayer;
              for (const char_km of mission_km[side_km]) {
                if (char_km.isHidden) continue;
                if (char_km.instanceId === pendingEffect.sourceInstanceId) continue;
                if (isEnemy_km && !canBeHiddenByEnemy(newState, char_km, sideOwner_km)) continue;
                const topCard_km = char_km.stack.length > 0 ? char_km.stack[char_km.stack.length - 1] : char_km.card;
                if ((topCard_km.chakra ?? 0) <= 4) {
                  validHideTargets_km.push(char_km.instanceId);
                }
              }
            }
          }

          if (validHideTargets_km.length === 1) {
            // Auto-hide the single target (use hideCharacterWithLog for protection checks)
            newState = EffectEngine.hideCharacterWithLog(newState, validHideTargets_km[0], pendingEffect.sourcePlayer);
          } else if (validHideTargets_km.length > 1) {
            // Create stage 2 pending effect/action for choosing which character to hide
            const effectId_km = generateInstanceId();
            const actionId_km = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: effectId_km,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: '',
              targetSelectionType: 'KIMIMARO056_CHOOSE_HIDE',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validHideTargets_km,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: actionId_km,
              type: 'SELECT_TARGET' as PendingAction['type'],
              player: pendingEffect.sourcePlayer,
              description: 'Kimimaro (056): Choose a character to hide (cost 4 or less).',
              descriptionKey: 'game.effect.desc.kimimaro056ChooseHide',
              descriptionParams: {},
              options: validHideTargets_km,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_km,
            }];
          }
        }
        break;
      }
      case 'KIMIMARO056_CHOOSE_HIDE': {
        // Stage 2: hide the selected character (cost ≤ 4) — use hideCharacterWithLog for protection checks
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }
      case 'KIN073_CHOOSE_DISCARD': {
        // Step 1: Player chose a card to discard (cost). Now find enemies in Kin's mission to hide.
        let parsed_k73d: { missionIndex?: number } = {};
        try { parsed_k73d = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k73MissionIdx = typeof parsed_k73d.missionIndex === 'number'
          ? parsed_k73d.missionIndex
          : pendingEffect.sourceMissionIndex;
        const idx_k73d = parseInt(targetId, 10);
        const ps_k73d = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_k73d >= 0 && idx_k73d < ps_k73d.hand.length) {
          const hand_k73d = [...ps_k73d.hand];
          const discarded_k73d = hand_k73d.splice(idx_k73d, 1)[0];
          ps_k73d.hand = hand_k73d;
          ps_k73d.discardPile = [...ps_k73d.discardPile, discarded_k73d];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_k73d };
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD', `Kin Tsuchi (073): Discarded ${discarded_k73d.name_fr} as cost.`,
            'game.log.effect.kin073Discard',
            { card: 'KIN TSUCHI', id: 'KS-073-UC', target: discarded_k73d.name_fr },
          );
        }
        // Now find non-hidden enemies in Kin's mission with effective power <= 4
        const enemyPlayer_k73d: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const enemySide_k73d: 'player1Characters' | 'player2Characters' =
          enemyPlayer_k73d === 'player1' ? 'player1Characters' : 'player2Characters';
        const k73Mission = newState.activeMissions[k73MissionIdx];
        const k73HideTargets: string[] = [];
        if (k73Mission) {
          for (const enemy of k73Mission[enemySide_k73d]) {
            if (enemy.isHidden) continue;
            if (!canBeHiddenByEnemy(newState, enemy, enemyPlayer_k73d)) continue;
            const enemyPower_k73 = calculateCharacterPower(newState, enemy, enemyPlayer_k73d);
            if (enemyPower_k73 <= 4) {
              k73HideTargets.push(enemy.instanceId);
            }
          }
        }
        if (k73HideTargets.length === 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No valid enemy to hide after discard.',
            'game.log.effect.noTarget',
            { card: 'KIN TSUCHI', id: 'KS-073-UC' },
          );
        } else if (k73HideTargets.length === 1) {
          newState = EffectEngine.hideCharacterWithLog(newState, k73HideTargets[0], pendingEffect.sourcePlayer);
        } else {
          // Multiple targets — let player choose
          const charResult_k73d = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          const step2Result_k73d: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'KIN073_CHOOSE_ENEMY',
            validTargets: k73HideTargets,
            description: 'Kin Tsuchi (073): Choose an enemy character with Power 4 or less to hide.',
            descriptionKey: 'game.effect.desc.kin073ChooseEnemy',
          };
          return EffectEngine.createPendingTargetSelection(
            newState,
            pendingEffect.sourcePlayer,
            charResult_k73d?.character ?? null,
            pendingEffect.sourceMissionIndex,
            'MAIN',
            false,
            step2Result_k73d,
            [],
          );
        }
        break;
      }
      case 'KIN073_CHOOSE_ENEMY': {
        // Step 2: Player chose an enemy to hide (after discarding cost).
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }
      case 'DISCARD_FROM_OPPONENT_HAND': {
        // Opponent discards a card from their hand (opponent selects)
        const idx_op = parseInt(targetId, 10);
        const opponent_op = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ps_op = { ...newState[opponent_op] };
        if (idx_op >= 0 && idx_op < ps_op.hand.length) {
          const hand_op = [...ps_op.hand];
          const discarded_op = hand_op.splice(idx_op, 1)[0];
          ps_op.hand = hand_op;
          ps_op.discardPile = [...ps_op.discardPile, discarded_op];
          newState = { ...newState, [opponent_op]: ps_op };
        }
        break;
      }
      case 'SASUKE_014_DISCARD_OPPONENT': {
        // Stage 2 of Sasuke 014 UPGRADE: source player chooses a card from opponent's hand to discard
        const idx_so = parseInt(targetId, 10);
        const opp_so = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ps_so = { ...newState[opp_so] };
        if (idx_so >= 0 && idx_so < ps_so.hand.length) {
          const hand_so = [...ps_so.hand];
          const discarded_so = hand_so.splice(idx_so, 1)[0];
          ps_so.hand = hand_so;
          ps_so.discardPile = [...ps_so.discardPile, discarded_so];
          newState = { ...newState, [opp_so]: ps_so };

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD_FROM_HAND',
            `Sasuke Uchiwa (014) UPGRADE: Discarded ${discarded_so.name_fr} from opponent's hand.`,
            'game.log.effect.sasuke014DiscardOpponent',
            { card: 'SASUKE UCHIWA', id: 'KS-014-UC', target: discarded_so.name_fr },
          );
        }
        break;
      }

      // =============================================
      // RECOVER_FROM_DISCARD: move card from discard to hand
      // =============================================
      case 'RECOVER_FROM_DISCARD': {
        const idx_rc = parseInt(targetId, 10);
        const ps_rc = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_rc >= 0 && idx_rc < ps_rc.discardPile.length) {
          const discard_rc = [...ps_rc.discardPile];
          const recovered = discard_rc.splice(idx_rc, 1)[0];
          ps_rc.discardPile = discard_rc;
          ps_rc.hand = [...ps_rc.hand, recovered];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_rc };
        }
        break;
      }

      // =============================================
      // MOVE SELF types (target = mission index → move self there)
      // =============================================
      case 'CHOJI_018_MOVE_SELF': {
        // Move Choji, then trigger post-move hide
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        const destMIdx018 = parseInt(targetId, 10);
        if (!isNaN(destMIdx018)) {
          const { postMoveHide } = require('./handlers/KS/uncommon/choji018');
          const hideResult = postMoveHide(newState, pendingEffect.sourceInstanceId, destMIdx018, pendingEffect.sourcePlayer);
          if (hideResult.requiresTargetSelection && hideResult.validTargets && hideResult.validTargets.length > 0) {
            return EffectEngine.createPendingTargetSelection(
              hideResult.state, pendingEffect.sourcePlayer,
              EffectEngine.findCharByInstanceId(hideResult.state, pendingEffect.sourceInstanceId)?.character ?? { instanceId: pendingEffect.sourceInstanceId, card: { id: pendingEffect.sourceCardId } as any, isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 0, stack: [], controlledBy: pendingEffect.sourcePlayer, originalOwner: pendingEffect.sourcePlayer, missionIndex: destMIdx018 },
              destMIdx018, 'UPGRADE', false, hideResult, [],
            );
          }
          newState = hideResult.state;
        }
        break;
      }
      case 'SHINO_MOVE_SELF':
      case 'NARUTO_MOVE_SELF':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      // =============================================
      // Two-stage MOVE types (stage 1: pick character, stage 2: pick destination)
      // =============================================
      case 'MOVE_CHARACTER_POWER_4_OR_LESS':
      case 'MOVE_FRIENDLY_SAND_VILLAGE':
      case 'KIDOMARU060_CHOOSE_CHARACTER': {
        // Stage 1: character chosen, now prompt for destination mission
        const moveChar = EffectEngine.findCharByInstanceId(newState, targetId);
        if (moveChar) {
          const validDests_mv: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== moveChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, moveChar.character, i, moveChar.player)) validDests_mv.push(String(i));
          }
          if (validDests_mv.length >= 1) {
            const tst2 = pendingEffect.targetSelectionType === 'MOVE_CHARACTER_POWER_4_OR_LESS'
              ? 'KANKURO078_MOVE_DESTINATION'
              : pendingEffect.targetSelectionType === 'MOVE_FRIENDLY_SAND_VILLAGE'
                ? 'TEMARI080_MOVE_DESTINATION'
                : 'KIDOMARU060_MOVE_DESTINATION';
            const effectId_mv = generateInstanceId();
            const actionId_mv = generateInstanceId();
            newState.pendingEffects.push({
              id: effectId_mv,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: targetId }),
              targetSelectionType: tst2,
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validDests_mv,
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            });
            newState.pendingActions.push({
              id: actionId_mv,
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: 'Choose a mission to move the character to.',
              descriptionKey: 'game.effect.desc.chooseMissionMove',
              options: validDests_mv,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_mv,
            });
          }
        }
        break;
      }
      case 'KANKURO078_MOVE_DESTINATION':
      case 'TEMARI080_MOVE_DESTINATION':
      case 'KIDOMARU060_MOVE_DESTINATION': {
        const destMission_mv2 = parseInt(targetId, 10);
        if (!isNaN(destMission_mv2)) {
          let charInstanceId_mv2 = '';
          try { charInstanceId_mv2 = JSON.parse(pendingEffect.effectDescription).charInstanceId ?? ''; } catch { /* ignore */ }
          if (charInstanceId_mv2) {
            const charRes_mv2 = EffectEngine.findCharByInstanceId(newState, charInstanceId_mv2);
            if (charRes_mv2) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, charInstanceId_mv2, destMission_mv2,
                charRes_mv2.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
              );
            }
          }
        }
        break;
      }

      // =============================================
      // KANKURO078_REVEAL_HIDDEN_REDUCED (Kankuro 078 UPGRADE — correct implementation)
      // Reveal a hidden friendly character paying 1 less than its reveal cost.
      // =============================================
      case 'KANKURO078_REVEAL_HIDDEN_REDUCED': {
        const charResult_k78 = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!charResult_k78) break;

        const { missionIndex: mIdx_k78, player: charPlayer_k78, character: hiddenChar_k78 } = charResult_k78;
        const side_k78 = charPlayer_k78 === 'player1' ? 'player1Characters' : 'player2Characters';
        if (!hiddenChar_k78.isHidden) break; // sanity check

        const topCard_k78 = hiddenChar_k78.stack.length > 0
          ? hiddenChar_k78.stack[hiddenChar_k78.stack.length - 1]
          : hiddenChar_k78.card;

        // Cost = max(0, card.chakra - 1)
        const revealCost_k78 = Math.max(0, (topCard_k78.chakra ?? 0) - 1);
        const ps_k78 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps_k78.chakra < revealCost_k78) break; // can't afford
        ps_k78.chakra -= revealCost_k78;
        newState = { ...newState, [pendingEffect.sourcePlayer]: ps_k78 };

        // Reveal the character
        const missions_k78 = [...newState.activeMissions];
        const m_k78 = { ...missions_k78[mIdx_k78] };
        const chars_k78 = [...m_k78[side_k78]];
        const cidx_k78 = chars_k78.findIndex(c => c.instanceId === targetId);
        if (cidx_k78 !== -1) {
          chars_k78[cidx_k78] = { ...chars_k78[cidx_k78], isHidden: false, wasRevealedAtLeastOnce: true };
          m_k78[side_k78] = chars_k78;
          missions_k78[mIdx_k78] = m_k78;
          newState = { ...newState, activeMissions: missions_k78 };

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            `Kankuro (078) UPGRADE: Revealed ${topCard_k78.name_fr}, paying ${revealCost_k78} chakra.`,
            'game.log.effect.kankuro078RevealHidden',
            { card: 'KANKURO', id: 'KS-078-UC', target: topCard_k78.name_fr, cost: String(revealCost_k78) },
          );

          const revealedChar_k78 = newState.activeMissions[mIdx_k78][side_k78].find(
            c => c.instanceId === targetId,
          );
          if (revealedChar_k78) {
            newState = EffectEngine.resolveRevealEffects(newState, pendingEffect.sourcePlayer, revealedChar_k78, mIdx_k78);
          }
        }
        break;
      }

      // =============================================
      // PLAY_HIDDEN_FROM_HAND_FREE (Kankuro 078 UPGRADE — deprecated, replaced by KANKURO078_REVEAL_HIDDEN_REDUCED)
      // =============================================
      case 'PLAY_HIDDEN_FROM_HAND_FREE': {
        // Stage 1: card chosen from hand. Store index and prompt for mission.
        const validMissions_ph: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          validMissions_ph.push(String(i));
        }
        if (validMissions_ph.length === 1) {
          // Auto-resolve: play hidden on the only mission
          const mIdx_ph = parseInt(validMissions_ph[0], 10);
          const hIdx_ph = parseInt(targetId, 10);
          const ps_ph = { ...newState[pendingEffect.sourcePlayer] };
          if (hIdx_ph >= 0 && hIdx_ph < ps_ph.hand.length) {
            const hand_ph = [...ps_ph.hand];
            const card_ph = hand_ph.splice(hIdx_ph, 1)[0];
            ps_ph.hand = hand_ph;
            ps_ph.charactersInPlay += 1;
            const friendlySide_ph = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
            const newChar_ph: CharacterInPlay = {
              instanceId: generateInstanceId(),
              card: card_ph,
              isHidden: true,
              wasRevealedAtLeastOnce: false,
              powerTokens: 0,
              stack: [card_ph],
              controlledBy: pendingEffect.sourcePlayer,
              originalOwner: pendingEffect.sourcePlayer,
              missionIndex: mIdx_ph,
            };
            const missions_ph = [...newState.activeMissions];
            const m_ph = { ...missions_ph[mIdx_ph] };
            m_ph[friendlySide_ph] = [...m_ph[friendlySide_ph], newChar_ph];
            missions_ph[mIdx_ph] = m_ph;
            newState = { ...newState, activeMissions: missions_ph, [pendingEffect.sourcePlayer]: ps_ph };
          }
        } else if (validMissions_ph.length > 1) {
          const effectId_ph = generateInstanceId();
          const actionId_ph = generateInstanceId();
          newState.pendingEffects.push({
            id: effectId_ph,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ handIndex: targetId }),
            targetSelectionType: 'KANKURO078_CHOOSE_HIDDEN_MISSION',
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: validMissions_ph,
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: false,
          });
          newState.pendingActions.push({
            id: actionId_ph,
            type: 'SELECT_TARGET',
            player: pendingEffect.sourcePlayer,
            description: 'Choose a mission to place the hidden character on.',
            descriptionKey: 'game.effect.desc.chooseMissionPlaceHidden',
            options: validMissions_ph,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effectId_ph,
          });
        }
        break;
      }
      case 'KANKURO078_CHOOSE_HIDDEN_MISSION': {
        const mIdx_kh = parseInt(targetId, 10);
        if (!isNaN(mIdx_kh)) {
          let handIndex_kh = 0;
          try { handIndex_kh = parseInt(JSON.parse(pendingEffect.effectDescription).handIndex ?? '0', 10); } catch { /* ignore */ }
          const ps_kh = { ...newState[pendingEffect.sourcePlayer] };
          if (handIndex_kh >= 0 && handIndex_kh < ps_kh.hand.length) {
            const hand_kh = [...ps_kh.hand];
            const card_kh = hand_kh.splice(handIndex_kh, 1)[0];
            ps_kh.hand = hand_kh;
            ps_kh.charactersInPlay += 1;
            const friendlySide_kh = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
            const newChar_kh: CharacterInPlay = {
              instanceId: generateInstanceId(),
              card: card_kh,
              isHidden: true,
              wasRevealedAtLeastOnce: false,
              powerTokens: 0,
              stack: [card_kh],
              controlledBy: pendingEffect.sourcePlayer,
              originalOwner: pendingEffect.sourcePlayer,
              missionIndex: mIdx_kh,
            };
            const missions_kh = [...newState.activeMissions];
            const m_kh = { ...missions_kh[mIdx_kh] };
            m_kh[friendlySide_kh] = [...m_kh[friendlySide_kh], newChar_kh];
            missions_kh[mIdx_kh] = m_kh;
            newState = { ...newState, activeMissions: missions_kh, [pendingEffect.sourcePlayer]: ps_kh };
          }
        }
        break;
      }

      // =============================================
      // FORCE_REVEAL_OR_DEFEAT (Dosu 069): opponent must reveal (paying cost+2) or defeat
      // Simplified: just defeat the target (the opponent can't choose in current UI)
      // =============================================
      case 'FORCE_REVEAL_OR_DEFEAT': {
        // Dosu 069: Source player selected a hidden enemy character.
        // The OPPONENT must choose: reveal (pay printed cost + 2) or defeat.
        const opponentPlayer_dosu = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const charResult_dosu = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!charResult_dosu) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          break;
        }
        const topCard_dosu = charResult_dosu.character.stack.length > 0
          ? charResult_dosu.character.stack[charResult_dosu.character.stack.length - 1]
          : charResult_dosu.character.card;
        const revealCost_dosu = (topCard_dosu.chakra ?? 0) + 2;
        const canAfford_dosu = newState[opponentPlayer_dosu].chakra >= revealCost_dosu;

        if (!canAfford_dosu) {
          // Opponent can't afford to reveal — auto-defeat
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DEFEAT', `Dosu Kinuta (069): Opponent cannot afford to reveal (cost ${revealCost_dosu}), character defeated.`,
            'game.log.effect.dosu069AutoDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', cost: String(revealCost_dosu) });
          break;
        }

        // Create pending for opponent to choose: click character to reveal+pay, or skip to defeat
        const effectId_dosu = generateInstanceId();
        const actionId_dosu = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId_dosu,
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: charResult_dosu.missionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ targetInstanceId: targetId, revealCost: revealCost_dosu, sourcePlayer: pendingEffect.sourcePlayer }),
          targetSelectionType: 'DOSU069_OPPONENT_CHOICE',
          sourcePlayer: pendingEffect.sourcePlayer,
          requiresTargetSelection: true,
          validTargets: [targetId],
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: false,
          selectingPlayer: opponentPlayer_dosu,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId_dosu,
          type: 'SELECT_TARGET' as PendingAction['type'],
          player: opponentPlayer_dosu,
          originPlayer: pendingEffect.sourcePlayer, // Dosu's player initiated this forced choice
          description: `Dosu Kinuta (069): Your hidden character was targeted. Click to reveal (pay ${revealCost_dosu} chakra) or skip to let it be defeated.`,
          descriptionKey: 'game.effect.desc.dosu069OpponentChoice',
          descriptionParams: { cost: String(revealCost_dosu) },
          options: [targetId],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId_dosu,
        }];
        // Track that the opponent is the forced resolver — they get the turn after resolution
        newState.pendingForcedResolver = opponentPlayer_dosu;
        break;
      }

      case 'DOSU069_OPPONENT_CHOICE': {
        // Opponent clicked the character = reveal and pay (triggers MAIN + AMBUSH effects)
        let parsed_dosu69: { targetInstanceId?: string; revealCost?: number; sourcePlayer?: string } = {};
        try { parsed_dosu69 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const targetInst_dosu69 = parsed_dosu69.targetInstanceId ?? targetId;
        const revCost_dosu69 = parsed_dosu69.revealCost ?? 0;
        const opponent_dosu69 = pendingEffect.selectingPlayer ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1');

        // Pay reveal cost
        const ps_dosu69 = { ...newState[opponent_dosu69] };
        ps_dosu69.chakra -= revCost_dosu69;
        newState = { ...newState, [opponent_dosu69]: ps_dosu69 };

        // Find the character and its mission
        const charResult_dosu69 = EffectEngine.findCharByInstanceId(newState, targetInst_dosu69);
        if (!charResult_dosu69) break;
        const mIdx_dosu69 = charResult_dosu69.missionIndex;
        const side_dosu69: 'player1Characters' | 'player2Characters' =
          opponent_dosu69 === 'player1' ? 'player1Characters' : 'player2Characters';
        const charTopCard_dosu69 = charResult_dosu69.character.stack.length > 0
          ? charResult_dosu69.character.stack[charResult_dosu69.character.stack.length - 1]
          : charResult_dosu69.character.card;

        // Check for upgrade target at same mission (same name, non-hidden, lower cost)
        const friendlyChars_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69];
        const upgradeTarget_dosu69 = friendlyChars_dosu69.find((c) => {
          if (c.instanceId === targetInst_dosu69 || c.isHidden) return false;
          const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          if ((charTopCard_dosu69.chakra ?? 0) <= (cTop.chakra ?? 0)) return false;
          return cTop.name_fr.toUpperCase() === charTopCard_dosu69.name_fr.toUpperCase();
        });

        if (upgradeTarget_dosu69) {
          // Reveal-for-upgrade: merge stacks
          const missions_dosu69 = [...newState.activeMissions];
          const m_dosu69 = { ...missions_dosu69[mIdx_dosu69] };
          const chars_dosu69 = [...m_dosu69[side_dosu69]];
          const hiddenChar_dosu69 = chars_dosu69.find(c => c.instanceId === targetInst_dosu69);
          const upgradeIdx_dosu69 = chars_dosu69.findIndex(c => c.instanceId === upgradeTarget_dosu69.instanceId);

          if (hiddenChar_dosu69 && upgradeIdx_dosu69 !== -1) {
            const upgraded = { ...chars_dosu69[upgradeIdx_dosu69] };
            upgraded.stack = [...upgraded.stack, ...hiddenChar_dosu69.stack];
            upgraded.card = charTopCard_dosu69;
            upgraded.powerTokens += hiddenChar_dosu69.powerTokens;
            upgraded.isHidden = false;
            upgraded.wasRevealedAtLeastOnce = true;

            const updatedChars = chars_dosu69.filter(c => c.instanceId !== targetInst_dosu69);
            const mergedIdx = updatedChars.findIndex(c => c.instanceId === upgradeTarget_dosu69.instanceId);
            if (mergedIdx !== -1) updatedChars[mergedIdx] = upgraded;

            m_dosu69[side_dosu69] = updatedChars;
            missions_dosu69[mIdx_dosu69] = m_dosu69;
            newState = { ...newState, activeMissions: missions_dosu69 };

            newState.log = logAction(newState.log, newState.turn, newState.phase, opponent_dosu69,
              'REVEAL_UPGRADE',
              `Dosu Kinuta (069): ${charTopCard_dosu69.name_fr} revealed as upgrade, paying ${revCost_dosu69} chakra.`,
              'game.log.effect.dosu069RevealUpgrade',
              { card: 'DOSU KINUTA', id: 'KS-069-UC', target: charTopCard_dosu69.name_fr, cost: String(revCost_dosu69) });

            // Trigger MAIN + UPGRADE + AMBUSH effects
            const upgradedChar_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69].find(
              c => c.instanceId === upgradeTarget_dosu69.instanceId
            );
            if (upgradedChar_dosu69) {
              newState = EffectEngine.resolveRevealUpgradeEffects(newState, opponent_dosu69, upgradedChar_dosu69, mIdx_dosu69);
            }
          }
        } else {
          // Normal reveal (no upgrade) — reveal and trigger MAIN + AMBUSH
          const missions_dosu69 = [...newState.activeMissions];
          const m_dosu69 = { ...missions_dosu69[mIdx_dosu69] };
          const chars_dosu69 = [...m_dosu69[side_dosu69]];
          const cidx_dosu69 = chars_dosu69.findIndex(c => c.instanceId === targetInst_dosu69);

          if (cidx_dosu69 !== -1) {
            chars_dosu69[cidx_dosu69] = { ...chars_dosu69[cidx_dosu69], isHidden: false, wasRevealedAtLeastOnce: true };
            m_dosu69[side_dosu69] = chars_dosu69;
            missions_dosu69[mIdx_dosu69] = m_dosu69;
            newState = { ...newState, activeMissions: missions_dosu69 };

            newState.log = logAction(newState.log, newState.turn, newState.phase, opponent_dosu69,
              'EFFECT', `Dosu Kinuta (069): ${chars_dosu69[cidx_dosu69].card.name_fr} was revealed, paying ${revCost_dosu69} chakra.`,
              'game.log.effect.dosu069Reveal', { card: 'DOSU KINUTA', id: 'KS-069-UC', target: chars_dosu69[cidx_dosu69].card.name_fr, cost: String(revCost_dosu69) });

            // Trigger MAIN + AMBUSH effects of the revealed character
            const revealedChar_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69].find(
              c => c.instanceId === targetInst_dosu69
            );
            if (revealedChar_dosu69) {
              newState = EffectEngine.resolveRevealEffects(newState, opponent_dosu69, revealedChar_dosu69, mIdx_dosu69);
            }
          }
        }
        break;
      }

      // =============================================
      // KAKASHI 106: Devolve an upgraded enemy character (remove top card from stack)
      // =============================================
      case 'KAKASHI106_DEVOLVE_TARGET': {
        newState = EffectEngine.devolveUpgradedCharacter(newState, pendingEffect, targetId);
        break;
      }

      // =============================================
      // KAKASHI_COPY_EFFECT / SAKON062_COPY_EFFECT: copy another character's effect
      // Kakashi 016: copies MAIN/AMBUSH (non-UPGRADE) instant effects from enemy
      // Sakon 062: copies MAIN/AMBUSH (non-UPGRADE) instant effects from friendly Sound Four
      // If the target has multiple copyable effects, the player chooses (Stage 2).
      // =============================================
      case 'KAKASHI_COPY_EFFECT':
      case 'SAKON062_COPY_EFFECT': {
        const copyTargetResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!copyTargetResult) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', `Effect copy: target character no longer in play.`,
            'game.log.effect.copyFailed', { card: pendingEffect.sourceCardId });
          break;
        }

        const copyTargetTopCard = copyTargetResult.character.stack.length > 0
          ? copyTargetResult.character.stack[copyTargetResult.character.stack.length - 1]
          : copyTargetResult.character.card;

        // Kakashi 016 / Sakon 062: non-UPGRADE, non-SCORE, non-continuous
        const copyableEffects = (copyTargetTopCard.effects ?? []).filter((eff) => {
          if (eff.type === 'UPGRADE' || eff.type === 'SCORE') return false;
          if (eff.description.includes('[⧗]')) return false;
          if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
          return true;
        });

        if (copyableEffects.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', `Effect copy: ${copyTargetTopCard.name_fr} has no copyable instant effect.`,
            'game.log.effect.copyFailed', { card: pendingEffect.sourceCardId });
          break;
        }

        if (copyableEffects.length === 1) {
          // Single copyable effect — execute directly
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, copyTargetTopCard, copyableEffects[0].type as EffectType,
          );
        } else {
          // Multiple copyable effects — Stage 2: let the player choose
          const choiceEffId = generateInstanceId();
          const choiceActId = generateInstanceId();
          const effectOpts = copyableEffects.map((eff) => `${eff.type}::${eff.description}`);
          newState.pendingEffects.push({
            id: choiceEffId,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ charInstanceId: targetId, cardId: copyTargetTopCard.id }),
            targetSelectionType: 'COPY_EFFECT_CHOSEN',
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: effectOpts,
            isOptional: false,
            isMandatory: true,
            resolved: false,
            isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: choiceActId,
            type: 'CHOOSE_EFFECT',
            player: pendingEffect.sourcePlayer,
            description: `Choose which effect of ${copyTargetTopCard.name_fr} to copy.`,
            descriptionKey: 'game.effect.desc.chooseEffectToCopy',
            descriptionParams: { target: copyTargetTopCard.name_fr },
            options: effectOpts,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: choiceEffId,
          });
        }
        break;
      }

      // =============================================
      // COPY_EFFECT_CHOSEN: Stage 2 — the player chose which specific effect to copy
      // Used by Kakashi 016, Kakashi 148, and Sakon 062 when multiple effects exist.
      // targetId format: "EFFECT_TYPE::description"
      // effectDescription stores JSON: { charInstanceId, cardId }
      // =============================================
      case 'COPY_EFFECT_CHOSEN': {
        let parsedCopy: { charInstanceId?: string; cardId?: string } = {};
        try { parsedCopy = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const chosenEffectType = targetId.split('::')[0] as EffectType;

        if (!parsedCopy.cardId || !chosenEffectType) break;

        // Find the target character to get the card info for logging
        const chosenTarget = parsedCopy.charInstanceId
          ? EffectEngine.findCharByInstanceId(newState, parsedCopy.charInstanceId)
          : null;
        const chosenTopCard = chosenTarget
          ? (chosenTarget.character.stack.length > 0
              ? chosenTarget.character.stack[chosenTarget.character.stack.length - 1]
              : chosenTarget.character.card)
          : null;

        newState = EffectEngine.executeCopiedEffect(
          newState, pendingEffect, chosenTopCard ?? { id: parsedCopy.cardId, name_fr: '?', effects: [] } as never,
          chosenEffectType,
        );
        break;
      }

      // --- Kabuto 053: Choose mission to play from discard ---
      case 'KABUTO053_CHOOSE_MISSION': {
        let parsed_kb3: { discardIndex?: number; reducedCost?: number } = {};
        try { parsed_kb3 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const missionIdx_kb3 = parseInt(targetId, 10);
        const cost_kb3 = parsed_kb3.reducedCost ?? 0;
        const discardIdx_kb3 = parsed_kb3.discardIndex;
        newState = EffectEngine.kabuto053PlayFromDiscard(newState, pendingEffect.sourcePlayer, missionIdx_kb3, cost_kb3, discardIdx_kb3);
        break;
      }

      // --- Kabuto 053 UPGRADE: Choose card from hand to discard ---
      case 'KABUTO053_CHOOSE_DISCARD': {
        const idx_kb53 = parseInt(targetId, 10);
        const ps_kb53 = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_kb53 >= 0 && idx_kb53 < ps_kb53.hand.length) {
          const hand_kb53 = [...ps_kb53.hand];
          const discarded_kb53 = hand_kb53.splice(idx_kb53, 1)[0];
          ps_kb53.hand = hand_kb53;
          ps_kb53.discardPile = [...ps_kb53.discardPile, discarded_kb53];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_kb53 };
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD',
            `Kabuto Yakushi (053) UPGRADE: Discarded ${discarded_kb53.name_fr}.`,
            'game.log.effect.discard',
            { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: discarded_kb53.name_fr },
          );
        }
        break;
      }

      // --- Hiruzen 002: Choose Leaf character from hand ---
      case 'HIRUZEN002_CHOOSE_CARD': {
        const player = pendingEffect.sourcePlayer;
        const cardIndex = parseInt(targetId, 10);
        const ps = newState[player];
        if (cardIndex < 0 || cardIndex >= ps.hand.length) break;

        const card = ps.hand[cardIndex];

        // Find valid missions for this card (fresh play OR upgrade over same-name with lower cost).
        // Filter by affordability: upgrade missions cost (diff - 1), fresh play costs (card.chakra - 1).
        const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
        const validMissions: string[] = [];
        let minCost = Math.max(0, card.chakra - 1); // fresh play baseline
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          const mission = newState.activeMissions[mIdx];
          const sameNameChar = mission[friendlySide].find((c: CharacterInPlay) => {
            if (c.isHidden) return false;
            const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
          });
          if (!sameNameChar) {
            // Fresh play — cost is card.chakra - 1
            const freshCost = Math.max(0, card.chakra - 1);
            if (ps.chakra >= freshCost) {
              validMissions.push(String(mIdx));
              minCost = Math.min(minCost, freshCost);
            }
          } else {
            const existingTop = sameNameChar.stack.length > 0 ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
            if ((card.chakra ?? 0) > (existingTop.chakra ?? 0)) {
              // Upgrade — cost is (diff - 1)
              const upgradeCost = Math.max(0, (card.chakra - existingTop.chakra) - 1);
              if (ps.chakra >= upgradeCost) {
                validMissions.push(String(mIdx));
                minCost = Math.min(minCost, upgradeCost);
              }
            }
          }
        }
        const reducedCost = minCost; // used in description below

        if (validMissions.length === 0) break;

        // Auto-resolve if only one valid mission
        if (validMissions.length === 1) {
          newState = EffectEngine.hiruzen002PlaceCard(newState, pendingEffect, cardIndex, parseInt(validMissions[0], 10));
          break;
        }

        // Multiple valid missions — create second pending for mission selection
        // Store the chosen card index in the effect description as JSON
        const isUpgrade = pendingEffect.isUpgrade;
        const effectId2 = generateInstanceId();
        const actionId2 = generateInstanceId();
        const pe2: PendingEffect = {
          id: effectId2,
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ cardIndex, isUpgrade }),
          targetSelectionType: 'HIRUZEN002_CHOOSE_MISSION',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: validMissions,
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: isUpgrade,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        };
        const pa2: PendingAction = {
          id: actionId2,
          type: 'SELECT_TARGET',
          player,
          description: `Hiruzen Sarutobi (002): Choose a mission to play ${card.name_fr} on (cost ${reducedCost}).`,
          descriptionKey: 'game.effect.desc.hiruzen002PlayOnMission',
          descriptionParams: { card: card.name_fr, cost: reducedCost },
          options: validMissions,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId2,
        };
        newState.pendingEffects = [...newState.pendingEffects, pe2];
        newState.pendingActions = [...newState.pendingActions, pa2];
        break;
      }

      // --- Hiruzen 002: Choose mission to place the card ---
      case 'HIRUZEN002_CHOOSE_MISSION': {
        let parsed: { cardIndex: number; isUpgrade?: boolean } = { cardIndex: -1 };
        try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const missionIdx = parseInt(targetId, 10);
        newState = EffectEngine.hiruzen002PlaceCard(newState, pendingEffect, parsed.cardIndex, missionIdx);
        break;
      }

      case 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT': {
        // Jiraiya 132 UPGRADE: opponent chooses which of their characters to defeat
        // until <= 2 per mission. Chain more selections if needed.
        let jirDesc: { missionIndex?: number; sourcePlayer?: string } = {};
        try { jirDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const missionIdx_j = jirDesc.missionIndex ?? 0;
        const jirSourcePlayer = (jirDesc.sourcePlayer ?? pendingEffect.sourcePlayer) as PlayerID;

        // Defeat the opponent's selected character
        newState = EffectEngine.defeatCharacter(newState, targetId, jirSourcePlayer);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, jirSourcePlayer,
          'EFFECT_DEFEAT',
          `Jiraya (132) UPGRADE: Opponent's character defeated in mission ${missionIdx_j + 1}.`,
          'game.log.effect.defeat',
          { card: 'JIRAYA', id: 'KS-132-S', target: targetId },
        );

        // Check if any mission still has > 2 enemy characters
        const enemySide_j: 'player1Characters' | 'player2Characters' =
          jirSourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const opponent_j = jirSourcePlayer === 'player1' ? 'player2' : 'player1';

        for (let mi_j = 0; mi_j < newState.activeMissions.length; mi_j++) {
          const mission_j = newState.activeMissions[mi_j];
          const enemyChars_j = mission_j[enemySide_j];

          if (enemyChars_j.length > 2) {
            // Chain another selection for the opponent
            const chainData_j = JSON.stringify({
              missionIndex: mi_j,
              sourcePlayer: jirSourcePlayer,
              text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${mi_j + 1} (${enemyChars_j.length} > 2).`,
            });
            const effectId_j = generateInstanceId();
            const actionId_j = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: effectId_j,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: chainData_j,
              targetSelectionType: 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT',
              sourcePlayer: jirSourcePlayer,
              requiresTargetSelection: true,
              validTargets: enemyChars_j.map((c: CharacterInPlay) => c.instanceId),
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: actionId_j,
              type: 'SELECT_TARGET' as PendingAction['type'],
              player: opponent_j,
              description: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${mi_j + 1} (${enemyChars_j.length} > 2).`,
              descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
              descriptionParams: { mission: String(mi_j + 1), count: String(enemyChars_j.length) },
              options: enemyChars_j.map((c: CharacterInPlay) => c.instanceId),
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_j,
            }];
            break;
          }
        }
        break;
      }

      case 'GAARA120_CHOOSE_DEFEAT': {
        // Gaara 120 MAIN: defeat selected enemy in this mission, then continue to remaining missions
        let gaaraDesc: { defeatedCount?: number; nextMissionIndex?: number; isUpgrade?: boolean; sourceInstanceId?: string; sourceMissionIndex?: number; missionIndex?: number } = {};
        try { gaaraDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const missionIdx_g = gaaraDesc.missionIndex ?? 0;
        let defeatedCount_g = gaaraDesc.defeatedCount ?? 0;

        // Defeat selected target
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        defeatedCount_g++;
        let defeatName_g = '';
        for (const m of newState.activeMissions) {
          for (const c of [...m.player1Characters, ...m.player2Characters]) {
            if (c.instanceId === targetId) {
              const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              defeatName_g = tc.name_fr;
            }
          }
        }
        // If not found in play anymore, it was defeated
        if (!defeatName_g) defeatName_g = 'enemy';
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (120): Defeated enemy ${defeatName_g} in mission ${missionIdx_g + 1}.`,
          'game.log.effect.defeat',
          { card: 'GAARA', id: 'KS-120-R', target: defeatName_g },
        );

        // Continue checking remaining missions
        const startMission_g = gaaraDesc.nextMissionIndex ?? (missionIdx_g + 1);
        const enemySide_g: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

        let chainedToNext = false;
        for (let mi = startMission_g; mi < newState.activeMissions.length; mi++) {
          const mission_g = newState.activeMissions[mi];
          const validTargets_g = mission_g[enemySide_g].filter((c: CharacterInPlay) => {
            if (c.isHidden) return true; // hidden = power 0
            const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            return (topCard.power + c.powerTokens) <= 1;
          });

          if (validTargets_g.length === 0) continue;

          // Always prompt for remaining missions too — player can skip (optional "up to 1")
          const chainData_g = JSON.stringify({
            defeatedCount: defeatedCount_g,
            nextMissionIndex: mi + 1,
            isUpgrade: gaaraDesc.isUpgrade,
            sourceInstanceId: gaaraDesc.sourceInstanceId,
            sourceMissionIndex: gaaraDesc.sourceMissionIndex,
            missionIndex: mi,
          });
          const effectId_g = generateInstanceId();
          const actionId_g = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: effectId_g,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: chainData_g,
            targetSelectionType: 'GAARA120_CHOOSE_DEFEAT',
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: validTargets_g.map((c: CharacterInPlay) => c.instanceId),
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: pendingEffect.isUpgrade,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: actionId_g,
            type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: `Gaara (120): Choose an enemy character with Power 1 or less to defeat in mission ${mi + 1}.`,
            descriptionKey: 'game.effect.desc.gaara120ChooseDefeat',
            descriptionParams: { mission: String(mi + 1) },
            options: validTargets_g.map((c: CharacterInPlay) => c.instanceId),
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effectId_g,
          }];
          chainedToNext = true;
          break;
        }

        // If no more chained selections, apply UPGRADE powerup
        if (!chainedToNext && gaaraDesc.isUpgrade && defeatedCount_g > 0 && gaaraDesc.sourceInstanceId && gaaraDesc.sourceMissionIndex != null) {
          const friendlySide_g: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const upgMission = { ...newState.activeMissions[gaaraDesc.sourceMissionIndex] };
          const upgChars = [...upgMission[friendlySide_g]];
          const selfIdx_g = upgChars.findIndex((c: CharacterInPlay) => c.instanceId === gaaraDesc.sourceInstanceId);
          if (selfIdx_g !== -1) {
            upgChars[selfIdx_g] = { ...upgChars[selfIdx_g], powerTokens: upgChars[selfIdx_g].powerTokens + defeatedCount_g };
            upgMission[friendlySide_g] = upgChars;
            const missions_g = [...newState.activeMissions];
            missions_g[gaaraDesc.sourceMissionIndex] = upgMission;
            newState = { ...newState, activeMissions: missions_g };
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_POWERUP',
              `Gaara (120): POWERUP ${defeatedCount_g} (upgrade).`,
              'game.log.effect.powerupSelf',
              { card: 'GAARA', id: 'KS-120-R', amount: defeatedCount_g },
            );
          }
        }
        break;
      }

      // Tsunade 104 (R): Player chose how much extra chakra to spend for POWERUP
      case 'TSUNADE104_CHOOSE_CHAKRA': {
        const chakraAmount = parseInt(targetId, 10);
        if (!isNaN(chakraAmount) && chakraAmount > 0) {
          // Deduct chakra
          const ps104 = { ...newState[pendingEffect.sourcePlayer] };
          ps104.chakra -= chakraAmount;
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps104 };

          // POWERUP on self
          const charResult104 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          if (charResult104) {
            const missions104 = [...newState.activeMissions];
            const mission104 = { ...missions104[charResult104.missionIndex] };
            const side104: 'player1Characters' | 'player2Characters' =
              charResult104.player === 'player1' ? 'player1Characters' : 'player2Characters';
            mission104[side104] = mission104[side104].map((c: CharacterInPlay) =>
              c.instanceId === pendingEffect.sourceInstanceId
                ? { ...c, powerTokens: c.powerTokens + chakraAmount }
                : c,
            );
            missions104[charResult104.missionIndex] = mission104;
            newState.activeMissions = missions104;
          }

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_POWERUP',
            `Tsunade (104): Spent ${chakraAmount} extra chakra for POWERUP ${chakraAmount}.`,
            'game.log.effect.powerupSelf',
            { card: 'TSUNADE', id: 'KS-104-R', amount: chakraAmount },
          );
        } else {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            'Tsunade (104): Chose not to spend extra chakra.',
            'game.log.effect.tsunade104Decline',
            { card: 'TSUNADE', id: 'KS-104-R' },
          );
        }
        break;
      }

      default:
        // Unknown target selection type — log warning
        console.warn(`[EffectEngine] Unknown targetSelectionType: ${pendingEffect.targetSelectionType}`);
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

    // Enforce same-name-per-mission rule
    if (!EffectEngine.validateNameUniquenessForMove(state, charResult.character, destMissionIndex, charResult.player)) {
      const loggedState = deepClone(state);
      loggedState.log = logAction(
        loggedState.log, loggedState.turn, loggedState.phase, charResult.player,
        'EFFECT_BLOCKED',
        `Cannot move ${charResult.character.card.name_fr} to mission ${destMissionIndex + 1} — a character with the same name already exists there.`,
        'game.log.effect.moveBlocked',
        { target: charResult.character.card.name_fr },
      );
      return loggedState;
    }

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
            { card: 'Chiens Ninjas', id: 'KS-100-C', target: hiddenInDest.card.name_fr },
          );
        }
      }
    }

    return newState;
  }

  /**
   * Kakashi 106 (R): De-evolve an upgraded enemy character.
   * Remove the top card from their stack, discard it.
   * If upgrade mode, also copy the discarded card's MAIN effects.
   */
  static devolveUpgradedCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const { character, missionIndex, player } = charResult;
    if (character.stack.length <= 1) {
      // Not upgraded, nothing to devolve
      return state;
    }

    const newState = deepClone(state);
    const isP1 = player === 'player1';
    const sideKey: 'player1Characters' | 'player2Characters' = isP1 ? 'player1Characters' : 'player2Characters';
    const mission = newState.activeMissions[missionIndex];
    const charIdx = mission[sideKey].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (charIdx === -1) return state;

    const targetChar = mission[sideKey][charIdx];

    // Remove the top card from the stack
    const newStack = [...targetChar.stack];
    const discardedCard = newStack.pop()!;
    const newTopCard = newStack[newStack.length - 1];

    // Update character: new top card is now active
    mission[sideKey][charIdx] = {
      ...targetChar,
      stack: newStack,
      card: newTopCard,
    };

    // Add discarded card to enemy's discard pile
    const enemyPS = { ...newState[player] };
    enemyPS.discardPile = [...enemyPS.discardPile, discardedCard];
    newState[player] = enemyPS;

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, pending.sourcePlayer,
      'EFFECT_DEVOLVE',
      `Kakashi Hatake (106): Removed ${discardedCard.name_fr} from enemy ${newTopCard.name_fr}'s stack (de-evolved).`,
      'game.log.effect.devolve',
      { card: 'KAKASHI HATAKE', id: 'KS-106-R', target: discardedCard.name_fr },
    );

    // UPGRADE: copy the discarded card's non-Upgrade MAIN effect
    if (pending.isUpgrade) {
      const mainEffects = (discardedCard.effects ?? []).filter(
        (e) => e.type === 'MAIN',
      );
      if (mainEffects.length > 0) {
        // Try to execute the discarded card's MAIN handler as if Kakashi played it
        const handler = getEffectHandler(discardedCard.id, 'MAIN');
        if (handler) {
          try {
            // Find Kakashi's character for context
            const kakashiResult = EffectEngine.findCharByInstanceId(newState, pending.sourceInstanceId);
            if (kakashiResult) {
              const ctx: EffectContext = {
                state: newState,
                sourcePlayer: pending.sourcePlayer,
                sourceCard: kakashiResult.character,
                sourceMissionIndex: kakashiResult.missionIndex,
                triggerType: 'MAIN',
                isUpgrade: false,
              };
              const copyResult = handler(ctx);
              if (copyResult.requiresTargetSelection && copyResult.validTargets && copyResult.validTargets.length > 0) {
                // Chain the target selection for the copied effect.
                // Override selectingPlayer: when Kakashi copies an effect, Kakashi's player
                // makes all target choices (even if the original card gives the opponent a choice).
                const adjustedCopyResult = { ...copyResult, selectingPlayer: undefined };
                return EffectEngine.createPendingTargetSelection(
                  copyResult.state, pending.sourcePlayer, kakashiResult.character,
                  kakashiResult.missionIndex, 'MAIN', false, adjustedCopyResult, [],
                );
              }
              return copyResult.state;
            }
          } catch (err) {
            console.error(`[EffectEngine] Kakashi 106 copy error for ${discardedCard.id}:`, err);
          }
        }
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pending.sourcePlayer,
          'EFFECT_COPY',
          `Kakashi Hatake (106) UPGRADE: Copied MAIN effect of ${discardedCard.name_fr}.`,
          'game.log.effect.copy',
          { card: 'KAKASHI HATAKE', id: 'KS-106-R', target: discardedCard.name_fr },
        );
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

  /** Orochimaru AMBUSH: look at hidden enemy, if cost <= 3 steal control.
   * Stage 1: Look at the card and create a reveal pending action so the player sees it.
   * Stage 2 (OROCHIMARU_REVEAL_RESULT): Execute the steal if applicable.
   */
  static orochimaruLookAndSteal(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || !charResult.character.isHidden) return state;

    const newState = deepClone(state);
    const mission = newState.activeMissions[charResult.missionIndex];
    const enemyKey = charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';

    const targetCharIdx = mission[enemyKey].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (targetCharIdx === -1) return state;

    const targetChar = mission[enemyKey][targetCharIdx];
    const actualCost = targetChar.card.chakra;
    const canSteal = actualCost <= 3;

    // Log the look
    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Orochimaru looks at hidden enemy: ${targetChar.card.name_fr} (cost ${actualCost}).`,
      'game.log.effect.lookAtHidden',
      { card: 'Orochimaru', id: pending.sourceCardId, target: targetChar.card.name_fr },
    );

    // Create a reveal pending action so the player sees the card before the steal
    const revealEffectId = generateInstanceId();
    const revealActionId = generateInstanceId();
    const revealData = JSON.stringify({
      targetInstanceId: targetId,
      cardName: targetChar.card.name_fr,
      cardCost: actualCost,
      cardPower: targetChar.card.power,
      cardImageFile: targetChar.card.image_file,
      canSteal,
      missionIndex: charResult.missionIndex,
    });

    newState.pendingEffects.push({
      id: revealEffectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: 'MAIN' as const,
      effectDescription: revealData,
      targetSelectionType: 'OROCHIMARU_REVEAL_RESULT',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: ['confirm'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    });
    newState.pendingActions.push({
      id: revealActionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: canSteal
        ? `Orochimaru revealed: ${targetChar.card.name_fr} (Cost ${actualCost}). Taking control!`
        : `Orochimaru revealed: ${targetChar.card.name_fr} (Cost ${actualCost}). Too expensive to steal.`,
      options: ['confirm'],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: revealEffectId,
    });

    return newState;
  }

  /** Orochimaru AMBUSH stage 2: Execute the steal after player has seen the revealed card. */
  static orochimaruExecuteSteal(state: GameState, pending: PendingEffect): GameState {
    let parsed: { targetInstanceId: string; canSteal: boolean; cardName: string; missionIndex: number };
    try { parsed = JSON.parse(pending.effectDescription); } catch { return state; }

    if (!parsed.canSteal) {
      // Cost > 3, cannot steal — just log
      return {
        ...state,
        log: logAction(
          state.log, state.turn, 'action', pending.sourcePlayer,
          'EFFECT', `${parsed.cardName} costs too much — Orochimaru cannot take control.`,
          'game.log.effect.orochimaruCannotSteal',
          { card: 'Orochimaru', id: pending.sourceCardId, target: parsed.cardName },
        ),
      };
    }

    // Execute the steal
    const newState = deepClone(state);
    const charResult = EffectEngine.findCharByInstanceId(newState, parsed.targetInstanceId);
    if (!charResult) return state;

    const mission = newState.activeMissions[charResult.missionIndex];
    const enemyKey = charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyKey = pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const targetCharIdx = mission[enemyKey].findIndex((c: CharacterInPlay) => c.instanceId === parsed.targetInstanceId);
    if (targetCharIdx === -1) return state;

    const targetChar = mission[enemyKey][targetCharIdx];
    mission[enemyKey].splice(targetCharIdx, 1);
    targetChar.controlledBy = pending.sourcePlayer;
    mission[friendlyKey].push(targetChar);

    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Orochimaru steals ${parsed.cardName}!`,
      'game.log.effect.takeControl',
      { card: 'Orochimaru', id: pending.sourceCardId, target: parsed.cardName },
    );

    return newState;
  }

  /**
   * Dosu LOOK_AT_HIDDEN_CHARACTER: After selecting the hidden target,
   * look at it and create an INFO_REVEAL pending to show the card info.
   */
  static dosuLookAtHidden(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || !charResult.character.isHidden) {
      return {
        ...state,
        log: logAction(state.log, state.turn, 'action', pending.sourcePlayer,
          'EFFECT_NO_TARGET', 'Dosu Kinuta: Target is no longer hidden.',
          'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: pending.sourceCardId }),
      };
    }

    const targetChar = charResult.character;
    const newState = deepClone(state);

    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Dosu Kinuta: Looked at hidden character ${targetChar.card.name_fr}.`,
      'game.log.effect.lookAtHidden',
      { card: 'DOSU KINUTA', id: pending.sourceCardId, target: targetChar.card.name_fr },
    );

    // Create a secondary INFO_REVEAL pending to show the card
    const revealEffectId = generateInstanceId();
    const revealActionId = generateInstanceId();
    const revealData = JSON.stringify({
      cardName: targetChar.card.name_fr,
      cardCost: targetChar.card.chakra,
      cardPower: targetChar.card.power,
      cardImageFile: targetChar.card.image_file,
    });

    newState.pendingEffects.push({
      id: revealEffectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: 'MAIN' as const,
      effectDescription: revealData,
      targetSelectionType: 'DOSU_LOOK_REVEAL',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: ['confirm'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    });
    newState.pendingActions.push({
      id: revealActionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: `Dosu Kinuta: Revealed ${targetChar.card.name_fr} (Cost ${targetChar.card.chakra}, Power ${targetChar.card.power}).`,
      descriptionKey: 'game.effect.desc.dosuLookReveal',
      descriptionParams: { target: targetChar.card.name_fr, cost: String(targetChar.card.chakra), power: String(targetChar.card.power) },
      options: ['confirm'],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: revealEffectId,
    });

    return newState;
  }

  /**
   * Itachi 091 "Mangekyo Sharingan": Resolve the hand reveal.
   * After the player acknowledges the revealed card:
   * - If isUpgrade: discard the revealed card from opponent's hand, opponent draws 1 card.
   * - If not upgrade: nothing more to do.
   */
  static itachi091ResolveReveal(state: GameState, pending: PendingEffect): GameState {
    let parsed: { cardName: string; isUpgrade: boolean; chosenIndex: number; randomIndex?: number };
    try { parsed = JSON.parse(pending.effectDescription); } catch { return state; }

    if (!parsed.isUpgrade) {
      // Base MAIN: just the reveal, nothing more
      return state;
    }

    // UPGRADE: discard the revealed card from opponent's hand, opponent draws 1 card
    const newState = deepClone(state);
    const opponentPlayer = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';
    const ps = newState[opponentPlayer];

    const cardIndex = parsed.chosenIndex ?? parsed.randomIndex ?? -1;
    if (cardIndex >= 0 && cardIndex < ps.hand.length) {
      const hand = [...ps.hand];
      const discardedCard = hand.splice(cardIndex, 1)[0];
      ps.hand = hand;
      ps.discardPile = [...ps.discardPile, discardedCard];

      newState.log = logAction(
        newState.log, newState.turn, 'action', pending.sourcePlayer,
        'EFFECT_DISCARD_FROM_HAND',
        `Itachi (091) UPGRADE: Discarded ${discardedCard.name_fr} from opponent's hand.`,
        'game.log.effect.itachi091Discard',
        { card: 'ITACHI UCHIWA', id: 'KS-091-UC', target: discardedCard.name_fr },
      );

      // Opponent draws 1 card
      if (ps.deck.length > 0) {
        const drawn = ps.deck.shift()!;
        ps.hand = [...ps.hand, drawn];
        newState.log = logAction(
          newState.log, newState.turn, 'action', opponentPlayer,
          'DRAW',
          `${opponentPlayer} draws 1 card (Itachi 091 upgrade replacement).`,
          'game.log.effect.itachi091Draw',
          { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
        );
      }
    }

    return newState;
  }

  // sasuke014ResolveReveal removed — AMBUSH now just shows hand, UPGRADE is separate handler

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
    const isEnemyEffect = effectSource !== charResult.player;

    // Check for defeat replacement (Hayate, Gaara 075, Gemma)
    const replacement = EffectEngine.checkDefeatReplacement(
      state, charResult.character, charResult.player, charResult.missionIndex, isEnemyEffect,
    );
    if (replacement.replaced) {
      if (replacement.replacement === 'immune') {
        // Character is immune to defeat — do nothing
        return state;
      }
      if (replacement.replacement === 'hide') {
        return EffectEngine.hideCharacter(state, targetId);
      }
      if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
        // Gemma 049: optional sacrifice — create pending choice for the owning player
        let newState = { ...state };
        const effectId = generateInstanceId();
        const actionId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: 'KS-049-C',
          sourceInstanceId: replacement.sacrificeInstanceId,
          sourceMissionIndex: charResult.missionIndex,
          effectType: 'MAIN' as const,
          effectDescription: JSON.stringify({
            targetInstanceId: targetId,
            sacrificeInstanceId: replacement.sacrificeInstanceId,
            effectSource,
          }),
          targetSelectionType: 'GEMMA049_SACRIFICE_CHOICE',
          sourcePlayer: charResult.player,
          requiresTargetSelection: true,
          validTargets: [replacement.sacrificeInstanceId],
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET' as 'SELECT_TARGET',
          player: charResult.player,
          description: `Gemma Shiranui (049): Sacrifice Gemma to protect ${charResult.character.card.name_fr}?`,
          descriptionKey: 'game.effect.desc.gemma049SacrificeDefeat',
          descriptionParams: { target: charResult.character.card.name_fr },
          options: [replacement.sacrificeInstanceId],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
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

    // Tsunade 004 UC: [⧗] Defeated friendly characters go to hand instead of discard pile
    const owner = defeated.originalOwner;
    const hasTsunade004 = EffectEngine.hasTsunade004Active(newState, charResult.player);
    if (hasTsunade004 && charResult.player === owner) {
      // Cards go to owner's hand instead of discard pile
      for (const card of defeated.stack) {
        newState[owner].hand.push(card);
      }
    } else {
      // Normal: add all cards in the stack to the original owner's discard pile
      for (const card of defeated.stack) {
        newState[owner].discardPile.push(card);
      }
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

  /** Sasuke 136 Stage 1: defeat the chosen friendly, then prompt for enemy target */
  static defeatFriendlyForSasuke136(state: GameState, pending: PendingEffect, targetId: string): GameState {
    // Defeat the friendly character
    let newState = EffectEngine.defeatCharacter(state, targetId, pending.sourcePlayer);

    // Find enemy targets in the source mission
    let missionIdx = pending.sourceMissionIndex;
    try {
      const parsed = JSON.parse(pending.effectDescription);
      if (parsed.missionIndex !== undefined) missionIdx = parsed.missionIndex;
    } catch { /* ignore */ }

    const mission = newState.activeMissions[missionIdx];
    if (!mission) return newState;

    const enemySide: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const enemyTargets = mission[enemySide].map((c) => c.instanceId);

    if (enemyTargets.length === 0) {
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Sasuke Uchiwa (136) UPGRADE: No enemy character to defeat after sacrifice.',
        'game.log.effect.noTarget',
        { card: 'SASUKE UCHIWA', id: 'KS-136-S' },
      );
      return newState;
    }

    if (enemyTargets.length === 1) {
      // Auto-defeat the only enemy
      return EffectEngine.defeatCharacter(newState, enemyTargets[0], pending.sourcePlayer);
    }

    // Stage 2: choose enemy to defeat
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: missionIdx,
      effectType: 'UPGRADE',
      effectDescription: '',
      targetSelectionType: 'SASUKE136_CHOOSE_ENEMY',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: enemyTargets,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: true,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: 'Sasuke Uchiwa (136) UPGRADE: Choose an enemy character to defeat.',
      descriptionKey: 'game.effect.desc.sasuke136ChooseEnemy',
      options: enemyTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Naruto 133 S — Stage 1: hide/defeat target 1, then chain to target 2 */
  static naruto133ApplyTarget1(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { missionIndex?: number; useDefeat?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const useDefeat = parsed.useDefeat ?? false;

    // Apply hide or defeat to target 1
    let newState: GameState;
    if (useDefeat) {
      newState = EffectEngine.defeatCharacter(state, targetId, pending.sourcePlayer);
    } else {
      newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);
    }

    // Now find valid targets for Stage 2: enemy Power ≤ 2 in ANY mission
    const enemySideKey: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const enemyPlayer: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';

    const validTarget2: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      for (const char of newState.activeMissions[i][enemySideKey]) {
        // Use effective power (includes continuous effects like MSS02 +1) — not just base+tokens
        const power = calculateCharacterPower(newState, char, enemyPlayer);
        if (power <= 2) {
          validTarget2.push(char.instanceId);
        }
      }
    }

    if (validTarget2.length === 0) {
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Naruto Uzumaki (133): No valid second enemy with Power 2 or less in play.',
        'game.log.effect.noTarget',
        { card: 'NARUTO UZUMAKI', id: 'KS-133-S' },
      );
      return newState;
    }

    if (validTarget2.length === 1) {
      // Auto-apply to the only target
      if (useDefeat) {
        return EffectEngine.defeatCharacter(newState, validTarget2[0], pending.sourcePlayer);
      } else {
        return EffectEngine.hideCharacterWithLog(newState, validTarget2[0], pending.sourcePlayer);
      }
    }

    // Stage 2: player chooses second target
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ useDefeat, target1Id: targetId }),
      targetSelectionType: 'NARUTO133_CHOOSE_TARGET2',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: validTarget2,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: pending.isUpgrade,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: useDefeat
        ? 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to defeat (any mission).'
        : 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to hide (any mission).',
      descriptionKey: useDefeat
        ? 'game.effect.desc.naruto133ChooseDefeat2'
        : 'game.effect.desc.naruto133ChooseHide2',
      options: validTarget2,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Naruto 108 R — hide target and apply POWERUP if upgrade */
  static naruto108ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { isUpgrade?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const isUpgrade = parsed.isUpgrade ?? false;

    // Get the target's power BEFORE hiding
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;
    const topCard = charResult.character.stack.length > 0
      ? charResult.character.stack[charResult.character.stack.length - 1]
      : charResult.character.card;
    const targetPower = topCard.power + charResult.character.powerTokens;

    // Hide the target
    let newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);

    // UPGRADE: POWERUP X on self where X = Power of hidden character
    if (isUpgrade && targetPower > 0) {
      const friendlySideKey: 'player1Characters' | 'player2Characters' =
        pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

      const missions = [...newState.activeMissions];
      const mission = { ...missions[pending.sourceMissionIndex] };
      const friendlyChars = [...mission[friendlySideKey]];
      const selfIdx = friendlyChars.findIndex((c) => c.instanceId === pending.sourceInstanceId);
      if (selfIdx !== -1) {
        friendlyChars[selfIdx] = {
          ...friendlyChars[selfIdx],
          powerTokens: friendlyChars[selfIdx].powerTokens + targetPower,
        };
        mission[friendlySideKey] = friendlyChars;
        missions[pending.sourceMissionIndex] = mission;
        newState = {
          ...newState,
          activeMissions: missions,
          log: logAction(
            newState.log, newState.turn, newState.phase, pending.sourcePlayer,
            'EFFECT_POWERUP',
            `Naruto Uzumaki (108): POWERUP ${targetPower} (Power of hidden ${charResult.character.card.name_fr}).`,
            'game.log.effect.powerup',
            { card: 'NARUTO UZUMAKI', id: 'KS-108-R', amount: targetPower, target: 'self' },
          ),
        };
      }
    }

    return newState;
  }

  /** Kyubi 134 S — iterative multi-hide: hide target, then offer more picks if budget remains */
  static kyubi134ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { remainingPower?: number; hiddenIds?: string[] } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    let remainingPower = parsed.remainingPower ?? 6;
    const hiddenIds = parsed.hiddenIds ?? [];

    // Get target's power before hiding
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || charResult.character.isHidden) return state;
    const topCard = charResult.character.stack.length > 0
      ? charResult.character.stack[charResult.character.stack.length - 1]
      : charResult.character.card;
    const targetPower = topCard.power + charResult.character.powerTokens;

    // Hide the target
    let newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);
    remainingPower -= targetPower;
    hiddenIds.push(targetId);

    if (remainingPower <= 0) return newState; // No budget left

    // Find remaining valid targets (not already hidden, not self, power fits in budget)
    const validNext: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of newState.activeMissions[i][side]) {
          if (char.isHidden) continue;
          if (char.instanceId === pending.sourceInstanceId) continue; // not self (Kyubi)
          if (hiddenIds.includes(char.instanceId)) continue;
          const tc = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
          const pw = tc.power + char.powerTokens;
          if (pw <= remainingPower && pw > 0) {
            validNext.push(char.instanceId);
          }
        }
      }
    }

    if (validNext.length === 0) return newState; // No more valid targets

    // Offer another pick (optional — player can decline)
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: 'UPGRADE',
      effectDescription: JSON.stringify({ remainingPower, hiddenIds }),
      targetSelectionType: 'KYUBI134_CHOOSE_HIDE_TARGETS',
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: validNext,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: true,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player: pending.sourcePlayer,
      description: `Kyubi (134) UPGRADE: Choose another character to hide (remaining power budget: ${remainingPower}).`,
      descriptionKey: 'game.effect.desc.kyubi134ChooseHide',
      descriptionParams: { remaining: String(remainingPower) },
      options: validNext,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Check if Tsunade 004 UC is face-visible on a player's side (defeat → hand redirect) */
  static hasTsunade004Active(state: GameState, player: PlayerID): boolean {
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const char of chars) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.number === 4 && topCard.rarity === 'UC') {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('hand instead'),
          );
          if (hasEffect) return true;
        }
      }
    }
    return false;
  }

  /** Check if a character is immune to hide by enemy effects (Ichibi 076/130, Kyubi 129/134) */
  static isImmuneToEnemyHide(char: CharacterInPlay): boolean {
    return isImmuneToEnemyHideOrDefeat(char);
  }

  /** Hide a character and log the action */
  static hideCharacterWithLog(state: GameState, targetInstanceId: string, sourcePlayer: PlayerID): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetInstanceId);
    if (!charResult) return state;
    if (charResult.character.isHidden) return state;

    const isEnemyEffect = charResult.player !== sourcePlayer;

    // Check hide immunity from enemy effects (Ichibi 076/130, Kyubi 129)
    if (isEnemyEffect && EffectEngine.isImmuneToEnemyHide(charResult.character)) {
      return state; // Immune — hide blocked
    }

    // Check Shino 115 mission-level protection: friendly allies cannot be hidden by enemy effects
    if (isEnemyEffect && isProtectedFromEnemyHide(state, charResult.character, charResult.player)) {
      return state; // Protected by Shino 115 — hide blocked
    }

    // Check Gemma 049 sacrifice: can sacrifice Gemma to protect friendly Leaf Village from enemy hide
    if (isEnemyEffect && charResult.character.card.group === 'Leaf Village') {
      const mission = state.activeMissions[charResult.missionIndex];
      const friendlyChars = charResult.player === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const friendly of friendlyChars) {
        if (friendly.isHidden || friendly.instanceId === charResult.character.instanceId) continue;
        const fTopCard = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;
        if (fTopCard.number === 49) {
          const hasSacrifice = (fTopCard.effects ?? []).some(
            (e) =>
              e.type === 'MAIN' &&
              e.description.includes('[⧗]') &&
              e.description.includes('Leaf Village') &&
              e.description.includes('defeat this character instead'),
          );
          if (hasSacrifice) {
            // Create pending choice for the owning player
            let newState = { ...state };
            const effectId = generateInstanceId();
            const actionId = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: effectId,
              sourceCardId: 'KS-049-C',
              sourceInstanceId: friendly.instanceId,
              sourceMissionIndex: charResult.missionIndex,
              effectType: 'MAIN' as const,
              effectDescription: JSON.stringify({
                targetInstanceId: targetInstanceId,
                sacrificeInstanceId: friendly.instanceId,
                effectSource: sourcePlayer,
              }),
              targetSelectionType: 'GEMMA049_SACRIFICE_HIDE_CHOICE',
              sourcePlayer: charResult.player,
              requiresTargetSelection: true,
              validTargets: [friendly.instanceId],
              isOptional: true,
              isMandatory: false,
              resolved: false,
              isUpgrade: false,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: actionId,
              type: 'SELECT_TARGET' as 'SELECT_TARGET',
              player: charResult.player,
              description: `Gemma Shiranui (049): Sacrifice Gemma to protect ${charResult.character.card.name_fr} from being hidden?`,
              descriptionKey: 'game.effect.desc.gemma049SacrificeHide',
              descriptionParams: { target: charResult.character.card.name_fr },
              options: [friendly.instanceId],
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId,
            }];
            return newState;
          }
        }
      }
    }

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

    // Find valid missions (fresh play or upgrade over same-name with lower cost)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const sameNameChar = mission[friendlySide].find(c => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === chosenCard.name_fr.toUpperCase();
      });
      if (!sameNameChar) {
        validMissions.push(String(i));
      } else {
        const existingTopCard = sameNameChar.stack.length > 0
          ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
        if ((chosenCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
          validMissions.push(String(i));
        }
      }
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
      descriptionKey: 'game.effect.desc.chooseMissionSummon',
      descriptionParams: { reduction: costReduction },
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

    // Find valid missions (fresh play or upgrade over same-name with lower cost)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const sameNameChar = mission[friendlySide].find(c => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === chosenCard.name_fr.toUpperCase();
      });
      if (!sameNameChar) {
        validMissions.push(String(i));
      } else {
        const existingTopCard = sameNameChar.stack.length > 0
          ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
        if ((chosenCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
          validMissions.push(String(i));
        }
      }
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
      descriptionKey: 'game.effect.desc.chooseMissionPlayReduced',
      descriptionParams: { card: cardName, id: cardId, reduction: costReduction },
      options: validMissions,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

    return newState;
  }

  /** Generic helper: place the card (last in discard) onto a mission as a face-visible character, with upgrade support + MAIN effect triggering */
  private static genericPlaceOnMission(state: GameState, player: PlayerID, missionIndex: number, cost: number, cardName: string, cardId: string, costReduction: number): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide].findIndex(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      state.log = logAction(
        state.log, state.turn, 'action', player,
        'EFFECT_UPGRADE',
        `${cardName} (${cardId}): Upgraded ${card.name_fr} on mission ${missionIndex + 1} for ${cost} chakra (reduced by ${costReduction}).`,
        'game.log.effect.upgradeFromHand',
        { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
      );
    } else {
      // Safety check: ensure no same-name visible character exists (name uniqueness)
      const hasNameConflict = mission[friendlySide].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflict) {
        // Can't place — discard instead of creating a duplicate
        ps.discardPile.push(card);
        state.log = logAction(
          state.log, state.turn, 'action', player,
          'EFFECT_BLOCKED',
          `${cardName} (${cardId}): Cannot play ${card.name_fr} on mission ${missionIndex + 1} — same name already present.`,
          'game.log.effect.nameConflictBlocked',
          { card: cardName, id: cardId, target: card.name_fr },
        );
        return state;
      }

      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card: card as any,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: 0,
        stack: [card as any],
        controlledBy: player,
        originalOwner: player,
        missionIndex,
      };

      mission[friendlySide] = [...mission[friendlySide], charInPlay];
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = charInPlay;

      ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

      state.log = logAction(
        state.log, state.turn, 'action', player,
        'EFFECT', `${cardName} (${cardId}): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${cost} chakra (reduced by ${costReduction}).`,
        'game.log.effect.playSummon',
        { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

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

    // Store in discard temporarily and use jiraiyaPlaceOnMission (handles upgrades + MAIN effects)
    ps.discardPile.push(card);

    return EffectEngine.jiraiyaPlaceOnMission(newState, player, missionIndex, cost);
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
      // Use hideCharacterWithLog for proper protection checks (Ichibi, Shino 115, Gemma 049)
      return EffectEngine.hideCharacterWithLog(newState, targetId, player);
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
      { card: 'Kimimaro', id: 'KS-055-C', count: 1 },
    );

    // Find valid hide targets (cost <= 3, not hidden, not Kimimaro himself)
    const opponent = player === 'player1' ? 'player2' : 'player1';
    const enemySide = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
    const validHideTargets: string[] = [];

    for (const mission of newState.activeMissions) {
      // Enemy chars — check immunity
      for (const char of mission[enemySide]) {
        if (char.isHidden) continue;
        if (!canBeHiddenByEnemy(newState, char, opponent)) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
      // Friendly chars — no immunity check needed
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
      // Auto-hide the only valid target (use hideCharacterWithLog for protection checks)
      return EffectEngine.hideCharacterWithLog(newState, validHideTargets[0], player);
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
      descriptionKey: 'game.effect.desc.kimimaro055Hide',
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
  // Haku 088 — Draw 1, put 1 back (two-step)
  // =====================================

  /**
   * Haku 088: Player confirmed the optional draw.
   * Draw 1 card from the deck, then create a mandatory PUT_CARD_ON_DECK pending.
   */
  static haku088ConfirmDraw(state: GameState, pending: PendingEffect): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (ps.deck.length === 0) return newState; // Should not happen (handler checks), but guard

    const drawnCard = ps.deck.shift()!;
    ps.hand.push(drawnCard);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_DRAW',
      `Haku (088): Drew 1 card. Must put 1 card back on top of deck.`,
      'game.log.effect.draw',
      { card: 'HAKU', id: 'KS-088-C', count: 1 },
    );

    // Mandatory put-back
    const handIndices = ps.hand.map((_: unknown, i: number) => String(i));
    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: '',
      targetSelectionType: 'PUT_CARD_ON_DECK',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: handIndices,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: pending.isUpgrade,
    });

    newState.pendingActions.push({
      id: actionId,
      type: 'PUT_CARD_ON_DECK' as const,
      player,
      description: 'Haku (088): Choose a card from your hand to put on top of your deck.',
      descriptionKey: 'game.effect.desc.haku088PutBack',
      options: handIndices,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effectId,
    });

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
      descriptionKey: 'game.effect.desc.mss08PlaceHidden',
      descriptionParams: { card: chosenCard.name_fr },
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
      wasRevealedAtLeastOnce: false,
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
  // =====================================
  // Kimimaro 056 — Continuous protection
  // =====================================

  /**
   * Check if the target of an effect is Kimimaro 056 with the continuous protection.
   * If so, the opponent (effect source) must pay 1 chakra if able.
   */
  static applyKimimaro056Protection(state: GameState, pending: PendingEffect, targetId: string): GameState {
    // Find the targeted character across all missions
    for (const mission of state.activeMissions) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (char.instanceId !== targetId) continue;
          if (char.isHidden) return state; // Hidden = no continuous effects

          const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
          if (topCard.number !== 56) return state;

          // Check if this card has the continuous protection effect
          const hasProtection = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('chakra'),
          );
          if (!hasProtection) return state;

          // Only triggers for enemy effects (not friendly)
          const charOwner = char.controlledBy;
          if (charOwner === pending.sourcePlayer) return state; // Friendly effect, no protection

          // Opponent must pay 1 chakra if able
          const opponent = pending.sourcePlayer;
          if (state[opponent].chakra >= 1) {
            state[opponent].chakra -= 1;
            state.log = logAction(
              state.log, state.turn, state.phase, charOwner,
              'EFFECT_CONTINUOUS',
              `Kimimaro (056): ${opponent} pays 1 Chakra for targeting this character.`,
              'game.log.effect.kimimaro056Protection',
              { card: 'KIMIMARO', id: 'KS-056-UC' },
            );
          }
          return state;
        }
      }
    }
    return state;
  }

  // =====================================
  // Hiruzen 002 — Place chosen Leaf character
  // =====================================

  static kabuto053PlayFromDiscard(state: GameState, player: PlayerID, missionIdx: number, cost: number, discardIndex?: number): GameState {
    const newState = deepClone(state);
    const ps = newState[player];

    if (ps.discardPile.length === 0) return state;
    let card;
    if (discardIndex !== undefined && discardIndex >= 0 && discardIndex < ps.discardPile.length) {
      card = ps.discardPile.splice(discardIndex, 1)[0];
    } else {
      card = ps.discardPile.pop()!;
    }
    ps.chakra -= cost;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...newState.activeMissions];
    const mission = { ...missions[missionIdx] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide].findIndex(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existing.stack, card],
      };
      mission[friendlySide] = updatedChars;
      missions[missionIdx] = mission;
      newState.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT_UPGRADE',
        `Kabuto Yakushi (053): Upgraded ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${cost} chakra (3 less).`,
        'game.log.effect.upgradeFromDiscard',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr, mission: String(missionIdx + 1), cost: String(cost) },
      );
    } else {
      // Safety check: name uniqueness
      const hasNameConflict_k053 = mission[friendlySide].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflict_k053) {
        ps.discardPile.push(card);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, player,
          'EFFECT_BLOCKED',
          `Kabuto Yakushi (053): Cannot play ${card.name_fr} on mission ${missionIdx + 1} — same name already present.`,
          'game.log.effect.nameConflictBlocked',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr },
        );
        return newState;
      }

      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: 0,
        stack: [card],
        controlledBy: player,
        originalOwner: player,
        missionIndex: missionIdx,
      };

      mission[friendlySide] = [...mission[friendlySide], charInPlay];
      missions[missionIdx] = mission;
      newState.activeMissions = missions;
      placedChar = charInPlay;

      let charCount = 0;
      for (const m of newState.activeMissions) {
        charCount += (player === 'player1' ? m.player1Characters : m.player2Characters).length;
      }
      ps.charactersInPlay = charCount;

      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT',
        `Kabuto Yakushi (053): Played ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${cost} chakra (3 less).`,
        'game.log.effect.playFromDiscard',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr, mission: String(missionIdx + 1), cost: String(cost) },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    return EffectEngine.resolvePlayEffects(newState, player, placedChar, missionIdx, isCardUpgrade);
  }

  static hiruzen002PlaceCard(state: GameState, pending: PendingEffect, cardIndex: number, missionIndex: number): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (cardIndex < 0 || cardIndex >= ps.hand.length) return state;
    if (missionIndex < 0 || missionIndex >= newState.activeMissions.length) return state;

    const card = ps.hand[cardIndex];

    const friendlySide_h002: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...newState.activeMissions];
    const mission = { ...missions[missionIndex] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide_h002].findIndex((c: CharacterInPlay) => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    // Safety check: name conflict without upgrade possibility
    if (existingIdx < 0) {
      const hasNameConflict = mission[friendlySide_h002].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflict) return state;
    }

    // Compute actual cost: for upgrades pay (diff - 1), for fresh play pay (cost - 1)
    let actualCost: number;
    if (existingIdx >= 0) {
      const existing_h002 = mission[friendlySide_h002][existingIdx];
      const existingTop_h002 = existing_h002.stack.length > 0
        ? existing_h002.stack[existing_h002.stack.length - 1]
        : existing_h002.card;
      actualCost = Math.max(0, (card.chakra - existingTop_h002.chakra) - 1);
    } else {
      actualCost = Math.max(0, card.chakra - 1);
    }
    if (ps.chakra < actualCost) return state;

    // Pay cost
    ps.chakra -= actualCost;
    ps.hand.splice(cardIndex, 1);

    const isHiruzenUpgrade = pending.isUpgrade;
    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      // Upgrade the existing character (stack new card on top)
      const existing = mission[friendlySide_h002][existingIdx];
      const updatedChars = [...mission[friendlySide_h002]];
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existing.stack, card],
        powerTokens: existing.powerTokens + (isHiruzenUpgrade ? 2 : 0),
      };
      mission[friendlySide_h002] = updatedChars;
      missions[missionIndex] = mission;
      newState.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      newState.log = logAction(
        newState.log, newState.turn, 'action', player,
        'EFFECT_UPGRADE',
        `Hiruzen Sarutobi (002): Upgraded ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (diff-1)${isHiruzenUpgrade ? ' with POWERUP 2' : ''}.`,
        'game.log.effect.upgradeLeafReduced',
        { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    } else {
      // Fresh play
      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: isHiruzenUpgrade ? 2 : 0,
        stack: [card],
        controlledBy: player,
        originalOwner: player,
        missionIndex,
      };

      mission[friendlySide_h002] = [...mission[friendlySide_h002], charInPlay];
      missions[missionIndex] = mission;
      newState.activeMissions = missions;
      placedChar = charInPlay;

      // Update character count
      ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

      const upgradeNote = isHiruzenUpgrade ? ' with POWERUP 2 (upgrade)' : '';
      newState.log = logAction(
        newState.log, newState.turn, 'action', player,
        'EFFECT',
        `Hiruzen Sarutobi (002): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (1 less)${upgradeNote}.`,
        'game.log.effect.playLeafReduced',
        { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    }

    // Resolve the played card's MAIN effects (and UPGRADE if it was a card-level upgrade)
    return EffectEngine.resolvePlayEffects(newState, player, placedChar, missionIndex, isCardUpgrade);
  }

  // =====================================
  // MSS 05 — Bring it Back
  // =====================================

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

    // Return only the top card to player's hand; discard cards underneath
    const ps = newState[player];
    const returnCard = target.stack.length > 0 ? target.stack[target.stack.length - 1] : target.card;
    ps.hand = [...ps.hand, returnCard];
    if (target.stack.length > 1) {
      const underCards = target.stack.slice(0, -1);
      ps.discardPile = [...ps.discardPile, ...underCards];
    }
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
      descriptionKey: 'game.effect.desc.mss07MoveDest',
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

    // Find valid missions (fresh play or upgrade over same-name with lower cost)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const sameNameChar = mission[friendlySide].find(c => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === chosenCard.name_fr.toUpperCase();
      });
      if (!sameNameChar) {
        validMissions.push(String(i));
      } else {
        const existingTopCard = sameNameChar.stack.length > 0
          ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
        if ((chosenCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
          validMissions.push(String(i));
        }
      }
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
      descriptionKey: 'game.effect.desc.jiraiya007PlaySummon',
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

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide].findIndex(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      // Upgrade the existing character
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      state.log = logAction(
        state.log, state.turn, 'action', player,
        'EFFECT_UPGRADE',
        `Jiraiya effect: Upgraded ${card.name_fr} as Summon on mission ${missionIndex + 1} for ${cost} chakra.`,
        'game.log.effect.upgradeSummon',
        { card: 'Jiraya', target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
      );
    } else {
      // Fresh play
      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card: card as any,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: 0,
        stack: [card as any],
        controlledBy: player,
        originalOwner: player,
        missionIndex,
      };

      mission[friendlySide] = [...mission[friendlySide], charInPlay];
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = charInPlay;

      ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

      state.log = logAction(
        state.log, state.turn, 'action', player,
        'EFFECT', `Jiraiya effect: Plays ${card.name_fr} as Summon on mission ${missionIndex + 1} for ${cost} chakra.`,
        'game.log.effect.playSummon', { card: 'Jiraya', id: 'KS-007-C', target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

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

    // Find valid destination missions (any other than the character's current, respecting name uniqueness)
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      // Auto-resolve: move to the only other mission
      return EffectEngine.moveCharToMissionDirect(newState, targetId, parseInt(validMissions[0], 10), player, 'Asuma Sarutobi', 'KS-023-C');
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
      descriptionKey: 'game.effect.desc.asuma023MoveDest',
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
    return EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Asuma Sarutobi', 'KS-023-C');
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

    // Find valid destination missions (any other than Naruto's current, respecting name uniqueness)
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      return EffectEngine.moveCharToMissionDirect(newState, targetId, parseInt(validMissions[0], 10), player, 'Iruka Umino', 'KS-047-C');
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
      descriptionKey: 'game.effect.desc.iruka047MoveDest',
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
    return EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Iruka Umino', 'KS-047-C');
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

    // Find valid destination missions (respecting name uniqueness)
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      // Auto-resolve destination, then check for more moves
      let result = EffectEngine.moveCharToMissionDirect(
        newState, targetId, parseInt(validMissions[0], 10), player, 'Kidomaru', 'KS-059-C',
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
      descriptionKey: 'game.effect.desc.kidomaru059MoveDest',
      descriptionParams: { remaining: movesRemaining },
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

    let result = EffectEngine.moveCharToMissionDirect(newState, charInstanceId, destMission, player, 'Kidomaru', 'KS-059-C');

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
      descriptionKey: 'game.effect.desc.kidomaru059ChooseChar',
      descriptionParams: { remaining: movesRemaining },
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
      const sameNameChar = mission[friendlySide].find(c => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === chosenCard.name_fr.toUpperCase();
      });

      if (!sameNameChar) {
        // No same-name → fresh play is valid
        validMissions.push(String(i));
      } else {
        // Same-name exists → check if upgrade is valid (strictly higher chakra)
        const existingTopCard = sameNameChar.stack.length > 0
          ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
        if ((chosenCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
          validMissions.push(String(i));
        }
      }
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
      descriptionKey: 'game.effect.desc.sakura109PlayMission',
      descriptionParams: { card: chosenCard.name_fr },
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

  /** Sakura 109 helper: place the card (last in discard) on the mission. Handles both fresh play and upgrade. */
  private static sakura109Place(state: GameState, player: PlayerID, missionIndex: number, cost: number, isUpgrade: boolean): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide].findIndex(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      // Upgrade the existing character
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      const costDesc = isUpgrade ? ` (cost reduced by 2, paid ${cost})` : ` (paid ${cost})`;
      state.log = logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_UPGRADE',
        `Sakura Haruno (109): Upgraded ${card.name_fr} from discard pile on mission ${missionIndex + 1}${costDesc}.`,
        'game.log.effect.upgradeFromDiscard',
        { card: 'SAKURA HARUNO', id: 'KS-109-R', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
      );
    } else {
      // Fresh play
      const newChar: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card: card as any,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: 0,
        stack: [card as any],
        controlledBy: player,
        originalOwner: player,
        missionIndex,
      };

      mission[friendlySide] = [...mission[friendlySide], newChar];
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = newChar;

      ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

      const costDesc = isUpgrade ? ` (cost reduced by 2, paid ${cost})` : ` (paid ${cost})`;
      state.log = logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_PLAY',
        `Sakura Haruno (109): Played ${card.name_fr} from discard pile to mission ${missionIndex + 1}${costDesc}.`,
        'game.log.effect.playFromDiscard',
        { card: 'SAKURA HARUNO', id: 'KS-109-R', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

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
        { card: 'SAKURA HARUNO', id: 'KS-135-S' },
      );
      return newState;
    }

    // Pay cost
    ps.chakra -= cost;

    // Find valid missions (fresh play or upgrade)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      const sameNameChar = mission[friendlySide].find(c => {
        if (c.isHidden) return false;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === chosenCard.name_fr.toUpperCase();
      });

      if (!sameNameChar) {
        // No same-name character → fresh play is valid
        validMissions.push(String(i));
      } else {
        // Same-name exists → check if upgrade is valid (strictly higher chakra)
        const existingTopCard = sameNameChar.stack.length > 0
          ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
        if ((chosenCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
          validMissions.push(String(i));
        }
      }
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
      descriptionKey: 'game.effect.desc.sakura135PlayMission',
      descriptionParams: { card: chosenCard.name_fr },
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

  /** Sakura 135 helper: place card (last in discard) on mission. Handles both fresh play and upgrade. */
  private static sakura135Place(state: GameState, player: PlayerID, missionIndex: number, cost: number, isUpgrade: boolean): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    // Check if there's a same-name character to upgrade
    const existingIdx = mission[friendlySide].findIndex(c => {
      if (c.isHidden) return false;
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
        && (card.chakra ?? 0) > (topCard.chakra ?? 0);
    });

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      // Upgrade the existing character
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],
        // Power tokens transfer through upgrade
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      const costDesc = isUpgrade ? ` (cost reduced by 4, paid ${cost})` : ` (paid ${cost})`;
      state.log = logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_UPGRADE',
        `Sakura Haruno (135): Upgraded ${card.name_fr} on mission ${missionIndex + 1}${costDesc}.`,
        'game.log.effect.upgradeFromDeck',
        { card: 'SAKURA HARUNO', id: 'KS-135-S', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
      );
    } else {
      // Fresh play
      const newChar: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card: card as any,
        isHidden: false,
        wasRevealedAtLeastOnce: true,
        powerTokens: 0,
        stack: [card as any],
        controlledBy: player,
        originalOwner: player,
        missionIndex,
      };

      mission[friendlySide] = [...mission[friendlySide], newChar];
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = newChar;

      ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

      const costDesc = isUpgrade ? ` (cost reduced by 4, paid ${cost})` : ` (paid ${cost})`;
      state.log = logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_PLAY',
        `Sakura Haruno (135): Played ${card.name_fr} from top of deck to mission ${missionIndex + 1}${costDesc}.`,
        'game.log.effect.playFromDeck',
        { card: 'SAKURA HARUNO', id: 'KS-135-S', target: card.name_fr, mission: `mission ${missionIndex + 1}`, cost },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

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
      { card: 'CHOJI AKIMICHI', id: 'KS-112-R', target: discardedCard.name_fr, cost: discardedCost },
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
          { card: 'CHOJI AKIMICHI', id: 'KS-112-R', amount: discardedCost },
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
        descriptionKey: 'game.effect.desc.choji112DiscardUpgrade',
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

    const player = pending.sourcePlayer;
    const missionIndex = charResult.missionIndex;

    // Enforce same-name-per-mission: check if taking control would create a name duplicate
    // When control changes, the character moves to the player's side of the same mission
    if (!charResult.character.isHidden) {
      const destMission = state.activeMissions[missionIndex];
      const friendlyCharsInMission = player === 'player1'
        ? destMission.player1Characters
        : destMission.player2Characters;
      const charName = charResult.character.card.name_fr.toUpperCase();
      const hasSameName = friendlyCharsInMission.some(
        (c) => !c.isHidden && c.card.name_fr.toUpperCase() === charName,
      );
      if (hasSameName) {
        const blockedState = deepClone(state);
        blockedState.log = logAction(
          blockedState.log, blockedState.turn, blockedState.phase, player,
          'EFFECT_BLOCKED',
          `Ino Yamanaka (020): Cannot take control of ${charResult.character.card.name_fr} — a character with the same name already exists on your side of this mission.`,
          'game.log.effect.takeControlBlocked',
          { card: 'INO YAMANAKA', id: 'KS-020-UC', target: charResult.character.card.name_fr },
        );
        return blockedState;
      }
    }

    const newState = deepClone(state);
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
      { card: 'INO YAMANAKA', id: 'KS-020-UC', target: targetName },
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
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, player, 'Itachi Uchiwa', 'KS-143-M');
  }

  /** Itachi 143 AMBUSH: move an enemy character to Itachi's mission. */
  static itachi143MoveEnemy(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const opponent = player === 'player1' ? 'player2' : 'player1';
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, opponent, 'Itachi Uchiwa', 'KS-143-M');
  }

  // =====================================
  // Shared: Move character to a specific mission
  // =====================================

  /**
   * Validate that moving a character to a mission does not violate the
   * same-name-per-mission rule. A player cannot have two visible characters
   * with the same name on the same mission.
   *
   * Returns true if the move is allowed, false if it would violate the constraint.
   */
  static validateNameUniquenessForMove(
    state: GameState,
    charToMove: CharacterInPlay,
    destMissionIndex: number,
    controllingPlayer: PlayerID,
  ): boolean {
    // Hidden characters don't violate name uniqueness (their name is unknown)
    if (charToMove.isHidden) return true;

    const destMission = state.activeMissions[destMissionIndex];
    if (!destMission) return true;

    const charName = charToMove.card.name_fr.toUpperCase();
    const friendlyChars = controllingPlayer === 'player1'
      ? destMission.player1Characters
      : destMission.player2Characters;

    // Check if any existing visible character on this mission (controlled by same player)
    // has the same name (excluding the character being moved itself)
    return !friendlyChars.some(
      (c) =>
        c.instanceId !== charToMove.instanceId &&
        !c.isHidden &&
        c.card.name_fr.toUpperCase() === charName,
    );
  }

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

    // Enforce same-name-per-mission rule (FAQ: if forced by an effect, discard the moved character)
    if (!EffectEngine.validateNameUniquenessForMove(state, charResult.character, destMissionIndex, charResult.player)) {
      // Remove character from source mission and discard it (FAQ Rule: "discard the new one without applying effects")
      const friendlySideDiscard: 'player1Characters' | 'player2Characters' =
        charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';
      const missions = [...state.activeMissions];
      const srcMission = { ...missions[charResult.missionIndex] };
      const discardedChar = srcMission[friendlySideDiscard].find(c => c.instanceId === charInstanceId);
      srcMission[friendlySideDiscard] = srcMission[friendlySideDiscard].filter(c => c.instanceId !== charInstanceId);
      missions[charResult.missionIndex] = srcMission;
      state.activeMissions = missions;

      // Add all cards in the stack to the original owner's discard pile
      if (discardedChar) {
        const owner = discardedChar.originalOwner ?? charResult.player;
        const ownerState = { ...state[owner] };
        const cardsToDiscard = discardedChar.stack.length > 0 ? [...discardedChar.stack] : [discardedChar.card];
        ownerState.discardPile = [...ownerState.discardPile, ...cardsToDiscard];
        ownerState.charactersInPlay = EffectEngine.countCharsForPlayer({ ...state, [owner]: ownerState }, owner);
        state[owner] = ownerState;
      }

      state.log = logAction(
        state.log, state.turn, state.phase, charOwner,
        'EFFECT_DISCARD',
        `${effectCardName} (${effectCardId}): ${charResult.character.card.name_fr} moved to mission ${destMissionIndex + 1} but discarded due to same-name conflict.`,
        'game.log.effect.moveNameConflictDiscard',
        { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr },
      );
      return state;
    }

    // Check Gaara 075 continuous protection: cannot be moved by enemy effects
    if (charResult.player !== charOwner) {
      // This is an enemy effect moving the character
      const topCard = charResult.character.stack.length > 0
        ? charResult.character.stack[charResult.character.stack.length - 1]
        : charResult.character.card;
      if (topCard.number === 75 && !charResult.character.isHidden) {
        const hasMoveProtection = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated by enemy'),
        );
        if (hasMoveProtection) {
          state.log = logAction(
            state.log, state.turn, state.phase, charOwner,
            'EFFECT_BLOCKED',
            `${effectCardName} (${effectCardId}): Cannot move ${charResult.character.card.name_fr} — Gaara's continuous effect protects against enemy effects.`,
            'game.log.effect.moveBlocked',
            { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr },
          );
          return state;
        }
      }
    }

    // Kurenai 035 (UC): Enemy characters cannot move from this mission
    // Check if the source mission has a Kurenai 035 on the opposing side
    {
      const sourceMission = state.activeMissions[charResult.missionIndex];
      const opponentSide = charResult.player === 'player1' ? 'player2Characters' : 'player1Characters';
      const opponentChars = sourceMission[opponentSide];
      for (const opp of opponentChars) {
        if (opp.isHidden) continue;
        const oppTop = opp.stack.length > 0 ? opp.stack[opp.stack.length - 1] : opp.card;
        if (oppTop.number === 35) {
          const hasRestriction = (oppTop.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('cannot move'),
          );
          if (hasRestriction) {
            state.log = logAction(
              state.log, state.turn, state.phase, charOwner,
              'EFFECT_BLOCKED',
              `${effectCardName} (${effectCardId}): Cannot move ${charResult.character.card.name_fr} — Kurenai blocks enemy movement from this mission.`,
              'game.log.effect.moveBlocked',
              { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr },
            );
            return state;
          }
        }
      }
    }

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

    // Check Choji 018 post-move hide trigger (only on friendly moves)
    state = checkChoji018PostMoveTrigger(state, movedChar, destMissionIndex, charOwner, charResult.player);

    return state;
  }

  // =====================================
  // Utility Methods
  // =====================================

  /**
   * Execute a copied effect from one character's card on the copier character.
   * Used by Kakashi 016, Kakashi 148, and Sakon 062 copy-effect mechanics.
   */
  static executeCopiedEffect(
    state: GameState,
    pendingEffect: PendingEffect,
    targetCard: { id: string; name_fr: string; effects: Array<{ type: string; description: string }> },
    effectType: EffectType,
  ): GameState {
    let newState = { ...state };

    const copiedHandler = getEffectHandler(targetCard.id, effectType);
    if (!copiedHandler) {
      newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
        'EFFECT', `Effect copy: no handler for ${targetCard.name_fr} (${effectType}).`,
        'game.log.effect.copyFailed', { card: pendingEffect.sourceCardId });
      return newState;
    }

    const copierResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
    if (!copierResult) return newState;

    const copierTopCard = copierResult.character.stack.length > 0
      ? copierResult.character.stack[copierResult.character.stack.length - 1]
      : copierResult.character.card;

    newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
      'EFFECT', `${copierTopCard.name_fr} copies ${targetCard.name_fr}'s ${effectType} effect!`,
      'game.log.effect.copySuccess',
      { card: copierTopCard.name_fr, target: targetCard.name_fr, effectType });

    const copyCtx: EffectContext = {
      state: newState,
      sourcePlayer: pendingEffect.sourcePlayer,
      sourceCard: copierResult.character,
      sourceMissionIndex: copierResult.missionIndex,
      triggerType: effectType,
      isUpgrade: false,
    };

    try {
      const copyResult = copiedHandler(copyCtx);
      if (copyResult.requiresTargetSelection && copyResult.validTargets && copyResult.validTargets.length > 0) {
        // Override selectingPlayer: when an effect is copied, the copier's player makes all
        // target choices regardless of what the original handler specifies.
        const adjustedCopyResult = { ...copyResult, selectingPlayer: undefined };
        newState = EffectEngine.createPendingTargetSelection(
          copyResult.state, pendingEffect.sourcePlayer, copierResult.character,
          copierResult.missionIndex, effectType, false, adjustedCopyResult, [],
        );
      } else {
        newState = copyResult.state;
      }
    } catch (err) {
      console.error(`[EffectEngine] Error executing copied effect from ${targetCard.id}:`, err);
    }

    return newState;
  }

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
  ): { replaced: boolean; replacement: 'hide' | 'sacrifice' | 'immune'; sacrificeInstanceId?: string } {
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

    // Ichibi 076 (UC), Kyubi 129 (R/RA), Ichibi 130 (R/RA), Kyubi 134 (S): Can't be hidden or defeated by enemy effects
    if (isEnemyEffect && isImmuneToEnemyHideOrDefeat(targetChar)) {
      return { replaced: true, replacement: 'immune' };
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
