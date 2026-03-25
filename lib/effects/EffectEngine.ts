import type { GameState, PlayerID, CharacterInPlay, EffectType, PendingEffect, PendingAction } from '../engine/types';
import type { EffectContext, EffectResult } from './EffectTypes';
import { getEffectHandler } from './EffectRegistry';
import { deepClone } from '../engine/utils/deepClone';
import { generateInstanceId } from '../engine/utils/id';
import { moveOrochimaru051 } from '../engine/phases/MissionPhase';
import { logAction } from '../engine/utils/gameLog';
import { triggerOnDefeatEffects } from './onDefeatTriggers';
import { checkNinjaHoundsTrigger, checkChoji018PostMoveTrigger } from './moveTriggers';
import { returnCharacterToHand } from '../engine/phases/EndPhase';
import { defeatFriendlyCharacter, sortTargetsGemmaLast } from './defeatUtils';
import { isProtectedFromEnemyHide, isImmuneToEnemyHideOrDefeat, canBeHiddenByEnemy, isMovementBlockedByKurenai, triggerOnPlayReactions, applyRempartTokenRemoval } from './ContinuousEffects';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { getEffectivePower } from './powerUtils';
import { checkFlexibleUpgrade } from '../engine/rules/PlayValidation';
import { canAffordAsUpgrade } from './handlers/KS/shared/upgradeCheck';
import { moveCharTo, getValidMissions, applyUpgradePowerup } from './handlers/KS/rare/sasuke107';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard, findHiddenLeafOnBoard } from './handlers/KS/shared/summonSearch';

/**
 * Find an upgrade target for a card on a mission. Checks both same-name and flexible (cross-name) upgrades.
 * Returns the index of the upgrade target in the chars array, or -1 if none found.
 */
function findUpgradeTargetIdx(
  chars: CharacterInPlay[],
  card: { name_fr: string; chakra: number; number?: number; effects?: Array<{ type: string; description: string }> },
  excludeInstanceId?: string,
): number {
  // Orochimaru 051/138 restriction: "upgrade to any character that is NOT a Summon nor Orochimaru"
  // This restriction applies to ALL upgrade paths (same-name AND flexible).
  const hasFlexibleRestriction = (card.number === 51 || card.number === 138) &&
    (card.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'));

  // First check same-name upgrade (highest priority)
  const sameNameIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    // Block same-name upgrade onto Orochimaru/Summon for cards with flexible restriction
    if (hasFlexibleRestriction) {
      const isSummon = (topCard.keywords ?? []).includes('Summon');
      const isOrochimaru = topCard.name_fr.toUpperCase().includes('OROCHIMARU');
      if (isSummon || isOrochimaru) return false;
    }
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
      && (card.chakra ?? 0) > (topCard.chakra ?? 0);
  });
  if (sameNameIdx >= 0) return sameNameIdx;

  // Then check flexible (cross-name) upgrade
  const flexIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    if (!checkFlexibleUpgrade(card as any, topCard) || (card.chakra ?? 0) <= (topCard.chakra ?? 0)) return false;
    // Exclude targets where upgrading would create a post-upgrade name conflict
    // E.g., Orochimaru 138 upgrading over Naruto when another Orochimaru is already present
    const wouldConflict = chars.some(other => {
      if (other.instanceId === c.instanceId || other.isHidden) return false;
      if (excludeInstanceId && other.instanceId === excludeInstanceId) return false;
      const oTop = other.stack?.length > 0 ? other.stack[other.stack?.length - 1] : other.card;
      return oTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    });
    return !wouldConflict;
  });
  return flexIdx;
}

/**
 * Check if a card has a same-name conflict (visible char with same name but NOT upgradeable) on a mission.
 */
function hasSameNameConflict(
  chars: CharacterInPlay[],
  card: { name_fr: string; chakra: number },
  excludeInstanceId?: string,
): boolean {
  return chars.some(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
  });
}

/**
 * Check if a mission is valid for placing a card (either fresh play or upgrade), considering cost.
 * Returns true if the card can be placed on the mission.
 * Also accounts for flexible (cross-name) upgrades.
 */
function isMissionValidForPlay(
  mission: { player1Characters: CharacterInPlay[]; player2Characters: CharacterInPlay[] },
  friendlySide: 'player1Characters' | 'player2Characters',
  card: { name_fr: string; chakra: number; number?: number; effects?: Array<{ type: string; description: string }> },
  availableChakra: number,
  costReduction: number,
  excludeInstanceId?: string,
): boolean {
  const chars = mission[friendlySide];
  const upgradeIdx = findUpgradeTargetIdx(chars, card, excludeInstanceId);

  if (upgradeIdx >= 0) {
    const existing = chars[upgradeIdx];
    const existingTopCard = existing.stack?.length > 0 ? existing.stack[existing.stack?.length - 1] : existing.card;
    const upgradeCost = Math.max(0, ((card.chakra ?? 0) - (existingTopCard.chakra ?? 0)) - costReduction);
    if (availableChakra >= upgradeCost) return true;
    // Upgrade unaffordable — fall through to check fresh play (possible for cross-name flex upgrades)
  }

  // No upgrade target (or upgrade unaffordable) — check for name conflict
  if (hasSameNameConflict(chars, card, excludeInstanceId)) {
    return false; // Same name exists but can't upgrade (lower or equal cost)
  }

  // Fresh play
  const freshCost = Math.max(0, (card.chakra ?? 0) - costReduction);
  return availableChakra >= freshCost;
}

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
    const charStack = character.stack ?? [character.card];
    const topCard = charStack.length > 0 ? charStack[charStack.length - 1] : character.card;
    if (!topCard) return newState;

    // Build the ordered list of effect types from the card definition (top-to-bottom).
    // When played as upgrade, both MAIN and UPGRADE trigger in card-printed order.
    // When not an upgrade, only MAIN triggers.
    const relevantTypes = new Set<string>(isUpgrade ? ['MAIN', 'UPGRADE'] : ['MAIN']);
    const orderedTypes: EffectType[] = [];
    for (const effect of (topCard.effects ?? [])) {
      if (relevantTypes.has(effect.type) && !orderedTypes.includes(effect.type as EffectType)) {
        // Skip 'effect:' modifier lines â€' they modify previous effects, not standalone
        if (effect.type === 'MAIN' && (effect.description.startsWith('effect:') || effect.description.startsWith('effect.'))) {
          continue;
        }
        orderedTypes.push(effect.type as EffectType);
      }
    }

    // Fallback: if no MAIN found in orderedTypes but card has one, add it
    if (!orderedTypes.includes('MAIN')) {
      const hasMain = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
      );
      if (hasMain) orderedTypes.unshift('MAIN');
    }

    for (let i = 0; i < orderedTypes.length; i++) {
      const effectType = orderedTypes[i];

      const handler = getEffectHandler(topCard.id, effectType);
      if (!handler) continue;

      try {
        // Re-find the character in case a previous effect moved it (e.g., Kakashi 137 UPGRADE moves self)
        const charResult = i > 0 ? EffectEngine.findCharByInstanceId(newState, character.instanceId) : null;
        const currentChar = charResult?.character ?? character;
        const currentMissionIndex = charResult?.missionIndex ?? missionIndex;

        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: currentChar,
          sourceMissionIndex: currentMissionIndex,
          triggerType: effectType,
          isUpgrade,
        };
        if (isUpgrade) {
          console.log(`[EffectEngine] resolvePlayEffects: ${topCard.id} ${effectType} isUpgrade=true orderedTypes=[${orderedTypes.join(',')}]`);
        }
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          // Queue remaining effect types (those after current position, in card order)
          const remainingEffectTypes = orderedTypes.slice(i + 1);

          newState = EffectEngine.createPendingTargetSelection(
            result.state, player, currentChar, currentMissionIndex, effectType, isUpgrade,
            result, remainingEffectTypes,
          );
          return newState;
        }
        newState = result.state;
      } catch (err) {
        console.error(`[EffectEngine] ${effectType} handler error for ${topCard.id}:`, err);
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
    const topCard = character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card;

    // Build the ordered list of effect types from the card definition (top-to-bottom).
    // When revealed as an upgrade, MAIN, AMBUSH, and UPGRADE all trigger â€' in card order.
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
          wasRevealed: true,
        };
        const result = handler(ctx);

        if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
          // Queue remaining effect types (those after current position, in card order)
          const remainingEffectTypes = orderedTypes.slice(i + 1).filter((t) =>
            (topCard.effects ?? []).some((e) => e.type === t)
          );

          newState = EffectEngine.createPendingTargetSelection(
            result.state, player, character, missionIndex, effectType, true,
            result, remainingEffectTypes, true,
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

    const topCard = character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card;

    // A simple reveal is NOT an upgrade — isUpgrade is only true when actively
    // played as an upgrade via resolvePlayEffects or resolveRevealUpgradeEffects.
    // Previously this checked stack.length >= 2, which incorrectly set isUpgrade
    // when a card that was previously upgraded got hidden and then revealed again.

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
            wasRevealed: true,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            // Check if AMBUSH also needs to be processed after this
            const remainingEffectTypes: EffectType[] = [];
            const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
            if (hasAmbushEffect) remainingEffectTypes.push('AMBUSH');

            // Use result.state to preserve any state changes the handler already made
            newState = EffectEngine.createPendingTargetSelection(
              result.state, player, character, missionIndex, 'MAIN', false,
              result, remainingEffectTypes, true,
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
            wasRevealed: true,
          };
          const result = handler(ctx);

          if (result.requiresTargetSelection && result.validTargets && result.validTargets.length > 0) {
            // Use result.state to preserve any state changes the handler already made
            newState = EffectEngine.createPendingTargetSelection(
              result.state, player, character, missionIndex, 'AMBUSH', false,
              result, [], true,
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
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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
   * Returns { state, pending } â€' pending=true means a target selection was created.
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
    wasRevealed?: boolean,
  ): GameState {
    // Safeguard: if validTargets is empty, skip creating the pending effect entirely
    // This prevents stuck UI when a handler returns requiresTargetSelection with no valid targets
    // IMPORTANT: still process remaining effects (e.g. UPGRADE after MAIN) so they don't get silently dropped
    if (!result.validTargets || result.validTargets.length === 0) {
      console.warn(`[EffectEngine] Skipping pending target selection with empty validTargets for ${result.targetSelectionType}`);
      let skipState = result.state;
      if (remainingEffectTypes.length > 0) {
        const syntheticPending: PendingEffect = {
          id: generateInstanceId(),
          sourceCardId: character ? (character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card).id : '',
          sourceInstanceId: character?.instanceId ?? '',
          sourceMissionIndex: missionIndex,
          effectType,
          effectDescription: '',
          targetSelectionType: '',
          sourcePlayer: player,
          requiresTargetSelection: false,
          validTargets: [],
          isOptional: true,
          isMandatory: false,
          resolved: true,
          isUpgrade,
          remainingEffectTypes: remainingEffectTypes,
        };
        skipState = EffectEngine.processRemainingEffects(skipState, syntheticPending);
      }
      return skipState;
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    const topCard = character
      ? (character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card)
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
      wasRevealed: wasRevealed ?? false,
      remainingEffectTypes: remainingEffectTypes.length > 0 ? remainingEffectTypes : undefined,
      selectingPlayer: result.selectingPlayer,
    };

    // Determine PendingAction type based on targetSelectionType
    let actionType: PendingAction['type'] = 'SELECT_TARGET';
    const tst = result.targetSelectionType ?? '';
    if (tst === 'PUT_CARD_ON_DECK') {
      actionType = 'PUT_CARD_ON_DECK';
    } else if (
      tst === 'DISCARD_CARD' ||
      tst === 'KIMIMARO_CHOOSE_DISCARD' ||
      tst === 'KIMIMARO123_CHOOSE_DISCARD' ||
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
      tst === 'TSUNADE104_CHOOSE_CHAKRA' ||
      tst === 'CHOOSE_TOKEN_AMOUNT_REMOVE' ||
      tst === 'CHOOSE_TOKEN_AMOUNT_STEAL'
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
      minSelections: result.minSelections ?? 1,
      maxSelections: result.maxSelections ?? 1,
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

    // Validate target is in valid targets list (prevents wrong character from being affected)
    // Multi-select types (Kiba 026 / Tayuya 065 UPGRADE) send comma-separated indices or "skip"
    const isMultiSelectType = pendingEffect.targetSelectionType === 'KIBA026_UPGRADE_CHOOSE'
      || pendingEffect.targetSelectionType === 'TAYUYA065_UPGRADE_CHOOSE';
    if (isMultiSelectType) {
      // Allow "skip" to pass through; validate each comma-separated index
      if (targetId !== 'skip' && pendingEffect.validTargets && pendingEffect.validTargets.length > 0) {
        const indices = targetId.split(',');
        const allValid = indices.every(idx => pendingEffect.validTargets!.includes(idx));
        if (!allValid) {
          console.warn(`[EffectEngine] Invalid multi-select target ${targetId} - not all in validTargets [${pendingEffect.validTargets.join(', ')}] for ${pendingEffect.targetSelectionType}`);
          return state;
        }
      }
    } else if (pendingEffect.targetSelectionType === 'REORDER_DISCARD') {
      // REORDER_DISCARD sends a JSON array of all IDs as targetId — skip single-target validation
    } else if (pendingEffect.validTargets && pendingEffect.validTargets.length > 0 && !pendingEffect.validTargets.includes(targetId)) {
      console.warn(`[EffectEngine] Invalid target ${targetId} - not in validTargets [${pendingEffect.validTargets.join(', ')}] for ${pendingEffect.targetSelectionType}`);
      return state;
    }

    // Kimimaro 056 continuous protection: opponent must pay 1 chakra to affect him.
    // If opponent can't pay, the effect is CANCELLED.
    // Only check on the FINAL target selection (not CONFIRM popups where targetId = sourceInstanceId)
    const isConfirmPopup = targetId === pendingEffect.sourceInstanceId && pendingEffect.validTargets?.length === 1 && pendingEffect.validTargets[0] === pendingEffect.sourceInstanceId;
    const kimimaro056Result = isConfirmPopup
      ? { state: newState, blocked: false }
      : EffectEngine.applyKimimaro056Protection(newState, pendingEffect, targetId);
    newState = kimimaro056Result.state;
    if (kimimaro056Result.blocked) {
      // Effect cancelled - clean up pending and return
      newState.pendingEffects = newState.pendingEffects.filter((pe) => pe.id !== pendingEffect.id);
      newState.pendingActions = newState.pendingActions.filter((pa) => pa.sourceEffectId !== pendingEffect.id);
      return EffectEngine.processRemainingEffects(newState, pendingEffect);
    }

    try {
    switch (pendingEffect.targetSelectionType) {
      case 'POWERUP_2_LEAF_VILLAGE':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 2);
        break;

      case 'REMOVE_POWER_TOKENS_ENEMY': {
        // Chain a second pending to let the player choose how many tokens to remove (1 or 2)
        const charResultRemove = EffectEngine.findCharByInstanceId(newState, targetId);
        if (charResultRemove) {
          const availableTokens = charResultRemove.character.powerTokens;
          const amountOptions = availableTokens >= 2 ? ['1', '2'] : ['1'];
          const step2Remove: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'CHOOSE_TOKEN_AMOUNT_REMOVE',
            validTargets: amountOptions,
            description: JSON.stringify({
              text: `Choose how many Power tokens to remove from ${charResultRemove.character.card.name_fr}.`,
              targetInstanceId: targetId,
            }),
            descriptionKey: 'game.effect.desc.chooseTokenAmountRemove',
          };
          newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
          newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
          const sourceCharRemove = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          return EffectEngine.createPendingTargetSelection(
            newState, pendingEffect.sourcePlayer,
            sourceCharRemove?.character ?? null,
            pendingEffect.sourceMissionIndex,
            pendingEffect.effectType, pendingEffect.isUpgrade, step2Remove, [],
          );
        }
        break;
      }

      case 'STEAL_POWER_TOKENS_ENEMY_THIS_MISSION': {
        // Chain a second pending to let the player choose how many tokens to steal (1 or 2)
        const charResultStealMission = EffectEngine.findCharByInstanceId(newState, targetId);
        if (charResultStealMission) {
          const availableTokensSteal = charResultStealMission.character.powerTokens;
          const amountOptionsSteal = availableTokensSteal >= 2 ? ['1', '2'] : ['1'];
          const step2Steal: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'CHOOSE_TOKEN_AMOUNT_STEAL',
            validTargets: amountOptionsSteal,
            description: JSON.stringify({
              text: `Choose how many Power tokens to steal from ${charResultStealMission.character.card.name_fr}.`,
              targetInstanceId: targetId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
            }),
            descriptionKey: 'game.effect.desc.chooseTokenAmountSteal',
          };
          newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
          newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
          const sourceCharStealMission = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          return EffectEngine.createPendingTargetSelection(
            newState, pendingEffect.sourcePlayer,
            sourceCharStealMission?.character ?? null,
            pendingEffect.sourceMissionIndex,
            pendingEffect.effectType, pendingEffect.isUpgrade, step2Steal, [],
          );
        }
        break;
      }

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
            // Always show selection UI â€' player chooses which card to discard
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
                isMandatory: true,
                description: JSON.stringify({
                  text: 'Itachi (091) UPGRADE: Choose a card from opponent\'s hand to discard.',
                  cards: oppCards091,
                }),
                descriptionKey: 'game.effect.desc.itachi091ChooseDiscard',
              };
              // Clean up old pending effect/action before chaining
              newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
              newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
              return EffectEngine.createPendingTargetSelection(
                newState, pendingEffect.sourcePlayer,
                charResult091?.character ?? null,
                pendingEffect.sourceMissionIndex,
                'MAIN', false, step2091, [],
              );
          }
        }
        break;
      }

      case 'LOOK_AT_HIDDEN_CHARACTER':
        newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, targetId);
        break;

      case 'NINJA_HOUNDS_LOOK_AT_HIDDEN':
        newState = EffectEngine.ninjaHoundsLookAtHidden(newState, pendingEffect, targetId);
        break;

      case 'DOSU_LOOK_REVEAL':
        // Acknowledgment only â€' no additional action needed
        break;

      case 'TAYUYA065_UPGRADE_REVEAL':
        // Acknowledgment only â€' no additional action needed
        break;

      case 'KIBA026_UPGRADE_REVEAL':
        // Acknowledgment only - draw and deck rearrangement already applied
        break;

      case 'KIBA026_UPGRADE_CHOOSE': {
        // Player chose which Akamaru cards to draw from top 3
        const descData026 = JSON.parse(pendingEffect.effectDescription);
        const topCardsRaw026 = descData026.topCardsRaw;
        const remainingDeck026 = descData026.remainingDeck;
        const selectedIndices026 = targetId === 'skip' ? [] : targetId.split(',').map(Number);
        const ps026 = { ...newState[pendingEffect.sourcePlayer] };
        const drawnCards026: string[] = [];
        const putBack026: typeof topCardsRaw026 = [];
        for (let i = 0; i < topCardsRaw026.length; i++) {
          if (selectedIndices026.includes(i)) {
            ps026.hand = [...ps026.hand, topCardsRaw026[i]];
            drawnCards026.push(topCardsRaw026[i].name_fr);
          } else {
            putBack026.push(topCardsRaw026[i]);
          }
        }
        ps026.deck = [...putBack026, ...remainingDeck026];
        newState[pendingEffect.sourcePlayer] = ps026;
        if (drawnCards026.length > 0) {
          const revealedNames026 = drawnCards026.join(', ');
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DRAW',
            `Kiba Inuzuka (026): Revealed and drew ${drawnCards026.length} Akamaru card(s) from top 3: ${revealedNames026} (upgrade).`,
            'game.log.effect.revealDraw',
            { card: 'KIBA INUZUKA', id: 'KS-026-UC', count: drawnCards026.length, revealed: revealedNames026 });
        } else {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            'Kiba Inuzuka (026): Chose not to draw any Akamaru. Cards put back.',
            'game.log.effect.lookAtDeck',
            { card: 'KIBA INUZUKA', id: 'KS-026-UC' });
        }
        break;
      }

      case 'TAYUYA065_UPGRADE_CHOOSE': {
        // Player chose which Summon cards to draw from top 3
        const descData065 = JSON.parse(pendingEffect.effectDescription);
        const topCardsRaw065 = descData065.topCardsRaw;
        const remainingDeck065 = descData065.remainingDeck;
        const selectedIndices065 = targetId === 'skip' ? [] : targetId.split(',').map(Number);
        const ps065 = { ...newState[pendingEffect.sourcePlayer] };
        const drawnCards065: string[] = [];
        const putBack065: typeof topCardsRaw065 = [];
        for (let i = 0; i < topCardsRaw065.length; i++) {
          if (selectedIndices065.includes(i)) {
            ps065.hand = [...ps065.hand, topCardsRaw065[i]];
            drawnCards065.push(topCardsRaw065[i].name_fr);
          } else {
            putBack065.push(topCardsRaw065[i]);
          }
        }
        ps065.deck = [...putBack065, ...remainingDeck065];
        newState[pendingEffect.sourcePlayer] = ps065;
        if (drawnCards065.length > 0) {
          const revealedNames065 = drawnCards065.join(', ');
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DRAW',
            `Tayuya (065): Revealed and drew ${drawnCards065.length} Summon card(s) from top 3: ${revealedNames065} (upgrade).`,
            'game.log.effect.revealDraw',
            { card: 'TAYUYA', id: 'KS-065-UC', count: drawnCards065.length, revealed: revealedNames065 });
        } else {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            'Tayuya (065): Chose not to draw any Summon cards. Cards put back.',
            'game.log.effect.lookAtDeck',
            { card: 'TAYUYA', id: 'KS-065-UC' });
        }
        break;
      }

      case 'SASUKE014_HAND_REVEAL':
        // Acknowledgment only â€' AMBUSH just shows opponent's hand
        break;

      case 'SASUKE014_UPGRADE_HAND_REVEAL': {
        // UPGRADE includes AMBUSH — hand was shown, now proceed directly to mandatory discard
        // (player already confirmed UPGRADE at SASUKE014_CONFIRM_UPGRADE_MODIFIER — no second confirm needed)
        const opp_sur = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ownHand_sur = newState[pendingEffect.sourcePlayer].hand;
        const oppHand_sur = newState[opp_sur].hand;

        if (ownHand_sur.length === 0 || oppHand_sur.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (014) UPGRADE: Cannot discard — empty hand.',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });
          break;
        }

        {
          const handIndices_sur = ownHand_sur.map((_: unknown, i: number) => String(i));
          const charResult_sur = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          const step_sur: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'SASUKE_014_DISCARD_OWN',
            validTargets: handIndices_sur,
            isMandatory: true,
            description: 'Sasuke Uchiwa (014) UPGRADE: Discard 1 of your cards.',
            descriptionKey: 'game.effect.desc.sasuke014DiscardOwn',
          };
          newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
          newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
          return EffectEngine.createPendingTargetSelection(
            newState, pendingEffect.sourcePlayer,
            charResult_sur?.character ?? null,
            pendingEffect.sourceMissionIndex,
            'UPGRADE', true, step_sur, [],
          );
        }
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

      // --- Naruto Legendary: CONFIRM → UPGRADE_MODIFIER → TARGET1 → TARGET2 ---
      // Mirrors Naruto 133 (S) flow exactly.
      case 'NARUTO_LEGENDARY_CONFIRM_MAIN': {
        const nlPlayer = pendingEffect.sourcePlayer;
        const nlOpponent: PlayerID = nlPlayer === 'player1' ? 'player2' : 'player1';
        const nlEnemySide: 'player1Characters' | 'player2Characters' =
          nlPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let nlParsed: { missionIndex?: number; useDefeat?: boolean } = {};
        try { nlParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const nlMI = nlParsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const nlUseDefeat = nlParsed.useDefeat ?? false;
        const nlMission = newState.activeMissions[nlMI];
        if (!nlMission) break;

        const nlValidT1 = nlMission[nlEnemySide]
          .filter((c: CharacterInPlay) => (nlUseDefeat || !c.isHidden) && getEffectivePower(newState, c, nlOpponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId);
        const nlValidT2: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const ch of newState.activeMissions[i][nlEnemySide]) {
            if ((nlUseDefeat || !ch.isHidden) && getEffectivePower(newState, ch, nlOpponent) <= 2) {
              nlValidT2.push(ch.instanceId);
            }
          }
        }

        if (nlValidT1.length === 0 && nlValidT2.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, nlPlayer,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (Legendary): No valid targets (state changed).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
          break;
        }

        // If isUpgrade and not already using defeat, chain to CONFIRM_UPGRADE_MODIFIER first
        if (pendingEffect.isUpgrade && !nlUseDefeat) {
          const nlmEffId = generateInstanceId();
          const nlmActId = generateInstanceId();
          newState.pendingEffects.push({
            id: nlmEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: nlMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: nlMI }),
            targetSelectionType: 'NARUTO_LEGENDARY_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: nlPlayer, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: nlmActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlPlayer,
            description: 'Naruto Uzumaki (Legendary): Apply UPGRADE? Defeat both targets instead of hiding them.',
            descriptionKey: 'game.effect.desc.narutoLegendaryConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: nlmEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        if (nlValidT1.length > 0) {
          const nlEffId = generateInstanceId();
          const nlActId = generateInstanceId();
          newState.pendingEffects.push({
            id: nlEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: nlMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: nlMI, useDefeat: nlUseDefeat }),
            targetSelectionType: 'NARUTO_LEGENDARY_CHOOSE_TARGET1',
            sourcePlayer: nlPlayer, requiresTargetSelection: true,
            validTargets: nlValidT1, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: nlActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlPlayer,
            description: nlUseDefeat
              ? 'Naruto Uzumaki (Legendary): Choose an enemy with Power 5 or less to defeat (this mission).'
              : 'Naruto Uzumaki (Legendary): Choose an enemy with Power 5 or less to hide (this mission).',
            descriptionKey: nlUseDefeat ? 'game.effect.desc.narutoLegendaryDefeatTarget1' : 'game.effect.desc.narutoLegendaryHideTarget1',
            options: nlValidT1, minSelections: 1, maxSelections: 1,
            sourceEffectId: nlEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        } else {
          // No target1, skip to target2 only
          const nlEffId2 = generateInstanceId();
          const nlActId2 = generateInstanceId();
          newState.pendingEffects.push({
            id: nlEffId2, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: nlMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useDefeat: nlUseDefeat, target1Id: null }),
            targetSelectionType: 'NARUTO_LEGENDARY_CHOOSE_TARGET2',
            sourcePlayer: nlPlayer, requiresTargetSelection: true,
            validTargets: nlValidT2, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: nlActId2, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlPlayer,
            description: nlUseDefeat
              ? 'Naruto Uzumaki (Legendary): Choose an enemy with Power 2 or less to defeat (any mission).'
              : 'Naruto Uzumaki (Legendary): Choose an enemy with Power 2 or less to hide (any mission).',
            descriptionKey: nlUseDefeat ? 'game.effect.desc.narutoLegendaryDefeatTarget2' : 'game.effect.desc.narutoLegendaryHideTarget2',
            options: nlValidT2, minSelections: 1, maxSelections: 1,
            sourceEffectId: nlEffId2,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'NARUTO_LEGENDARY_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed UPGRADE modifier: defeat instead of hide — re-enter CONFIRM_MAIN with useDefeat: true
        const nlmPlayer = pendingEffect.sourcePlayer;
        const nlmOpponent: PlayerID = nlmPlayer === 'player1' ? 'player2' : 'player1';
        const nlmEnemySide: 'player1Characters' | 'player2Characters' =
          nlmPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let nlmParsed: { missionIndex?: number } = {};
        try { nlmParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const nlmMI = nlmParsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const nlmMission = newState.activeMissions[nlmMI];
        if (!nlmMission) break;

        // UPGRADE modifier = defeat mode: include hidden chars (power 0 qualifies)
        const nlmValidT1 = nlmMission[nlmEnemySide]
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, nlmOpponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId);
        const nlmValidT2: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const ch of newState.activeMissions[i][nlmEnemySide]) {
            if (getEffectivePower(newState, ch, nlmOpponent) <= 2) {
              nlmValidT2.push(ch.instanceId);
            }
          }
        }

        if (nlmValidT1.length === 0 && nlmValidT2.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, nlmPlayer,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (Legendary): No valid targets (state changed after modifier).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
          break;
        }

        if (nlmValidT1.length > 0) {
          const nlmEffId = generateInstanceId();
          const nlmActId = generateInstanceId();
          newState.pendingEffects.push({
            id: nlmEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: nlmMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: nlmMI, useDefeat: true }),
            targetSelectionType: 'NARUTO_LEGENDARY_CHOOSE_TARGET1',
            sourcePlayer: nlmPlayer, requiresTargetSelection: true,
            validTargets: nlmValidT1, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: nlmActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlmPlayer,
            description: 'Naruto Uzumaki (Legendary): Choose an enemy with Power 5 or less to defeat (this mission).',
            descriptionKey: 'game.effect.desc.narutoLegendaryDefeatTarget1',
            options: nlmValidT1, minSelections: 1, maxSelections: 1,
            sourceEffectId: nlmEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        } else {
          const nlmEffId2 = generateInstanceId();
          const nlmActId2 = generateInstanceId();
          newState.pendingEffects.push({
            id: nlmEffId2, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: nlmMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useDefeat: true, target1Id: null }),
            targetSelectionType: 'NARUTO_LEGENDARY_CHOOSE_TARGET2',
            sourcePlayer: nlmPlayer, requiresTargetSelection: true,
            validTargets: nlmValidT2, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: nlmActId2, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlmPlayer,
            description: 'Naruto Uzumaki (Legendary): Choose an enemy with Power 2 or less to defeat (any mission).',
            descriptionKey: 'game.effect.desc.narutoLegendaryDefeatTarget2',
            options: nlmValidT2, minSelections: 1, maxSelections: 1,
            sourceEffectId: nlmEffId2,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'NARUTO_LEGENDARY_CHOOSE_TARGET1': {
        // Stage 1: hide or defeat the chosen enemy (Power ≤5 in this mission), then prompt for target 2
        let nlParsedT1: { missionIndex?: number; useDefeat?: boolean } = {};
        try { nlParsedT1 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const nlUseDefeatT1 = nlParsedT1.useDefeat ?? false;
        const nlPlayerT1 = pendingEffect.sourcePlayer;
        const nlOpponentT1: PlayerID = nlPlayerT1 === 'player1' ? 'player2' : 'player1';
        const nlEnemySideT1 = nlPlayerT1 === 'player1' ? 'player2Characters' : 'player1Characters';

        if (nlUseDefeatT1) {
          newState = EffectEngine.defeatCharacter(newState, targetId, nlPlayerT1);
        } else {
          newState = EffectEngine.hideCharacterWithLog(newState, targetId, nlPlayerT1);
        }

        // Find valid targets for target 2: enemy Power ≤2 in ANY mission
        const nlValidT2a: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const ch of newState.activeMissions[i][nlEnemySideT1]) {
            if (!nlUseDefeatT1 && ch.isHidden) continue;
            const power = calculateCharacterPower(newState, ch, nlOpponentT1);
            if (power <= 2) {
              nlValidT2a.push(ch.instanceId);
            }
          }
        }

        if (nlValidT2a.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, nlPlayerT1,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (Legendary): No valid second enemy with Power 2 or less in play.',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' });
        } else if (nlValidT2a.length === 1) {
          if (nlUseDefeatT1) {
            newState = EffectEngine.defeatCharacter(newState, nlValidT2a[0], nlPlayerT1);
          } else {
            newState = EffectEngine.hideCharacterWithLog(newState, nlValidT2a[0], nlPlayerT1);
          }
        } else {
          const nlEffId2a = generateInstanceId();
          const nlActId2a = generateInstanceId();
          newState.pendingEffects.push({
            id: nlEffId2a, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useDefeat: nlUseDefeatT1, target1Id: targetId }),
            targetSelectionType: 'NARUTO_LEGENDARY_CHOOSE_TARGET2',
            sourcePlayer: nlPlayerT1, requiresTargetSelection: true,
            validTargets: nlValidT2a, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: nlActId2a, type: 'SELECT_TARGET' as PendingAction['type'],
            player: nlPlayerT1,
            description: nlUseDefeatT1
              ? 'Naruto Uzumaki (Legendary): Choose an enemy with Power 2 or less to defeat (any mission).'
              : 'Naruto Uzumaki (Legendary): Choose an enemy with Power 2 or less to hide (any mission).',
            descriptionKey: nlUseDefeatT1 ? 'game.effect.desc.narutoLegendaryDefeatTarget2' : 'game.effect.desc.narutoLegendaryHideTarget2',
            options: nlValidT2a, minSelections: 1, maxSelections: 1,
            sourceEffectId: nlEffId2a,
          });
        }
        break;
      }

      case 'NARUTO_LEGENDARY_CHOOSE_TARGET2': {
        let nlParsedT2: { useDefeat?: boolean } = {};
        try { nlParsedT2 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (nlParsedT2.useDefeat) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        } else {
          newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
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

      // --- MSS 01: Call for Support CONFIRM ---
      case 'MSS01_CONFIRM_SCORE': {
        const m01Player = pendingEffect.sourcePlayer;
        // Re-check: find all characters in play
        const m01Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            m01Targets.push(char.instanceId);
          }
        }
        if (m01Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m01Player,
            'SCORE_NO_TARGET', 'MSS 01 (Call for Support): No characters in play (state changed).',
            'game.log.effect.noTarget', { card: 'Appel de soutien', id: 'KS-001-MMS' });
          break;
        }
        // Child: target selection (mandatory after CONFIRM)
        const m01EffId = generateInstanceId();
        const m01ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: m01EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'MSS01_POWERUP_TARGET',
          sourcePlayer: m01Player, requiresTargetSelection: true,
          validTargets: m01Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: m01ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: m01Player,
          description: 'MSS 01 (Call for Support): Choose a character to give POWERUP 2.',
          descriptionKey: 'game.effect.desc.mss01Powerup',
          options: m01Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: m01EffId,
        });
        break;
      }

      // --- MSS 03: Find the Traitor CONFIRM ---
      case 'MSS03_CONFIRM_SCORE': {
        const m03Player = pendingEffect.sourcePlayer;
        const m03OpponentId = m03Player === 'player1' ? 'player2' : 'player1';
        const m03OpponentHand = newState[m03OpponentId].hand;

        if (m03OpponentHand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m03Player,
            'SCORE_NO_TARGET', 'MSS 03 (Find the Traitor): Opponent has no cards (state changed).',
            'game.log.effect.noTarget', { card: 'Trouver le traitre', id: 'KS-003-MMS' });
          break;
        }

        if (m03OpponentHand.length === 1) {
          // Auto-discard the only card
          const m03Ps = { ...newState[m03OpponentId], hand: [...m03OpponentHand], discardPile: [...newState[m03OpponentId].discardPile] };
          const [m03Discarded] = m03Ps.hand.splice(0, 1);
          m03Ps.discardPile.push(m03Discarded);
          newState[m03OpponentId] = m03Ps;
          newState.log = logAction(newState.log, newState.turn, newState.phase, m03Player,
            'SCORE_DISCARD', `MSS 03 (Find the Traitor): Opponent discarded ${m03Discarded.name_fr} from hand.`,
            'game.log.score.discard', { card: 'Trouver le traitre', count: 1 });
          break;
        }

        // Multiple cards: opponent must choose (mandatory)
        const m03HandIndices = m03OpponentHand.map((_: unknown, i: number) => String(i));
        const m03EffId = generateInstanceId();
        const m03ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: m03EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'MSS03_OPPONENT_DISCARD',
          sourcePlayer: m03Player, requiresTargetSelection: true,
          validTargets: m03HandIndices, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: m03ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: m03OpponentId,
          description: 'MSS 03 (Find the Traitor): Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.mss03OpponentDiscard',
          options: m03HandIndices, minSelections: 1, maxSelections: 1,
          sourceEffectId: m03EffId,
        });
        break;
      }

      // --- MSS 04: Assassination CONFIRM ---
      case 'MSS04_CONFIRM_SCORE': {
        const m04Player = pendingEffect.sourcePlayer;
        const m04EnemySide: 'player1Characters' | 'player2Characters' =
          m04Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const m04Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const c of mission[m04EnemySide]) {
            if (c.isHidden) m04Targets.push(c.instanceId);
          }
        }

        if (m04Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m04Player,
            'SCORE_NO_TARGET', 'MSS 04 (Assassination): No hidden enemies (state changed).',
            'game.log.effect.noTarget', { card: 'Assassinat', id: 'KS-004-MMS' });
          break;
        }

        if (m04Targets.length === 1) {
          // Auto-defeat the only hidden enemy
          newState = EffectEngine.defeatCharacter(newState, m04Targets[0], m04Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, m04Player,
            'SCORE_DEFEAT', 'MSS 04 (Assassination): Defeated the only hidden enemy character.',
            'game.log.score.defeat', { card: 'Assassinat', target: m04Targets[0] });
          break;
        }

        // Multiple: child target selection (mandatory after CONFIRM)
        const m04EffId = generateInstanceId();
        const m04ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: m04EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'MSS04_DEFEAT_HIDDEN',
          sourcePlayer: m04Player, requiresTargetSelection: true,
          validTargets: m04Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: m04ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: m04Player,
          description: 'MSS 04 (Assassination): Choose a hidden enemy character to defeat.',
          descriptionKey: 'game.effect.desc.mss04DefeatHidden',
          options: m04Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: m04EffId,
        });
        break;
      }

      // --- MSS 06: Rescue a Friend CONFIRM ---
      case 'MSS06_CONFIRM_SCORE': {
        const m06Player = pendingEffect.sourcePlayer;
        const m06Ps = newState[m06Player];
        if (m06Ps.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m06Player,
            'SCORE_NO_DRAW', 'MSS 06 (Rescue a Friend): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'Sauvetage d\'un ami', id: 'KS-006-MMS' });
          break;
        }
        const m06NewPs = { ...m06Ps, deck: [...m06Ps.deck], hand: [...m06Ps.hand] };
        const m06Drawn = m06NewPs.deck.shift()!;
        m06NewPs.hand.push(m06Drawn);
        newState[m06Player] = m06NewPs;
        newState.log = logAction(newState.log, newState.turn, newState.phase, m06Player,
          'SCORE_DRAW', 'MSS 06 (Rescue a Friend): Drew 1 card.',
          'game.log.score.draw', { card: 'Sauvetage d\'un ami', count: 1 });
        break;
      }

      // --- MSS 07: I Have to Go CONFIRM ---
      case 'MSS07_CONFIRM_SCORE': {
        const m07Player = pendingEffect.sourcePlayer;
        const m07FriendlySide: 'player1Characters' | 'player2Characters' =
          m07Player === 'player1' ? 'player1Characters' : 'player2Characters';

        const m07Targets: string[] = [];
        const m07CharMissionMap: Record<string, number> = {};
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const c of newState.activeMissions[i][m07FriendlySide]) {
            if (c.isHidden && newState.activeMissions.length > 1) {
              m07Targets.push(c.instanceId);
              m07CharMissionMap[c.instanceId] = i;
            }
          }
        }

        if (m07Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m07Player,
            'SCORE_NO_TARGET', 'MSS 07 (I Have to Go): No hidden friendly characters (state changed).',
            'game.log.effect.noTarget', { card: 'Je dois partir', id: 'KS-007-MMS' });
          break;
        }

        if (m07Targets.length === 1) {
          // Skip character selection, go straight to destination (SKIP on char, mandatory on dest)
          const m07CharId = m07Targets[0];
          const m07FromMI = m07CharMissionMap[m07CharId];
          const m07OtherMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== m07FromMI) m07OtherMissions.push(String(i));
          }

          if (m07OtherMissions.length === 1) {
            // Only one destination: auto-resolve
            newState = EffectEngine.mss07ApplyMove(newState, m07CharId, m07FromMI, parseInt(m07OtherMissions[0], 10), m07Player);
            break;
          }

          // Multiple destinations: mandatory destination selection
          const m07dEffId = generateInstanceId();
          const m07dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: m07dEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: 'SCORE' as EffectType,
            effectDescription: JSON.stringify({ charId: m07CharId, fromMissionIndex: m07FromMI }),
            targetSelectionType: 'MSS07_CHOOSE_DESTINATION',
            sourcePlayer: m07Player, requiresTargetSelection: true,
            validTargets: m07OtherMissions, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: m07dActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: m07Player,
            description: 'MSS 07 (I Have to Go): Choose a mission to move the hidden character to.',
            descriptionKey: 'game.effect.desc.mss07MoveDest',
            options: m07OtherMissions, minSelections: 1, maxSelections: 1,
            sourceEffectId: m07dEffId,
          });
          break;
        }

        // Multiple hidden chars: child character selection (mandatory after CONFIRM)
        const m07EffId = generateInstanceId();
        const m07ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: m07EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'MSS07_MOVE_HIDDEN',
          sourcePlayer: m07Player, requiresTargetSelection: true,
          validTargets: m07Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: m07ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: m07Player,
          description: 'MSS 07 (I Have to Go): Choose a hidden friendly character to move.',
          descriptionKey: 'game.effect.desc.mss07MoveHidden',
          options: m07Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: m07EffId,
        });
        break;
      }

      // --- MSS 08: Set a Trap CONFIRM ---
      case 'MSS08_CONFIRM_SCORE': {
        const m08Player = pendingEffect.sourcePlayer;
        const m08Hand = newState[m08Player].hand;

        if (m08Hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m08Player,
            'SCORE_NO_TARGET', 'MSS 08 (Set a Trap): No cards in hand (state changed).',
            'game.log.effect.noTarget', { card: 'Tendre un piege', id: 'KS-008-MMS' });
          break;
        }
        if (newState.activeMissions.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m08Player,
            'SCORE_NO_TARGET', 'MSS 08 (Set a Trap): No active missions (state changed).',
            'game.log.effect.noTarget', { card: 'Tendre un piege', id: 'KS-008-MMS' });
          break;
        }

        // Child: card selection (mandatory after CONFIRM)
        const m08HandIndices = m08Hand.map((_: unknown, i: number) => String(i));
        const m08EffId = generateInstanceId();
        const m08ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: m08EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'MSS08_CHOOSE_CARD',
          sourcePlayer: m08Player, requiresTargetSelection: true,
          validTargets: m08HandIndices, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: m08ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: m08Player,
          description: 'MSS 08 (Set a Trap): Choose a card from your hand to place as a hidden character.',
          descriptionKey: 'game.effect.desc.mss08ChooseCard',
          options: m08HandIndices, minSelections: 1, maxSelections: 1,
          sourceEffectId: m08EffId,
        });
        break;
      }

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

      // --- Gaara 153 (M) â€' same logic as 139 (S) ---
      case 'GAARA153_DEFEAT_BY_COST': {
        const gaara153Info = EffectEngine.findCharByInstanceId(newState, targetId);
        const gaara153DefeatedName = gaara153Info ? gaara153Info.character.card.name_fr : '';
        const gaara153DefeatedCost = gaara153Info
          ? (gaara153Info.character.stack?.length > 0
              ? gaara153Info.character.stack[gaara153Info.character.stack?.length - 1]
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
              const tc = ch.stack?.length > 0 ? ch.stack[ch.stack?.length - 1] : ch.card;
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
          ? (gaara139Info.character.stack?.length > 0
              ? gaara139Info.character.stack[gaara139Info.character.stack?.length - 1]
              : gaara139Info.character.card
            ).chakra
          : 0;

        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        // Check if UPGRADE modifier was confirmed (useHideSameName from description)
        let g139DefeatParsed: { useHideSameName?: boolean } = {};
        try { g139DefeatParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const g139UseHide = g139DefeatParsed.useHideSameName ?? false;

        if (g139UseHide && gaara139DefeatedName) {
          const opponentPlayer = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const gaara139EnemySide: 'player1Characters' | 'player2Characters' =
            opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

          const hideTargets: string[] = [];
          for (let mi = 0; mi < newState.activeMissions.length; mi++) {
            for (const ch of newState.activeMissions[mi][gaara139EnemySide]) {
              if (ch.isHidden) continue;
              if (ch.instanceId === targetId) continue;
              const tc = ch.stack?.length > 0 ? ch.stack[ch.stack?.length - 1] : ch.card;
              if (tc.name_fr === gaara139DefeatedName && tc.chakra < gaara139DefeatedCost) {
                hideTargets.push(ch.instanceId);
              }
            }
          }

          if (hideTargets.length > 0) {
            if (hideTargets.length === 1) {
              // Auto-hide the single target
              newState = EffectEngine.hideCharacterWithLog(newState, hideTargets[0], pendingEffect.sourcePlayer);
            } else {
              // Multiple targets — let player choose
              const g139HideEffId = generateInstanceId();
              const g139HideActId = generateInstanceId();
              newState.pendingEffects = [...newState.pendingEffects, {
                id: g139HideEffId,
                sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: 'UPGRADE' as const,
                effectDescription: JSON.stringify({ defeatedName: gaara139DefeatedName }),
                targetSelectionType: 'GAARA139_HIDE_SAME_NAME',
                sourcePlayer: pendingEffect.sourcePlayer,
                requiresTargetSelection: true,
                validTargets: hideTargets,
                isOptional: false,
                isMandatory: true,
                resolved: false,
                isUpgrade: true,
                remainingEffectTypes: pendingEffect.remainingEffectTypes,
              }];
              newState.pendingActions = [...newState.pendingActions, {
                id: g139HideActId,
                type: 'SELECT_TARGET' as const,
                player: pendingEffect.sourcePlayer,
                description: `Gaara (139) UPGRADE: Choose an enemy ${gaara139DefeatedName} to hide.`,
                descriptionKey: 'game.effect.desc.gaara139HideSameName',
                descriptionParams: { target: gaara139DefeatedName },
                options: hideTargets,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: g139HideEffId,
              }];
              pendingEffect.remainingEffectTypes = undefined;
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
      case 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY': {
        if (pendingEffect.isUpgrade) {
          // Upgrade: steal ALL tokens, no choice needed
          newState = EffectEngine.stealTokensFromTarget(newState, pendingEffect, targetId, 99);
        } else {
          // Non-upgrade: chain a second pending to choose how many tokens to steal (1 or 2)
          const charResultStealPlay = EffectEngine.findCharByInstanceId(newState, targetId);
          if (charResultStealPlay) {
            const availableTokensStealPlay = charResultStealPlay.character.powerTokens;
            const amountOptionsStealPlay = availableTokensStealPlay >= 2 ? ['1', '2'] : ['1'];
            const step2StealPlay: EffectResult = {
              state: newState,
              requiresTargetSelection: true,
              targetSelectionType: 'CHOOSE_TOKEN_AMOUNT_STEAL',
              validTargets: amountOptionsStealPlay,
              description: JSON.stringify({
                text: `Choose how many Power tokens to steal from ${charResultStealPlay.character.card.name_fr}.`,
                targetInstanceId: targetId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
              }),
              descriptionKey: 'game.effect.desc.chooseTokenAmountSteal',
            };
            newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
            newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
            const sourceCharStealPlay = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
            return EffectEngine.createPendingTargetSelection(
              newState, pendingEffect.sourcePlayer,
              sourceCharStealPlay?.character ?? null,
              pendingEffect.sourceMissionIndex,
              pendingEffect.effectType, pendingEffect.isUpgrade, step2StealPlay, [],
            );
          }
        }
        break;
      }

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
          const tTop = tenten118Char.character.stack?.length > 0
            ? tenten118Char.character.stack[tenten118Char.character.stack?.length - 1]
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
      // KIBA113 / KIBA149: Confirmation popups (like Sasuke 146)
      // =============================================
      case 'KIBA113_CONFIRM_MAIN':
      case 'KIBA149_CONFIRM_MAIN': {
        // Player confirmed MAIN effect activation
        const isK149 = pendingEffect.targetSelectionType === 'KIBA149_CONFIRM_MAIN';
        const cardLabel = isK149 ? 'KS-113-MV' : 'KS-113-R';
        let confirmData: { sourceMissionIndex: number; sourceCardInstanceId: string; isUpgrade: string } | null = null;
        try { confirmData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (!confirmData) break;

        const isUpgradeMode = confirmData.isUpgrade === 'true';
        const srcMI_c = confirmData.sourceMissionIndex;

        if (isUpgradeMode) {
          // Show UPGRADE confirmation popup (optional)
          const upgradeEffId = generateInstanceId();
          const upgradeActId = generateInstanceId();
          const upgradeType = isK149 ? 'KIBA149_CONFIRM_UPGRADE' : 'KIBA113_CONFIRM_UPGRADE';
          const upgradeDescKey = isK149 ? 'game.effect.desc.kiba149ConfirmUpgrade' : 'game.effect.desc.kiba113ConfirmUpgrade';
          newState.pendingEffects = [...newState.pendingEffects, {
            id: upgradeEffId,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: srcMI_c,
            effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: upgradeType,
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: [confirmData.sourceCardInstanceId],
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: true,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: upgradeActId,
            type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: isK149
              ? 'Kiba Inuzuka (113 MV) UPGRADE: Instead, defeat both of them.'
              : 'Kiba Inuzuka (113) UPGRADE: Instead, defeat both of them.',
            descriptionKey: upgradeDescKey,
            options: [confirmData.sourceCardInstanceId],
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: upgradeEffId,
          }];
        } else {
          // No upgrade - proceed directly to target selection (hide mode)
          if (isK149) {
            // Kiba 149: auto-pick first Akamaru, hide it, then ask for second target
            newState = EffectEngine.kiba149ExecuteStep1(newState, pendingEffect, false);
          } else {
            // Kiba 113: ask player to choose Akamaru
            newState = EffectEngine.kiba113QueueAkamaruChoice(newState, pendingEffect, false);
          }
        }
        break;
      }

      case 'KIBA113_CONFIRM_UPGRADE':
      case 'KIBA149_CONFIRM_UPGRADE': {
        // Player confirmed UPGRADE modification → use defeat mode
        const isK149_u = pendingEffect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE';
        if (isK149_u) {
          newState = EffectEngine.kiba149ExecuteStep1(newState, pendingEffect, true);
        } else {
          newState = EffectEngine.kiba113QueueAkamaruChoice(newState, pendingEffect, true);
        }
        break;
      }

      // =============================================
      // Confirmation popups for instant effects (batch 1: KS-001 to KS-010)
      // =============================================
      case 'HIRUZEN001_CONFIRM_MAIN': {
        // Player confirmed — re-compute Leaf Village targets and queue POWERUP_2_LEAF_VILLAGE
        const h001Targets: string[] = [];
        const h001FriendlySide = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        for (const mission of newState.activeMissions) {
          for (const char of mission[h001FriendlySide]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.group === 'Leaf Village') h001Targets.push(char.instanceId);
          }
        }
        if (h001Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Hiruzen Sarutobi (001): No valid Leaf Village target for POWERUP 2.',
            'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: 'KS-001-C' });
          break;
        }
        const h001EffId = generateInstanceId();
        const h001ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: h001EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'POWERUP_2_LEAF_VILLAGE',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: h001Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: h001ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a friendly Leaf Village character to give POWERUP 2.',
          descriptionKey: 'game.effect.desc.hiruzen001Powerup',
          options: h001Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: h001EffId,
        }];
        break;
      }

      case 'HIRUZEN002_CONFIRM_MAIN': {
        // Always queue card choice — UPGRADE handled via remainingEffectTypes after MAIN completes
        newState = EffectEngine.queueHiruzen002Choose(newState, pendingEffect, pendingEffect.isUpgrade);
        pendingEffect.remainingEffectTypes = undefined; // propagated into queueHiruzen002Choose
        break;
      }

      case 'HIRUZEN002_CONFIRM_UPGRADE': {
        // Player confirmed UPGRADE — apply POWERUP 2 to the character played by MAIN
        let h002UpgMeta: { playedCharId?: string } = {};
        try { h002UpgMeta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const h002PlayedId = h002UpgMeta.playedCharId;
        if (!h002PlayedId) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Hiruzen Sarutobi (002): No character to POWERUP 2 (UPGRADE).',
            'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' });
          break;
        }
        const h002Res = EffectEngine.findCharByInstanceId(newState, h002PlayedId);
        if (h002Res) {
          const missions_h002u = [...newState.activeMissions];
          const m_h002u = { ...missions_h002u[h002Res.missionIndex] };
          const side_h002u = h002Res.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m_h002u[side_h002u] = m_h002u[side_h002u].map((c: CharacterInPlay) =>
            c.instanceId === h002PlayedId ? { ...c, powerTokens: c.powerTokens + 2 } : c
          );
          missions_h002u[h002Res.missionIndex] = m_h002u;
          newState = { ...newState, activeMissions: missions_h002u };
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', 'Hiruzen Sarutobi (002): POWERUP 2 applied to the played character (UPGRADE effect).',
            'game.log.effect.powerup', { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', amount: '2' });
        }
        // Clean up metadata
        delete (newState as any)._hiruzen002PlayedCharId;
        break;
      }

      case 'TSUNADE004_CONFIRM_UPGRADE': {
        // Player confirmed — re-compute discard targets and queue RECOVER_FROM_DISCARD
        const t004Player = pendingEffect.sourcePlayer;
        const t004Discard = newState[t004Player].discardPile;
        const t004Targets: string[] = [];
        for (let idx = 0; idx < t004Discard.length; idx++) {
          if (t004Discard[idx].card_type === 'character') t004Targets.push(String(idx));
        }
        if (t004Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t004Player,
            'EFFECT_NO_TARGET', 'Tsunade (004): No characters in discard pile to recover.',
            'game.log.effect.noTarget', { card: 'TSUNADE', id: 'KS-004-UC' });
          break;
        }
        const t004EffId = generateInstanceId();
        const t004ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: t004EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'RECOVER_FROM_DISCARD',
          sourcePlayer: t004Player, requiresTargetSelection: true,
          validTargets: t004Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: t004ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: t004Player,
          description: 'Choose a character from your discard pile to put into your hand.',
          descriptionKey: 'game.effect.desc.tsunade004RecoverFromDiscard',
          options: t004Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: t004EffId,
        }];
        break;
      }

      case 'SHIZUNE006_CONFIRM_MAIN': {
        // Player confirmed — re-compute enemy targets with power ≤ 3
        const s006Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const s006EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const s006Targets: string[] = [];
        for (let s006mIdx = 0; s006mIdx < newState.activeMissions.length; s006mIdx++) {
          // Skip missions where Kurenai blocks enemy movement
          if (isMovementBlockedByKurenai(newState, s006mIdx, s006Opponent)) continue;
          const s006Mission = newState.activeMissions[s006mIdx];
          for (const char of (s006Mission as any)[s006EnemySide]) {
            if (getEffectivePower(newState, char, s006Opponent) <= 3) {
              // Pre-check: at least one destination must not have same-name conflict
              const s006TopCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
              const s006CharName = s006TopCard.name_fr;
              const s006HasDest = newState.activeMissions.some((m: any, i: number) => {
                if (i === s006mIdx) return false;
                return !m[s006EnemySide].some((c: any) => {
                  if (c.instanceId === char.instanceId) return false;
                  if (c.isHidden) return false;
                  const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                  return cTop.name_fr === s006CharName;
                });
              });
              if (!s006HasDest) continue;
              s006Targets.push(char.instanceId);
            }
          }
        }
        if (s006Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Shizune (006): No enemy character with Power 3 or less in play to move.',
            'game.log.effect.noTarget', { card: 'SHIZUNE', id: 'KS-006-UC' });
          break;
        }
        const s006EffId = generateInstanceId();
        const s006ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s006EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_ENEMY_POWER_3_OR_LESS',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: s006Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s006ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character with Power 3 or less to move to another mission.',
          descriptionKey: 'game.effect.desc.shizune006MoveEnemy',
          options: s006Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s006EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'SHIZUNE006_CONFIRM_UPGRADE': {
        // Player confirmed — apply +2 chakra directly
        const s006uPlayer = pendingEffect.sourcePlayer;
        const s006uPs = { ...newState[s006uPlayer] };
        s006uPs.chakra += 2;
        newState = { ...newState, [s006uPlayer]: s006uPs };
        newState.log = logAction(newState.log, newState.turn, newState.phase, s006uPlayer,
          'EFFECT_CHAKRA', 'Shizune (006): Gained 2 Chakra (upgrade effect).',
          'game.log.effect.gainChakra', { card: 'SHIZUNE', id: 'KS-006-UC', amount: '2' });
        break;
      }

      case 'JIRAIYA007_CONFIRM_MAIN': {
        // Player confirmed — re-compute summon targets and queue JIRAIYA_CHOOSE_SUMMON
        const j007Hand = findAffordableSummonsInHand(newState, pendingEffect.sourcePlayer, 1);
        const j007Hidden = findHiddenSummonsOnBoard(newState, pendingEffect.sourcePlayer, 1);
        const j007Targets = [
          ...j007Hand.map(i => `HAND_${i}`),
          ...j007Hidden.map(h => `HIDDEN_${h.instanceId}`),
        ];
        if (j007Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Jiraiya (007): No affordable Summon characters available.',
            'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-007-C' });
          break;
        }
        const j007EffId = generateInstanceId();
        const j007ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: j007EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ hiddenChars: j007Hidden, costReduction: 1 }),
          targetSelectionType: 'JIRAIYA_CHOOSE_SUMMON',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: j007Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: j007ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: JSON.stringify({
            text: 'Jiraiya (007): Choose a Summon character to play (paying 1 less).',
            hiddenChars: j007Hidden, costReduction: 1,
          }),
          descriptionKey: 'game.effect.desc.jiraiya007ChooseSummon',
          options: j007Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: j007EffId,
        }];
        break;
      }

      case 'JIRAIYA008_CONFIRM_MAIN': {
        // Player confirmed — re-compute summon targets and queue JIRAIYA008_CHOOSE_SUMMON
        const j008Hand = findAffordableSummonsInHand(newState, pendingEffect.sourcePlayer, 2);
        const j008Hidden = findHiddenSummonsOnBoard(newState, pendingEffect.sourcePlayer, 2);
        const j008Targets = [
          ...j008Hand.map(i => `HAND_${i}`),
          ...j008Hidden.map(h => `HIDDEN_${h.instanceId}`),
        ];
        if (j008Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Jiraiya (008): No affordable Summon characters available.',
            'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-008-UC' });
          break;
        }
        const j008EffId = generateInstanceId();
        const j008ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: j008EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ hiddenChars: j008Hidden, costReduction: 2 }),
          targetSelectionType: 'JIRAIYA008_CHOOSE_SUMMON',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: j008Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: j008ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: JSON.stringify({
            text: 'Jiraiya (008): Choose a Summon character to play (paying 2 less).',
            hiddenChars: j008Hidden, costReduction: 2,
          }),
          descriptionKey: 'game.effect.desc.jiraiya008ChooseSummon',
          options: j008Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: j008EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'JIRAIYA008_CONFIRM_UPGRADE': {
        // Player confirmed — re-compute hide targets and queue JIRAIYA_HIDE_ENEMY_COST_3
        let j008uData: { sourceMissionIndex?: number } | null = null;
        try { j008uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const j008uMIdx = j008uData?.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const j008uEnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const j008uMission = newState.activeMissions[j008uMIdx];
        const j008uTargets: string[] = [];
        if (j008uMission) {
          for (const char of (j008uMission as any)[j008uEnemySide]) {
            if (char.isHidden) continue;
            const tc = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (tc.chakra <= 3) j008uTargets.push(char.instanceId);
          }
        }
        if (j008uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Jiraiya (008): No enemy character with cost 3 or less to hide (upgrade).',
            'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-008-UC' });
          break;
        }
        const j008uEffId = generateInstanceId();
        const j008uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: j008uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: j008uMIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'JIRAIYA_HIDE_ENEMY_COST_3',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: j008uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: j008uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Jiraiya (008): Select an enemy character with cost 3 or less in this mission to hide (upgrade effect).',
          descriptionKey: 'game.effect.desc.jiraiya008HideEnemy',
          options: j008uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: j008uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'NARUTO010_CONFIRM_AMBUSH': {
        // Player confirmed — re-compute valid destination missions and queue NARUTO_MOVE_SELF
        let n010Data: { sourceMissionIndex?: number } | null = null;
        try { n010Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n010MIdx = n010Data?.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const n010FriendlySide = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        // Find the source character to get name
        let n010CharName = 'NARUTO UZUMAKI';
        const n010SrcMission = newState.activeMissions[n010MIdx];
        if (n010SrcMission) {
          for (const c of (n010SrcMission as any)[n010FriendlySide]) {
            if (c.instanceId === pendingEffect.sourceInstanceId) {
              const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              n010CharName = top.name_fr;
              break;
            }
          }
        }

        const n010Targets: string[] = [];
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          if (mIdx === n010MIdx) continue;
          const mission = newState.activeMissions[mIdx];
          const friendlyChars = (mission as any)[n010FriendlySide];
          const hasSameName = friendlyChars.some((c: CharacterInPlay) => {
            if (c.instanceId === pendingEffect.sourceInstanceId) return false;
            const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return top.name_fr === n010CharName;
          });
          if (!hasSameName) n010Targets.push(String(mIdx));
        }
        if (n010Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (010): No valid mission to move to.',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-010-C' });
          break;
        }
        const n010EffId = generateInstanceId();
        const n010ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: n010EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: n010MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'NARUTO_MOVE_SELF',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: n010Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: n010ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a mission to move Naruto Uzumaki to.',
          descriptionKey: 'game.effect.desc.naruto010MoveSelf',
          options: n010Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: n010EffId,
        }];
        break;
      }

      // =============================================
      // BATCH 2 CONFIRM CASES (KS-011 to KS-020)
      // =============================================

      case 'CHOJI017_CONFIRM_MAIN': {
        // Apply POWERUP 3 on self immediately
        const c017Res = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (c017Res) {
          const missions017 = [...newState.activeMissions];
          const m017 = { ...missions017[c017Res.missionIndex] };
          const side017 = c017Res.player === 'player1' ? 'player1Characters' : 'player2Characters';
          m017[side017] = m017[side017].map((c: CharacterInPlay) =>
            c.instanceId === pendingEffect.sourceInstanceId ? { ...c, powerTokens: c.powerTokens + 3 } : c
          );
          missions017[c017Res.missionIndex] = m017;
          newState = { ...newState, activeMissions: missions017 };
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_POWERUP', 'Choji Akimichi (017): POWERUP 3 on self.',
            'game.log.effect.powerupSelf', { card: 'CHOJI AKIMICHI', id: 'KS-017-C', amount: 3 });
        }
        break;
      }

      case 'INO019_CONFIRM_MAIN': {
        // Re-verify Team 10 synergy, then apply POWERUP 1 on self immediately
        const i019Res = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!i019Res) break;
        const i019Mission = newState.activeMissions[i019Res.missionIndex];
        const allChars019 = [...i019Mission.player1Characters, ...i019Mission.player2Characters];
        const hasTeam10_019 = allChars019.some((char: CharacterInPlay) => {
          if (char.instanceId === pendingEffect.sourceInstanceId) return false;
          if (char.isHidden) return false;
          const top = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          return top.keywords?.includes('Team 10');
        });
        if (!hasTeam10_019) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Ino Yamanaka (019): No other Team 10 character in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-019-C' });
          break;
        }
        const missions019 = [...newState.activeMissions];
        const m019 = { ...missions019[i019Res.missionIndex] };
        const side019 = i019Res.player === 'player1' ? 'player1Characters' : 'player2Characters';
        m019[side019] = m019[side019].map((c: CharacterInPlay) =>
          c.instanceId === pendingEffect.sourceInstanceId ? { ...c, powerTokens: c.powerTokens + 1 } : c
        );
        missions019[i019Res.missionIndex] = m019;
        newState = { ...newState, activeMissions: missions019 };
        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_POWERUP', 'Ino Yamanaka (019): POWERUP 1 (Team 10 synergy).',
          'game.log.effect.powerupSelf', { card: 'INO YAMANAKA', id: 'KS-019-C', amount: 1 });
        break;
      }

      case 'SAKURA012_CONFIRM_UPGRADE': {
        // Draw 1 card, then chain to SAKURA_012_DISCARD
        const ps012 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps012.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (012): Deck empty, cannot draw.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-012-UC' });
          break;
        }
        const deck012 = [...ps012.deck];
        const drawn012 = deck012.shift()!;
        ps012.deck = deck012;
        ps012.hand = [...ps012.hand, drawn012];
        newState = { ...newState, [pendingEffect.sourcePlayer]: ps012 };
        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW', 'Sakura Haruno (012): Drew 1 card (upgrade). Must discard 1.',
          'game.log.effect.draw', { card: 'SAKURA HARUNO', id: 'KS-012-UC', count: 1 });

        if (ps012.hand.length === 1) {
          // Auto-discard the only card
          const discarded012 = ps012.hand[0];
          const ps012b = { ...newState[pendingEffect.sourcePlayer] };
          ps012b.hand = [];
          ps012b.discardPile = [...ps012b.discardPile, discarded012];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps012b };
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_DISCARD', `Sakura Haruno (012): Auto-discarded ${discarded012.name_fr}.`,
            'game.log.effect.discard', { card: 'SAKURA HARUNO', id: 'KS-012-UC', target: discarded012.name_fr });
          break;
        }
        // Create child pending for discard selection
        const s012Targets = ps012.hand.map((_: any, idx: number) => String(idx));
        const s012EffId = generateInstanceId();
        const s012ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s012EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'SAKURA_012_DISCARD',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: s012Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s012ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'You drew a card. You must discard 1 card from your hand.',
          descriptionKey: 'game.effect.desc.sakura012Discard',
          options: s012Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s012EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'SASUKE014_CONFIRM_AMBUSH': {
        // Re-check opponent hand and chain to reveal
        let s014Meta: { isUpgrade?: boolean } = {};
        try { s014Meta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s014Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const oppHand014 = newState[s014Opponent].hand;

        if (oppHand014.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (014): Opponent hand empty.',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });
          break;
        }

        // If upgrade: prompt UPGRADE modifier BEFORE revealing the hand (like Itachi 091 pattern)
        if (s014Meta.isUpgrade) {
          const s014mEffId = generateInstanceId();
          const s014mActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: s014mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: 'UPGRADE',
            effectDescription: JSON.stringify({ sourceCardInstanceId: pendingEffect.sourceInstanceId }),
            targetSelectionType: 'SASUKE014_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId], isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: s014mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: `Sasuke Uchiwa (014) UPGRADE: In addition, discard 1 card to discard 1 from opponent's hand?`,
            descriptionKey: 'game.effect.desc.sasuke014ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId], minSelections: 1, maxSelections: 1,
            sourceEffectId: s014mEffId,
          }];
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Non-upgrade: reveal hand directly
        const allCards014 = oppHand014.map((c: any, i: number) => ({
          name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
        }));

        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_LOOK_HAND', 'Sasuke Uchiwa (014): Revealed all cards in opponent\'s hand.',
          'game.log.effect.sasuke014Reveal', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });

        const s014EffId = generateInstanceId();
        const s014ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s014EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({
            text: 'Sasuke (014): Opponent\'s hand revealed.',
            cards: allCards014,
          }),
          targetSelectionType: 'SASUKE014_HAND_REVEAL',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: ['confirm'], isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s014ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: JSON.stringify({ text: 'Opponent hand revealed.', cards: allCards014 }),
          descriptionKey: 'game.effect.desc.sasuke014Reveal',
          options: ['confirm'], minSelections: 1, maxSelections: 1,
          sourceEffectId: s014EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'SASUKE014_CONFIRM_UPGRADE_MODIFIER': {
        // Player accepted the UPGRADE modifier — now reveal hand with upgrade flag, then chain to discard
        const s014umOpponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const oppHand014um = newState[s014umOpponent].hand;

        if (oppHand014um.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (014): Opponent hand empty.',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });
          break;
        }

        const allCards014um = oppHand014um.map((c: any, i: number) => ({
          name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
        }));

        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_LOOK_HAND', 'Sasuke Uchiwa (014): Revealed all cards in opponent\'s hand.',
          'game.log.effect.sasuke014Reveal', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });

        // Chain to UPGRADE_HAND_REVEAL (which will show the hand and then chain to discard flow)
        const s014umEffId = generateInstanceId();
        const s014umActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s014umEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({
            text: 'Sasuke (014): Opponent\'s hand revealed.',
            cards: allCards014um,
          }),
          targetSelectionType: 'SASUKE014_UPGRADE_HAND_REVEAL',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: ['confirm'], isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s014umActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: JSON.stringify({ text: 'Opponent hand revealed.', cards: allCards014um }),
          descriptionKey: 'game.effect.desc.sasuke014Reveal',
          options: ['confirm'], minSelections: 1, maxSelections: 1,
          sourceEffectId: s014umEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'SASUKE014_CONFIRM_UPGRADE': {
        // Player confirmed the UPGRADE discard chain — create mandatory discard from own hand
        const opp014u = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ownHand014u = newState[pendingEffect.sourcePlayer].hand;
        const oppHand014u = newState[opp014u].hand;

        if (ownHand014u.length === 0 || oppHand014u.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (014) UPGRADE: Cannot discard — empty hand.',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });
          break;
        }

        const handIndices014u = ownHand014u.map((_: unknown, i: number) => String(i));
        const charResult014u = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        const step014u: EffectResult = {
          state: newState,
          requiresTargetSelection: true,
          targetSelectionType: 'SASUKE_014_DISCARD_OWN',
          validTargets: handIndices014u,
          isMandatory: true,
          description: 'Sasuke Uchiwa (014) UPGRADE: Discard 1 of your cards.',
          descriptionKey: 'game.effect.desc.sasuke014DiscardOwn',
        };
        newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
        return EffectEngine.createPendingTargetSelection(
          newState, pendingEffect.sourcePlayer,
          charResult014u?.character ?? null,
          pendingEffect.sourceMissionIndex,
          'UPGRADE', true, step014u, [],
        );
      }

      case 'KAKASHI016_CONFIRM_MAIN': {
        // If upgrade, chain to UPGRADE confirm popup first
        let k016Meta: { isUpgrade?: boolean } = {};
        try { k016Meta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        if (k016Meta.isUpgrade) {
          // Show UPGRADE confirm popup before executing copy
          const k016UpEffId = generateInstanceId();
          const k016UpActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: k016UpEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: 'UPGRADE',
            effectDescription: JSON.stringify({ sourceCardInstanceId: pendingEffect.sourceInstanceId }),
            targetSelectionType: 'KAKASHI016_CONFIRM_UPGRADE',
            sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId], isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: k016UpActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: 'Kakashi (016) UPGRADE: Instead, there\'s no cost limit.',
            descriptionKey: 'game.effect.desc.kakashi016ConfirmUpgrade',
            options: [pendingEffect.sourceInstanceId], minSelections: 1, maxSelections: 1,
            sourceEffectId: k016UpEffId,
          }];
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Non-upgrade: compute targets with cost 4 limit and chain to copy
        const enemySide016: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k016Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[enemySide016]) {
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.chakra > 4) continue;
            const k016WasRevealed = pendingEffect.wasRevealed ?? false;
            const hasInstant = topCard.effects?.some((eff: { type: string; description: string }) => {
              if (eff.type === 'SCORE') return false;
              if (eff.type === 'UPGRADE') return false; // Kakashi 016 CANNOT copy UPGRADE
              if (eff.type === 'AMBUSH' && !k016WasRevealed) return false;
              if (eff.description.includes('[⧗]')) return false;
              if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
              return true;
            });
            if (hasInstant) k016Targets.push(char.instanceId);
          }
        }
        if (k016Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (016): No valid copy target (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-016-UC' });
          break;
        }
        const k016EffId = generateInstanceId();
        const k016ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k016EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KAKASHI_COPY_EFFECT',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: k016Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: pendingEffect.isUpgrade,
          wasRevealed: pendingEffect.wasRevealed,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k016ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character (cost 4 or less) to copy their effect.',
          descriptionKey: 'game.effect.desc.kakashi016CopyEffect',
          descriptionParams: { costLimit: 'cost 4 or less' },
          options: k016Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k016EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KAKASHI016_CONFIRM_UPGRADE': {
        // UPGRADE confirmed: compute targets with NO cost limit
        const enemySide016u: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k016uWasRevealed = pendingEffect.wasRevealed ?? false;
        const k016uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[enemySide016u]) {
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const hasInstant = topCard.effects?.some((eff: { type: string; description: string }) => {
              if (eff.type === 'SCORE') return false;
              if (eff.type === 'UPGRADE') return false; // Kakashi 016 CANNOT copy UPGRADE
              if (eff.type === 'AMBUSH' && !k016uWasRevealed) return false;
              if (eff.description.includes('[⧗]')) return false;
              if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
              return true;
            });
            if (hasInstant) k016uTargets.push(char.instanceId);
          }
        }
        if (k016uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (016) UPGRADE: No valid copy target.',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-016-UC' });
          break;
        }
        const k016uEffId = generateInstanceId();
        const k016uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k016uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'MAIN',
          effectDescription: '', targetSelectionType: 'KAKASHI_COPY_EFFECT',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: k016uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          wasRevealed: k016uWasRevealed,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k016uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character (any cost) to copy their effect.',
          descriptionKey: 'game.effect.desc.kakashi016CopyEffect',
          descriptionParams: { costLimit: 'any cost' },
          options: k016uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k016uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'CHOJI018_CONFIRM_UPGRADE': {
        // Re-compute valid destination missions for move
        const c018FriendlySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const c018SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!c018SrcChar) break;
        const c018Top = c018SrcChar.character.stack?.length > 0
          ? c018SrcChar.character.stack[c018SrcChar.character.stack?.length - 1]
          : c018SrcChar.character.card;
        const c018CharName = c018Top.name_fr;

        const c018Targets: string[] = [];
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          if (mIdx === c018SrcChar.missionIndex) continue;
          const mission = newState.activeMissions[mIdx];
          const hasSameName = mission[c018FriendlySide].some((c: CharacterInPlay) => {
            if (c.instanceId === pendingEffect.sourceInstanceId || c.isHidden) return false;
            const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return top.name_fr === c018CharName;
          });
          if (!hasSameName) c018Targets.push(String(mIdx));
        }
        if (c018Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Choji Akimichi (018): No valid mission to move to (state changed).',
            'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' });
          break;
        }
        const c018EffId = generateInstanceId();
        const c018ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: c018EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: c018SrcChar.missionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'CHOJI_018_MOVE_SELF',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: c018Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: c018ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a mission to move Choji Akimichi to.',
          descriptionKey: 'game.effect.desc.choji018MoveSelf',
          options: c018Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: c018EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'INO020_CONFIRM_MAIN': {
        // If upgrade, chain to UPGRADE confirm popup first
        let i020Meta: { isUpgrade?: boolean } = {};
        try { i020Meta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        if (i020Meta.isUpgrade) {
          // Show UPGRADE confirm popup
          const i020UpEffId = generateInstanceId();
          const i020UpActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: i020UpEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: 'UPGRADE',
            effectDescription: JSON.stringify({ sourceCardInstanceId: pendingEffect.sourceInstanceId }),
            targetSelectionType: 'INO020_CONFIRM_UPGRADE',
            sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId], isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: i020UpActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: 'Ino (020) UPGRADE: Instead, the cost limit is 3 or less.',
            descriptionKey: 'game.effect.desc.ino020ConfirmUpgrade',
            options: [pendingEffect.sourceInstanceId], minSelections: 1, maxSelections: 1,
            sourceEffectId: i020UpEffId,
          }];
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Non-upgrade: compute targets with cost 2 limit
        const i020SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        const i020MIdx = i020SrcChar?.missionIndex ?? pendingEffect.sourceMissionIndex;
        const mission020 = newState.activeMissions[i020MIdx];
        if (!mission020) break;
        const enemySide020: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const friendlySide020: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const friendlyNames020 = new Set(
          mission020[friendlySide020].filter((c: CharacterInPlay) => !c.isHidden).map((c: CharacterInPlay) => c.card.name_fr.toUpperCase())
        );

        const i020Targets: string[] = [];
        for (const char of mission020[enemySide020]) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          const effectiveCost = char.isHidden ? 0 : topCard.chakra;
          console.log(`[EffectEngine] INO020_CONFIRM_MAIN: enemy ${char.instanceId} isHidden=${char.isHidden} cost=${effectiveCost} name=${char.card.name_fr}`);
          if (effectiveCost <= 2) {
            if (!char.isHidden && friendlyNames020.has(char.card.name_fr.toUpperCase())) continue;
            i020Targets.push(char.instanceId);
          }
        }
        if (i020Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', `Ino Yamanaka (020): No valid take-control target (state changed).`,
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-020-UC' });
          break;
        }
        const i020EffId = generateInstanceId();
        const i020ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: i020EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: i020MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: i020Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: i020ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character with cost 2 or less to take control of.',
          descriptionKey: 'game.effect.desc.ino020TakeControl',
          descriptionParams: { costLimit: '2' },
          options: i020Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: i020EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'INO020_CONFIRM_UPGRADE': {
        // UPGRADE confirmed: compute targets with cost 3 limit
        const i020uSrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        const i020uMIdx = i020uSrcChar?.missionIndex ?? pendingEffect.sourceMissionIndex;
        const mission020u = newState.activeMissions[i020uMIdx];
        if (!mission020u) break;
        const enemySide020u: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const friendlySide020u: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const friendlyNames020u = new Set(
          mission020u[friendlySide020u].filter((c: CharacterInPlay) => !c.isHidden).map((c: CharacterInPlay) => c.card.name_fr.toUpperCase())
        );
        const i020uTargets: string[] = [];
        for (const char of mission020u[enemySide020u]) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          const effectiveCost = char.isHidden ? 0 : topCard.chakra;
          if (effectiveCost <= 3) {
            if (!char.isHidden && friendlyNames020u.has(char.card.name_fr.toUpperCase())) continue;
            i020uTargets.push(char.instanceId);
          }
        }
        if (i020uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Ino Yamanaka (020) UPGRADE: No valid take-control target (cost 3 or less).',
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-020-UC' });
          break;
        }
        const i020uEffId = generateInstanceId();
        const i020uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: i020uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: i020uMIdx,
          effectType: 'MAIN',
          effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: i020uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: i020uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character with cost 3 or less to take control of.',
          descriptionKey: 'game.effect.desc.ino020TakeControl',
          descriptionParams: { costLimit: '3' },
          options: i020uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: i020uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      // =============================================
      // BATCH 3 CONFIRM CASES (KS-021 to KS-030)
      // =============================================

      case 'SHIKAMARU021_CONFIRM_MAIN': {
        // Draw 1 card immediately (edge holder already verified by handler)
        const ps021 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps021.deck.length > 0) {
          const deck021 = [...ps021.deck];
          const drawn021 = deck021.shift()!;
          ps021.deck = deck021;
          ps021.hand = [...ps021.hand, drawn021];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps021 };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW', 'Shikamaru Nara (021): Drew 1 card (Edge holder).',
          'game.log.effect.draw', { card: 'SHIKAMARU NARA', id: 'KS-021-C', count: 1 });
        break;
      }

      case 'SHIKAMARU022_CONFIRM_AMBUSH': {
        // Re-scan log for enemy characters played during opponent's last turn
        const s022Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const s022EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const s022Turn = newState.turn;

        const PLAY_ACTIONS_022 = new Set([
          'PLAY_CHARACTER', 'REVEAL_CHARACTER', 'REVEAL_UPGRADE', 'UPGRADE_CHARACTER',
        ]);
        const EFFECT_PLAY_ACTIONS_022 = new Set([
          'EFFECT', 'EFFECT_UPGRADE', 'EFFECT_PLAY',
        ]);

        const s022PlayedChars: { name?: string; instanceId?: string; mission: number }[] = [];
        let s022PrimaryIdx = -1;
        for (let i = newState.log.length - 1; i >= 0; i--) {
          const entry = newState.log[i];
          if (entry.turn !== s022Turn || entry.phase !== 'action') continue;
          if (entry.player !== s022Opponent) continue;
          if (entry.action === 'PASS') break;
          if (entry.action === 'PLAY_HIDDEN') { s022PrimaryIdx = i; break; }
          if (PLAY_ACTIONS_022.has(entry.action)) { s022PrimaryIdx = i; break; }
        }
        if (s022PrimaryIdx >= 0) {
          for (let i = s022PrimaryIdx; i < newState.log.length; i++) {
            const entry = newState.log[i];
            if (entry.turn !== s022Turn || entry.phase !== 'action') break;
            if (entry.player !== s022Opponent) break;
            const missionNum = entry.messageParams?.mission != null ? Number(entry.messageParams.mission) - 1 : null;
            if (entry.action === 'PLAY_HIDDEN') {
              const instId = entry.messageParams?.instanceId as string | undefined;
              if (missionNum !== null) s022PlayedChars.push({ instanceId: instId, mission: missionNum });
            } else if (PLAY_ACTIONS_022.has(entry.action)) {
              const charName = (entry.messageParams?.card as string) ?? null;
              if (charName && missionNum !== null) s022PlayedChars.push({ name: charName, mission: missionNum });
            } else if (EFFECT_PLAY_ACTIONS_022.has(entry.action)) {
              const charName = (entry.messageParams?.target as string) ?? null;
              if (charName && missionNum !== null) s022PlayedChars.push({ name: charName, mission: missionNum });
            }
          }
        }

        const s022Targets: string[] = [];
        for (const played of s022PlayedChars) {
          const mission = newState.activeMissions[played.mission];
          if (!mission) continue;
          for (const char of mission[s022EnemySide]) {
            if (s022Targets.includes(char.instanceId)) continue;
            if (played.instanceId) {
              // Hidden play: match by instanceId
              if (char.instanceId === played.instanceId) {
                s022Targets.push(char.instanceId);
              }
            } else if (played.name) {
              // Visible play: match by name
              if (!char.isHidden) {
                const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
                if (topCard.name_fr.toUpperCase() === played.name.toUpperCase()) {
                  s022Targets.push(char.instanceId);
                }
              }
            }
          }
        }

        if (s022Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Shikamaru Nara (022): No valid targets (state changed).',
            'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' });
          break;
        }

        const s022EffId = generateInstanceId();
        const s022ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s022EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'SHIKAMARU_MOVE_ENEMY',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: s022Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s022ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character to move to another mission.',
          descriptionKey: 'game.effect.desc.shikamaru022MoveEnemy',
          options: s022Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s022EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'ASUMA023_CONFIRM_MAIN': {
        // Re-find Team 10 chars in source mission
        const a023SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!a023SrcChar) break;
        const a023MIdx = a023SrcChar.missionIndex;
        const a023Mission = newState.activeMissions[a023MIdx];
        if (!a023Mission) break;

        const a023Targets: string[] = [];
        const a023AllChars = [...a023Mission.player1Characters, ...a023Mission.player2Characters];
        for (const char of a023AllChars) {
          if (char.instanceId === pendingEffect.sourceInstanceId) continue;
          if (char.isHidden) continue;
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.keywords?.includes('Team 10')) {
            // Pre-check: at least one destination must not have same-name conflict
            const charController = a023Mission.player1Characters.some((c) => c.instanceId === char.instanceId) ? 'player1' : 'player2';
            const ctrlSide: 'player1Characters' | 'player2Characters' = charController === 'player1' ? 'player1Characters' : 'player2Characters';
            const charName = topCard.name_fr;
            const hasValidDest = newState.activeMissions.some((m, i) => {
              if (i === a023MIdx) return false;
              return !m[ctrlSide].some((c) => {
                if (c.instanceId === char.instanceId) return false;
                if (c.isHidden) return false;
                const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                return cTop.name_fr === charName;
              });
            });
            if (!hasValidDest) continue;
            a023Targets.push(char.instanceId);
          }
        }

        if (a023Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Asuma Sarutobi (023): No Team 10 character in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-023-C' });
          break;
        }

        const a023EffId = generateInstanceId();
        const a023ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: a023EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: a023MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'ASUMA_CHOOSE_TEAM10',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: a023Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: a023ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Choose a Team 10 character in this mission to move.',
          descriptionKey: 'game.effect.desc.asuma023MoveTeam10',
          options: a023Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: a023EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'ASUMA024_CONFIRM_AMBUSH': {
        // Draw 1 card, then chain to mandatory discard for POWERUP 3
        const ps024 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps024.deck.length > 0) {
          const deck024 = [...ps024.deck];
          const drawn024 = deck024.shift()!;
          ps024.deck = deck024;
          ps024.hand = [...ps024.hand, drawn024];
        }
        newState = { ...newState, [pendingEffect.sourcePlayer]: ps024 };
        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW', 'Asuma Sarutobi (024): Drew 1 card (ambush).',
          'game.log.effect.draw', { card: 'ASUMA SARUTOBI', id: 'KS-024-UC', count: 1 });

        const currentPs024 = newState[pendingEffect.sourcePlayer];
        if (currentPs024.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Asuma Sarutobi (024): No cards in hand to discard for POWERUP 3.',
            'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-024-UC' });
          break;
        }

        const a024Targets = currentPs024.hand.map((_: any, idx: number) => String(idx));
        const a024EffId = generateInstanceId();
        const a024ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: a024EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'ASUMA_024_DISCARD_FOR_POWERUP',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: a024Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: a024ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Discard a card from your hand to give Asuma POWERUP 3.',
          descriptionKey: 'game.effect.desc.asuma024DiscardForPowerup',
          options: a024Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: a024EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KIBA026_CONFIRM_MAIN': {
        // Re-find non-hidden enemies with lowest cost in this mission
        const k026SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!k026SrcChar) break;
        const k026MIdx = k026SrcChar.missionIndex;
        const k026Mission = newState.activeMissions[k026MIdx];
        if (!k026Mission) break;
        const k026EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k026Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';

        const k026NonHidden = k026Mission[k026EnemySide].filter((c: CharacterInPlay) => {
          if (c.isHidden) return false;
          // Check canBeHiddenByEnemy via centralized utility
          return canBeHiddenByEnemy(newState, c, k026Opponent);
        });

        if (k026NonHidden.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kiba Inuzuka (026): No non-hidden enemy to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' });
          break;
        }

        let k026LowestCost = Infinity;
        for (const char of k026NonHidden) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.chakra < k026LowestCost) k026LowestCost = topCard.chakra;
        }
        const k026Tied = k026NonHidden.filter((c: CharacterInPlay) => {
          const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return topCard.chakra === k026LowestCost;
        });

        if (k026Tied.length === 1) {
          // Auto-hide
          newState = EffectEngine.hideCharacterWithLog(newState, k026Tied[0].instanceId, pendingEffect.sourcePlayer);
          break;
        }

        // Multiple tied — create mandatory child
        const k026Targets = k026Tied.map((c: CharacterInPlay) => c.instanceId);
        const k026EffId = generateInstanceId();
        const k026ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k026EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: k026MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIBA026_PLAYER_CHOOSE_HIDE',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: k026Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k026ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: `Choose which enemy character (cost ${k026LowestCost}) to hide.`,
          descriptionKey: 'game.effect.desc.kiba026PlayerChoose',
          descriptionParams: { cost: String(k026LowestCost) },
          options: k026Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k026EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KIBA026_CONFIRM_UPGRADE': {
        // Re-peek top 3 cards of deck
        const ps026 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps026.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', 'Kiba Inuzuka (026): Deck empty (state changed).',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' });
          break;
        }
        const topCards026 = ps026.deck.slice(0, 3);
        const remainingDeck026 = ps026.deck.slice(3);
        const matchIndices026: number[] = [];
        for (let i = 0; i < topCards026.length; i++) {
          if (topCards026[i].name_fr === 'AKAMARU') matchIndices026.push(i);
        }
        const cardInfos026 = topCards026.map((c: any) => ({
          name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, isMatch: c.name_fr === 'AKAMARU',
        }));

        if (matchIndices026.length === 0) {
          // No Akamaru: put back, show confirm-only reveal
          ps026.deck = [...topCards026, ...remainingDeck026];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps026 };
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', 'Kiba Inuzuka (026): Looked at top 3 of deck, no Akamaru found (upgrade).',
            'game.log.effect.lookAtDeck', { card: 'KIBA INUZUKA', id: 'KS-026-UC' });

          const k026rEffId = generateInstanceId();
          const k026rActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: k026rEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              text: `Kiba (026): No Akamaru in top ${topCards026.length}. Cards put back.`,
              topCards: cardInfos026,
            }),
            targetSelectionType: 'KIBA026_UPGRADE_REVEAL',
            sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
            validTargets: ['confirm'], isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: k026rActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: JSON.stringify({
              text: `Kiba (026): No Akamaru in top ${topCards026.length}. Cards put back.`,
              topCards: cardInfos026,
            }),
            descriptionKey: 'game.effect.desc.kiba026UpgradeReveal',
            options: ['confirm'], minSelections: 1, maxSelections: 1,
            sourceEffectId: k026rEffId,
          }];
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Akamaru found: create KIBA026_UPGRADE_CHOOSE child (SKIP ok — draw 0 valid)
        const k026cEffId = generateInstanceId();
        const k026cActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k026cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({
            text: `Kiba (026): Found ${matchIndices026.length} Akamaru card(s) in top ${topCards026.length}. Choose which to draw.`,
            topCards: cardInfos026,
            topCardsRaw: topCards026,
            remainingDeck: remainingDeck026,
          }),
          targetSelectionType: 'KIBA026_UPGRADE_CHOOSE',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: matchIndices026.map((i: number) => String(i)),
          isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k026cActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: JSON.stringify({
            text: `Kiba (026): Found ${matchIndices026.length} Akamaru card(s) in top ${topCards026.length}. Choose which to draw.`,
            topCards: cardInfos026,
          }),
          descriptionKey: 'game.effect.desc.kiba026UpgradeChoose',
          options: matchIndices026.map((i: number) => String(i)),
          minSelections: 0, maxSelections: matchIndices026.length,
          sourceEffectId: k026cEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'AKAMARU028_CONFIRM_AMBUSH': {
        // Re-find friendly Kiba targets in this mission
        const a028SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!a028SrcChar) break;
        const a028MIdx = a028SrcChar.missionIndex;
        const a028Mission = newState.activeMissions[a028MIdx];
        if (!a028Mission) break;
        const a028FriendlySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const a028KibaTargets: string[] = [];
        for (const char of a028Mission[a028FriendlySide]) {
          if (char.isHidden) continue;
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.name_fr === 'KIBA INUZUKA') a028KibaTargets.push(char.instanceId);
        }

        if (a028KibaTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Akamaru (028): No friendly Kiba Inuzuka (state changed).',
            'game.log.effect.noTarget', { card: 'AKAMARU', id: 'KS-028-UC' });
          break;
        }

        if (a028KibaTargets.length === 1) {
          // Auto-apply POWERUP 2
          newState = EffectEngine.applyPowerupToTarget(newState, a028KibaTargets[0], 2);
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_POWERUP', 'Akamaru (028): POWERUP 2 on Kiba Inuzuka (ambush).',
            'game.log.effect.powerup', { card: 'AKAMARU', id: 'KS-028-UC', amount: 2, target: 'KIBA INUZUKA' });
          break;
        }

        // Multiple Kiba — create mandatory child
        const a028EffId = generateInstanceId();
        const a028ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: a028EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: a028MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'AKAMARU_028_POWERUP_KIBA',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: a028KibaTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: a028ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a friendly Kiba Inuzuka to give POWERUP 2.',
          descriptionKey: 'game.effect.desc.akamaru028PowerupKiba',
          options: a028KibaTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: a028EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'AKAMARU029_CONFIRM_UPGRADE': {
        // Re-find non-hidden enemies with lowest cost in this mission
        const a029SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!a029SrcChar) break;
        const a029MIdx = a029SrcChar.missionIndex;
        const a029Mission = newState.activeMissions[a029MIdx];
        if (!a029Mission) break;
        const a029EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const a029Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';

        const a029NonHidden = a029Mission[a029EnemySide].filter((c: CharacterInPlay) => {
          if (c.isHidden) return false;
          return canBeHiddenByEnemy(newState, c, a029Opponent);
        });

        if (a029NonHidden.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Akamaru (029): No non-hidden enemy to hide (state changed).',
            'game.log.effect.noTarget', { card: 'AKAMARU', id: 'KS-029-UC' });
          break;
        }

        let a029LowestCost = Infinity;
        for (const char of a029NonHidden) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.chakra < a029LowestCost) a029LowestCost = topCard.chakra;
        }
        const a029Tied = a029NonHidden.filter((c: CharacterInPlay) => {
          const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return topCard.chakra === a029LowestCost;
        });

        if (a029Tied.length === 1) {
          newState = EffectEngine.hideCharacterWithLog(newState, a029Tied[0].instanceId, pendingEffect.sourcePlayer);
          break;
        }

        const a029Targets = a029Tied.map((c: CharacterInPlay) => c.instanceId);
        const a029EffId = generateInstanceId();
        const a029ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: a029EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: a029MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'AKAMARU029_CHOOSE_HIDE',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: a029Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: a029ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: `Choose which enemy character (cost ${a029LowestCost}) to hide.`,
          descriptionKey: 'game.effect.desc.akamaru029ChooseHide',
          descriptionParams: { cost: String(a029LowestCost) },
          options: a029Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: a029EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'HINATA030_CONFIRM_MAIN': {
        // Re-find enemies with power tokens across all missions
        const h030EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const h030Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[h030EnemySide]) {
            if (char.powerTokens > 0) h030Targets.push(char.instanceId);
          }
        }

        if (h030Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Hinata Hyuga (030): No enemy with Power tokens (state changed).',
            'game.log.effect.noTarget', { card: 'HINATA HYUGA', id: 'KS-030-C' });
          break;
        }

        const h030EffId = generateInstanceId();
        const h030ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: h030EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'REMOVE_POWER_TOKENS_ENEMY',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: h030Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: h030ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character to remove up to 2 Power tokens from.',
          descriptionKey: 'game.effect.desc.hinata030RemoveTokens',
          options: h030Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: h030EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      // =============================================
      // BATCH 4 CONFIRM CASES (KS-032 to KS-039)
      // =============================================
      case 'SHINO032_CONFIRM_MAIN': {
        // Both players draw 1 card
        const s032Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const ps032 = { ...newState[pendingEffect.sourcePlayer] };
        if (ps032.deck.length > 0) {
          const deck032 = [...ps032.deck];
          const drawn032 = deck032.shift()!;
          ps032.deck = deck032;
          ps032.hand = [...ps032.hand, drawn032];
        }
        newState[pendingEffect.sourcePlayer] = ps032;

        const ops032 = { ...newState[s032Opponent] };
        if (ops032.deck.length > 0) {
          const deck032o = [...ops032.deck];
          const drawn032o = deck032o.shift()!;
          ops032.deck = deck032o;
          ops032.hand = [...ops032.hand, drawn032o];
        }
        newState[s032Opponent] = ops032;

        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW', 'Shino Aburame (032): Each player draws a card.',
          'game.log.effect.bothDraw', { card: 'SHINO ABURAME', id: 'KS-032-C', count: 1 });
        break;
      }

      case 'SHINO033_CONFIRM_UPGRADE': {
        // Re-find valid destination missions (not current, no same-name, R8 Kurenai)
        const s033SrcMI = pendingEffect.sourceMissionIndex;
        const s033Player = pendingEffect.sourcePlayer;
        const s033FriendlySide = s033Player === 'player1' ? 'player1Characters' : 'player2Characters';

        // Find the source character to get its name
        let s033CharName = '';
        const s033SrcMission = newState.activeMissions[s033SrcMI];
        if (s033SrcMission) {
          for (const c of s033SrcMission[s033FriendlySide]) {
            if (c.instanceId === pendingEffect.sourceInstanceId) {
              const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              s033CharName = top.name_fr;
              break;
            }
          }
        }

        const s033Targets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === s033SrcMI) continue;
          const mission = newState.activeMissions[i];
          const friendlyChars = mission[s033FriendlySide];
          const hasSameName = friendlyChars.some((c: CharacterInPlay) => {
            if (c.instanceId === pendingEffect.sourceInstanceId) return false;
            if (c.isHidden) return false;
            const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return top.name_fr === s033CharName;
          });
          if (!hasSameName) s033Targets.push(String(i));
        }

        if (s033Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s033Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (033): No valid mission to move to (state changed).',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-033-UC' });
          break;
        }

        const s033EffId = generateInstanceId();
        const s033ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s033EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'SHINO_MOVE_SELF',
          sourcePlayer: s033Player, requiresTargetSelection: true,
          validTargets: s033Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s033ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: s033Player,
          description: 'Select a mission to move Shino Aburame to.',
          descriptionKey: 'game.effect.desc.shino033MoveSelf',
          options: s033Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s033EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KURENAI035_CONFIRM_UPGRADE': {
        // Re-find enemy characters with effective power <= 1 in this mission
        const k035Player = pendingEffect.sourcePlayer;
        const k035Opponent = k035Player === 'player1' ? 'player2' : 'player1';
        const k035EnemySide = k035Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const k035Mission = newState.activeMissions[pendingEffect.sourceMissionIndex];
        const k035Targets: string[] = [];

        if (k035Mission) {
          for (const char of k035Mission[k035EnemySide]) {
            if (getEffectivePower(newState, char, k035Opponent as PlayerID) <= 1) {
              k035Targets.push(char.instanceId);
            }
          }
        }

        if (k035Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k035Player,
            'EFFECT_NO_TARGET', 'Yuhi Kurenai (035): No enemy with Power 1 or less (state changed).',
            'game.log.effect.noTarget', { card: 'YUHI KURENAI', id: 'KS-035-UC' });
          break;
        }

        if (k035Targets.length === 1) {
          // Auto-defeat single target
          newState = EffectEngine.defeatCharacter(newState, k035Targets[0], k035Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, k035Player,
            'EFFECT_DEFEAT', 'Yuhi Kurenai (035): Defeated enemy character with Power 1 or less (upgrade).',
            'game.log.effect.defeat', { card: 'YUHI KURENAI', id: 'KS-035-UC' });
          break;
        }

        // Multiple targets — mandatory child
        const k035EffId = generateInstanceId();
        const k035ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k035EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KURENAI_DEFEAT_LOW_POWER',
          sourcePlayer: k035Player, requiresTargetSelection: true,
          validTargets: k035Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k035ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k035Player,
          description: 'Select an enemy character with Power 1 or less to defeat.',
          descriptionKey: 'game.effect.desc.kurenai035DefeatLowPower',
          options: k035Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k035EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'NEJI036_CONFIRM_MAIN': {
        // Re-find enemies with power tokens across all missions (same as HINATA030)
        const n036EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const n036Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[n036EnemySide]) {
            if (char.powerTokens > 0) n036Targets.push(char.instanceId);
          }
        }

        if (n036Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Neji Hyuga (036): No enemy with Power tokens (state changed).',
            'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: 'KS-036-C' });
          break;
        }

        const n036EffId = generateInstanceId();
        const n036ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: n036EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'REMOVE_POWER_TOKENS_ENEMY',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: n036Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: n036ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select an enemy character to remove up to 2 Power tokens from.',
          descriptionKey: 'game.effect.desc.neji036RemoveTokens',
          options: n036Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: n036EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'NEJI037_CONFIRM_UPGRADE': {
        // Re-find non-hidden enemies with power tokens in this mission
        const n037Player = pendingEffect.sourcePlayer;
        const n037Opponent = n037Player === 'player1' ? 'player2' : 'player1';
        const n037EnemySide = n037Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const n037Mission = newState.activeMissions[pendingEffect.sourceMissionIndex];
        const n037Targets: string[] = [];

        if (n037Mission) {
          for (const char of n037Mission[n037EnemySide]) {
            if (!char.isHidden && char.powerTokens > 0) {
              n037Targets.push(char.instanceId);
            }
          }
        }

        if (n037Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n037Player,
            'EFFECT_NO_TARGET', 'Neji Hyuga (037): No enemy with Power tokens in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: 'KS-037-UC' });
          break;
        }

        if (n037Targets.length === 1) {
          // Auto-remove all tokens from single target
          const n037Res = EffectEngine.findCharByInstanceId(newState, n037Targets[0]);
          if (n037Res) {
            const missions_n037 = [...newState.activeMissions];
            const m_n037 = { ...missions_n037[n037Res.missionIndex] };
            const side_n037 = n037Res.player === 'player1' ? 'player1Characters' : 'player2Characters';
            m_n037[side_n037] = m_n037[side_n037].map((c: CharacterInPlay) =>
              c.instanceId === n037Targets[0] ? { ...c, powerTokens: 0 } : c
            );
            missions_n037[n037Res.missionIndex] = m_n037;
            newState = { ...newState, activeMissions: missions_n037 };
            newState.log = logAction(newState.log, newState.turn, newState.phase, n037Player,
              'EFFECT_REMOVE_TOKENS', `Neji Hyuga (037): Removed all Power tokens from ${n037Res.character.card.name_fr} (upgrade).`,
              'game.log.effect.removeTokens', { card: 'NEJI HYUGA', id: 'KS-037-UC', amount: n037Res.character.powerTokens, target: n037Res.character.card.name_fr });
          }
          break;
        }

        // Multiple targets — mandatory child
        const n037EffId = generateInstanceId();
        const n037ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: n037EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'NEJI037_REMOVE_ALL_TOKENS',
          sourcePlayer: n037Player, requiresTargetSelection: true,
          validTargets: n037Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: n037ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: n037Player,
          description: 'Select an enemy character to remove all Power tokens from.',
          descriptionKey: 'game.effect.desc.neji037RemoveTokens',
          options: n037Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: n037EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'ROCKLEE038_CONFIRM_AMBUSH': {
        // POWERUP 1 on self
        const rl038Player = pendingEffect.sourcePlayer;
        const rl038Side = rl038Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const rl038MI = pendingEffect.sourceMissionIndex;
        const missions_rl038 = [...newState.activeMissions];
        const m_rl038 = { ...missions_rl038[rl038MI] };
        const chars_rl038 = [...m_rl038[rl038Side]];
        const idx_rl038 = chars_rl038.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_rl038 !== -1) {
          chars_rl038[idx_rl038] = { ...chars_rl038[idx_rl038], powerTokens: chars_rl038[idx_rl038].powerTokens + 1 };
          m_rl038[rl038Side] = chars_rl038;
          missions_rl038[rl038MI] = m_rl038;
          newState = { ...newState, activeMissions: missions_rl038 };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, rl038Player,
          'EFFECT_POWERUP', 'Rock Lee (038): POWERUP 1 on self (ambush).',
          'game.log.effect.powerupSelf', { card: 'ROCK LEE', id: 'KS-038-C', amount: 1 });
        break;
      }

      case 'ROCKLEE039_CONFIRM_UPGRADE': {
        // POWERUP 2 on self
        const rl039Player = pendingEffect.sourcePlayer;
        const rl039Side = rl039Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const rl039MI = pendingEffect.sourceMissionIndex;
        const missions_rl039 = [...newState.activeMissions];
        const m_rl039 = { ...missions_rl039[rl039MI] };
        const chars_rl039 = [...m_rl039[rl039Side]];
        const idx_rl039 = chars_rl039.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_rl039 !== -1) {
          chars_rl039[idx_rl039] = { ...chars_rl039[idx_rl039], powerTokens: chars_rl039[idx_rl039].powerTokens + 2 };
          m_rl039[rl039Side] = chars_rl039;
          missions_rl039[rl039MI] = m_rl039;
          newState = { ...newState, activeMissions: missions_rl039 };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, rl039Player,
          'EFFECT_POWERUP', 'Rock Lee (039): POWERUP 2 on self (upgrade).',
          'game.log.effect.powerupSelf', { card: 'ROCK LEE', id: 'KS-039-UC', amount: 2 });
        break;
      }

      // =============================================
      // Batch 5 CONFIRM cases (KS-041 to KS-050)
      // =============================================

      case 'TENTEN041_CONFIRM_MAIN': {
        // Re-find hidden chars (both sides, not self) in source mission
        const tt041SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!tt041SrcChar) break;
        const tt041MIdx = tt041SrcChar.missionIndex;
        const tt041Mission = newState.activeMissions[tt041MIdx];
        if (!tt041Mission) break;

        const tt041Targets: string[] = [];
        for (const char of [...tt041Mission.player1Characters, ...tt041Mission.player2Characters]) {
          if (char.isHidden && char.instanceId !== pendingEffect.sourceInstanceId) {
            tt041Targets.push(char.instanceId);
          }
        }

        if (tt041Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Tenten (041): No hidden character in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-041-UC' });
          break;
        }

        if (tt041Targets.length === 1) {
          // Auto-defeat the single target
          newState = EffectEngine.defeatCharacter(newState, tt041Targets[0], pendingEffect.sourcePlayer);
          break;
        }

        // Multiple targets: mandatory child
        const tt041mEffId = generateInstanceId();
        const tt041mActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: tt041mEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: tt041MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'TENTEN_DEFEAT_HIDDEN',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: tt041Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: tt041mActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a hidden character in this mission to defeat.',
          descriptionKey: 'game.effect.desc.tenten041DefeatHidden',
          options: tt041Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: tt041mEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'TENTEN041_CONFIRM_UPGRADE': {
        // Re-find non-hidden Leaf Village chars (any mission, both sides, not self)
        const tt041uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.group === 'Leaf Village') {
              tt041uTargets.push(char.instanceId);
            }
          }
        }

        if (tt041uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Tenten (041): No Leaf Village character in play (state changed).',
            'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-041-UC' });
          break;
        }

        if (tt041uTargets.length === 1) {
          // Auto-POWERUP 1
          const tt041uRes = EffectEngine.findCharByInstanceId(newState, tt041uTargets[0]);
          if (tt041uRes) {
            const tt041uMissions = [...newState.activeMissions];
            const tt041uM = { ...tt041uMissions[tt041uRes.missionIndex] };
            const tt041uKey = tt041uRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
            tt041uM[tt041uKey] = tt041uM[tt041uKey].map((c: CharacterInPlay) =>
              c.instanceId === tt041uTargets[0] ? { ...c, powerTokens: c.powerTokens + 1 } : c
            );
            tt041uMissions[tt041uRes.missionIndex] = tt041uM;
            newState = { ...newState, activeMissions: tt041uMissions };
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_POWERUP', `Tenten (041): POWERUP 1 on ${tt041uRes.character.card.name_fr} (upgrade).`,
              'game.log.effect.powerup', { card: 'TENTEN', id: 'KS-041-UC', amount: '1', target: tt041uRes.character.card.name_fr });
          }
          break;
        }

        // Multiple targets: mandatory child
        const tt041uEffId = generateInstanceId();
        const tt041uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: tt041uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'TENTEN_POWERUP_LEAF',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: tt041uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: tt041uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a Leaf Village character in play to give POWERUP 1.',
          descriptionKey: 'game.effect.desc.tenten041PowerupLeaf',
          options: tt041uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: tt041uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'GAI043_CONFIRM_UPGRADE': {
        // POWERUP 3 on self
        const g043Player = pendingEffect.sourcePlayer;
        const g043Side = g043Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const g043MI = pendingEffect.sourceMissionIndex;
        const missions_g043 = [...newState.activeMissions];
        const m_g043 = { ...missions_g043[g043MI] };
        const chars_g043 = [...m_g043[g043Side]];
        const idx_g043 = chars_g043.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_g043 !== -1) {
          chars_g043[idx_g043] = { ...chars_g043[idx_g043], powerTokens: chars_g043[idx_g043].powerTokens + 3 };
          m_g043[g043Side] = chars_g043;
          missions_g043[g043MI] = m_g043;
          newState = { ...newState, activeMissions: missions_g043 };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, g043Player,
          'EFFECT_POWERUP', 'Gai Maito (043): POWERUP 3 on self (upgrade).',
          'game.log.effect.powerupSelf', { card: 'GAI MAITO', id: 'KS-043-UC', amount: 3 });
        break;
      }

      case 'ANKO045_CONFIRM_AMBUSH': {
        // Re-find hidden enemy chars across all missions
        const a045Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const a045EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const a045Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[a045EnemySide]) {
            if (char.isHidden) {
              a045Targets.push(char.instanceId);
            }
          }
        }

        if (a045Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Anko Mitarashi (045): No hidden enemy character in play (state changed).',
            'game.log.effect.noTarget', { card: 'ANKO MITARASHI', id: 'KS-045-UC' });
          break;
        }

        if (a045Targets.length === 1) {
          // Auto-defeat
          newState = EffectEngine.defeatCharacter(newState, a045Targets[0], pendingEffect.sourcePlayer);
          break;
        }

        // Multiple targets: mandatory child
        const a045EffId = generateInstanceId();
        const a045ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: a045EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'ANKO_DEFEAT_HIDDEN_ENEMY',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: a045Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: a045ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a hidden enemy character in play to defeat.',
          descriptionKey: 'game.effect.desc.anko045DefeatHidden',
          options: a045Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: a045EffId,
        }];
        break;
      }

      case 'EBISU046_CONFIRM_MAIN': {
        // Re-check condition: friendly with less effective power in mission
        const e046SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!e046SrcChar) break;
        const e046Mission = newState.activeMissions[e046SrcChar.missionIndex];
        if (!e046Mission) break;
        const e046FriendlySide = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const e046SourcePower = getEffectivePower(newState, e046SrcChar.character, pendingEffect.sourcePlayer);
        const e046HasLesser = (e046Mission as any)[e046FriendlySide].some((c: CharacterInPlay) => {
          if (c.instanceId === pendingEffect.sourceInstanceId) return false;
          if (c.isHidden) return false;
          return getEffectivePower(newState, c, pendingEffect.sourcePlayer) < e046SourcePower;
        });

        if (!e046HasLesser) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Ebisu (046): No friendly character with less Power (state changed).',
            'game.log.effect.noTarget', { card: 'EBISU', id: 'KS-046-C' });
          break;
        }

        // Draw 1 card
        const e046Ps = { ...newState[pendingEffect.sourcePlayer] };
        if (e046Ps.deck.length > 0) {
          const e046Deck = [...e046Ps.deck];
          const e046Drawn = e046Deck.shift()!;
          e046Ps.deck = e046Deck;
          e046Ps.hand = [...e046Ps.hand, e046Drawn];
        }
        newState = { ...newState, [pendingEffect.sourcePlayer]: e046Ps };
        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DRAW', 'Ebisu (046): Drew 1 card.',
          'game.log.effect.draw', { card: 'EBISU', id: 'KS-046-C', count: '1' });
        break;
      }

      case 'IRUKA047_CONFIRM_MAIN': {
        // Re-find Naruto Uzumaki chars with R8+R10 filtering
        const i047Targets: string[] = [];
        for (let i047mIdx = 0; i047mIdx < newState.activeMissions.length; i047mIdx++) {
          const i047Mission = newState.activeMissions[i047mIdx];
          for (const char of [...i047Mission.player1Characters, ...i047Mission.player2Characters]) {
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.name_fr === 'NARUTO UZUMAKI') {
              const charCtrl = i047Mission.player1Characters.some((c: CharacterInPlay) => c.instanceId === char.instanceId) ? 'player1' : 'player2';
              if (isMovementBlockedByKurenai(newState, i047mIdx, charCtrl)) continue;
              const i047CtrlSide: 'player1Characters' | 'player2Characters' = charCtrl === 'player1' ? 'player1Characters' : 'player2Characters';
              const i047HasDest = newState.activeMissions.some((m: any, i: number) => {
                if (i === i047mIdx) return false;
                return !m[i047CtrlSide].some((c: any) => {
                  if (c.instanceId === char.instanceId) return false;
                  if (c.isHidden) return false;
                  const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                  return cTop.name_fr === 'NARUTO UZUMAKI';
                });
              });
              if (!i047HasDest) continue;
              i047Targets.push(char.instanceId);
            }
          }
        }

        if (i047Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Iruka Umino (047): No Naruto Uzumaki can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: 'KS-047-C' });
          break;
        }

        if (i047Targets.length === 1) {
          // Auto-select the single Naruto
          newState = EffectEngine.irukaChooseNaruto(newState, pendingEffect, i047Targets[0]);
          break;
        }

        // Multiple targets: mandatory child
        const i047EffId = generateInstanceId();
        const i047ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: i047EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'IRUKA_CHOOSE_NARUTO',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: i047Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: i047ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Iruka Umino (047): Choose a Naruto Uzumaki character to move.',
          descriptionKey: 'game.effect.desc.iruka047MoveNaruto',
          options: i047Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: i047EffId,
        }];
        break;
      }

      case 'OROCHIMARU050_CONFIRM_AMBUSH': {
        // Re-find hidden enemy chars in this mission
        const o050SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!o050SrcChar) break;
        const o050MIdx = o050SrcChar.missionIndex;
        const o050Mission = newState.activeMissions[o050MIdx];
        if (!o050Mission) break;
        const o050EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const o050Targets: string[] = [];
        for (const char of (o050Mission as any)[o050EnemySide]) {
          if (char.isHidden) {
            o050Targets.push(char.instanceId);
          }
        }

        if (o050Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Orochimaru (050): No hidden enemy in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-050-C' });
          break;
        }

        if (o050Targets.length === 1) {
          // Auto-select
          newState = EffectEngine.orochimaruLookAndSteal(newState, pendingEffect, o050Targets[0]);
          break;
        }

        // Multiple targets: mandatory child
        const o050EffId = generateInstanceId();
        const o050ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: o050EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: o050MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'OROCHIMARU_LOOK_AND_STEAL',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: o050Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: o050ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a hidden enemy character in this mission to look at.',
          descriptionKey: 'game.effect.desc.orochimaru050LookSteal',
          options: o050Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: o050EffId,
        }];
        break;
      }

      // =============================================
      // BATCH 6 CONFIRM CASES (KS-051 to KS-060)
      // =============================================

      case 'OROCHIMARU051_CONFIRM_UPGRADE': {
        // Re-find hidden enemy chars across all missions
        const o051EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const o051Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[o051EnemySide]) {
            if (char.isHidden) o051Targets.push(char.instanceId);
          }
        }

        if (o051Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Orochimaru (051): No hidden enemy character in play (state changed).',
            'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-051-UC' });
          break;
        }

        if (o051Targets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, o051Targets[0], pendingEffect.sourcePlayer);
          break;
        }

        const o051EffId = generateInstanceId();
        const o051ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: o051EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'OROCHIMARU051_DEFEAT_HIDDEN',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: o051Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: o051ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Select a hidden enemy character in play to defeat.',
          descriptionKey: 'game.effect.desc.orochimaru051DefeatHidden',
          options: o051Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: o051EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KABUTO052_CONFIRM_AMBUSH': {
        // Draw top card from opponent's deck, then place hidden on a mission
        const kb052Player = pendingEffect.sourcePlayer;
        const kb052Opponent = kb052Player === 'player1' ? 'player2' : 'player1';
        const kb052OpPs = { ...newState[kb052Opponent] };

        if (kb052OpPs.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb052Player,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (052): Opponent deck empty (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-052-C' });
          break;
        }

        const kb052Deck = [...kb052OpPs.deck];
        const kb052Drawn = kb052Deck.shift()!;
        kb052OpPs.deck = kb052Deck;
        newState = { ...newState, [kb052Opponent]: kb052OpPs };
        newState.log = logAction(newState.log, newState.turn, newState.phase, kb052Player,
          'EFFECT_DRAW', 'Kabuto Yakushi (052): Drew top card from opponent deck.',
          'game.log.effect.kabutoStealDraw', { card: 'KABUTO YAKUSHI', id: 'KS-052-C' });

        (newState as any)._pendingHiddenCard = kb052Drawn;
        (newState as any)._pendingOriginalOwner = kb052Opponent;

        const kb052Missions: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          kb052Missions.push(String(i));
        }

        if (kb052Missions.length === 1) {
          const kb052FriendlySide: 'player1Characters' | 'player2Characters' =
            kb052Player === 'player1' ? 'player1Characters' : 'player2Characters';
          const newChar_kb052: CharacterInPlay = {
            instanceId: generateInstanceId(),
            card: kb052Drawn,
            isHidden: true,
            wasRevealedAtLeastOnce: false,
            powerTokens: 0,
            stack: [kb052Drawn],
            controlledBy: kb052Player,
            originalOwner: kb052Opponent,
            controllerInstanceId: pendingEffect.sourceInstanceId,
            missionIndex: 0,
          };
          const missions_kb052 = [...newState.activeMissions];
          const mission_kb052 = { ...missions_kb052[0] };
          mission_kb052[kb052FriendlySide] = [...mission_kb052[kb052FriendlySide], newChar_kb052];
          missions_kb052[0] = mission_kb052;
          newState.activeMissions = missions_kb052;
          newState[kb052Player] = { ...newState[kb052Player], charactersInPlay: EffectEngine.countCharsForPlayer(newState, kb052Player) };
          delete (newState as any)._pendingHiddenCard;
          delete (newState as any)._pendingOriginalOwner;
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb052Player,
            'EFFECT', 'Kabuto Yakushi (052): Placed stolen card hidden on mission 1.',
            'game.log.effect.kabutoSteal', { card: 'KABUTO YAKUSHI', id: 'KS-052-C', mission: '1' });
          break;
        }

        const kb052EffId = generateInstanceId();
        const kb052ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: kb052EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KABUTO_CHOOSE_MISSION',
          sourcePlayer: kb052Player, requiresTargetSelection: true,
          validTargets: kb052Missions, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: kb052ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: kb052Player,
          description: 'Choose a mission to place the stolen card hidden.',
          descriptionKey: 'game.effect.desc.kabuto052ChooseMission',
          options: kb052Missions, minSelections: 1, maxSelections: 1,
          sourceEffectId: kb052EffId,
        }];
        break;
      }

      case 'KABUTO053_CONFIRM_UPGRADE': {
        const kb053uPlayer = pendingEffect.sourcePlayer;
        const kb053uPs = newState[kb053uPlayer];

        if (kb053uPs.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb053uPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (053): No cards in hand to discard (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' });
          break;
        }

        if (kb053uPs.hand.length === 1) {
          const kb053uHand = [...kb053uPs.hand];
          const kb053uDiscarded = kb053uHand.splice(0, 1)[0];
          const kb053uNewPs = { ...kb053uPs, hand: kb053uHand, discardPile: [...kb053uPs.discardPile, kb053uDiscarded] };
          newState = { ...newState, [kb053uPlayer]: kb053uNewPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb053uPlayer,
            'EFFECT_DISCARD', `Kabuto Yakushi (053) UPGRADE: Discarded ${kb053uDiscarded.name_fr}.`,
            'game.log.effect.discard', { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: kb053uDiscarded.name_fr });
          break;
        }

        const kb053uOptions = kb053uPs.hand.map((_: any, i: number) => String(i));
        const kb053uEffId = generateInstanceId();
        const kb053uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: kb053uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KABUTO053_CHOOSE_DISCARD',
          sourcePlayer: kb053uPlayer, requiresTargetSelection: true,
          validTargets: kb053uOptions, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: kb053uActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: kb053uPlayer,
          originPlayer: kb053uPlayer,
          description: 'Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.kabuto053ChooseDiscard',
          options: kb053uOptions, minSelections: 1, maxSelections: 1,
          sourceEffectId: kb053uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KABUTO053_CONFIRM_MAIN': {
        const kb053mPlayer = pendingEffect.sourcePlayer;
        const kb053mPs = newState[kb053mPlayer];

        if (kb053mPs.discardPile.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb053mPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (053): Discard pile empty (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' });
          break;
        }

        const kb053mTopCard = kb053mPs.discardPile[kb053mPs.discardPile.length - 1];
        if (kb053mTopCard.card_type !== 'character') {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb053mPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (053): Top of discard is not a character (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' });
          break;
        }

        const kb053mReducedCost = Math.max(0, (kb053mTopCard.chakra ?? 0) - 3);
        const kb053mCanAffordFresh = kb053mPs.chakra >= kb053mReducedCost;

        const kb053mFriendlySide = kb053mPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const kb053mValidMissions: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const mChars = newState.activeMissions[i][kb053mFriendlySide];
          const hasSameName = mChars.some((c: CharacterInPlay) => {
            if (c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return cTop.name_fr.toUpperCase() === kb053mTopCard.name_fr.toUpperCase();
          });
          // Check same-name upgrade AND flexible cross-name upgrade (e.g. Orochimaru 138)
          const canUpgrade = mChars.some((c: CharacterInPlay) => {
            if (c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            const isSameName = cTop.name_fr.toUpperCase() === kb053mTopCard.name_fr.toUpperCase()
              && (kb053mTopCard.chakra ?? 0) > (cTop.chakra ?? 0);
            const isFlex = checkFlexibleUpgrade(kb053mTopCard as any, cTop)
              && (kb053mTopCard.chakra ?? 0) > (cTop.chakra ?? 0);
            if (!isSameName && !isFlex) return false;
            // Check if player can afford the upgrade cost with 3 reduction
            const upgCost = Math.max(0, ((kb053mTopCard.chakra ?? 0) - (cTop.chakra ?? 0)) - 3);
            return kb053mPs.chakra >= upgCost;
          });
          if (canUpgrade || (!hasSameName && kb053mCanAffordFresh)) {
            kb053mValidMissions.push(String(i));
          }
        }

        if (kb053mValidMissions.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb053mPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (053): No valid mission to play from discard (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' });
          break;
        }

        if (kb053mValidMissions.length === 1) {
          const kb053mMIdx = parseInt(kb053mValidMissions[0], 10);
          newState = EffectEngine.kabuto053PlayFromDiscard(newState, kb053mPlayer, kb053mMIdx, kb053mReducedCost, undefined);
          break;
        }

        const kb053mEffId = generateInstanceId();
        const kb053mActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: kb053mEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ reducedCost: kb053mReducedCost }),
          targetSelectionType: 'KABUTO053_CHOOSE_MISSION',
          sourcePlayer: kb053mPlayer, requiresTargetSelection: true,
          validTargets: kb053mValidMissions, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: kb053mActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: kb053mPlayer,
          originPlayer: kb053mPlayer,
          description: 'Choose a mission to play the character from discard.',
          descriptionKey: 'game.effect.desc.kabuto053ChooseMission',
          descriptionParams: { cardName: kb053mTopCard.name_fr, cost: String(kb053mReducedCost) },
          options: kb053mValidMissions, minSelections: 1, maxSelections: 1,
          sourceEffectId: kb053mEffId,
        }];
        break;
      }

      case 'KABUTO054_CONFIRM_UPGRADE': {
        // POWERUP 1 on self
        const kb054uPlayer = pendingEffect.sourcePlayer;
        const kb054uSide = kb054uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const kb054uMI = pendingEffect.sourceMissionIndex;
        const missions_kb054u = [...newState.activeMissions];
        const m_kb054u = { ...missions_kb054u[kb054uMI] };
        const chars_kb054u = [...m_kb054u[kb054uSide]];
        const idx_kb054u = chars_kb054u.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_kb054u !== -1) {
          chars_kb054u[idx_kb054u] = { ...chars_kb054u[idx_kb054u], powerTokens: chars_kb054u[idx_kb054u].powerTokens + 1 };
          m_kb054u[kb054uSide] = chars_kb054u;
          missions_kb054u[kb054uMI] = m_kb054u;
          newState = { ...newState, activeMissions: missions_kb054u };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, kb054uPlayer,
          'EFFECT_POWERUP', 'Kabuto Yakushi (054): POWERUP 1 (upgrade effect).',
          'game.log.effect.powerupSelf', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', amount: 1 });
        break;
      }

      case 'KABUTO054_CONFIRM_MAIN': {
        // Batch hide: all non-hidden chars in this mission with power < self power
        const kb054mPlayer = pendingEffect.sourcePlayer;
        const kb054mSrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!kb054mSrcChar) break;
        const kb054mMI = kb054mSrcChar.missionIndex;
        const kb054mMission = newState.activeMissions[kb054mMI];
        if (!kb054mMission) break;
        const kb054mSelfPower = getEffectivePower(newState, kb054mSrcChar.character, kb054mPlayer);

        if (kb054mSelfPower <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb054mPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (054): Self has 0 power (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' });
          break;
        }

        const kb054mTargets: { instanceId: string; char: CharacterInPlay; sidePlayer: PlayerID }[] = [];
        for (const side of ['player1Characters', 'player2Characters'] as const) {
          const sidePlayer = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
          for (const char of kb054mMission[side]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const charPower = getEffectivePower(newState, char, sidePlayer);
            if (charPower < kb054mSelfPower) {
              kb054mTargets.push({ instanceId: char.instanceId, char, sidePlayer });
            }
          }
        }

        if (kb054mTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, kb054mPlayer,
            'EFFECT_NO_TARGET', 'Kabuto Yakushi (054): No characters with less power (state changed).',
            'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' });
          break;
        }

        // Sort targets so Gemma 049 is processed last
        const kb054mSorted = sortTargetsGemmaLast(kb054mTargets.map(t => t.char));
        const kb054mSortedIds = kb054mSorted.map((c: CharacterInPlay) => c.instanceId);
        const kb054mOrdered = kb054mSortedIds.map((id: string) => kb054mTargets.find(t => t.instanceId === id)!);

        // Gemma 049 pre-scan: check for multi-LV targets on opponent side
        const kb054mAlreadyGemma = newState.pendingEffects.some(
          (pe: any) => (pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' || pe.targetSelectionType === 'GEMMA049_CHOOSE_PROTECT_HIDE') && !pe.resolved,
        );
        let kb054mGemmaCreated = false;
        if (!kb054mAlreadyGemma) {
          for (const side of ['player1Characters', 'player2Characters'] as const) {
            const sidePlayer = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
            if (sidePlayer === kb054mPlayer) continue;
            const sideChars = kb054mMission[side];
            let gemmaChar: CharacterInPlay | null = null;
            for (const ch of sideChars) {
              if (ch.isHidden) continue;
              const fTopCard = ch.stack?.length > 0 ? ch.stack[ch.stack?.length - 1] : ch.card;
              if (fTopCard.number === 49) {
                const hasSacrifice = (fTopCard.effects ?? []).some(
                  (e: any) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
                    e.description.includes('Leaf Village') && e.description.includes('defeat this character instead'),
                );
                if (hasSacrifice) { gemmaChar = ch; break; }
              }
            }
            if (!gemmaChar) continue;

            const lvTargetIds = kb054mOrdered
              .filter(t => t.sidePlayer === sidePlayer && t.char.card.group === 'Leaf Village')
              .map(t => t.instanceId);

            if (lvTargetIds.length >= 2) {
              const effectId = generateInstanceId();
              const actionId = generateInstanceId();
              const allTargetIds = kb054mOrdered.map(t => t.instanceId);
              newState.pendingEffects = [...newState.pendingEffects, {
                id: effectId,
                sourceCardId: 'KS-049-C',
                sourceInstanceId: gemmaChar.instanceId,
                sourceMissionIndex: kb054mMI,
                effectType: 'MAIN' as const,
                effectDescription: JSON.stringify({
                  sacrificeInstanceId: gemmaChar.instanceId,
                  effectSource: kb054mPlayer,
                  batchAllTargets: allTargetIds,
                  batchLVTargets: lvTargetIds,
                  batchSourcePlayer: kb054mPlayer,
                }),
                targetSelectionType: 'GEMMA049_CHOOSE_PROTECT_HIDE',
                sourcePlayer: sidePlayer,
                requiresTargetSelection: true,
                validTargets: lvTargetIds,
                isOptional: true,
                isMandatory: false,
                resolved: false,
                isUpgrade: false,
              }];
              newState.pendingActions = [...newState.pendingActions, {
                id: actionId,
                type: 'SELECT_TARGET' as PendingAction['type'],
                player: sidePlayer,
                description: 'Gemma Shiranui (049): Choose which Leaf Village character to protect from being hidden (or skip).',
                descriptionKey: 'game.effect.desc.gemma049ChooseProtect',
                options: lvTargetIds,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: effectId,
              }];
              kb054mGemmaCreated = true;
              break;
            }
          }
        }
        if (kb054mGemmaCreated) break;

        // Sequential hide: player chooses order, one target at a time
        const kb054mAllTargetIds = kb054mOrdered.map(t => t.instanceId);

        if (kb054mAllTargetIds.length === 1) {
          // Only one target — auto-hide it
          newState = EffectEngine.hideCharacterWithLog(newState, kb054mAllTargetIds[0], kb054mPlayer);
        } else {
          // Multiple targets — let player choose order
          const kb054mSeqEffId = generateInstanceId();
          const kb054mSeqActId = generateInstanceId();
          newState.pendingEffects.push({
            id: kb054mSeqEffId, sourceCardId: 'KS-054-UC',
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: kb054mMI, effectType: 'MAIN' as EffectType,
            effectDescription: JSON.stringify({
              remainingTargets: kb054mAllTargetIds,
              sourcePlayer: kb054mPlayer,
              selfPower: kb054mSelfPower,
            }),
            targetSelectionType: 'KABUTO054_CHOOSE_HIDE_TARGET',
            sourcePlayer: kb054mPlayer, requiresTargetSelection: true,
            validTargets: kb054mAllTargetIds,
            isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: kb054mSeqActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: kb054mPlayer,
            description: 'Kabuto Yakushi (054): Choose which character to hide first.',
            descriptionKey: 'game.effect.desc.kabuto054ChooseHideTarget',
            options: kb054mAllTargetIds,
            minSelections: 1, maxSelections: 1, sourceEffectId: kb054mSeqEffId,
          });
        }
        break;
      }

      case 'KABUTO054_CHOOSE_HIDE_TARGET': {
        // Sequential hide: player chose a target to hide
        const kb054sPlayer = pendingEffect.sourcePlayer;
        let kb054sMeta: { remainingTargets?: string[]; sourcePlayer?: string; selfPower?: number } = {};
        try { kb054sMeta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const kb054sRemaining = (kb054sMeta.remainingTargets ?? []).filter((id: string) => id !== targetId);

        // Hide the chosen target
        const pendingCountBefore054 = newState.pendingEffects.length;
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, kb054sPlayer);

        // Check if Gemma 049 intercepted
        const gemma054Pending = newState.pendingEffects.find(
          (pe: any) => pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' && !pe.resolved
            && newState.pendingEffects.length > pendingCountBefore054,
        );
        if (gemma054Pending && kb054sRemaining.length > 0) {
          // Store remaining targets for Gemma to continue after
          const existingDesc054 = JSON.parse(gemma054Pending.effectDescription);
          existingDesc054.batchRemainingTargets = kb054sRemaining;
          existingDesc054.batchSourcePlayer = kb054sPlayer;
          gemma054Pending.effectDescription = JSON.stringify(existingDesc054);
          break;
        }

        // Continue with remaining targets
        if (kb054sRemaining.length > 0) {
          // Re-validate remaining targets still exist and are non-hidden
          const kb054sValidRemaining = kb054sRemaining.filter((id: string) => {
            const res = EffectEngine.findCharByInstanceId(newState, id);
            return res && !res.character.isHidden;
          });

          if (kb054sValidRemaining.length === 1) {
            // Auto-hide last remaining
            newState = EffectEngine.hideCharacterWithLog(newState, kb054sValidRemaining[0], kb054sPlayer);
          } else if (kb054sValidRemaining.length > 1) {
            // More targets — create next choice
            const kb054sNextEffId = generateInstanceId();
            const kb054sNextActId = generateInstanceId();
            newState.pendingEffects.push({
              id: kb054sNextEffId, sourceCardId: 'KS-054-UC',
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: 'MAIN' as EffectType,
              effectDescription: JSON.stringify({
                remainingTargets: kb054sValidRemaining,
                sourcePlayer: kb054sPlayer,
              }),
              targetSelectionType: 'KABUTO054_CHOOSE_HIDE_TARGET',
              sourcePlayer: kb054sPlayer, requiresTargetSelection: true,
              validTargets: kb054sValidRemaining,
              isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
            });
            newState.pendingActions.push({
              id: kb054sNextActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: kb054sPlayer,
              description: 'Kabuto Yakushi (054): Choose next character to hide.',
              descriptionKey: 'game.effect.desc.kabuto054ChooseHideTarget',
              options: kb054sValidRemaining,
              minSelections: 1, maxSelections: 1, sourceEffectId: kb054sNextEffId,
            });
          }
        }
        break;
      }

      case 'KIMIMARO055_CONFIRM_AMBUSH': {
        const km055Player = pendingEffect.sourcePlayer;
        const km055Ps = newState[km055Player];

        if (km055Ps.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, km055Player,
            'EFFECT_NO_TARGET', 'Kimimaro (055): No cards in hand to discard (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' });
          break;
        }

        // Check valid hide targets exist (cost <= 3)
        let km055HasHideTarget = false;
        for (const mission of newState.activeMissions) {
          for (const side of ['player1Characters', 'player2Characters'] as const) {
            const sideOwner = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
            const isEnemy = sideOwner !== km055Player;
            for (const char of mission[side]) {
              if (char.isHidden) continue;
              if (isEnemy && !canBeHiddenByEnemy(newState, char, sideOwner)) continue;
              const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
              if ((topCard.chakra ?? 0) <= 3) { km055HasHideTarget = true; break; }
            }
            if (km055HasHideTarget) break;
          }
          if (km055HasHideTarget) break;
        }

        if (!km055HasHideTarget) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, km055Player,
            'EFFECT_NO_TARGET', 'Kimimaro (055): No valid character to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' });
          break;
        }

        if (km055Ps.hand.length === 1) {
          // Auto-discard the only card, then chain to hide target selection
          newState = EffectEngine.kimimaroChooseDiscard(newState, pendingEffect, '0');
          break;
        }

        const km055Options = km055Ps.hand.map((_: any, i: number) => String(i));
        const km055EffId = generateInstanceId();
        const km055ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: km055EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIMIMARO_CHOOSE_DISCARD',
          sourcePlayer: km055Player, requiresTargetSelection: true,
          validTargets: km055Options, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: km055ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: km055Player,
          description: 'Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.kimimaro055Discard',
          options: km055Options, minSelections: 1, maxSelections: 1,
          sourceEffectId: km055EffId,
        }];
        break;
      }

      case 'KIMIMARO056_CONFIRM_UPGRADE': {
        const km056Player = pendingEffect.sourcePlayer;
        const km056Ps = newState[km056Player];

        if (km056Ps.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, km056Player,
            'EFFECT_NO_TARGET', 'Kimimaro (056): No cards in hand to discard (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-056-UC' });
          break;
        }

        // Check valid hide targets exist (cost <= 4)
        let km056HasHideTarget = false;
        for (const mission of newState.activeMissions) {
          for (const side of ['player1Characters', 'player2Characters'] as const) {
            const sideOwner = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
            const isEnemy = sideOwner !== km056Player;
            for (const char of mission[side]) {
              if (char.isHidden) continue;
              if (isEnemy && !canBeHiddenByEnemy(newState, char, sideOwner)) continue;
              const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
              if ((topCard.chakra ?? 0) <= 4) { km056HasHideTarget = true; break; }
            }
            if (km056HasHideTarget) break;
          }
          if (km056HasHideTarget) break;
        }

        if (!km056HasHideTarget) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, km056Player,
            'EFFECT_NO_TARGET', 'Kimimaro (056): No valid character to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-056-UC' });
          break;
        }

        if (km056Ps.hand.length === 1) {
          // Auto-discard the only card
          const km056Hand = [...km056Ps.hand];
          const km056Discarded = km056Hand.splice(0, 1)[0];
          const km056NewPs = { ...km056Ps, hand: km056Hand, discardPile: [...km056Ps.discardPile, km056Discarded] };
          newState = { ...newState, [km056Player]: km056NewPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, km056Player,
            'EFFECT_DISCARD', `Kimimaro (056) UPGRADE: Discarded ${km056Discarded.name_fr} from hand.`,
            'game.log.effect.discard', { card: 'KIMIMARO', id: 'KS-056-UC', target: km056Discarded.name_fr });

          // Find valid hide targets (cost <= 4)
          const km056HideTargets: string[] = [];
          for (const mission_km of newState.activeMissions) {
            for (const side_km of ['player1Characters', 'player2Characters'] as const) {
              const sideOwner_km = (side_km === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
              const isEnemy_km = sideOwner_km !== km056Player;
              for (const char_km of mission_km[side_km]) {
                if (char_km.isHidden) continue;
                if (isEnemy_km && !canBeHiddenByEnemy(newState, char_km, sideOwner_km)) continue;
                const topCard_km = char_km.stack?.length > 0 ? char_km.stack[char_km.stack?.length - 1] : char_km.card;
                if ((topCard_km.chakra ?? 0) <= 4) km056HideTargets.push(char_km.instanceId);
              }
            }
          }

          if (km056HideTargets.length === 1) {
            newState = EffectEngine.hideCharacterWithLog(newState, km056HideTargets[0], km056Player);
          } else if (km056HideTargets.length > 1) {
            const km056hEffId = generateInstanceId();
            const km056hActId = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: km056hEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: '', targetSelectionType: 'KIMIMARO056_CHOOSE_HIDE',
              sourcePlayer: km056Player, requiresTargetSelection: true,
              validTargets: km056HideTargets, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: pendingEffect.isUpgrade,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: km056hActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: km056Player,
              description: 'Kimimaro (056): Choose a character to hide (cost 4 or less).',
              descriptionKey: 'game.effect.desc.kimimaro056ChooseHide',
              options: km056HideTargets, minSelections: 1, maxSelections: 1,
              sourceEffectId: km056hEffId,
            }];
            pendingEffect.remainingEffectTypes = undefined;
          }
          break;
        }

        // Multiple cards in hand: mandatory child
        const km056Options = km056Ps.hand.map((_: any, i: number) => String(i));
        const km056EffId = generateInstanceId();
        const km056ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: km056EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIMIMARO056_CHOOSE_DISCARD',
          sourcePlayer: km056Player, requiresTargetSelection: true,
          validTargets: km056Options, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: pendingEffect.isUpgrade,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: km056ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: km056Player,
          description: 'Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.kimimaro056Discard',
          options: km056Options, minSelections: 1, maxSelections: 1,
          sourceEffectId: km056EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'JIROBO057_CONFIRM_MAIN': {
        const j057Player = pendingEffect.sourcePlayer;
        const j057FriendlySide = j057Player === 'player1' ? 'player1Characters' : 'player2Characters';

        let j057Count = 0;
        for (const mission of newState.activeMissions) {
          const hasSF = (mission as any)[j057FriendlySide].some((char: CharacterInPlay) => {
            if (char.instanceId === pendingEffect.sourceInstanceId) return false;
            if (char.isHidden) return false;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            return topCard.keywords && topCard.keywords.includes('Sound Four');
          });
          if (hasSF) j057Count++;
        }

        if (j057Count === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j057Player,
            'EFFECT_NO_TARGET', 'Jirobo (057): No missions with a friendly Sound Four character (state changed).',
            'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-057-C' });
          break;
        }

        // POWERUP X on self
        const j057Side = j057Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const j057MI = pendingEffect.sourceMissionIndex;
        const missions_j057 = [...newState.activeMissions];
        const m_j057 = { ...missions_j057[j057MI] };
        const chars_j057 = [...m_j057[j057Side]];
        const idx_j057 = chars_j057.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_j057 !== -1) {
          chars_j057[idx_j057] = { ...chars_j057[idx_j057], powerTokens: chars_j057[idx_j057].powerTokens + j057Count };
          m_j057[j057Side] = chars_j057;
          missions_j057[j057MI] = m_j057;
          newState = { ...newState, activeMissions: missions_j057 };
        }
        newState.log = logAction(newState.log, newState.turn, newState.phase, j057Player,
          'EFFECT_POWERUP', `Jirobo (057): POWERUP ${j057Count} on self.`,
          'game.log.effect.powerupSelf', { card: 'JIROBO', id: 'KS-057-C', amount: j057Count });
        break;
      }

      case 'JIROBO058_CONFIRM_MAIN': {
        // MAIN: POWERUP 1 to Sound Four chars in THIS mission only
        const j058Player = pendingEffect.sourcePlayer;
        const j058FriendlySide = j058Player === 'player1' ? 'player1Characters' : 'player2Characters';

        const j058Targets: { missionIndex: number; instanceId: string }[] = [];
        const j058Mission = newState.activeMissions[pendingEffect.sourceMissionIndex];
        if (j058Mission) {
          for (const char of (j058Mission as any)[j058FriendlySide] as CharacterInPlay[]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
              j058Targets.push({ missionIndex: pendingEffect.sourceMissionIndex, instanceId: char.instanceId });
            }
          }
        }

        if (j058Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j058Player,
            'EFFECT_NO_TARGET', 'Jirobo (058): No other friendly Sound Four characters in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-058-UC' });
          break;
        }

        // POWERUP 1 on each target
        const missions_j058 = [...newState.activeMissions];
        for (const t of j058Targets) {
          const m = { ...missions_j058[t.missionIndex] };
          const chars = [...m[j058FriendlySide]];
          const idx = chars.findIndex((c: CharacterInPlay) => c.instanceId === t.instanceId);
          if (idx !== -1) {
            chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + 1 };
            m[j058FriendlySide] = chars;
            missions_j058[t.missionIndex] = m;
          }
        }
        newState = { ...newState, activeMissions: missions_j058 };
        newState.log = logAction(newState.log, newState.turn, newState.phase, j058Player,
          'EFFECT_POWERUP', `Jirobo (058) MAIN: POWERUP 1 on ${j058Targets.length} Sound Four character(s) in this mission.`,
          'game.log.effect.powerup', { card: 'JIROBO', id: 'KS-058-UC', amount: '1', count: j058Targets.length });
        break;
      }

      case 'JIROBO058_CONFIRM_UPGRADE': {
        // UPGRADE: POWERUP 1 to Sound Four chars in OTHER missions (not the source mission)
        const j058uPlayer = pendingEffect.sourcePlayer;
        const j058uFriendlySide = j058uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        const j058uTargets: { missionIndex: number; instanceId: string }[] = [];
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          if (mIdx === pendingEffect.sourceMissionIndex) continue; // Skip source mission
          const mission = newState.activeMissions[mIdx];
          for (const char of (mission as any)[j058uFriendlySide] as CharacterInPlay[]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
              j058uTargets.push({ missionIndex: mIdx, instanceId: char.instanceId });
            }
          }
        }

        if (j058uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j058uPlayer,
            'EFFECT_NO_TARGET', 'Jirobo (058) UPGRADE: No friendly Sound Four characters in other missions (state changed).',
            'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-058-UC' });
          break;
        }

        // POWERUP 1 on each target
        const missions_j058u = [...newState.activeMissions];
        for (const t of j058uTargets) {
          const m = { ...missions_j058u[t.missionIndex] };
          const chars = [...m[j058uFriendlySide]];
          const idx = chars.findIndex((c: CharacterInPlay) => c.instanceId === t.instanceId);
          if (idx !== -1) {
            chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + 1 };
            m[j058uFriendlySide] = chars;
            missions_j058u[t.missionIndex] = m;
          }
        }
        newState = { ...newState, activeMissions: missions_j058u };
        newState.log = logAction(newState.log, newState.turn, newState.phase, j058uPlayer,
          'EFFECT_POWERUP', `Jirobo (058) UPGRADE: POWERUP 1 on ${j058uTargets.length} Sound Four character(s) in other missions.`,
          'game.log.effect.powerup', { card: 'JIROBO', id: 'KS-058-UC', amount: '1', count: j058uTargets.length });
        break;
      }

      case 'KIDOMARU059_CONFIRM_MAIN': {
        const k059Player = pendingEffect.sourcePlayer;
        const k059FriendlySide: 'player1Characters' | 'player2Characters' =
          k059Player === 'player1' ? 'player1Characters' : 'player2Characters';

        // Re-count X (Sound Four mission count)
        let k059X = 0;
        for (const mission of newState.activeMissions) {
          const hasSF = (mission as any)[k059FriendlySide].some((char: CharacterInPlay) => {
            if (char.instanceId === pendingEffect.sourceInstanceId) return false;
            if (char.isHidden) return false;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            return topCard.keywords && topCard.keywords.includes('Sound Four');
          });
          if (hasSF) k059X++;
        }

        if (k059X === 0 || newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k059Player,
            'EFFECT_NO_TARGET', 'Kidomaru (059): Cannot move (state changed).',
            'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-059-C' });
          break;
        }

        // Find movable friendly chars (R8+R10)
        const k059Targets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (isMovementBlockedByKurenai(newState, i, k059Player)) continue;
          for (const char of newState.activeMissions[i][k059FriendlySide]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const charName = topCard.name_fr;
            const hasValidDest = newState.activeMissions.some((m: any, di: number) => {
              if (di === i) return false;
              return !m[k059FriendlySide].some((c: any) => {
                if (c.instanceId === char.instanceId) return false;
                if (c.isHidden) return false;
                const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                return cTop.name_fr === charName;
              });
            });
            if (hasValidDest) k059Targets.push(char.instanceId);
          }
        }

        if (k059Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k059Player,
            'EFFECT_NO_TARGET', 'Kidomaru (059): No friendly characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-059-C' });
          break;
        }

        // Chain to KIDOMARU_CHOOSE_CHARACTER with movesRemaining: X
        const k059EffId = generateInstanceId();
        const k059ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k059EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ movesRemaining: k059X }),
          targetSelectionType: 'KIDOMARU_CHOOSE_CHARACTER',
          sourcePlayer: k059Player, requiresTargetSelection: true,
          validTargets: k059Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k059ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k059Player,
          description: `Kidomaru (059): Choose a friendly character to move (${k059X} move(s) remaining).`,
          descriptionKey: 'game.effect.desc.kidomaru059ChooseChar',
          descriptionParams: { remaining: k059X },
          options: k059Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k059EffId,
        }];
        break;
      }

      case 'KIDOMARU060_CONFIRM_MAIN': {
        const k060SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!k060SrcChar) break;
        const k060MIdx = k060SrcChar.missionIndex;
        const k060Mission = newState.activeMissions[k060MIdx];
        if (!k060Mission || newState.activeMissions.length < 2) break;

        const k060Targets: string[] = [];
        for (const char of [...k060Mission.player1Characters, ...k060Mission.player2Characters]) {
          const charCtrl = k060Mission.player1Characters.some((c: CharacterInPlay) => c.instanceId === char.instanceId) ? 'player1' : 'player2';
          if (isMovementBlockedByKurenai(newState, k060MIdx, charCtrl as PlayerID)) continue;
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          const charName = topCard.name_fr;
          const ctrlSide: 'player1Characters' | 'player2Characters' = charCtrl === 'player1' ? 'player1Characters' : 'player2Characters';
          const hasValidDest = char.isHidden || newState.activeMissions.some((m: any, i: number) => {
            if (i === k060MIdx) return false;
            return !m[ctrlSide].some((c: any) => {
              if (c.instanceId === char.instanceId) return false;
              if (c.isHidden) return false;
              const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              return cTop.name_fr === charName;
            });
          });
          if (hasValidDest) k060Targets.push(char.instanceId);
        }

        if (k060Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kidômaru (060): No character can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'KIDÔMARU', id: 'KS-060-UC' });
          break;
        }

        if (k060Targets.length === 1) {
          const k060AutoChar = EffectEngine.findCharByInstanceId(newState, k060Targets[0]);
          if (k060AutoChar) {
            const k060Dests: string[] = [];
            for (let i = 0; i < newState.activeMissions.length; i++) {
              if (i !== k060AutoChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, k060AutoChar.character, i, k060AutoChar.player)) {
                k060Dests.push(String(i));
              }
            }
            if (k060Dests.length === 1) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, k060Targets[0], parseInt(k060Dests[0], 10),
                k060AutoChar.player, 'KS-060-UC', 'KS-060-UC',
                pendingEffect.sourcePlayer,
              );
              break;
            }
            if (k060Dests.length > 1) {
              const k060dEffId = generateInstanceId();
              const k060dActId = generateInstanceId();
              newState.pendingEffects = [...newState.pendingEffects, {
                id: k060dEffId, sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: k060Targets[0] }),
                targetSelectionType: 'KIDOMARU060_MOVE_DESTINATION',
                sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
                validTargets: k060Dests, isOptional: false, isMandatory: true,
                resolved: false, isUpgrade: false,
                remainingEffectTypes: pendingEffect.remainingEffectTypes,
              }];
              newState.pendingActions = [...newState.pendingActions, {
                id: k060dActId, type: 'SELECT_TARGET' as PendingAction['type'],
                player: pendingEffect.sourcePlayer,
                description: 'Choose a mission to move the character to.',
                descriptionKey: 'game.effect.desc.chooseMissionMove',
                options: k060Dests, minSelections: 1, maxSelections: 1,
                sourceEffectId: k060dEffId,
              }];
              pendingEffect.remainingEffectTypes = undefined;
              break;
            }
          }
          break;
        }

        // Multiple targets: mandatory child (no SKIP after CONFIRM)
        const k060EffId = generateInstanceId();
        const k060ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k060EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: k060MIdx,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIDOMARU060_CHOOSE_CHARACTER',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: k060Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k060ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Kidômaru (060): Choose a character in this mission to move.',
          descriptionKey: 'game.effect.desc.kidomaru060ChooseChar',
          options: k060Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k060EffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KIDOMARU060_CONFIRM_AMBUSH': {
        const k060aEnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k060aEnemyPlayer = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const k060aTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[k060aEnemySide] as CharacterInPlay[]) {
            if (getEffectivePower(newState, char, k060aEnemyPlayer as PlayerID) <= 1) {
              k060aTargets.push(char.instanceId);
            }
          }
        }

        if (k060aTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kidômaru (060) AMBUSH: No enemy character with Power 1 or less (state changed).',
            'game.log.effect.noTarget', { card: 'KIDÔMARU', id: 'KS-060-UC' });
          break;
        }

        if (k060aTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, k060aTargets[0], pendingEffect.sourcePlayer);
          break;
        }

        const k060aEffId = generateInstanceId();
        const k060aActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: k060aEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIDOMARU060_DEFEAT_LOW_POWER',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: k060aTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: k060aActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Kidômaru (060) AMBUSH: Select an enemy character with Power 1 or less to defeat.',
          descriptionKey: 'game.effect.desc.kidomaru060DefeatLowPower',
          options: k060aTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k060aEffId,
        }];
        break;
      }

      // =============================================
      // BATCH 7 CONFIRM CASES (KS-061 to KS-070)
      // =============================================

      case 'SAKON061_CONFIRM_MAIN': {
        // Re-count missions with friendly Sound Four (excluding self), draw X cards
        const s061Player = pendingEffect.sourcePlayer;
        const s061FriendlySide = s061Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let s061Count = 0;
        for (const mission of newState.activeMissions) {
          const hasSF = (mission as any)[s061FriendlySide].some((char: CharacterInPlay) => {
            if (char.instanceId === pendingEffect.sourceInstanceId) return false;
            if (char.isHidden) return false;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            return topCard.keywords && topCard.keywords.includes('Sound Four');
          });
          if (hasSF) s061Count++;
        }

        if (s061Count === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s061Player,
            'EFFECT_NO_TARGET', 'Sakon (061): No missions with friendly Sound Four characters (state changed).',
            'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-061-C' });
          break;
        }

        const ps061 = { ...newState[s061Player] };
        const newDeck061 = [...ps061.deck];
        const newHand061 = [...ps061.hand];
        for (let i = 0; i < s061Count; i++) {
          if (newDeck061.length === 0) break;
          newHand061.push(newDeck061.shift()!);
        }
        const drawn061 = newHand061.length - ps061.hand.length;
        ps061.deck = newDeck061;
        ps061.hand = newHand061;
        newState = { ...newState, [s061Player]: ps061 };
        newState.log = logAction(newState.log, newState.turn, newState.phase, s061Player,
          'EFFECT_DRAW', `Sakon (061): Drew ${drawn061} card(s).`,
          'game.log.effect.draw', { card: 'Sakon', id: 'KS-061-C', count: String(drawn061) });
        break;
      }

      case 'SAKON062_CONFIRM_AMBUSH': {
        // Re-find friendly Sound Four targets with copyable effects
        const s062Player = pendingEffect.sourcePlayer;
        const s062FriendlySide = s062Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const s062Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[s062FriendlySide] as CharacterInPlay[]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
              const hasInstant = topCard.effects?.some((eff: any) => {
                if (eff.type === 'SCORE') return false; // SCORE never copyable
                if (eff.description && eff.description.includes('[⧗]')) return false;
                if (eff.description && (eff.description.startsWith('effect:') || eff.description.startsWith('effect.'))) return false;
                return true;
              });
              if (hasInstant) s062Targets.push(char.instanceId);
            }
          }
        }

        if (s062Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s062Player,
            'EFFECT_NO_TARGET', 'Sakon (062): No friendly Sound Four with copyable effect (state changed).',
            'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-062-UC' });
          break;
        }

        if (s062Targets.length === 1) {
          // Auto-select the single target — feed into existing SAKON062_COPY_EFFECT logic
          const s062AutoResult = EffectEngine.findCharByInstanceId(newState, s062Targets[0]);
          if (!s062AutoResult) break;
          const s062TopCard = s062AutoResult.character.stack?.length > 0
            ? s062AutoResult.character.stack[s062AutoResult.character.stack?.length - 1]
            : s062AutoResult.character.card;
          const s062Copyable = (s062TopCard.effects ?? []).filter((eff: any) => {
            if (eff.type === 'SCORE') return false; // SCORE never copyable
            if (eff.description.includes('[⧗]')) return false;
            if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
            return true;
          });
          if (s062Copyable.length === 0) break;
          if (s062Copyable.length === 1) {
            newState = EffectEngine.executeCopiedEffect(newState, pendingEffect, s062TopCard, s062Copyable[0].type as EffectType);
          } else {
            const s062ChoiceEffId = generateInstanceId();
            const s062ChoiceActId = generateInstanceId();
            const s062Opts = s062Copyable.map((eff: any) => `${eff.type}::${eff.description}`);
            newState.pendingEffects = [...newState.pendingEffects, {
              id: s062ChoiceEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: s062Targets[0], cardId: s062TopCard.id }),
              targetSelectionType: 'COPY_EFFECT_CHOSEN',
              sourcePlayer: s062Player, requiresTargetSelection: true,
              validTargets: s062Opts, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: s062ChoiceActId, type: 'CHOOSE_EFFECT' as PendingAction['type'],
              player: s062Player,
              description: `Choose which effect of ${s062TopCard.name_fr} to copy.`,
              descriptionKey: 'game.effect.desc.chooseEffectToCopy',
              descriptionParams: { target: s062TopCard.name_fr },
              options: s062Opts, minSelections: 1, maxSelections: 1,
              sourceEffectId: s062ChoiceEffId,
            }];
          }
          break;
        }

        // Multiple targets — create mandatory child SAKON062_COPY_EFFECT
        const s062EffId = generateInstanceId();
        const s062ActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: s062EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'SAKON062_COPY_EFFECT',
          sourcePlayer: s062Player, requiresTargetSelection: true,
          validTargets: s062Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: s062ActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: s062Player,
          description: 'Select a friendly Sound Four character to copy an instant effect from.',
          descriptionKey: 'game.effect.desc.sakon062CopyEffect',
          options: s062Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s062EffId,
        }];
        break;
      }

      case 'TAYUYA065_CONFIRM_AMBUSH': {
        // Re-find friendly Sound Village characters (excluding self)
        const t065aPlayer = pendingEffect.sourcePlayer;
        const t065aFriendlySide = t065aPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const t065aTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[t065aFriendlySide] as CharacterInPlay[]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.group === 'Sound Village') t065aTargets.push(char.instanceId);
          }
        }

        if (t065aTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t065aPlayer,
            'EFFECT_NO_TARGET', 'Tayuya (065): No friendly Sound Village character to POWERUP (state changed).',
            'game.log.effect.noTarget', { card: 'TAYUYA', id: 'KS-065-UC' });
          break;
        }

        if (t065aTargets.length === 1) {
          // Auto-apply POWERUP 2
          const t065aTargetId = t065aTargets[0];
          newState.activeMissions = newState.activeMissions.map((m) => ({
            ...m,
            player1Characters: m.player1Characters.map((c: CharacterInPlay) =>
              c.instanceId === t065aTargetId ? { ...c, powerTokens: c.powerTokens + 2 } : c),
            player2Characters: m.player2Characters.map((c: CharacterInPlay) =>
              c.instanceId === t065aTargetId ? { ...c, powerTokens: c.powerTokens + 2 } : c),
          }));
          const t065aChar = EffectEngine.findCharByInstanceId(newState, t065aTargetId);
          const t065aName = t065aChar ? t065aChar.character.card.name_fr : 'unknown';
          newState.log = logAction(newState.log, newState.turn, newState.phase, t065aPlayer,
            'EFFECT_POWERUP', `Tayuya (065): POWERUP 2 on ${t065aName} (ambush).`,
            'game.log.effect.powerup', { card: 'TAYUYA', id: 'KS-065-UC', amount: '2', target: t065aName });
          break;
        }

        // Multiple targets — mandatory child (no SKIP per Andy)
        const t065aEffId = generateInstanceId();
        const t065aActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: t065aEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'TAYUYA065_POWERUP_SOUND',
          sourcePlayer: t065aPlayer, requiresTargetSelection: true,
          validTargets: t065aTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: t065aActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: t065aPlayer,
          description: 'Select a friendly Sound Village character in play to give POWERUP 2.',
          descriptionKey: 'game.effect.desc.tayuya065PowerupSound',
          options: t065aTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: t065aEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'TAYUYA065_CONFIRM_UPGRADE': {
        // Re-peek top 3 cards of deck
        const t065uPlayer = pendingEffect.sourcePlayer;
        const ps065u = { ...newState[t065uPlayer] };
        if (ps065u.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t065uPlayer,
            'EFFECT', 'Tayuya (065): Deck empty (state changed).',
            'game.log.effect.noTarget', { card: 'TAYUYA', id: 'KS-065-UC' });
          break;
        }

        const lookCount065 = Math.min(3, ps065u.deck.length);
        const topCards065 = ps065u.deck.slice(0, lookCount065);
        const remainingDeck065 = ps065u.deck.slice(lookCount065);
        const matchIndices065: number[] = [];
        for (let i = 0; i < topCards065.length; i++) {
          if (topCards065[i].keywords && topCards065[i].keywords.includes('Summon')) matchIndices065.push(i);
        }
        const cardInfos065 = topCards065.map((c: any) => ({
          name: c.name_fr, name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, isSummon: !!(c.keywords && c.keywords.includes('Summon')),
          isMatch: !!(c.keywords && c.keywords.includes('Summon')),
        }));

        if (matchIndices065.length === 0) {
          // No Summon: put back, show info-only reveal
          ps065u.deck = [...topCards065, ...remainingDeck065];
          newState = { ...newState, [t065uPlayer]: ps065u };
          newState.log = logAction(newState.log, newState.turn, newState.phase, t065uPlayer,
            'EFFECT', `Tayuya (065): Looked at top ${lookCount065} of deck, no Summon found (upgrade).`,
            'game.log.effect.lookAtDeck', { card: 'TAYUYA', id: 'KS-065-UC' });

          const t065rEffId = generateInstanceId();
          const t065rActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: t065rEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              text: `Tayuya (065): No Summon in top ${lookCount065}. Cards put back.`,
              topCards: cardInfos065,
            }),
            targetSelectionType: 'TAYUYA065_UPGRADE_REVEAL',
            sourcePlayer: t065uPlayer, requiresTargetSelection: true,
            validTargets: ['confirm'], isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: t065rActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: t065uPlayer,
            description: JSON.stringify({
              text: `Tayuya (065): No Summon in top ${lookCount065}. Cards put back.`,
              topCards: cardInfos065,
            }),
            descriptionKey: 'game.effect.desc.tayuya065UpgradeReveal',
            options: ['confirm'], minSelections: 1, maxSelections: 1,
            sourceEffectId: t065rEffId,
          }];
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Summon found: create TAYUYA065_UPGRADE_CHOOSE child (SKIP ok per Andy — draw 0 valid)
        const t065cEffId = generateInstanceId();
        const t065cActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: t065cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({
            text: `Tayuya (065): Found ${matchIndices065.length} Summon card(s) in top ${lookCount065}. Choose which to draw.`,
            topCards: cardInfos065,
            topCardsRaw: topCards065,
            remainingDeck: remainingDeck065,
          }),
          targetSelectionType: 'TAYUYA065_UPGRADE_CHOOSE',
          sourcePlayer: t065uPlayer, requiresTargetSelection: true,
          validTargets: matchIndices065.map((i: number) => String(i)),
          isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: t065cActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: t065uPlayer,
          description: JSON.stringify({
            text: `Tayuya (065): Found ${matchIndices065.length} Summon card(s) in top ${lookCount065}. Choose which to draw.`,
            topCards: cardInfos065,
          }),
          descriptionKey: 'game.effect.desc.tayuya065UpgradeChoose',
          options: matchIndices065.map((i: number) => String(i)),
          minSelections: 0, maxSelections: matchIndices065.length,
          sourceEffectId: t065cEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'DOKI066_CONFIRM_MAIN': {
        // Re-check friendly Sound Four in source mission, steal 1 chakra
        const d066Player = pendingEffect.sourcePlayer;
        const d066Opponent = d066Player === 'player1' ? 'player2' : 'player1';
        const d066SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!d066SrcChar) break;
        const d066Mission = newState.activeMissions[d066SrcChar.missionIndex];
        if (!d066Mission) break;
        const d066FriendlySide = d066Player === 'player1' ? 'player1Characters' : 'player2Characters';

        const d066HasSF = (d066Mission as any)[d066FriendlySide].some((char: CharacterInPlay) => {
          if (char.instanceId === pendingEffect.sourceInstanceId) return false;
          if (char.isHidden) return false;
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          return topCard.keywords && topCard.keywords.includes('Sound Four');
        });

        if (!d066HasSF) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, d066Player,
            'EFFECT_NO_TARGET', 'Doki (066): No friendly Sound Four in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'DOKI', id: 'KS-066-UC' });
          break;
        }

        const d066Ps = { ...newState[d066Player] };
        const d066OpPs = { ...newState[d066Opponent] };
        const d066Amount = Math.min(1, d066OpPs.chakra);
        d066OpPs.chakra -= d066Amount;
        d066Ps.chakra += d066Amount;
        newState = { ...newState, [d066Player]: d066Ps, [d066Opponent]: d066OpPs };
        newState.log = logAction(newState.log, newState.turn, newState.phase, d066Player,
          'EFFECT_STEAL_CHAKRA', `Doki (066): Sound Four ally present - stole ${d066Amount} Chakra from opponent.`,
          'game.log.effect.stealChakra', { card: 'DOKI', id: 'KS-066-UC', amount: String(d066Amount) });
        break;
      }

      case 'ZAKU070_CONFIRM_MAIN': {
        // Opponent accepted: give them 1 chakra
        const z070Player = pendingEffect.sourcePlayer;
        const z070Opponent = z070Player === 'player1' ? 'player2' : 'player1';
        const z070OpPs = { ...newState[z070Opponent] };
        z070OpPs.chakra += 1;
        newState = { ...newState, [z070Opponent]: z070OpPs };
        newState.log = logAction(newState.log, newState.turn, newState.phase, z070Player,
          'EFFECT_CHAKRA', 'Zaku Abumi (070): Opponent gains 1 Chakra.',
          'game.log.effect.oppGainChakra', { card: 'Zaku Abumi', id: 'KS-070-C', amount: '1' });
        break;
      }

      case 'KIN072_CONFIRM_MAIN': {
        // Opponent accepted: draw 1 card
        const k072Player = pendingEffect.sourcePlayer;
        const k072Opponent = k072Player === 'player1' ? 'player2' : 'player1';
        const k072OpPs = { ...newState[k072Opponent] };
        if (k072OpPs.deck.length > 0) {
          const k072Deck = [...k072OpPs.deck];
          const k072Drawn = k072Deck.shift()!;
          k072OpPs.deck = k072Deck;
          k072OpPs.hand = [...k072OpPs.hand, k072Drawn];
          newState = { ...newState, [k072Opponent]: k072OpPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, k072Player,
            'EFFECT_DRAW', 'Kin Tsuchi (072): Opponent draws 1 card.',
            'game.log.effect.oppDraw', { card: 'Kin Tsuchi', id: 'KS-072-C', count: '1' });
        } else {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k072Player,
            'EFFECT_NO_TARGET', 'Kin Tsuchi (072): Opponent has no cards to draw.',
            'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-072-C' });
        }
        break;
      }

      case 'DOSU068_CONFIRM_MAIN': {
        // Re-find hidden chars in play, look at one
        const d068mTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.isHidden) d068mTargets.push(char.instanceId);
          }
        }

        if (d068mTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Dosu Kinuta (068): No hidden characters in play (state changed).',
            'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: 'KS-068-C' });
          break;
        }

        if (d068mTargets.length === 1) {
          // Auto-look
          newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, d068mTargets[0]);
          break;
        }

        // Multiple — mandatory child
        const d068mEffId = generateInstanceId();
        const d068mActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: d068mEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'LOOK_AT_HIDDEN_CHARACTER',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: d068mTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        newState.pendingActions = [...newState.pendingActions, {
          id: d068mActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Dosu Kinuta (068): Select a hidden character in play to look at.',
          descriptionKey: 'game.effect.desc.dosu068LookAtHidden',
          options: d068mTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: d068mEffId,
        }];
        break;
      }

      case 'DOSU068_CONFIRM_AMBUSH': {
        // Re-find hidden chars in play, defeat one
        const d068aTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.isHidden) d068aTargets.push(char.instanceId);
          }
        }

        if (d068aTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Dosu Kinuta (068): No hidden characters in play to defeat (state changed).',
            'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: 'KS-068-C' });
          break;
        }

        if (d068aTargets.length === 1) {
          // Auto-defeat
          newState = EffectEngine.defeatCharacter(newState, d068aTargets[0], pendingEffect.sourcePlayer);
          break;
        }

        // Multiple — mandatory child
        const d068aEffId = generateInstanceId();
        const d068aActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: d068aEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: d068aTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: d068aActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Dosu Kinuta (068) AMBUSH: Select a hidden character in play to defeat.',
          descriptionKey: 'game.effect.desc.dosu068Defeat',
          options: d068aTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: d068aEffId,
        }];
        break;
      }

      case 'DOSU069_CONFIRM_UPGRADE': {
        // Re-find hidden chars in play, look at one. R4 propagation (Type B, MAIN remaining)
        const d069uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.isHidden) d069uTargets.push(char.instanceId);
          }
        }

        if (d069uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Dosu Kinuta (069): No hidden characters in play (state changed).',
            'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: 'KS-069-UC' });
          break;
        }

        if (d069uTargets.length === 1) {
          // Auto-look
          newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, d069uTargets[0]);
          break;
        }

        // Multiple — mandatory child with R4 propagation
        const d069uEffId = generateInstanceId();
        const d069uActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: d069uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'LOOK_AT_HIDDEN_CHARACTER',
          sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
          validTargets: d069uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: d069uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: pendingEffect.sourcePlayer,
          description: 'Dosu Kinuta (069) UPGRADE: Select a hidden character in play to look at.',
          descriptionKey: 'game.effect.desc.dosu069LookAtHidden',
          options: d069uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: d069uEffId,
        }];
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'DOSU069_CONFIRM_MAIN': {
        // Re-find hidden enemy chars, force reveal/defeat
        const d069mPlayer = pendingEffect.sourcePlayer;
        const d069mEnemySide = d069mPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const d069mTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of (mission as any)[d069mEnemySide] as CharacterInPlay[]) {
            if (char.isHidden) d069mTargets.push(char.instanceId);
          }
        }

        if (d069mTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, d069mPlayer,
            'EFFECT_NO_TARGET', 'Dosu Kinuta (069): No hidden enemy characters in play (state changed).',
            'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: 'KS-069-UC' });
          break;
        }

        if (d069mTargets.length === 1) {
          // Auto-select — replicate FORCE_REVEAL_OR_DEFEAT logic
          const d069mAutoTargetId = d069mTargets[0];
          const d069mOpponent = d069mPlayer === 'player1' ? 'player2' : 'player1';
          const d069mCharResult = EffectEngine.findCharByInstanceId(newState, d069mAutoTargetId);
          if (!d069mCharResult) {
            newState = EffectEngine.defeatCharacter(newState, d069mAutoTargetId, d069mPlayer);
            break;
          }
          const d069mTopCard = d069mCharResult.character.stack?.length > 0
            ? d069mCharResult.character.stack[d069mCharResult.character.stack?.length - 1]
            : d069mCharResult.character.card;
          const d069mFullRevealCost = (d069mTopCard.chakra ?? 0) + 2;
          // Check for upgrade target — if upgrade exists, minimum cost is (new - old) + 2
          const d069mOppSide: 'player1Characters' | 'player2Characters' =
            d069mOpponent === 'player1' ? 'player1Characters' : 'player2Characters';
          const d069mFriendly = newState.activeMissions[d069mCharResult.missionIndex][d069mOppSide];
          const d069mUpgradeTarget = d069mFriendly.find((c) => {
            if (c.instanceId === d069mAutoTargetId || c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            if ((d069mTopCard.chakra ?? 0) <= (cTop.chakra ?? 0)) return false;
            return cTop.name_fr.toUpperCase() === d069mTopCard.name_fr.toUpperCase();
          });
          let d069mRevealCost = d069mFullRevealCost;
          if (d069mUpgradeTarget) {
            const d069mOldTop = d069mUpgradeTarget.stack?.length > 0
              ? d069mUpgradeTarget.stack[d069mUpgradeTarget.stack?.length - 1]
              : d069mUpgradeTarget.card;
            d069mRevealCost = Math.max(0, (d069mTopCard.chakra ?? 0) - (d069mOldTop.chakra ?? 0)) + 2;
          }
          const d069mCanAfford = newState[d069mOpponent].chakra >= d069mRevealCost;

          if (!d069mCanAfford) {
            newState = EffectEngine.defeatCharacter(newState, d069mAutoTargetId, d069mPlayer);
            newState.log = logAction(newState.log, newState.turn, newState.phase, d069mPlayer,
              'EFFECT_DEFEAT', `Dosu Kinuta (069): Opponent cannot afford to reveal (cost ${d069mRevealCost}), character defeated.`,
              'game.log.effect.dosu069AutoDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', cost: String(d069mRevealCost) });
            break;
          }

          // Create DOSU069_OPPONENT_CHOICE pending (store full cost — actual cost recalculated at resolution)
          const d069mOcEffId = generateInstanceId();
          const d069mOcActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: d069mOcEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: d069mCharResult.missionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ targetInstanceId: d069mAutoTargetId, revealCost: d069mFullRevealCost, sourcePlayer: d069mPlayer }),
            targetSelectionType: 'DOSU069_OPPONENT_CHOICE',
            sourcePlayer: d069mPlayer, requiresTargetSelection: true,
            validTargets: [d069mAutoTargetId], isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: false,
            selectingPlayer: d069mOpponent,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: d069mOcActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: d069mOpponent,
            originPlayer: d069mPlayer,
            description: `Dosu Kinuta (069): Your hidden character was targeted. Click to reveal (pay ${d069mRevealCost} chakra) or skip to let it be defeated.`,
            descriptionKey: 'game.effect.desc.dosu069OpponentChoice',
            descriptionParams: { cost: String(d069mRevealCost) },
            options: [d069mAutoTargetId], minSelections: 1, maxSelections: 1,
            sourceEffectId: d069mOcEffId,
          }];
          newState.pendingForcedResolver = d069mOpponent;
          break;
        }

        // Multiple — mandatory child FORCE_REVEAL_OR_DEFEAT
        const d069mEffId = generateInstanceId();
        const d069mActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: d069mEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'FORCE_REVEAL_OR_DEFEAT',
          sourcePlayer: d069mPlayer, requiresTargetSelection: true,
          validTargets: d069mTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: d069mActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: d069mPlayer,
          description: 'Dosu Kinuta (069): Choose a hidden enemy character. Opponent must play them paying 2 extra, or defeat them.',
          descriptionKey: 'game.effect.desc.dosu069ForceRevealOrDefeat',
          options: d069mTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: d069mEffId,
        }];
        break;
      }

      // =============================================
      // Batch 8: CONFIRM popup cases (KS-071 to KS-080)
      // =============================================

      case 'ZAKU071_CONFIRM_MAIN': {
        // Re-check: fewer friendly non-hidden than enemy, ≥2 missions, Kurenai, valid targets with destinations
        const z071Player = pendingEffect.sourcePlayer;
        const z071Opponent = z071Player === 'player1' ? 'player2' : 'player1';
        const z071MI = pendingEffect.sourceMissionIndex;
        const z071Mission = newState.activeMissions[z071MI];
        if (!z071Mission) break;
        const z071FriendlySide = z071Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const z071EnemySide = z071Player === 'player1' ? 'player2Characters' : 'player1Characters';

        const z071FriendlyNH = z071Mission[z071FriendlySide].filter((c: CharacterInPlay) => !c.isHidden).length;
        const z071EnemyNH = z071Mission[z071EnemySide].filter((c: CharacterInPlay) => !c.isHidden).length;
        if (z071FriendlyNH >= z071EnemyNH) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z071Player,
            'EFFECT_NO_TARGET', 'Zaku Abumi (071): Condition no longer met (state changed).',
            'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' });
          break;
        }
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z071Player,
            'EFFECT_NO_TARGET', 'Zaku Abumi (071): Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' });
          break;
        }
        if (isMovementBlockedByKurenai(newState, z071MI, z071Opponent)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z071Player,
            'EFFECT_BLOCKED', 'Zaku Abumi (071): Enemy movement blocked by Yuhi Kurenai (035).',
            'game.log.effect.moveBlockedKurenai', { card: 'ZAKU ABUMI', id: 'KS-071-UC' });
          break;
        }

        // Filter enemy chars with valid destinations (name uniqueness)
        const z071EnemyControl = z071Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const z071ValidTargets: string[] = [];
        for (const char of z071Mission[z071EnemySide]) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          const charName = topCard.name_fr;
          const hasValidDest = char.isHidden || newState.activeMissions.some((m, i) => {
            if (i === z071MI) return false;
            return !m[z071EnemyControl].some((c: CharacterInPlay) => {
              if (c.instanceId === char.instanceId) return false;
              if (c.isHidden) return false;
              const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              return cTop.name_fr === charName;
            });
          });
          if (hasValidDest) z071ValidTargets.push(char.instanceId);
        }

        if (z071ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z071Player,
            'EFFECT_NO_TARGET', 'Zaku Abumi (071): No enemy characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' });
          break;
        }

        if (z071ValidTargets.length === 1) {
          // Auto-select + check destinations
          const z071AutoChar = EffectEngine.findCharByInstanceId(newState, z071ValidTargets[0]);
          if (z071AutoChar) {
            const z071AutoDests: string[] = [];
            for (let i = 0; i < newState.activeMissions.length; i++) {
              if (i !== z071AutoChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, z071AutoChar.character, i, z071AutoChar.player)) z071AutoDests.push(String(i));
            }
            if (z071AutoDests.length === 1) {
              newState = EffectEngine.moveCharToMissionDirectPublic(newState, z071ValidTargets[0], parseInt(z071AutoDests[0], 10), z071AutoChar.player, 'Zaku Abumi', 'KS-071-UC', z071Player);
            } else if (z071AutoDests.length > 1) {
              const z071dEffId = generateInstanceId();
              const z071dActId = generateInstanceId();
              newState.pendingEffects.push({
                id: z071dEffId, sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: z071ValidTargets[0] }),
                targetSelectionType: 'ZAKU071_MOVE_DESTINATION',
                sourcePlayer: z071Player, requiresTargetSelection: true,
                validTargets: z071AutoDests, isOptional: false, isMandatory: true,
                resolved: false, isUpgrade: false,
                remainingEffectTypes: pendingEffect.remainingEffectTypes,
              });
              newState.pendingActions.push({
                id: z071dActId, type: 'SELECT_TARGET' as PendingAction['type'],
                player: z071Player,
                description: 'Zaku Abumi (071): Choose a mission to move the enemy character to.',
                descriptionKey: 'game.effect.desc.zaku071MoveDest',
                options: z071AutoDests, minSelections: 1, maxSelections: 1,
                sourceEffectId: z071dEffId,
              });
              pendingEffect.remainingEffectTypes = undefined;
            }
          }
          break;
        }

        // Multiple targets: create child MOVE_ENEMY_FROM_THIS_MISSION with isOptional: true (SKIP 2)
        const z071cEffId = generateInstanceId();
        const z071cActId = generateInstanceId();
        newState.pendingEffects.push({
          id: z071cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_ENEMY_FROM_THIS_MISSION',
          sourcePlayer: z071Player, requiresTargetSelection: true,
          validTargets: z071ValidTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: z071cActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: z071Player,
          description: 'Zaku Abumi (071): Choose an enemy character to move to another mission.',
          descriptionKey: 'game.effect.desc.zaku071ChooseEnemy',
          options: z071ValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: z071cEffId,
        });
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'ZAKU071_CONFIRM_UPGRADE': {
        // POWERUP 2 on self
        const z071uPlayer = pendingEffect.sourcePlayer;
        const z071uSide = z071uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const z071uMI = pendingEffect.sourceMissionIndex;
        const missions_z071u = [...newState.activeMissions];
        const m_z071u = { ...missions_z071u[z071uMI] };
        const chars_z071u = [...m_z071u[z071uSide]];
        const idx_z071u = chars_z071u.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_z071u !== -1) {
          chars_z071u[idx_z071u] = { ...chars_z071u[idx_z071u], powerTokens: chars_z071u[idx_z071u].powerTokens + 2 };
          m_z071u[z071uSide] = chars_z071u;
          missions_z071u[z071uMI] = m_z071u;
          newState = { ...newState, activeMissions: missions_z071u };
          newState.log = logAction(newState.log, newState.turn, newState.phase, z071uPlayer,
            'EFFECT_POWERUP', 'Zaku Abumi (071): POWERUP 2 on self.',
            'game.log.effect.powerupSelf', { card: 'ZAKU ABUMI', id: 'KS-071-UC', amount: 2 });
        }
        break;
      }

      case 'KIN073_CONFIRM_MAIN': {
        // Re-check hand not empty + valid enemy targets IN PLAY (any mission)
        const k073Player = pendingEffect.sourcePlayer;
        const k073Opponent = k073Player === 'player1' ? 'player2' : 'player1';
        const k073Ps = newState[k073Player];
        let k073Data: { missionIndex?: number } = {};
        try { k073Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k073MI = k073Data.missionIndex ?? pendingEffect.sourceMissionIndex;

        if (k073Ps.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k073Player,
            'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No cards in hand (state changed).',
            'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' });
          break;
        }

        const k073EnemySide = k073Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const k073HasTarget = newState.activeMissions.some((mission) =>
          mission[k073EnemySide].some(
            (char: CharacterInPlay) => canBeHiddenByEnemy(newState, char, k073Opponent) && getEffectivePower(newState, char, k073Opponent) <= 4,
          ),
        );

        if (!k073HasTarget) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k073Player,
            'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No valid enemy target in play (state changed).',
            'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' });
          break;
        }

        // Mandatory child: KIN073_CHOOSE_DISCARD (discard is mandatory after CONFIRM)
        if (k073Ps.hand.length === 1) {
          // Auto-discard the only card, then chain to hide target selection
          const k073Hand = [...k073Ps.hand];
          const k073Discarded = k073Hand.splice(0, 1)[0];
          const k073NewPs = { ...k073Ps, hand: k073Hand, discardPile: [...k073Ps.discardPile, k073Discarded] };
          newState = { ...newState, [k073Player]: k073NewPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, k073Player,
            'EFFECT_DISCARD', `Kin Tsuchi (073): Discarded ${k073Discarded.name_fr} from hand.`,
            'game.log.effect.discard', { card: 'KIN TSUCHI', id: 'KS-073-UC', target: k073Discarded.name_fr });

          // Now find valid hide targets IN PLAY (all missions)
          const k073HideTargets: string[] = [];
          for (const k073m of newState.activeMissions) {
            for (const char of k073m[k073EnemySide]) {
              if (canBeHiddenByEnemy(newState, char, k073Opponent) && getEffectivePower(newState, char, k073Opponent) <= 4) {
                k073HideTargets.push(char.instanceId);
              }
            }
          }

          if (k073HideTargets.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, k073Player,
              'EFFECT_NO_TARGET', 'Kin Tsuchi (073): No valid enemy to hide after discard.',
              'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' });
          } else if (k073HideTargets.length === 1) {
            newState = EffectEngine.hideCharacterWithLog(newState, k073HideTargets[0], k073Player);
          } else {
            // Multiple hide targets — isOptional: true (SKIP 2)
            const k073hEffId = generateInstanceId();
            const k073hActId = generateInstanceId();
            newState.pendingEffects.push({
              id: k073hEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: k073MI,
              effectType: pendingEffect.effectType,
              effectDescription: '', targetSelectionType: 'KIN073_CHOOSE_ENEMY',
              sourcePlayer: k073Player, requiresTargetSelection: true,
              validTargets: k073HideTargets, isOptional: true, isMandatory: false,
              resolved: false, isUpgrade: false,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
            });
            newState.pendingActions.push({
              id: k073hActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: k073Player,
              description: 'Kin Tsuchi (073): Choose an enemy character with Power 4 or less to hide.',
              descriptionKey: 'game.effect.desc.kin073ChooseEnemy',
              options: k073HideTargets, minSelections: 1, maxSelections: 1,
              sourceEffectId: k073hEffId,
            });
            pendingEffect.remainingEffectTypes = undefined;
          }
          break;
        }

        // Multiple cards in hand: mandatory child KIN073_CHOOSE_DISCARD
        const k073Options = k073Ps.hand.map((_: any, i: number) => String(i));
        const k073EffId = generateInstanceId();
        const k073ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k073EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: k073MI,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KIN073_CHOOSE_DISCARD',
          sourcePlayer: k073Player, requiresTargetSelection: true,
          validTargets: k073Options, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: k073ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: k073Player,
          description: 'Kin Tsuchi (073): Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.kin073ChooseDiscard',
          options: k073Options, minSelections: 1, maxSelections: 1,
          sourceEffectId: k073EffId,
        });
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KIN073_CONFIRM_UPGRADE': {
        // Place top card of deck as hidden character in source mission
        const k073uPlayer = pendingEffect.sourcePlayer;
        const k073uPs = newState[k073uPlayer];

        if (k073uPs.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k073uPlayer,
            'EFFECT_NO_TARGET', 'Kin Tsuchi (073): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'KIN TSUCHI', id: 'KS-073-UC' });
          break;
        }

        const k073uMI = pendingEffect.sourceMissionIndex;
        const k073uDeck = [...k073uPs.deck];
        const k073uCard = k073uDeck.shift()!;
        const k073uNewPs = { ...k073uPs, deck: k073uDeck };
        newState = { ...newState, [k073uPlayer]: k073uNewPs };

        const k073uSide = k073uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const missions_k073u = [...newState.activeMissions];
        const m_k073u = { ...missions_k073u[k073uMI] };
        const chars_k073u = [...m_k073u[k073uSide]];
        const newHidden: CharacterInPlay = {
          card: k073uCard,
          isHidden: true,
          powerTokens: 0,
          stack: [k073uCard],
          controlledBy: k073uPlayer,
          originalOwner: k073uPlayer,
          instanceId: generateInstanceId(),
          wasRevealedAtLeastOnce: false,
          missionIndex: k073uMI,
        };
        chars_k073u.push(newHidden);
        m_k073u[k073uSide] = chars_k073u;
        missions_k073u[k073uMI] = m_k073u;
        newState = { ...newState, activeMissions: missions_k073u };
        newState.log = logAction(newState.log, newState.turn, newState.phase, k073uPlayer,
          'EFFECT', 'Kin Tsuchi (073) UPGRADE: Placed top card of deck as hidden character.',
          'game.log.effect.placeHidden', { card: 'KIN TSUCHI', id: 'KS-073-UC' });
        break;
      }

      case 'GAARA074_CONFIRM_MAIN': {
        // Re-count friendly hidden characters in this mission (excluding self)
        const g074Player = pendingEffect.sourcePlayer;
        const g074MI = pendingEffect.sourceMissionIndex;
        const g074Mission = newState.activeMissions[g074MI];
        if (!g074Mission) break;
        const g074FriendlySide = g074Player === 'player1' ? 'player1Characters' : 'player2Characters';

        const g074HiddenCount = g074Mission[g074FriendlySide].filter(
          (char: CharacterInPlay) => char.isHidden && char.instanceId !== pendingEffect.sourceInstanceId,
        ).length;

        if (g074HiddenCount === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g074Player,
            'EFFECT_NO_TARGET', 'Gaara (074): No friendly hidden characters in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-074-C' });
          break;
        }

        // POWERUP X on self
        const g074Side = g074Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const missions_g074 = [...newState.activeMissions];
        const m_g074 = { ...missions_g074[g074MI] };
        const chars_g074 = [...m_g074[g074Side]];
        const idx_g074 = chars_g074.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
        if (idx_g074 !== -1) {
          chars_g074[idx_g074] = { ...chars_g074[idx_g074], powerTokens: chars_g074[idx_g074].powerTokens + g074HiddenCount };
          m_g074[g074Side] = chars_g074;
          missions_g074[g074MI] = m_g074;
          newState = { ...newState, activeMissions: missions_g074 };
          newState.log = logAction(newState.log, newState.turn, newState.phase, g074Player,
            'EFFECT_POWERUP', `Gaara (074): POWERUP ${g074HiddenCount} on self.`,
            'game.log.effect.powerupSelf', { card: 'GAARA', id: 'KS-074-C', amount: g074HiddenCount });
        }
        break;
      }

      case 'KANKURO078_CONFIRM_AMBUSH': {
        // Re-find characters with power ≤ 4 across ALL missions, with valid destinations
        const k078Player = pendingEffect.sourcePlayer;

        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k078Player,
            'EFFECT_NO_TARGET', 'Kankuro (078): Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' });
          break;
        }

        const k078ValidTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          const mission_k78 = newState.activeMissions[mi];
          for (const side of ['player1Characters', 'player2Characters'] as const) {
            const charOwner = side === 'player1Characters' ? 'player1' : 'player2';
            if (isMovementBlockedByKurenai(newState, mi, charOwner as PlayerID)) continue;
            for (const char of mission_k78[side]) {
              if (getEffectivePower(newState, char, charOwner as PlayerID) > 4) continue;
              // Check valid destinations (name uniqueness)
              const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
              const charName = topCard.name_fr;
              const charControlSide = (char.controlledBy === 'player1' ? 'player1Characters' : 'player2Characters') as 'player1Characters' | 'player2Characters';
              const hasValidDest = char.isHidden || newState.activeMissions.some((m, i) => {
                if (i === mi) return false;
                return !m[charControlSide].some((c: CharacterInPlay) => {
                  if (c.instanceId === char.instanceId) return false;
                  if (c.isHidden) return false;
                  const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                  return cTop.name_fr === charName;
                });
              });
              if (hasValidDest) k078ValidTargets.push(char.instanceId);
            }
          }
        }

        if (k078ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k078Player,
            'EFFECT_NO_TARGET', 'Kankuro (078): No characters with Power 4 or less can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' });
          break;
        }

        if (k078ValidTargets.length === 1) {
          // Auto-select character, check destinations
          const k078AutoChar = EffectEngine.findCharByInstanceId(newState, k078ValidTargets[0]);
          if (k078AutoChar) {
            const k078AutoDests: string[] = [];
            for (let i = 0; i < newState.activeMissions.length; i++) {
              if (i !== k078AutoChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, k078AutoChar.character, i, k078AutoChar.player)) k078AutoDests.push(String(i));
            }
            if (k078AutoDests.length === 1) {
              newState = EffectEngine.moveCharToMissionDirectPublic(newState, k078ValidTargets[0], parseInt(k078AutoDests[0], 10), k078AutoChar.player, 'Kankuro', 'KS-078-UC', k078Player);
            } else if (k078AutoDests.length > 1) {
              const k078dEffId = generateInstanceId();
              const k078dActId = generateInstanceId();
              newState.pendingEffects.push({
                id: k078dEffId, sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: k078ValidTargets[0] }),
                targetSelectionType: 'KANKURO078_MOVE_DESTINATION',
                sourcePlayer: k078Player, requiresTargetSelection: true,
                validTargets: k078AutoDests, isOptional: false, isMandatory: true,
                resolved: false, isUpgrade: false,
                remainingEffectTypes: pendingEffect.remainingEffectTypes,
              });
              newState.pendingActions.push({
                id: k078dActId, type: 'SELECT_TARGET' as PendingAction['type'],
                player: k078Player,
                description: 'Kankuro (078): Choose a mission to move the character to.',
                descriptionKey: 'game.effect.desc.chooseMissionMove',
                options: k078AutoDests, minSelections: 1, maxSelections: 1,
                sourceEffectId: k078dEffId,
              });
              pendingEffect.remainingEffectTypes = undefined;
            }
          }
          break;
        }

        // Multiple targets: child MOVE_CHARACTER_POWER_4_OR_LESS with isOptional: true (SKIP 2)
        const k078cEffId = generateInstanceId();
        const k078cActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k078cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_CHARACTER_POWER_4_OR_LESS',
          sourcePlayer: k078Player, requiresTargetSelection: true,
          validTargets: k078ValidTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: k078cActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k078Player,
          description: 'Kankuro (078): Choose a character with Power 4 or less to move.',
          descriptionKey: 'game.effect.desc.kankuro078ChooseChar',
          options: k078ValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k078cEffId,
        });
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'KANKURO078_CONFIRM_UPGRADE': {
        // Re-find hidden friendly characters
        const k078uPlayer = pendingEffect.sourcePlayer;
        const k078uSide = k078uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const k078uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[k078uSide]) {
            if (char.isHidden && char.instanceId !== pendingEffect.sourceInstanceId) {
              k078uTargets.push(char.instanceId);
            }
          }
        }

        if (k078uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k078uPlayer,
            'EFFECT_NO_TARGET', 'Kankuro (078): No hidden friendly characters (state changed).',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' });
          break;
        }

        // Create mandatory child KANKURO078_REVEAL_HIDDEN_REDUCED (handles reveal logic, upgrade stacking, cost)
        const k078uEffId = generateInstanceId();
        const k078uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k078uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KANKURO078_REVEAL_HIDDEN_REDUCED',
          sourcePlayer: k078uPlayer, requiresTargetSelection: true,
          validTargets: k078uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: k078uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k078uPlayer,
          description: 'Kankuro (078): Choose a hidden friendly character to reveal (paying 1 less).',
          descriptionKey: 'game.effect.desc.kankuro078ChooseReveal',
          options: k078uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k078uEffId,
        });
        break;
      }

      case 'TEMARI080_CONFIRM_MAIN': {
        // Re-find friendly Sand Village chars with valid destinations
        const t080Player = pendingEffect.sourcePlayer;
        const t080Side = t080Player === 'player1' ? 'player1Characters' : 'player2Characters';

        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t080Player,
            'EFFECT_NO_TARGET', 'Temari (080): Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' });
          break;
        }

        const t080ValidTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          if (isMovementBlockedByKurenai(newState, mi, t080Player)) continue;
          const mission_t80 = newState.activeMissions[mi];
          for (const char of mission_t80[t080Side]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.group !== 'Sand Village') continue;
            // Check valid destinations (name uniqueness)
            const charName = topCard.name_fr;
            const hasValidDest = newState.activeMissions.some((m, i) => {
              if (i === mi) return false;
              return !m[t080Side].some((c: CharacterInPlay) => {
                if (c.instanceId === char.instanceId) return false;
                if (c.isHidden) return false;
                const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                return cTop.name_fr === charName;
              });
            });
            if (hasValidDest) t080ValidTargets.push(char.instanceId);
          }
        }

        if (t080ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t080Player,
            'EFFECT_NO_TARGET', 'Temari (080): No movable Sand Village characters (state changed).',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' });
          break;
        }

        if (t080ValidTargets.length === 1) {
          // Auto-select character, check destinations
          const t080AutoChar = EffectEngine.findCharByInstanceId(newState, t080ValidTargets[0]);
          if (t080AutoChar) {
            const t080AutoDests: string[] = [];
            for (let i = 0; i < newState.activeMissions.length; i++) {
              if (i !== t080AutoChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, t080AutoChar.character, i, t080AutoChar.player)) t080AutoDests.push(String(i));
            }
            if (t080AutoDests.length === 1) {
              newState = EffectEngine.moveCharToMissionDirectPublic(newState, t080ValidTargets[0], parseInt(t080AutoDests[0], 10), t080AutoChar.player, 'Temari', 'KS-080-UC', t080Player);
            } else if (t080AutoDests.length > 1) {
              const t080dEffId = generateInstanceId();
              const t080dActId = generateInstanceId();
              newState.pendingEffects.push({
                id: t080dEffId, sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: t080ValidTargets[0] }),
                targetSelectionType: 'TEMARI080_MOVE_DESTINATION',
                sourcePlayer: t080Player, requiresTargetSelection: true,
                validTargets: t080AutoDests, isOptional: false, isMandatory: true,
                resolved: false, isUpgrade: false,
                remainingEffectTypes: pendingEffect.remainingEffectTypes,
              });
              newState.pendingActions.push({
                id: t080dActId, type: 'SELECT_TARGET' as PendingAction['type'],
                player: t080Player,
                description: 'Temari (080): Choose a mission to move the character to.',
                descriptionKey: 'game.effect.desc.chooseMissionMove',
                options: t080AutoDests, minSelections: 1, maxSelections: 1,
                sourceEffectId: t080dEffId,
              });
              pendingEffect.remainingEffectTypes = undefined;
            }
          }
          break;
        }

        // Multiple targets: child MOVE_FRIENDLY_SAND_VILLAGE with isOptional: true (SKIP 2)
        const t080cEffId = generateInstanceId();
        const t080cActId = generateInstanceId();
        newState.pendingEffects.push({
          id: t080cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_FRIENDLY_SAND_VILLAGE',
          sourcePlayer: t080Player, requiresTargetSelection: true,
          validTargets: t080ValidTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: t080cActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: t080Player,
          description: 'Temari (080): Choose a friendly Sand Village character to move.',
          descriptionKey: 'game.effect.desc.temari080ChooseChar',
          options: t080ValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: t080cEffId,
        });
        pendingEffect.remainingEffectTypes = undefined;
        break;
      }

      case 'TEMARI080_CONFIRM_UPGRADE': {
        // Move self to another mission
        const t080uPlayer = pendingEffect.sourcePlayer;
        const t080uMI = pendingEffect.sourceMissionIndex;

        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t080uPlayer,
            'EFFECT_NO_TARGET', 'Temari (080): Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' });
          break;
        }

        if (isMovementBlockedByKurenai(newState, t080uMI, t080uPlayer)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t080uPlayer,
            'EFFECT_BLOCKED', 'Temari (080): Movement blocked by Yuhi Kurenai (035).',
            'game.log.effect.moveBlockedKurenai', { card: 'TEMARI', id: 'KS-080-UC' });
          break;
        }

        // Find self and check valid destinations
        const t080uCharRes = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!t080uCharRes) break;
        const t080uDests: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i !== t080uCharRes.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, t080uCharRes.character, i, t080uCharRes.player)) t080uDests.push(String(i));
        }

        if (t080uDests.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t080uPlayer,
            'EFFECT_NO_TARGET', 'Temari (080): No valid destination for self (state changed).',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' });
          break;
        }

        if (t080uDests.length === 1) {
          // Auto-move self
          newState = EffectEngine.moveCharToMissionDirectPublic(
            newState, pendingEffect.sourceInstanceId, parseInt(t080uDests[0], 10),
            t080uCharRes.player, 'Temari', 'KS-080-UC', t080uPlayer);
          break;
        }

        // Multiple destinations: child MOVE_SELF_TO_MISSION with isOptional: true (SKIP 2)
        const t080uEffId = generateInstanceId();
        const t080uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: t080uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_SELF_TO_MISSION',
          sourcePlayer: t080uPlayer, requiresTargetSelection: true,
          validTargets: t080uDests, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: t080uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: t080uPlayer,
          description: 'Temari (080): Choose a mission to move to.',
          descriptionKey: 'game.effect.desc.chooseMissionMove',
          options: t080uDests, minSelections: 1, maxSelections: 1,
          sourceEffectId: t080uEffId,
        });
        break;
      }

      // =============================================
      // BATCH 9 CONFIRM CASES (KS-081 to KS-090)
      // =============================================

      case 'BAKI081_CONFIRM_SCORE': {
        // Re-check deck not empty, then draw 1 card directly
        const b081Player = pendingEffect.sourcePlayer;
        const b081Ps = newState[b081Player];
        if (b081Ps.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, b081Player,
            'SCORE_NO_TARGET', 'Baki (081): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-081-C' });
          break;
        }
        const b081NewPs = { ...b081Ps, deck: [...b081Ps.deck], hand: [...b081Ps.hand] };
        const b081Drawn = b081NewPs.deck.shift()!;
        b081NewPs.hand.push(b081Drawn);
        newState[b081Player] = b081NewPs;
        newState.log = logAction(newState.log, newState.turn, newState.phase, b081Player,
          'SCORE_DRAW', 'Baki (081): [SCORE] Drew 1 card.',
          'game.log.score.draw', { card: 'BAKI', count: 1 });
        break;
      }

      case 'BAKI082_CONFIRM_SCORE': {
        // Re-find all hidden characters in play, then defeat or create child selection
        const b082sPlayer = pendingEffect.sourcePlayer;
        const b082sTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.isHidden) b082sTargets.push(char.instanceId);
          }
        }

        if (b082sTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, b082sPlayer,
            'SCORE_NO_TARGET', 'Baki (082): [SCORE] No hidden characters in play (state changed).',
            'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-082-UC' });
          break;
        }

        if (b082sTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, b082sTargets[0], b082sPlayer);
          newState.log = logAction(newState.log, newState.turn, newState.phase, b082sPlayer,
            'SCORE_DEFEAT', 'Baki (082): [SCORE] Defeated the only hidden character in play.',
            'game.log.score.defeat', { card: 'BAKI', id: 'KS-082-UC' });
          break;
        }

        // Multiple targets: child DEFEAT_HIDDEN_CHARACTER_ANY (isOptional: true = SKIP 2)
        const b082sEffId = generateInstanceId();
        const b082sActId = generateInstanceId();
        newState.pendingEffects.push({
          id: b082sEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: 'SCORE' as EffectType,
          effectDescription: '', targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER_ANY',
          sourcePlayer: b082sPlayer, requiresTargetSelection: true,
          validTargets: b082sTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: b082sActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: b082sPlayer,
          description: 'Baki (082) SCORE: Choose a hidden character to defeat.',
          descriptionKey: 'game.effect.desc.baki082ScoreChooseHidden',
          options: b082sTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: b082sEffId,
        });
        break;
      }

      case 'BAKI082_CONFIRM_UPGRADE': {
        // Re-find enemy P≤1 in source mission
        const b082uPlayer = pendingEffect.sourcePlayer;
        const b082uEnemy = b082uPlayer === 'player1' ? 'player2' : 'player1';
        const b082uEnemySide = b082uEnemy === 'player1' ? 'player1Characters' : 'player2Characters';
        let b082uData: { missionIndex?: number } = {};
        try { b082uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const b082uMI = b082uData.missionIndex ?? pendingEffect.sourceMissionIndex;
        const b082uMission = newState.activeMissions[b082uMI];
        if (!b082uMission) break;

        const b082uTargets: string[] = [];
        for (const char of b082uMission[b082uEnemySide]) {
          if (getEffectivePower(newState, char, b082uEnemy as PlayerID) <= 1) {
            b082uTargets.push(char.instanceId);
          }
        }

        if (b082uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, b082uPlayer,
            'EFFECT_NO_TARGET', 'Baki (082) UPGRADE: No enemy with Power 1 or less (state changed).',
            'game.log.effect.noTarget', { card: 'BAKI', id: 'KS-082-UC' });
          break;
        }

        if (b082uTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, b082uTargets[0], b082uPlayer);
          const b082uChar = b082uMission[b082uEnemySide].find((c: CharacterInPlay) => c.instanceId === b082uTargets[0]);
          newState.log = logAction(newState.log, newState.turn, newState.phase, b082uPlayer,
            'EFFECT_DEFEAT', `Baki (082) UPGRADE: Defeated enemy ${b082uChar?.card.name_fr ?? 'character'} with Power 1 or less.`,
            'game.log.effect.defeat', { card: 'BAKI', id: 'KS-082-UC', target: b082uChar?.card.name_fr ?? '' });
          break;
        }

        // Multiple targets: child BAKI082_DEFEAT_LOW_POWER (isOptional: true = SKIP 2)
        const b082uEffId = generateInstanceId();
        const b082uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: b082uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: b082uMI,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'BAKI082_DEFEAT_LOW_POWER',
          sourcePlayer: b082uPlayer, requiresTargetSelection: true,
          validTargets: b082uTargets, isOptional: true, isMandatory: false,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: b082uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: b082uPlayer,
          description: 'Baki (082) UPGRADE: Choose an enemy with Power 1 or less to defeat.',
          descriptionKey: 'game.effect.desc.baki082UpgradeChooseLowPower',
          options: b082uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: b082uEffId,
        });
        break;
      }

      case 'RASA083_CONFIRM_SCORE': {
        // Re-check another Sand Village ally in mission, then add 1 point
        const r083Player = pendingEffect.sourcePlayer;
        let r083Data: { missionIndex?: number } = {};
        try { r083Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const r083MI = r083Data.missionIndex ?? pendingEffect.sourceMissionIndex;
        const r083Mission = newState.activeMissions[r083MI];
        if (!r083Mission) break;
        const r083Side = r083Player === 'player1' ? 'player1Characters' : 'player2Characters';

        const r083HasAlly = r083Mission[r083Side].some((char: CharacterInPlay) => {
          if (char.instanceId === pendingEffect.sourceInstanceId) return false;
          if (char.isHidden) return false;
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          return topCard.group === 'Sand Village';
        });

        if (!r083HasAlly) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, r083Player,
            'SCORE_NO_TARGET', 'Rasa (083): No other Sand Village character (state changed).',
            'game.log.effect.noTarget', { card: 'RASA', id: 'KS-083-UC' });
          break;
        }

        const r083Ps = { ...newState[r083Player] };
        r083Ps.missionPoints = r083Ps.missionPoints + 1;
        newState[r083Player] = r083Ps;
        newState.log = logAction(newState.log, newState.turn, newState.phase, r083Player,
          'SCORE_BONUS_POINT', 'Rasa (083): Another Sand Village character present - gained 1 bonus Mission point.',
          'game.log.score.bonusPoint', { card: 'RASA', id: 'KS-083-UC', amount: 1 });
        break;
      }

      // =============================================
      // BATCH 10 CONFIRM POPUPS (KS-091 to KS-112)
      // =============================================

      // --- Group A: Simple CONFIRM → direct execution ---

      case 'GAMAHIRO095_CONFIRM_MAIN': {
        // Re-check: friendly in mission + deck not empty → draw 1 card
        const g095Player = pendingEffect.sourcePlayer;
        const g095MI = pendingEffect.sourceMissionIndex;
        const g095Mission = newState.activeMissions[g095MI];
        if (!g095Mission) break;
        const g095FriendlySide = g095Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const g095HasFriendly = g095Mission[g095FriendlySide].some(
          (c: CharacterInPlay) => c.instanceId !== pendingEffect.sourceInstanceId,
        );
        if (!g095HasFriendly || newState[g095Player].deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g095Player,
            'EFFECT_NO_TARGET', 'Gamahiro (095): No friendly character or deck empty (state changed).',
            'game.log.effect.noTarget', { card: 'GAMAHIRO', id: 'KS-095-C' });
          break;
        }
        const g095Ps = { ...newState[g095Player] };
        const g095Deck = [...g095Ps.deck];
        const g095Drawn = g095Deck.shift()!;
        g095Ps.deck = g095Deck;
        g095Ps.hand = [...g095Ps.hand, g095Drawn];
        newState[g095Player] = g095Ps;
        newState.log = logAction(newState.log, newState.turn, newState.phase, g095Player,
          'EFFECT_DRAW', 'Gamahiro (095): Drew 1 card.',
          'game.log.effect.draw', { card: 'GAMAHIRO', id: 'KS-095-C', count: 1 });
        break;
      }

      case 'KATSUYU098_CONFIRM_MAIN': {
        // Re-check: Tsunade in play → POWERUP 2 on self
        const k098Player = pendingEffect.sourcePlayer;
        const k098FriendlySide = k098Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let k098HasTsunade = false;
        for (const m of newState.activeMissions) {
          for (const c of m[k098FriendlySide]) {
            if (!c.isHidden) {
              const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              if (topCard.name_fr.toUpperCase().includes('TSUNADE')) {
                k098HasTsunade = true;
                break;
              }
            }
          }
          if (k098HasTsunade) break;
        }
        if (!k098HasTsunade) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k098Player,
            'EFFECT_NO_TARGET', 'Katsuyu (098): No friendly Tsunade in play (state changed).',
            'game.log.effect.noTarget', { card: 'KATSUYU', id: 'KS-098-C' });
          break;
        }
        newState = EffectEngine.applyPowerupToTarget(newState, pendingEffect.sourceInstanceId, 2);
        newState.log = logAction(newState.log, newState.turn, newState.phase, k098Player,
          'EFFECT_POWERUP', 'Katsuyu (098): POWERUP 2 on self (Tsunade in play).',
          'game.log.effect.powerupSelf', { card: 'KATSUYU', id: 'KS-098-C', amount: 2 });
        break;
      }

      // --- Group B: CONFIRM → child target selection ---

      case 'KISAME092_CONFIRM_AMBUSH': {
        // Re-check enemies with tokens in this mission → child STEAL_POWER_TOKENS_ENEMY_THIS_MISSION
        const k092Player = pendingEffect.sourcePlayer;
        const k092MI = pendingEffect.sourceMissionIndex;
        const k092Mission = newState.activeMissions[k092MI];
        if (!k092Mission) break;
        const k092EnemySide = k092Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const k092ValidTargets = k092Mission[k092EnemySide]
          .filter((c: CharacterInPlay) => c.powerTokens > 0)
          .map((c: CharacterInPlay) => c.instanceId);
        if (k092ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k092Player,
            'EFFECT_NO_TARGET', 'Kisame Hoshigaki (092): No enemy with Power tokens in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-092-C' });
          break;
        }
        if (k092ValidTargets.length === 1) {
          // Auto-select single target → chain to token amount choice
          const k092Target = k092Mission[k092EnemySide].find((c: CharacterInPlay) => c.instanceId === k092ValidTargets[0])!;
          const k092Amounts = k092Target.powerTokens >= 2 ? ['1', '2'] : ['1'];
          const k092EffId = generateInstanceId();
          const k092ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k092EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: k092MI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ targetInstanceId: k092ValidTargets[0], sourceInstanceId: pendingEffect.sourceInstanceId }),
            targetSelectionType: 'CHOOSE_TOKEN_AMOUNT_STEAL',
            sourcePlayer: k092Player, requiresTargetSelection: true,
            validTargets: k092Amounts, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k092ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k092Player,
            description: `Kisame Hoshigaki (092): Choose how many Power tokens to steal from ${k092Target.card.name_fr}.`,
            descriptionKey: 'game.effect.desc.chooseTokenAmountSteal',
            options: k092Amounts, minSelections: 1, maxSelections: 1,
            sourceEffectId: k092EffId,
          });
        } else {
          // Multiple targets → child selection (isMandatory: true, no SKIP on character targeting)
          const k092EffId = generateInstanceId();
          const k092ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k092EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: k092MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_THIS_MISSION',
            sourcePlayer: k092Player, requiresTargetSelection: true,
            validTargets: k092ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k092ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k092Player,
            description: 'Kisame Hoshigaki (092): Choose an enemy character to steal Power tokens from.',
            descriptionKey: 'game.effect.desc.kisame092StealTarget',
            options: k092ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k092EffId,
          });
        }
        break;
      }

      case 'PAKKUN099_CONFIRM_SCORE': {
        // Re-check valid destinations → child PAKKUN_MOVE_DESTINATION
        const p099Player = pendingEffect.sourcePlayer;
        const p099CharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!p099CharResult) break;
        const p099MI = p099CharResult.missionIndex;
        // Check Kurenai block
        if (isMovementBlockedByKurenai(newState, p099MI, p099Player)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, p099Player,
            'EFFECT_BLOCKED', 'Pakkun (099): Movement blocked by Kurenai Yuhi (035).',
            'game.log.effect.moveBlocked', { card: 'PAKKUN', id: 'KS-099-C' });
          break;
        }
        const p099ValidDests: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i !== p099MI && EffectEngine.validateNameUniquenessForMove(newState, p099CharResult.character, i, p099Player)) {
            p099ValidDests.push(String(i));
          }
        }
        if (p099ValidDests.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, p099Player,
            'EFFECT_NO_TARGET', 'Pakkun (099): No valid destination mission (state changed).',
            'game.log.effect.noTarget', { card: 'PAKKUN', id: 'KS-099-C' });
          break;
        }
        if (p099ValidDests.length === 1) {
          newState = EffectEngine.moveSelfToMission(newState, pendingEffect, p099ValidDests[0]);
        } else {
          const p099EffId = generateInstanceId();
          const p099ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: p099EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: p099MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'PAKKUN_MOVE_DESTINATION',
            sourcePlayer: p099Player, requiresTargetSelection: true,
            validTargets: p099ValidDests, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: p099ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: p099Player,
            description: 'Pakkun (099): Choose a mission to move to.',
            descriptionKey: 'game.effect.desc.pakkun099MoveDest',
            options: p099ValidDests, minSelections: 1, maxSelections: 1,
            sourceEffectId: p099EffId,
          });
        }
        break;
      }

      case 'MANDA102_CONFIRM_AMBUSH': {
        // Re-check enemy Summon in mission → child DEFEAT_ENEMY_SUMMON_THIS_MISSION
        const m102Player = pendingEffect.sourcePlayer;
        const m102MI = pendingEffect.sourceMissionIndex;
        const m102Mission = newState.activeMissions[m102MI];
        if (!m102Mission) break;
        const m102EnemySide = m102Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const m102ValidTargets = m102Mission[m102EnemySide]
          .filter((c: CharacterInPlay) => {
            if (c.isHidden) return false;
            const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return (topCard.keywords ?? []).some((k: string) => k.toLowerCase().includes('invocation') || k.toLowerCase().includes('summon'));
          })
          .map((c: CharacterInPlay) => c.instanceId);
        if (m102ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, m102Player,
            'EFFECT_NO_TARGET', 'Manda (102): No enemy Summon character in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'MANDA', id: 'KS-102-UC' });
          break;
        }
        if (m102ValidTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, m102ValidTargets[0], m102Player);
        } else {
          const m102EffId = generateInstanceId();
          const m102ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: m102EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: m102MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'DEFEAT_ENEMY_SUMMON_THIS_MISSION',
            sourcePlayer: m102Player, requiresTargetSelection: true,
            validTargets: m102ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: m102ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: m102Player,
            description: 'Manda (102): Choose an enemy Summon character to defeat.',
            descriptionKey: 'game.effect.desc.manda102DefeatSummon',
            options: m102ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: m102EffId,
          });
        }
        break;
      }

      case 'TSUNADE104_CONFIRM_MAIN': {
        // Re-check chakra → child TSUNADE104_CHOOSE_CHAKRA
        const t104Player = pendingEffect.sourcePlayer;
        const t104Chakra = newState[t104Player].chakra;
        if (t104Chakra <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t104Player,
            'EFFECT_NO_TARGET', 'Tsunade (104): No chakra remaining (state changed).',
            'game.log.effect.noTarget', { card: 'TSUNADE', id: 'KS-104-R' });
          break;
        }
        const t104Options: string[] = [];
        for (let i = 0; i <= t104Chakra; i++) t104Options.push(String(i));
        const t104EffId = generateInstanceId();
        const t104ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: t104EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'TSUNADE104_CHOOSE_CHAKRA',
          sourcePlayer: t104Player, requiresTargetSelection: true,
          validTargets: t104Options, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: pendingEffect.isUpgrade,
        });
        newState.pendingActions.push({
          id: t104ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: t104Player,
          description: `Tsunade (104): Choose how much extra chakra to spend (0-${t104Chakra}) for POWERUP.`,
          descriptionKey: 'game.effect.desc.tsunade104ChooseChakra',
          descriptionParams: { max: String(t104Chakra) },
          options: t104Options, minSelections: 1, maxSelections: 1,
          sourceEffectId: t104EffId,
        });
        break;
      }

      case 'TSUNADE104_CONFIRM_UPGRADE': {
        // UPGRADE: Apply POWERUP X where X = amount spent on the MAIN effect (no double payment)
        const t104uPlayer = pendingEffect.sourcePlayer;
        const mainSpent = (newState as any)._tsunade104ChakraSpent ?? 0;
        delete (newState as any)._tsunade104ChakraSpent;

        if (mainSpent <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t104uPlayer,
            'EFFECT', 'Tsunade (104) UPGRADE: No chakra was spent on MAIN, no bonus POWERUP.',
            'game.log.effect.tsunade104Decline', { card: 'TSUNADE', id: 'KS-104-R' });
          break;
        }

        // Apply POWERUP = mainSpent (free, no additional chakra cost)
        const charResult104u = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (charResult104u) {
          const missions104u = [...newState.activeMissions];
          const mission104u = { ...missions104u[charResult104u.missionIndex] };
          const side104u: 'player1Characters' | 'player2Characters' =
            charResult104u.player === 'player1' ? 'player1Characters' : 'player2Characters';
          mission104u[side104u] = mission104u[side104u].map((c: CharacterInPlay) =>
            c.instanceId === pendingEffect.sourceInstanceId
              ? { ...c, powerTokens: c.powerTokens + mainSpent }
              : c,
          );
          missions104u[charResult104u.missionIndex] = mission104u;
          newState.activeMissions = missions104u;
        }

        newState.log = logAction(newState.log, newState.turn, newState.phase, t104uPlayer,
          'EFFECT_POWERUP', `Tsunade (104) UPGRADE: POWERUP ${mainSpent} (matching MAIN chakra spent).`,
          'game.log.effect.powerupSelf', { card: 'TSUNADE', id: 'KS-104-R', amount: mainSpent });
        break;
      }

      case 'JIRAIYA105_CONFIRM_MAIN': {
        // Re-check affordable summons in hand → child JIRAIYA105_CHOOSE_SUMMON
        const j105Player = pendingEffect.sourcePlayer;
        const j105Hand = newState[j105Player].hand;
        const j105Chakra = newState[j105Player].chakra;
        const j105ValidTargets = j105Hand
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => {
            if (c.card_type !== 'character') return false;
            const hasSummon = (c.keywords ?? []).some((k: string) => k.toLowerCase().includes('invocation') || k.toLowerCase().includes('summon'));
            if (!hasSummon) return false;
            return j105Chakra >= Math.max(0, (c.chakra ?? 0) - 3);
          })
          .map(({ i }) => String(i));
        // Also include hidden summons on board
        const j105HiddenSummons = findHiddenSummonsOnBoard(newState, j105Player, 3);
        const j105AllTargets = [
          ...j105ValidTargets.map(i => `HAND_${i}`),
          ...j105HiddenSummons.map(h => `HIDDEN_${h.instanceId}`),
        ];
        if (j105AllTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j105Player,
            'EFFECT_NO_TARGET', 'Jiraiya (105): No affordable Summon in hand or hidden on board (state changed).',
            'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' });
          break;
        }
        const j105EffId = generateInstanceId();
        const j105ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: j105EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ hiddenChars: j105HiddenSummons }), targetSelectionType: 'JIRAIYA105_CHOOSE_SUMMON',
          sourcePlayer: j105Player, requiresTargetSelection: true,
          validTargets: j105AllTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: pendingEffect.isUpgrade,
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
        });
        pendingEffect.remainingEffectTypes = undefined; // Prevent duplicate from parent
        newState.pendingActions.push({
          id: j105ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: j105Player,
          description: 'Jiraiya (105): Choose a Summon character from your hand to play (cost -3).',
          descriptionKey: 'game.effect.desc.jiraiya105ChooseSummon',
          options: j105AllTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: j105EffId,
        });
        break;
      }

      case 'JIRAIYA105_CONFIRM_UPGRADE': {
        // Re-check enemies in mission → child JIRAIYA105_MOVE_ENEMY
        const j105uPlayer = pendingEffect.sourcePlayer;
        let j105uData: { missionIndex?: number } = {};
        try { j105uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const j105uMI = j105uData.missionIndex ?? pendingEffect.sourceMissionIndex;
        const j105uMission = newState.activeMissions[j105uMI];
        if (!j105uMission) break;
        const j105uEnemySide = j105uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const j105uValidTargets = j105uMission[j105uEnemySide]
          .map((c: CharacterInPlay) => c.instanceId);
        if (j105uValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j105uPlayer,
            'EFFECT_NO_TARGET', 'Jiraiya (105) UPGRADE: No enemy in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' });
          break;
        }
        if (j105uValidTargets.length === 1) {
          // Auto-select → move stage
          const j105uEffId = generateInstanceId();
          const j105uActId = generateInstanceId();
          const j105uCharRes = EffectEngine.findCharByInstanceId(newState, j105uValidTargets[0]);
          const j105uDestMissions: string[] = [];
          if (j105uCharRes) {
            for (let i = 0; i < newState.activeMissions.length; i++) {
              if (i !== j105uCharRes.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, j105uCharRes.character, i, j105uCharRes.player)) {
                j105uDestMissions.push(String(i));
              }
            }
          }
          if (j105uDestMissions.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, j105uPlayer,
              'EFFECT_NO_TARGET', `Jiraiya (105) UPGRADE: No valid destination for ${j105uCharRes?.character.card.name_fr ?? 'enemy'}.`,
              'game.log.effect.noTarget', { card: 'JIRAIYA', id: 'KS-105-R' });
            break;
          }
          if (j105uDestMissions.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, j105uValidTargets[0], parseInt(j105uDestMissions[0], 10),
              j105uCharRes!.player, 'Jiraiya', 'KS-105-R', j105uPlayer,
            );
          } else {
            newState.pendingEffects.push({
              id: j105uEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: j105uMI, effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: j105uValidTargets[0] }),
              targetSelectionType: 'JIRAIYA105_MOVE_ENEMY_DESTINATION',
              sourcePlayer: j105uPlayer, requiresTargetSelection: true,
              validTargets: j105uDestMissions, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: true,
            });
            newState.pendingActions.push({
              id: j105uActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: j105uPlayer,
              description: 'Jiraiya (105) UPGRADE: Choose a mission to move the enemy to.',
              descriptionKey: 'game.effect.desc.chooseMissionMove',
              options: j105uDestMissions, minSelections: 1, maxSelections: 1,
              sourceEffectId: j105uEffId,
            });
          }
        } else {
          const j105uEffId = generateInstanceId();
          const j105uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: j105uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: j105uMI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'JIRAIYA105_MOVE_ENEMY',
            sourcePlayer: j105uPlayer, requiresTargetSelection: true,
            validTargets: j105uValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: j105uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: j105uPlayer,
            description: 'Jiraiya (105) UPGRADE: Choose an enemy character to move.',
            descriptionKey: 'game.effect.desc.jiraiya105MoveEnemy',
            options: j105uValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: j105uEffId,
          });
        }
        break;
      }

      case 'SHIKAMARU111_CONFIRM_UPGRADE': {
        // Re-check enemies P≤3 in mission → child SHIKAMARU111_HIDE_ENEMY
        const s111Player = pendingEffect.sourcePlayer;
        const s111Opponent = s111Player === 'player1' ? 'player2' : 'player1';
        let s111Data: { missionIndex?: number } = {};
        try { s111Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s111MI = s111Data.missionIndex ?? pendingEffect.sourceMissionIndex;
        const s111Mission = newState.activeMissions[s111MI];
        if (!s111Mission) break;
        const s111EnemySide = s111Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const s111ValidTargets = s111Mission[s111EnemySide]
          .filter((c: CharacterInPlay) => canBeHiddenByEnemy(newState, c, s111Opponent as PlayerID) && getEffectivePower(newState, c, s111Opponent as PlayerID) <= 3)
          .map((c: CharacterInPlay) => c.instanceId);
        if (s111ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s111Player,
            'EFFECT_NO_TARGET', 'Shikamaru Nara (111) UPGRADE: No enemy with Power 3 or less (state changed).',
            'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-111-R' });
          break;
        }
        if (s111ValidTargets.length === 1) {
          newState = EffectEngine.hideCharacterWithLog(newState, s111ValidTargets[0], s111Player);
        } else {
          const s111EffId = generateInstanceId();
          const s111ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s111EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: s111MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'SHIKAMARU111_HIDE_ENEMY',
            sourcePlayer: s111Player, requiresTargetSelection: true,
            validTargets: s111ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: s111ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s111Player,
            description: 'Shikamaru Nara (111) UPGRADE: Choose an enemy with Power 3 or less to hide.',
            descriptionKey: 'game.effect.desc.shikamaru111HideEnemy',
            options: s111ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: s111EffId,
          });
        }
        break;
      }

      case 'CHOJI112_CONFIRM_MAIN': {
        // Re-check hand not empty → child CHOJI_CHOOSE_DISCARD
        const c112Player = pendingEffect.sourcePlayer;
        if (newState[c112Player].hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, c112Player,
            'EFFECT_NO_TARGET', 'Choji Akimichi (112): Hand is empty (state changed).',
            'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: 'KS-112-R' });
          break;
        }
        const c112Targets = newState[c112Player].hand.map((_: unknown, i: number) => String(i));
        const c112EffId = generateInstanceId();
        const c112ActId = generateInstanceId();
        newState.pendingEffects.push({
          id: c112EffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'CHOJI_CHOOSE_DISCARD',
          sourcePlayer: c112Player, requiresTargetSelection: true,
          validTargets: c112Targets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: pendingEffect.isUpgrade,
        });
        newState.pendingActions.push({
          id: c112ActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: c112Player,
          description: 'Choji Akimichi (112): Choose a card from your hand to discard.',
          descriptionKey: 'game.effect.desc.choji112ChooseDiscard',
          options: c112Targets, minSelections: 1, maxSelections: 1,
          sourceEffectId: c112EffId,
        });
        break;
      }

      case 'CHOJI112_CONFIRM_UPGRADE': {
        // Player confirmed UPGRADE repeat → child CHOJI_CHOOSE_DISCARD (mandatory)
        const c112uPlayer = pendingEffect.sourcePlayer;
        if (newState[c112uPlayer].hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, c112uPlayer,
            'EFFECT_NO_TARGET', 'Choji Akimichi (112) UPGRADE: Hand is empty (state changed).',
            'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: 'KS-112-R' });
          break;
        }
        const c112uTargets = newState[c112uPlayer].hand.map((_: unknown, i: number) => String(i));
        const c112uEffId = generateInstanceId();
        const c112uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: c112uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'CHOJI_CHOOSE_DISCARD',
          sourcePlayer: c112uPlayer, requiresTargetSelection: true,
          validTargets: c112uTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
        });
        newState.pendingActions.push({
          id: c112uActId, type: 'DISCARD_CARD' as PendingAction['type'],
          player: c112uPlayer,
          description: 'Choji Akimichi (112) UPGRADE: Choose a second card to discard for POWERUP.',
          descriptionKey: 'game.effect.desc.choji112DiscardUpgrade',
          options: c112uTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: c112uEffId,
        });
        break;
      }

      case 'SASUKE107_CONFIRM_UPGRADE': {
        // Apply POWERUP X where X = movedCount
        const s107Player = pendingEffect.sourcePlayer;
        let s107Data: { movedCount?: number; sasukeInstanceId?: string; sourceMissionIndex?: number } = {};
        try { s107Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s107MovedCount = s107Data.movedCount ?? 0;
        const s107SasukeId = s107Data.sasukeInstanceId ?? pendingEffect.sourceInstanceId;
        if (s107MovedCount > 0) {
          newState = EffectEngine.applyPowerupToTarget(newState, s107SasukeId, s107MovedCount);
          newState.log = logAction(newState.log, newState.turn, newState.phase, s107Player,
            'EFFECT_POWERUP', `Sasuke Uchiwa (107) UPGRADE: POWERUP ${s107MovedCount} (characters moved).`,
            'game.log.effect.powerupSelf', { card: 'SASUKE UCHIWA', id: 'KS-107-R', amount: s107MovedCount });
        }
        break;
      }

      // --- Sasuke 107: Player chose which character to move next ---
      case 'SASUKE107_CHOOSE_CHAR_TO_MOVE': {
        const ctm107Player = pendingEffect.sourcePlayer;
        const ctm107Side: 'player1Characters' | 'player2Characters' =
          ctm107Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let ctm107Data: {
          remainingCharIds?: string[];
          movedCount?: number;
          isUpgrade?: boolean;
          sasukeInstanceId?: string;
          sourceMissionIndex?: number;
        } = {};
        try { ctm107Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const ctm107Remaining = (ctm107Data.remainingCharIds ?? []).filter(id => id !== targetId);
        const ctm107MovedCount = ctm107Data.movedCount ?? 0;
        const ctm107IsUpgrade = ctm107Data.isUpgrade ?? false;
        const ctm107SasukeId = ctm107Data.sasukeInstanceId ?? '';
        const ctm107SrcMission = ctm107Data.sourceMissionIndex ?? 0;

        // Find the chosen character
        let ctm107CharName = '';
        for (const m of newState.activeMissions) {
          const c = m[ctm107Side].find((ch) => ch.instanceId === targetId);
          if (c) { ctm107CharName = c.card.name_fr; break; }
        }

        if (!ctm107CharName) {
          // Character no longer exists - continue with remaining
          break;
        }

        // Check Kurenai movement block
        let ctm107CharMission = -1;
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (newState.activeMissions[i][ctm107Side].some(c => c.instanceId === targetId)) {
            ctm107CharMission = i;
            break;
          }
        }
        if (ctm107CharMission >= 0 && isMovementBlockedByKurenai(newState, ctm107CharMission, ctm107Player)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
            'EFFECT_BLOCKED', `Sasuke Uchiwa (107): Movement of ${ctm107CharName} blocked by Kurenai Yuhi (035).`,
            'game.log.effect.moveBlocked', { card: 'SASUKE UCHIWA', id: 'KS-107-R' });
          // Continue with remaining chars
          // Fall through to create next pending below
        } else {
          const ctm107ValidMissions = getValidMissions(newState, targetId, ctm107Player, ctm107SrcMission);

          if (ctm107ValidMissions.length === 0) {
            // Can't move - skip
            newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
              'EFFECT_SKIP', `Sasuke Uchiwa (107): ${ctm107CharName} cannot move (no valid destination).`,
              'game.log.effect.sasuke107Skip', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: ctm107CharName });
          } else if (ctm107ValidMissions.length === 1) {
            // Auto-move to single destination
            const ctm107Dest = ctm107ValidMissions[0];
            // Find the character before move for trigger calls
            let ctm107MovedChar: CharacterInPlay | null = null;
            for (const m of newState.activeMissions) {
              const c = m[ctm107Side].find((ch) => ch.instanceId === targetId);
              if (c) { ctm107MovedChar = c; break; }
            }

            newState = moveCharTo(newState, targetId, ctm107Dest, ctm107Player);
            newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
              'EFFECT_MOVE', `Sasuke Uchiwa (107): Moved ${ctm107CharName} to mission ${ctm107Dest + 1}.`,
              'game.log.effect.move', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: ctm107CharName, from: ctm107SrcMission, to: ctm107Dest });

            // Call move triggers (character placed at destination)
            if (ctm107MovedChar) {
              const ctm107CharAtDest = newState.activeMissions[ctm107Dest]?.[ctm107Side]
                ?.find((c) => c.instanceId === targetId);
              if (ctm107CharAtDest) {
                newState = checkNinjaHoundsTrigger(newState, ctm107CharAtDest, ctm107Dest, ctm107Player);
                newState = checkChoji018PostMoveTrigger(newState, ctm107CharAtDest, ctm107Dest, ctm107Player, ctm107Player);
              }
            }

            // Create next pending for remaining chars AFTER triggers
            const ctm107NewMovedCount = ctm107MovedCount + 1;

            // Filter remaining to those that still exist and can move
            const ctm107StillMoveable: string[] = [];
            for (const rid of ctm107Remaining) {
              let exists = false;
              for (const m of newState.activeMissions) {
                if (m[ctm107Side].some(c => c.instanceId === rid)) { exists = true; break; }
              }
              if (!exists) continue;
              const vm = getValidMissions(newState, rid, ctm107Player, ctm107SrcMission);
              if (vm.length > 0) ctm107StillMoveable.push(rid);
            }

            if (ctm107StillMoveable.length === 0) {
              // All done - apply UPGRADE POWERUP if applicable
              if (ctm107IsUpgrade && ctm107NewMovedCount > 0) {
                newState = applyUpgradePowerup(newState, ctm107SasukeId, ctm107NewMovedCount, ctm107Player, ctm107SrcMission);
              }
            } else if (ctm107StillMoveable.length === 1) {
              // One left - create destination choice directly
              const lastCharId = ctm107StillMoveable[0];
              let lastName = '';
              for (const m of newState.activeMissions) {
                const c = m[ctm107Side].find((ch) => ch.instanceId === lastCharId);
                if (c) { lastName = c.card.name_fr; break; }
              }
              const lastValidMissions = getValidMissions(newState, lastCharId, ctm107Player, ctm107SrcMission);
              if (lastValidMissions.length === 1) {
                // Auto-move the last one too
                let lastMovedChar: CharacterInPlay | null = null;
                for (const m of newState.activeMissions) {
                  const c = m[ctm107Side].find((ch) => ch.instanceId === lastCharId);
                  if (c) { lastMovedChar = c; break; }
                }
                newState = moveCharTo(newState, lastCharId, lastValidMissions[0], ctm107Player);
                newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
                  'EFFECT_MOVE', `Sasuke Uchiwa (107): Moved ${lastName} to mission ${lastValidMissions[0] + 1}.`,
                  'game.log.effect.move', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: lastName, from: ctm107SrcMission, to: lastValidMissions[0] });
                if (lastMovedChar) {
                  const lastCharAtDest = newState.activeMissions[lastValidMissions[0]]?.[ctm107Side]
                    ?.find((c) => c.instanceId === lastCharId);
                  if (lastCharAtDest) {
                    newState = checkNinjaHoundsTrigger(newState, lastCharAtDest, lastValidMissions[0], ctm107Player);
                    newState = checkChoji018PostMoveTrigger(newState, lastCharAtDest, lastValidMissions[0], ctm107Player, ctm107Player);
                  }
                }
                const finalMovedCount = ctm107NewMovedCount + 1;
                if (ctm107IsUpgrade && finalMovedCount > 0) {
                  newState = applyUpgradePowerup(newState, ctm107SasukeId, finalMovedCount, ctm107Player, ctm107SrcMission);
                }
              } else {
                // Multiple destinations for last char - create choice
                const lastEffectId = generateInstanceId();
                const lastActionId = generateInstanceId();
                newState.pendingEffects.push({
                  id: lastEffectId,
                  sourceCardId: pendingEffect.sourceCardId,
                  sourceInstanceId: pendingEffect.sourceInstanceId,
                  sourceMissionIndex: pendingEffect.sourceMissionIndex,
                  effectType: pendingEffect.effectType,
                  effectDescription: JSON.stringify({
                    charInstanceId: lastCharId,
                    remainingCharIds: [],
                    movedCount: ctm107NewMovedCount,
                    isUpgrade: ctm107IsUpgrade,
                    sasukeInstanceId: ctm107SasukeId,
                    sourceMissionIndex: ctm107SrcMission,
                  }),
                  targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION',
                  sourcePlayer: ctm107Player,
                  requiresTargetSelection: true,
                  validTargets: lastValidMissions.map(String),
                  isOptional: false,
                  isMandatory: true,
                  resolved: false,
                  isUpgrade: ctm107IsUpgrade,
                });
                newState.pendingActions.push({
                  id: lastActionId,
                  type: 'SELECT_TARGET',
                  player: ctm107Player,
                  description: `Sasuke Uchiwa (107): Choose a mission to move ${lastName} to.`,
                  descriptionKey: 'game.effect.desc.sasuke107ChooseDestination',
                  descriptionParams: { target: lastName },
                  options: lastValidMissions.map(String),
                  minSelections: 1,
                  maxSelections: 1,
                  sourceEffectId: lastEffectId,
                });
              }
            } else {
              // 2+ remaining - create char choice pending
              const nextEffectId = generateInstanceId();
              const nextActionId = generateInstanceId();
              newState.pendingEffects.push({
                id: nextEffectId,
                sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex,
                effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({
                  remainingCharIds: ctm107StillMoveable,
                  movedCount: ctm107NewMovedCount,
                  isUpgrade: ctm107IsUpgrade,
                  sasukeInstanceId: ctm107SasukeId,
                  sourceMissionIndex: ctm107SrcMission,
                }),
                targetSelectionType: 'SASUKE107_CHOOSE_CHAR_TO_MOVE',
                sourcePlayer: ctm107Player,
                requiresTargetSelection: true,
                validTargets: ctm107StillMoveable,
                isOptional: false,
                isMandatory: true,
                resolved: false,
                isUpgrade: ctm107IsUpgrade,
              });
              newState.pendingActions.push({
                id: nextActionId,
                type: 'SELECT_TARGET',
                player: ctm107Player,
                description: 'Sasuke Uchiwa (107): Choose which character to move next.',
                descriptionKey: 'game.effect.desc.sasuke107ChooseCharToMove',
                options: ctm107StillMoveable,
                minSelections: 1,
                maxSelections: 1,
                sourceEffectId: nextEffectId,
              });
            }
            break;
          } else {
            // Multiple valid destinations - create CHOOSE_DESTINATION pending
            const ctm107DestEffectId = generateInstanceId();
            const ctm107DestActionId = generateInstanceId();
            newState.pendingEffects.push({
              id: ctm107DestEffectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({
                charInstanceId: targetId,
                remainingCharIds: ctm107Remaining,
                movedCount: ctm107MovedCount,
                isUpgrade: ctm107IsUpgrade,
                sasukeInstanceId: ctm107SasukeId,
                sourceMissionIndex: ctm107SrcMission,
              }),
              targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION',
              sourcePlayer: ctm107Player,
              requiresTargetSelection: true,
              validTargets: ctm107ValidMissions.map(String),
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: ctm107IsUpgrade,
            });
            newState.pendingActions.push({
              id: ctm107DestActionId,
              type: 'SELECT_TARGET',
              player: ctm107Player,
              description: `Sasuke Uchiwa (107): Choose a mission to move ${ctm107CharName} to.`,
              descriptionKey: 'game.effect.desc.sasuke107ChooseDestination',
              descriptionParams: { target: ctm107CharName },
              options: ctm107ValidMissions.map(String),
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: ctm107DestEffectId,
            });
            break;
          }
        }

        // If we got here via blocked/skip path, continue with remaining
        if (ctm107CharMission >= 0 && isMovementBlockedByKurenai(newState, ctm107CharMission, ctm107Player)) {
          // Filter remaining chars
          const ctm107BlockedRemaining: string[] = [];
          for (const rid of ctm107Remaining) {
            let exists = false;
            for (const m of newState.activeMissions) {
              if (m[ctm107Side].some(c => c.instanceId === rid)) { exists = true; break; }
            }
            if (!exists) continue;
            const vm = getValidMissions(newState, rid, ctm107Player, ctm107SrcMission);
            if (vm.length > 0) ctm107BlockedRemaining.push(rid);
          }
          if (ctm107BlockedRemaining.length === 0) {
            if (ctm107IsUpgrade && ctm107MovedCount > 0) {
              newState = applyUpgradePowerup(newState, ctm107SasukeId, ctm107MovedCount, ctm107Player, ctm107SrcMission);
            }
          } else if (ctm107BlockedRemaining.length >= 2) {
            const nextEffectId = generateInstanceId();
            const nextActionId = generateInstanceId();
            newState.pendingEffects.push({
              id: nextEffectId,
              sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({
                remainingCharIds: ctm107BlockedRemaining,
                movedCount: ctm107MovedCount,
                isUpgrade: ctm107IsUpgrade,
                sasukeInstanceId: ctm107SasukeId,
                sourceMissionIndex: ctm107SrcMission,
              }),
              targetSelectionType: 'SASUKE107_CHOOSE_CHAR_TO_MOVE',
              sourcePlayer: ctm107Player,
              requiresTargetSelection: true,
              validTargets: ctm107BlockedRemaining,
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: ctm107IsUpgrade,
            });
            newState.pendingActions.push({
              id: nextActionId,
              type: 'SELECT_TARGET',
              player: ctm107Player,
              description: 'Sasuke Uchiwa (107): Choose which character to move next.',
              descriptionKey: 'game.effect.desc.sasuke107ChooseCharToMove',
              options: ctm107BlockedRemaining,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: nextEffectId,
            });
          } else {
            // 1 remaining - process directly via CHOOSE_DESTINATION or auto-move
            const lastId = ctm107BlockedRemaining[0];
            let lastN = '';
            for (const m of newState.activeMissions) {
              const c = m[ctm107Side].find((ch) => ch.instanceId === lastId);
              if (c) { lastN = c.card.name_fr; break; }
            }
            const lastVm = getValidMissions(newState, lastId, ctm107Player, ctm107SrcMission);
            if (lastVm.length === 1) {
              let lastMC: CharacterInPlay | null = null;
              for (const m of newState.activeMissions) {
                const c = m[ctm107Side].find((ch) => ch.instanceId === lastId);
                if (c) { lastMC = c; break; }
              }
              newState = moveCharTo(newState, lastId, lastVm[0], ctm107Player);
              newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
                'EFFECT_MOVE', `Sasuke Uchiwa (107): Moved ${lastN} to mission ${lastVm[0] + 1}.`,
                'game.log.effect.move', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: lastN, from: ctm107SrcMission, to: lastVm[0] });
              if (lastMC) {
                const lastAtDest = newState.activeMissions[lastVm[0]]?.[ctm107Side]?.find((c) => c.instanceId === lastId);
                if (lastAtDest) {
                  newState = checkNinjaHoundsTrigger(newState, lastAtDest, lastVm[0], ctm107Player);
                  newState = checkChoji018PostMoveTrigger(newState, lastAtDest, lastVm[0], ctm107Player, ctm107Player);
                }
              }
              if (ctm107IsUpgrade && (ctm107MovedCount + 1) > 0) {
                newState = applyUpgradePowerup(newState, ctm107SasukeId, ctm107MovedCount + 1, ctm107Player, ctm107SrcMission);
              }
            } else {
              const eId = generateInstanceId();
              const aId = generateInstanceId();
              newState.pendingEffects.push({
                id: eId, sourceCardId: pendingEffect.sourceCardId, sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: lastId, remainingCharIds: [], movedCount: ctm107MovedCount, isUpgrade: ctm107IsUpgrade, sasukeInstanceId: ctm107SasukeId, sourceMissionIndex: ctm107SrcMission }),
                targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION', sourcePlayer: ctm107Player,
                requiresTargetSelection: true, validTargets: lastVm.map(String), isOptional: false, isMandatory: true, resolved: false, isUpgrade: ctm107IsUpgrade,
              });
              newState.pendingActions.push({
                id: aId, type: 'SELECT_TARGET', player: ctm107Player,
                description: `Sasuke Uchiwa (107): Choose a mission to move ${lastN} to.`,
                descriptionKey: 'game.effect.desc.sasuke107ChooseDestination', descriptionParams: { target: lastN },
                options: lastVm.map(String), minSelections: 1, maxSelections: 1, sourceEffectId: eId,
              });
            }
          }
        }
        break;
      }

      // --- Sasuke 107: Auto-moved character (single char, auto destination) — resolve triggers ---
      case 'SASUKE107_AUTO_MOVED': {
        const am107Player = pendingEffect.sourcePlayer;
        const am107Side: 'player1Characters' | 'player2Characters' =
          am107Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let am107Data: {
          movedCharInstanceId?: string;
          destMissionIndex?: number;
          movedCount?: number;
          isUpgrade?: boolean;
          sasukeInstanceId?: string;
          sourceMissionIndex?: number;
          remainingCharIds?: string[];
        } = {};
        try { am107Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const am107CharId = am107Data.movedCharInstanceId ?? '';
        const am107Dest = am107Data.destMissionIndex ?? 0;
        const am107MovedCount = am107Data.movedCount ?? 0;
        const am107IsUpgrade = am107Data.isUpgrade ?? false;
        const am107SasukeId = am107Data.sasukeInstanceId ?? '';
        const am107SrcMission = am107Data.sourceMissionIndex ?? 0;

        // Call move triggers for the auto-moved character
        const am107CharAtDest = newState.activeMissions[am107Dest]?.[am107Side]
          ?.find((c) => c.instanceId === am107CharId);
        if (am107CharAtDest) {
          newState = checkNinjaHoundsTrigger(newState, am107CharAtDest, am107Dest, am107Player);
          newState = checkChoji018PostMoveTrigger(newState, am107CharAtDest, am107Dest, am107Player, am107Player);
        }

        // Apply UPGRADE POWERUP if this was the last character and upgrade is active
        if (am107IsUpgrade && am107MovedCount > 0) {
          newState = applyUpgradePowerup(newState, am107SasukeId, am107MovedCount, am107Player, am107SrcMission);
        }
        break;
      }

      // --- Batch 12: KS-123 to KS-132 CONFIRM cases ---

      case 'KIMIMARO123_CONFIRM_UPGRADE': {
        // Re-validate hand + defeat targets, then create mandatory child
        const k123Player = pendingEffect.sourcePlayer;
        const k123Hand = newState[k123Player].hand;
        if (k123Hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k123Player,
            'EFFECT_NO_TARGET', 'Kimimaro (123) UPGRADE: Hand is empty (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-123-R' });
          break;
        }
        const k123DefeatTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of [...m.player1Characters, ...m.player2Characters]) {
            if (c.instanceId === pendingEffect.sourceInstanceId) continue;
            const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            if ((topCard.chakra ?? 0) <= 5) k123DefeatTargets.push(c.instanceId);
          }
        }
        if (k123DefeatTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k123Player,
            'EFFECT_NO_TARGET', 'Kimimaro (123) UPGRADE: No character with cost 5 or less to defeat (state changed).',
            'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-123-R' });
          break;
        }
        if (k123Hand.length === 1) {
          // Auto-discard the only card
          newState = EffectEngine.discardFromHand(newState, k123Player, 0);
          // Re-check defeat targets after discard
          const k123DefeatAfter: string[] = [];
          for (const m of newState.activeMissions) {
            for (const c of [...m.player1Characters, ...m.player2Characters]) {
              if (c.instanceId === pendingEffect.sourceInstanceId) continue;
              const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              if ((topCard.chakra ?? 0) <= 5) k123DefeatAfter.push(c.instanceId);
            }
          }
          if (k123DefeatAfter.length === 1) {
            newState = EffectEngine.defeatCharacter(newState, k123DefeatAfter[0], k123Player);
          } else if (k123DefeatAfter.length > 1) {
            const k123dEffId = generateInstanceId();
            const k123dActId = generateInstanceId();
            newState.pendingEffects.push({
              id: k123dEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
              effectDescription: '', targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER',
              sourcePlayer: k123Player, requiresTargetSelection: true,
              validTargets: k123DefeatAfter, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
            });
            newState.pendingActions.push({
              id: k123dActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: k123Player,
              description: 'Kimimaro (123) UPGRADE: Choose a character with cost 5 or less to defeat.',
              descriptionKey: 'game.effect.desc.kimimaro123Defeat',
              options: k123DefeatAfter, minSelections: 1, maxSelections: 1,
              sourceEffectId: k123dEffId,
            });
          }
        } else {
          // Hand has 2+ cards → child KIMIMARO123_CHOOSE_DISCARD (mandatory)
          const k123Targets = k123Hand.map((_: unknown, i: number) => String(i));
          const k123EffId = generateInstanceId();
          const k123ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k123EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KIMIMARO123_CHOOSE_DISCARD',
            sourcePlayer: k123Player, requiresTargetSelection: true,
            validTargets: k123Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k123ActId, type: 'DISCARD_CARD' as PendingAction['type'],
            player: k123Player,
            description: 'Kimimaro (123) UPGRADE: Choose a card to discard.',
            descriptionKey: 'game.effect.desc.kimimaro123Discard',
            options: k123Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k123EffId,
          });
        }
        break;
      }

      case 'KIDOMARU124_CONFIRM_AMBUSH': {
        // Parse metadata to check if upgraded
        let k124Data: { wasUpgraded?: boolean; powerLimit?: number; sourceMissionIndex?: number } = {};
        try { k124Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k124Upgraded = k124Data.wasUpgraded ?? false;
        const k124Player = pendingEffect.sourcePlayer;

        if (k124Upgraded) {
          // Chain to CONFIRM_UPGRADE_MODIFIER popup
          const k124mEffId = generateInstanceId();
          const k124mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k124mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'KIDOMARU124_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: k124Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          pendingEffect.remainingEffectTypes = undefined;
          newState.pendingActions.push({
            id: k124mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k124Player,
            description: 'Kidomaru (124): Apply UPGRADE? Power limit becomes 5 or less.',
            descriptionKey: 'game.effect.desc.kidomaru124ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: k124mEffId,
          });
          break;
        }

        // Not upgraded: compute P<=3 targets and create mandatory child
        {
          const k124Limit = 3;
          const k124EnemySide: 'player1Characters' | 'player2Characters' =
            k124Player === 'player1' ? 'player2Characters' : 'player1Characters';
          const k124Opponent = k124Player === 'player1' ? 'player2' as const : 'player1' as const;
          const k124SrcMission = k124Data.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
          const k124Targets: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i === k124SrcMission) continue;
            for (const c of newState.activeMissions[i][k124EnemySide]) {
              if (getEffectivePower(newState, c, k124Opponent) <= k124Limit) {
                k124Targets.push(c.instanceId);
              }
            }
          }
          if (k124Targets.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, k124Player,
              'EFFECT_NO_TARGET', `Kidomaru (124) AMBUSH: No enemy with Power ${k124Limit} or less in other missions.`,
              'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-124-R' });
            break;
          }
          if (k124Targets.length === 1) {
            newState = EffectEngine.defeatCharacter(newState, k124Targets[0], k124Player);
            break;
          }
          const k124EffId = generateInstanceId();
          const k124ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k124EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KIDOMARU124_DEFEAT_TARGET',
            sourcePlayer: k124Player, requiresTargetSelection: true,
            validTargets: k124Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k124ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k124Player,
            description: 'Kidomaru (124) AMBUSH: Choose an enemy with Power 3 or less to defeat.',
            descriptionKey: 'game.effect.desc.kidomaru124Defeat',
            options: k124Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k124EffId,
          });
        }
        break;
      }

      case 'KIDOMARU124_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: compute P<=5 targets
        const k124uPlayer = pendingEffect.sourcePlayer;
        let k124uData: { sourceMissionIndex?: number } = {};
        try { k124uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k124uLimit = 5;
        const k124uEnemySide: 'player1Characters' | 'player2Characters' =
          k124uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k124uOpponent = k124uPlayer === 'player1' ? 'player2' as const : 'player1' as const;
        const k124uSrcMission = k124uData.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const k124uTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === k124uSrcMission) continue;
          for (const c of newState.activeMissions[i][k124uEnemySide]) {
            if (getEffectivePower(newState, c, k124uOpponent) <= k124uLimit) {
              k124uTargets.push(c.instanceId);
            }
          }
        }
        if (k124uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k124uPlayer,
            'EFFECT_NO_TARGET', `Kidomaru (124) AMBUSH (UPGRADE): No enemy with Power ${k124uLimit} or less in other missions.`,
            'game.log.effect.noTarget', { card: 'KIDOMARU', id: 'KS-124-R' });
          break;
        }
        if (k124uTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, k124uTargets[0], k124uPlayer);
          break;
        }
        {
          const k124uEffId = generateInstanceId();
          const k124uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k124uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KIDOMARU124_DEFEAT_TARGET',
            sourcePlayer: k124uPlayer, requiresTargetSelection: true,
            validTargets: k124uTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: k124uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k124uPlayer,
            description: 'Kidomaru (124) AMBUSH (UPGRADE): Choose an enemy with Power 5 or less to defeat.',
            descriptionKey: 'game.effect.desc.kidomaru124DefeatUpgrade',
            options: k124uTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k124uEffId,
          });
        }
        break;
      }

      case 'TAYUYA125_CONFIRM_UPGRADE': {
        // Re-compute affordable Sound Village characters
        const t125Player = pendingEffect.sourcePlayer;
        const t125State = newState[t125Player];
        const t125FriendlySide: 'player1Characters' | 'player2Characters' =
          t125Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const t125Targets: string[] = [];
        for (let i = 0; i < t125State.hand.length; i++) {
          const card = t125State.hand[i];
          if (card.group === 'Sound Village') {
            const freshCost = Math.max(0, card.chakra - 2);
            const canFresh = t125State.chakra >= freshCost;
            const canUpgrade = canAffordAsUpgrade(newState, t125Player, card as { name_fr: string; chakra: number }, 2);
            if (canFresh || canUpgrade) {
              t125Targets.push(String(i));
            }
          }
        }
        // Hidden Sound Village board chars
        const t125Hidden: Array<{ instanceId: string; name_fr: string; name_en?: string; chakra: number; power: number; image_file?: string; missionIndex: number }> = [];
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          for (const char of newState.activeMissions[mIdx][t125FriendlySide]) {
            if (!char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (topCard.group === 'Sound Village') {
              const revealCost = Math.max(0, (topCard.chakra ?? 0) - 2);
              if (t125State.chakra >= revealCost) {
                t125Targets.push(`board:${char.instanceId}`);
                t125Hidden.push({
                  instanceId: char.instanceId, name_fr: topCard.name_fr,
                  name_en: topCard.name_en, chakra: topCard.chakra ?? 0,
                  power: topCard.power ?? 0, image_file: topCard.image_file, missionIndex: mIdx,
                });
              }
            }
          }
        }
        if (t125Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t125Player,
            'EFFECT_NO_TARGET', 'Tayuya (125) UPGRADE: No affordable Sound Village character (state changed).',
            'game.log.effect.noTarget', { card: 'TAYUYA', id: 'KS-125-R' });
          break;
        }
        {
          const t125EffId = generateInstanceId();
          const t125ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: t125EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ hiddenChars: t125Hidden, costReduction: 2 }),
            targetSelectionType: 'TAYUYA125_CHOOSE_SOUND',
            sourcePlayer: t125Player, requiresTargetSelection: true,
            validTargets: t125Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: t125ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: t125Player,
            description: JSON.stringify({ text: 'Tayuya (125) UPGRADE: Choose a Sound Village character to play (paying 2 less).', hiddenChars: t125Hidden }),
            descriptionKey: 'game.effect.desc.tayuya125PlaySound',
            options: t125Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: t125EffId,
          });
        }
        break;
      }

      case 'OROCHIMARU126_CONFIRM_SCORE': {
        // Re-compute weakest enemies
        const o126Player = pendingEffect.sourcePlayer;
        const o126Opponent = o126Player === 'player1' ? 'player2' as const : 'player1' as const;
        const o126EnemySide: 'player1Characters' | 'player2Characters' =
          o126Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const o126Candidates: Array<{ instanceId: string; missionIndex: number; power: number; name: string }> = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const c of newState.activeMissions[i][o126EnemySide]) {
            if (!c.isHidden) {
              o126Candidates.push({
                instanceId: c.instanceId, missionIndex: i,
                power: getEffectivePower(newState, c, o126Opponent),
                name: c.card.name_fr,
              });
            }
          }
        }
        if (o126Candidates.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, o126Player,
            'EFFECT_NO_TARGET', 'Orochimaru (126) SCORE: No non-hidden enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-126-R' });
          break;
        }
        const o126MinPower = Math.min(...o126Candidates.map(c => c.power));
        const o126Weakest = o126Candidates.filter(c => c.power === o126MinPower);
        if (o126Weakest.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, o126Weakest[0].instanceId, o126Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, o126Player,
            'EFFECT_DEFEAT', `Orochimaru (126) SCORE: Defeated weakest enemy ${o126Weakest[0].name} (Power ${o126MinPower}).`,
            'game.log.effect.defeat', { card: 'OROCHIMARU', id: 'KS-126-R', target: o126Weakest[0].name });
          break;
        }
        // Multiple tied: mandatory child
        {
          const o126EffId = generateInstanceId();
          const o126ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: o126EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'OROCHIMARU126_DEFEAT_WEAKEST',
            sourcePlayer: o126Player, requiresTargetSelection: true,
            validTargets: o126Weakest.map(w => w.instanceId), isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: o126ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: o126Player,
            description: `Orochimaru (126) SCORE: Multiple enemies tied for weakest (Power ${o126MinPower}). Choose which to defeat.`,
            descriptionKey: 'game.effect.desc.orochimaru126DefeatWeakest',
            descriptionParams: { power: o126MinPower },
            options: o126Weakest.map(w => w.instanceId), minSelections: 1, maxSelections: 1,
            sourceEffectId: o126EffId,
          });
        }
        break;
      }

      case 'OROCHIMARU126_CONFIRM_UPGRADE': {
        // Apply POWERUP 3 on self directly
        const o126uPlayer = pendingEffect.sourcePlayer;
        newState = EffectEngine.applyPowerupToTarget(newState, pendingEffect.sourceInstanceId, 3);
        newState.log = logAction(newState.log, newState.turn, newState.phase, o126uPlayer,
          'EFFECT_POWERUP', 'Orochimaru (126) UPGRADE: POWERUP 3 on self.',
          'game.log.effect.powerupSelf', { card: 'OROCHIMARU', id: 'KS-126-R', amount: 3 });
        break;
      }

      case 'SAKON127_CONFIRM_AMBUSH': {
        // Re-compute hide targets (non-hidden enemies P<=5 in this mission)
        const s127Player = pendingEffect.sourcePlayer;
        const s127Opponent = s127Player === 'player1' ? 'player2' as const : 'player1' as const;
        const s127EnemySide: 'player1Characters' | 'player2Characters' =
          s127Player === 'player1' ? 'player2Characters' : 'player1Characters';
        let s127Data: { sourceMissionIndex?: number } = {};
        try { s127Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s127MIdx = s127Data.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const s127Mission = newState.activeMissions[s127MIdx];
        const s127Targets = s127Mission ? s127Mission[s127EnemySide]
          .filter((c: CharacterInPlay) => canBeHiddenByEnemy(newState, c, s127Opponent) && getEffectivePower(newState, c, s127Opponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId) : [];
        if (s127Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s127Player,
            'EFFECT_NO_TARGET', 'Sakon (127) AMBUSH: No valid target (state changed).',
            'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-127-R' });
          break;
        }
        if (s127Targets.length === 1) {
          newState = EffectEngine.hideCharacterWithLog(newState, s127Targets[0], s127Player);
          break;
        }
        {
          const s127EffId = generateInstanceId();
          const s127ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s127EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'SAKON127_HIDE_TARGET',
            sourcePlayer: s127Player, requiresTargetSelection: true,
            validTargets: s127Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: s127ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s127Player,
            description: 'Sakon (127) AMBUSH: Choose an enemy with Power 5 or less to hide.',
            descriptionKey: 'game.effect.desc.sakon127Hide',
            options: s127Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: s127EffId,
          });
        }
        break;
      }

      case 'HINATA114_CONFIRM_MAIN': {
        const h114Player = pendingEffect.sourcePlayer;
        // Auto POWERUP 2 on self
        const h114CharRes = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (h114CharRes) {
          const h114Missions = [...newState.activeMissions];
          const h114Mission = { ...h114Missions[h114CharRes.missionIndex] };
          const h114Side: 'player1Characters' | 'player2Characters' =
            h114CharRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
          h114Mission[h114Side] = h114Mission[h114Side].map((c: CharacterInPlay) =>
            c.instanceId === pendingEffect.sourceInstanceId
              ? { ...c, powerTokens: c.powerTokens + 2 }
              : c,
          );
          h114Missions[h114CharRes.missionIndex] = h114Mission;
          newState.activeMissions = h114Missions;
          newState.log = logAction(newState.log, newState.turn, newState.phase, h114Player,
            'EFFECT_POWERUP', 'Hinata Hyuga (114): POWERUP 2 on self.',
            'game.log.effect.powerupSelf', { card: 'HINATA HYUGA', id: 'KS-114-R', amount: 2 });
        }
        // Find valid targets for POWERUP 1 (other friendly chars in play)
        const h114Targets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            if (char.instanceId !== pendingEffect.sourceInstanceId) {
              h114Targets.push(char.instanceId);
            }
          }
        }
        if (h114Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, h114Player,
            'EFFECT_NO_TARGET', 'Hinata Hyuga (114): No other character in play for POWERUP 1.',
            'game.log.effect.noTarget', { card: 'HINATA HYUGA', id: 'KS-114-R' });
          break;
        }
        {
          const h114EffId = generateInstanceId();
          const h114ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: h114EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'HINATA114_POWERUP_TARGET',
            sourcePlayer: h114Player, requiresTargetSelection: true,
            validTargets: h114Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: h114ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: h114Player,
            description: 'Hinata Hyuga (114): Choose a character to give POWERUP 1.',
            descriptionKey: 'game.effect.desc.hinata114Powerup',
            options: h114Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: h114EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'HINATA114_CONFIRM_UPGRADE': {
        const h114uPlayer = pendingEffect.sourcePlayer;
        const h114uEnemySide: 'player1Characters' | 'player2Characters' =
          h114uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const h114uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[h114uEnemySide]) {
            if (char.powerTokens > 0) h114uTargets.push(char.instanceId);
          }
        }
        if (h114uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, h114uPlayer,
            'EFFECT_NO_TARGET', 'Hinata Hyuga (114) UPGRADE: No enemy character with Power tokens (state changed).',
            'game.log.effect.noTarget', { card: 'HINATA HYUGA', id: 'KS-114-R' });
          break;
        }
        {
          const h114uEffId = generateInstanceId();
          const h114uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: h114uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'HINATA114_REMOVE_TOKENS',
            sourcePlayer: h114uPlayer, requiresTargetSelection: true,
            validTargets: h114uTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: h114uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: h114uPlayer,
            description: 'Hinata Hyuga (114) UPGRADE: Choose an enemy character to remove all Power tokens from.',
            descriptionKey: 'game.effect.desc.hinata114RemoveTokens',
            options: h114uTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: h114uEffId,
          });
        }
        break;
      }

      case 'SHINO115_CONFIRM_AMBUSH': {
        const s115Player = pendingEffect.sourcePlayer;
        const s115Side: 'player1Characters' | 'player2Characters' =
          s115Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const s115MI = pendingEffect.sourceMissionIndex;
        const s115Mission = newState.activeMissions[s115MI];
        if (!s115Mission || newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s115Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (115) AMBUSH: No valid targets (state changed).',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-115-R' });
          break;
        }
        // Check Kurenai block
        if (isMovementBlockedByKurenai(newState, s115MI, s115Player)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s115Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (115) AMBUSH: Movement blocked by Kurenai.',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-115-R' });
          break;
        }
        const s115Targets: string[] = s115Mission[s115Side]
          .filter((c: CharacterInPlay) => c.instanceId !== pendingEffect.sourceInstanceId)
          .map((c: CharacterInPlay) => c.instanceId);
        if (s115Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s115Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (115) AMBUSH: No friendly characters to move (state changed).',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-115-R' });
          break;
        }
        {
          const s115EffId = generateInstanceId();
          const s115ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s115EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: s115MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'SHINO115_MOVE_FRIENDLY',
            sourcePlayer: s115Player, requiresTargetSelection: true,
            validTargets: s115Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: s115ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s115Player,
            description: 'Shino Aburame (115) AMBUSH: Choose a friendly character to move.',
            descriptionKey: 'game.effect.desc.shino115MoveFriendly',
            options: s115Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: s115EffId,
          });
        }
        break;
      }

      case 'NEJI116_CONFIRM_MAIN': {
        const n116Player = pendingEffect.sourcePlayer;
        const n116Opponent = n116Player === 'player1' ? 'player2' : 'player1';
        const n116Side: 'player1Characters' | 'player2Characters' = n116Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const n116EnemySide: 'player1Characters' | 'player2Characters' = n116Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const n116MI = pendingEffect.sourceMissionIndex;
        const n116Mission = newState.activeMissions[n116MI];
        if (!n116Mission) break;
        const n116Targets: string[] = [];
        for (const char of n116Mission[n116Side]) {
          if (char.instanceId !== pendingEffect.sourceInstanceId && !char.isHidden && getEffectivePower(newState, char, n116Player) === 4) {
            n116Targets.push(char.instanceId);
          }
        }
        for (const char of n116Mission[n116EnemySide]) {
          if (!char.isHidden && getEffectivePower(newState, char, n116Opponent as PlayerID) === 4) {
            n116Targets.push(char.instanceId);
          }
        }
        if (n116Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n116Player,
            'EFFECT_NO_TARGET', 'Neji Hyuga (116) MAIN: No character with exactly Power 4 (state changed).',
            'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: 'KS-116-R' });
          break;
        }
        {
          const n116EffId = generateInstanceId();
          const n116ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n116EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n116MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'NEJI116_DEFEAT_POWER4',
            sourcePlayer: n116Player, requiresTargetSelection: true,
            validTargets: n116Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n116ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n116Player,
            description: 'Neji Hyuga (116) MAIN: Choose a character with exactly Power 4 to defeat.',
            descriptionKey: 'game.effect.desc.neji116DefeatPower4',
            descriptionParams: { power: '4' },
            options: n116Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: n116EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'NEJI116_CONFIRM_UPGRADE': {
        const n116uPlayer = pendingEffect.sourcePlayer;
        const n116uOpponent = n116uPlayer === 'player1' ? 'player2' : 'player1';
        const n116uSide: 'player1Characters' | 'player2Characters' = n116uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const n116uEnemySide: 'player1Characters' | 'player2Characters' = n116uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const n116uMI = pendingEffect.sourceMissionIndex;
        const n116uMission = newState.activeMissions[n116uMI];
        if (!n116uMission) break;
        const n116uTargets: string[] = [];
        for (const char of n116uMission[n116uSide]) {
          if (char.instanceId !== pendingEffect.sourceInstanceId && !char.isHidden && getEffectivePower(newState, char, n116uPlayer) === 6) {
            n116uTargets.push(char.instanceId);
          }
        }
        for (const char of n116uMission[n116uEnemySide]) {
          if (!char.isHidden && getEffectivePower(newState, char, n116uOpponent as PlayerID) === 6) {
            n116uTargets.push(char.instanceId);
          }
        }
        if (n116uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n116uPlayer,
            'EFFECT_NO_TARGET', 'Neji Hyuga (116) UPGRADE: No character with exactly Power 6 (state changed).',
            'game.log.effect.noTarget', { card: 'NEJI HYUGA', id: 'KS-116-R' });
          break;
        }
        {
          const n116uEffId = generateInstanceId();
          const n116uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n116uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n116uMI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'NEJI116_DEFEAT_POWER6',
            sourcePlayer: n116uPlayer, requiresTargetSelection: true,
            validTargets: n116uTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: n116uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n116uPlayer,
            description: 'Neji Hyuga (116) UPGRADE: Choose a character with exactly Power 6 to defeat.',
            descriptionKey: 'game.effect.desc.neji116DefeatPower6',
            descriptionParams: { power: '6' },
            options: n116uTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: n116uEffId,
          });
        }
        break;
      }

      case 'ROCKLEE117_CONFIRM_UPGRADE': {
        const rl117Player = pendingEffect.sourcePlayer;
        const rl117PS = { ...newState[rl117Player] };
        if (rl117PS.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, rl117Player,
            'EFFECT_NO_TARGET', 'Rock Lee (117) UPGRADE: Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'ROCK LEE', id: 'KS-117-R' });
          break;
        }
        const rl117Deck = [...rl117PS.deck];
        const rl117Discarded = rl117Deck.shift()!;
        const rl117Cost = rl117Discarded.chakra || 0;
        rl117PS.deck = rl117Deck;
        rl117PS.discardPile = [...rl117PS.discardPile, rl117Discarded];
        newState = { ...newState, [rl117Player]: rl117PS };
        newState.log = logAction(newState.log, newState.turn, newState.phase, rl117Player,
          'EFFECT_DISCARD', `Rock Lee (117) UPGRADE: Revealed and discarded ${rl117Discarded.name_fr} (cost ${rl117Cost}).`,
          'game.log.effect.discard', { card: 'ROCK LEE', id: 'KS-117-R', target: rl117Discarded.name_fr });
        if (rl117Cost > 0) {
          const rl117CharRes = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          if (rl117CharRes) {
            const rl117Missions = [...newState.activeMissions];
            const rl117Mission = { ...rl117Missions[rl117CharRes.missionIndex] };
            const rl117Side: 'player1Characters' | 'player2Characters' =
              rl117CharRes.player === 'player1' ? 'player1Characters' : 'player2Characters';
            rl117Mission[rl117Side] = rl117Mission[rl117Side].map((c: CharacterInPlay) =>
              c.instanceId === pendingEffect.sourceInstanceId
                ? { ...c, powerTokens: c.powerTokens + rl117Cost }
                : c,
            );
            rl117Missions[rl117CharRes.missionIndex] = rl117Mission;
            newState.activeMissions = rl117Missions;
            newState.log = logAction(newState.log, newState.turn, newState.phase, rl117Player,
              'EFFECT_POWERUP', `Rock Lee (117) UPGRADE: POWERUP ${rl117Cost} (cost of ${rl117Discarded.name_fr}).`,
              'game.log.effect.powerupSelf', { card: 'ROCK LEE', id: 'KS-117-R', amount: rl117Cost });
          }
        }
        break;
      }

      case 'TENTEN118_CONFIRM_AMBUSH': {
        const tt118Player = pendingEffect.sourcePlayer;
        const tt118MI = pendingEffect.sourceMissionIndex;
        const tt118Mission = newState.activeMissions[tt118MI];
        if (!tt118Mission) break;
        const tt118Targets: string[] = [];
        for (const char of [...tt118Mission.player1Characters, ...tt118Mission.player2Characters]) {
          if (char.isHidden) tt118Targets.push(char.instanceId);
        }
        if (tt118Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, tt118Player,
            'EFFECT_NO_TARGET', 'Tenten (118) AMBUSH: No hidden characters in this mission (state changed).',
            'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-118-R' });
          break;
        }
        {
          const tt118EffId = generateInstanceId();
          const tt118ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: tt118EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: tt118MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'TENTEN_118_DEFEAT_HIDDEN_IN_MISSION',
            sourcePlayer: tt118Player, requiresTargetSelection: true,
            validTargets: tt118Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: tt118ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: tt118Player,
            description: 'Tenten (118) AMBUSH: Choose a hidden character in this mission to defeat.',
            descriptionKey: 'game.effect.desc.tenten118DefeatHidden',
            options: tt118Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: tt118EffId,
          });
        }
        break;
      }

      case 'KANKURO119_CONFIRM_MAIN': {
        const k119Player = pendingEffect.sourcePlayer;
        const k119Opponent = k119Player === 'player1' ? 'player2' : 'player1';
        const k119EnemySide: 'player1Characters' | 'player2Characters' = k119Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const k119MI = pendingEffect.sourceMissionIndex;
        const k119Mission = newState.activeMissions[k119MI];
        if (!k119Mission) break;
        const k119Targets = k119Mission[k119EnemySide]
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, k119Opponent as PlayerID) <= 3)
          .map((c: CharacterInPlay) => c.instanceId);
        if (k119Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k119Player,
            'EFFECT_NO_TARGET', 'Kankuro (119) MAIN: No enemy with Power 3 or less (state changed).',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-119-R' });
          break;
        }
        {
          const k119EffId = generateInstanceId();
          const k119ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k119EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: k119MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KANKURO119_DEFEAT_TARGET',
            sourcePlayer: k119Player, requiresTargetSelection: true,
            validTargets: k119Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k119ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k119Player,
            description: 'Kankuro (119) MAIN: Choose an enemy with Power 3 or less to defeat.',
            descriptionKey: 'game.effect.desc.kankuro119Defeat',
            options: k119Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k119EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'KANKURO119_CONFIRM_UPGRADE': {
        const k119uPlayer = pendingEffect.sourcePlayer;
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k119uPlayer,
            'EFFECT_NO_TARGET', 'Kankuro (119) UPGRADE: Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-119-R' });
          break;
        }
        const k119uTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const mission = newState.activeMissions[i];
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            const charOwner = char.controlledBy ?? (mission.player1Characters.includes(char) ? 'player1' : 'player2');
            if (isMovementBlockedByKurenai(newState, i, charOwner as PlayerID)) continue;
            // Check at least one valid destination
            let hasValidDest = false;
            for (let d = 0; d < newState.activeMissions.length; d++) {
              if (d === i) continue;
              if (EffectEngine.validateNameUniquenessForMove(newState, char, d, charOwner as PlayerID)) {
                hasValidDest = true;
                break;
              }
            }
            if (hasValidDest) k119uTargets.push(char.instanceId);
          }
        }
        if (k119uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k119uPlayer,
            'EFFECT_NO_TARGET', 'Kankuro (119) UPGRADE: No characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-119-R' });
          break;
        }
        {
          const k119uEffId = generateInstanceId();
          const k119uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k119uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KANKURO119_MOVE_CHARACTER',
            sourcePlayer: k119uPlayer, requiresTargetSelection: true,
            validTargets: k119uTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k119uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k119uPlayer,
            description: 'Kankuro (119) UPGRADE: Choose a character in play to move.',
            descriptionKey: 'game.effect.desc.kankuro119MoveCharacter',
            options: k119uTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k119uEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'TEMARI121_CONFIRM_MAIN': {
        const tm121Player = pendingEffect.sourcePlayer;
        const tm121Side: 'player1Characters' | 'player2Characters' = tm121Player === 'player1' ? 'player1Characters' : 'player2Characters';
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, tm121Player,
            'EFFECT_NO_TARGET', 'Temari (121) MAIN: Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-121-R' });
          break;
        }
        const tm121Targets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (isMovementBlockedByKurenai(newState, i, tm121Player)) continue;
          for (const char of newState.activeMissions[i][tm121Side]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            let hasValidDest = false;
            for (let d = 0; d < newState.activeMissions.length; d++) {
              if (d === i) continue;
              // Hidden chars have no visible name, so name uniqueness can't block them
              if (char.isHidden || EffectEngine.validateNameUniquenessForMove(newState, char, d, tm121Player)) { hasValidDest = true; break; }
            }
            if (hasValidDest) tm121Targets.push(char.instanceId);
          }
        }
        if (tm121Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, tm121Player,
            'EFFECT_NO_TARGET', 'Temari (121) MAIN: No friendly characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-121-R' });
          break;
        }
        {
          const tm121EffId = generateInstanceId();
          const tm121ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: tm121EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'TEMARI121_MOVE_FRIENDLY',
            sourcePlayer: tm121Player, requiresTargetSelection: true,
            validTargets: tm121Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: tm121ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: tm121Player,
            description: 'Temari (121) MAIN: Choose a friendly character to move.',
            descriptionKey: 'game.effect.desc.temari121MoveFriendly',
            options: tm121Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: tm121EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'TEMARI121_CONFIRM_UPGRADE': {
        const tm121uPlayer = pendingEffect.sourcePlayer;
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, tm121uPlayer,
            'EFFECT_NO_TARGET', 'Temari (121) UPGRADE: Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-121-R' });
          break;
        }
        const tm121uTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const mission = newState.activeMissions[i];
          for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
            // Card says "Move any character in play" — includes hidden characters
            const charOwner = char.controlledBy ?? (mission.player1Characters.includes(char) ? 'player1' : 'player2');
            if (isMovementBlockedByKurenai(newState, i, charOwner as PlayerID)) continue;
            let hasValidDest = false;
            for (let d = 0; d < newState.activeMissions.length; d++) {
              if (d === i) continue;
              if (EffectEngine.validateNameUniquenessForMove(newState, char, d, charOwner as PlayerID)) { hasValidDest = true; break; }
            }
            if (hasValidDest) tm121uTargets.push(char.instanceId);
          }
        }
        if (tm121uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, tm121uPlayer,
            'EFFECT_NO_TARGET', 'Temari (121) UPGRADE: No characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-121-R' });
          break;
        }
        {
          const tm121uEffId = generateInstanceId();
          const tm121uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: tm121uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'TEMARI121_MOVE_ANY',
            sourcePlayer: tm121uPlayer, requiresTargetSelection: true,
            validTargets: tm121uTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: tm121uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: tm121uPlayer,
            description: 'Temari (121) UPGRADE: Choose any character to move.',
            descriptionKey: 'game.effect.desc.temari121MoveAny',
            options: tm121uTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: tm121uEffId,
          });
        }
        break;
      }

      case 'JIROBO122_CONFIRM_MAIN': {
        // Auto-execute POWERUP X where X = total characters in this mission
        const j122mPlayer = pendingEffect.sourcePlayer;
        const j122mMI = pendingEffect.sourceMissionIndex;
        const j122mMission = newState.activeMissions[j122mMI];
        if (!j122mMission) break;
        const j122mTotal = j122mMission.player1Characters.length + j122mMission.player2Characters.length;
        if (j122mTotal > 0) {
          const j122mFriendly: 'player1Characters' | 'player2Characters' =
            j122mPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const j122mMissions = [...newState.activeMissions];
          const j122mM = { ...j122mMissions[j122mMI] };
          const j122mChars = [...j122mM[j122mFriendly]];
          const j122mSelfIdx = j122mChars.findIndex((c) => c.instanceId === pendingEffect.sourceInstanceId);
          if (j122mSelfIdx !== -1) {
            j122mChars[j122mSelfIdx] = {
              ...j122mChars[j122mSelfIdx],
              powerTokens: j122mChars[j122mSelfIdx].powerTokens + j122mTotal,
            };
            j122mM[j122mFriendly] = j122mChars;
            j122mMissions[j122mMI] = j122mM;
            newState.activeMissions = j122mMissions;
            newState.log = logAction(newState.log, newState.turn, newState.phase, j122mPlayer,
              'EFFECT_POWERUP',
              `Jirobo (122): POWERUP ${j122mTotal} (total characters in this mission).`,
              'game.log.effect.powerupSelf',
              { card: 'JIROBO', id: 'KS-122-R', amount: j122mTotal });
          }
        }
        break;
      }

      case 'JIROBO122_CONFIRM_UPGRADE': {
        const j122Player = pendingEffect.sourcePlayer;
        const j122Opponent = j122Player === 'player1' ? 'player2' : 'player1';
        const j122EnemySide: 'player1Characters' | 'player2Characters' = j122Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const j122MI = pendingEffect.sourceMissionIndex;
        const j122Mission = newState.activeMissions[j122MI];
        if (!j122Mission) break;
        const j122Targets = j122Mission[j122EnemySide]
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, j122Opponent as PlayerID) <= 1)
          .map((c: CharacterInPlay) => c.instanceId);
        if (j122Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j122Player,
            'EFFECT_NO_TARGET', 'Jirobo (122) UPGRADE: No enemy with Power 1 or less (state changed).',
            'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-122-R' });
          break;
        }
        {
          const j122EffId = generateInstanceId();
          const j122ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: j122EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: j122MI, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'JIROBO122_DEFEAT_TARGET',
            sourcePlayer: j122Player, requiresTargetSelection: true,
            validTargets: j122Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: j122ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: j122Player,
            description: 'Jirobo (122) UPGRADE: Choose an enemy with Power 1 or less to defeat.',
            descriptionKey: 'game.effect.desc.jirobo122Defeat',
            options: j122Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: j122EffId,
          });
        }
        break;
      }

      case 'GAARA120_CONFIRM_MAIN': {
        // Start the mission-by-mission defeat flow
        const g120Player = pendingEffect.sourcePlayer;
        const g120Opponent = g120Player === 'player1' ? 'player2' : 'player1';
        const g120EnemySide: 'player1Characters' | 'player2Characters' =
          g120Player === 'player1' ? 'player2Characters' : 'player1Characters';
        let g120Desc: { isUpgrade?: boolean } = {};
        try { g120Desc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        // Find first mission with valid targets
        let g120FirstMission = -1;
        let g120FirstTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const targets = newState.activeMissions[i][g120EnemySide]
            .filter((c: CharacterInPlay) => getEffectivePower(newState, c, g120Opponent as PlayerID) <= 1)
            .map((c: CharacterInPlay) => c.instanceId);
          if (targets.length > 0) {
            g120FirstMission = i;
            g120FirstTargets = targets;
            break;
          }
        }
        if (g120FirstMission === -1) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g120Player,
            'EFFECT_NO_TARGET', 'Gaara (120): No enemy characters with Power 1 or less (state changed).',
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-120-R' });
          break;
        }
        {
          const g120EffId = generateInstanceId();
          const g120ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: g120EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              defeatedCount: 0,
              nextMissionIndex: g120FirstMission + 1,
              isUpgrade: g120Desc.isUpgrade ?? false,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              missionIndex: g120FirstMission,
            }),
            targetSelectionType: 'GAARA120_CHOOSE_DEFEAT',
            sourcePlayer: g120Player, requiresTargetSelection: true,
            validTargets: g120FirstTargets, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: g120ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: g120Player,
            description: `Gaara (120): Choose an enemy character with Power 1 or less to defeat in mission ${g120FirstMission + 1}.`,
            descriptionKey: 'game.effect.desc.gaara120ChooseDefeat',
            descriptionParams: { mission: String(g120FirstMission + 1) },
            options: g120FirstTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: g120EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'ITACHI128_CONFIRM_UPGRADE': {
        // Reworked: move any friendly character in play (player chooses char + destination)
        const i128Player = pendingEffect.sourcePlayer;
        const i128FriendlySide: 'player1Characters' | 'player2Characters' =
          i128Player === 'player1' ? 'player1Characters' : 'player2Characters';
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i128Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (128) UPGRADE: Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-128-R' });
          break;
        }
        const i128Targets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (isMovementBlockedByKurenai(newState, i, i128Player)) continue;
          for (const c of newState.activeMissions[i][i128FriendlySide]) {
            if (c.instanceId === pendingEffect.sourceInstanceId) continue;
            let hasValidDest = false;
            for (let d = 0; d < newState.activeMissions.length; d++) {
              if (d === i) continue;
              if (EffectEngine.validateNameUniquenessForMove(newState, c, d, i128Player)) { hasValidDest = true; break; }
            }
            if (hasValidDest) i128Targets.push(c.instanceId);
          }
        }
        if (i128Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i128Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (128) UPGRADE: No friendly characters can be moved (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-128-R' });
          break;
        }
        if (i128Targets.length === 1) {
          // Auto-select single target, go straight to destination selection
          const i128CharRes = EffectEngine.findCharByInstanceId(newState, i128Targets[0]);
          if (i128CharRes) {
            const i128DestMissions: string[] = [];
            for (let d = 0; d < newState.activeMissions.length; d++) {
              if (d === i128CharRes.missionIndex) continue;
              if (EffectEngine.validateNameUniquenessForMove(newState, i128CharRes.character, d, i128Player)) {
                i128DestMissions.push(String(d));
              }
            }
            if (i128DestMissions.length === 1) {
              newState = EffectEngine.moveCharToMissionDirectPublic(
                newState, i128Targets[0], parseInt(i128DestMissions[0], 10),
                i128Player, 'ITACHI UCHIWA', 'KS-128-R', i128Player,
              );
              break;
            }
            if (i128DestMissions.length > 1) {
              const i128dEffId = generateInstanceId();
              const i128dActId = generateInstanceId();
              newState.pendingEffects.push({
                id: i128dEffId, sourceCardId: pendingEffect.sourceCardId,
                sourceInstanceId: pendingEffect.sourceInstanceId,
                sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
                effectDescription: JSON.stringify({ charInstanceId: i128Targets[0] }),
                targetSelectionType: 'ITACHI128_MOVE_DESTINATION',
                sourcePlayer: i128Player, requiresTargetSelection: true,
                validTargets: i128DestMissions, isOptional: false, isMandatory: true,
                resolved: false, isUpgrade: false,
              });
              newState.pendingActions.push({
                id: i128dActId, type: 'SELECT_TARGET' as PendingAction['type'],
                player: i128Player,
                description: `Itachi Uchiwa (128) UPGRADE: Choose a mission to move ${i128CharRes.character.card.name_fr} to.`,
                descriptionKey: 'game.effect.desc.chooseMissionMove',
                options: i128DestMissions, minSelections: 1, maxSelections: 1,
                sourceEffectId: i128dEffId,
              });
              break;
            }
          }
          break;
        }
        {
          const i128EffId = generateInstanceId();
          const i128ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i128EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'ITACHI128_MOVE_FRIENDLY',
            sourcePlayer: i128Player, requiresTargetSelection: true,
            validTargets: i128Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i128ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i128Player,
            description: 'Itachi Uchiwa (128) UPGRADE: Choose a friendly character to move.',
            descriptionKey: 'game.effect.desc.itachi128MoveFriendly',
            options: i128Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i128EffId,
          });
        }
        break;
      }

      case 'ICHIBI130_CONFIRM_UPGRADE': {
        // Re-compute missions with hidden enemies
        const i130Player = pendingEffect.sourcePlayer;
        const i130EnemySide: 'player1Characters' | 'player2Characters' =
          i130Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const i130Missions: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (newState.activeMissions[i][i130EnemySide].some((c: CharacterInPlay) => c.isHidden)) {
            i130Missions.push(String(i));
          }
        }
        if (i130Missions.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i130Player,
            'EFFECT_NO_TARGET', 'Ichibi (130) UPGRADE: No hidden enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'ICHIBI', id: 'KS-130-R' });
          break;
        }
        if (i130Missions.length === 1) {
          // Auto-resolve: defeat all hidden in that mission
          const mIdx = parseInt(i130Missions[0]);
          const hiddenEnemies = newState.activeMissions[mIdx][i130EnemySide].filter((c: CharacterInPlay) => c.isHidden);
          const sorted = sortTargetsGemmaLast(hiddenEnemies);
          let defeatedCount = 0;
          for (const h of sorted) {
            newState = EffectEngine.defeatCharacter(newState, h.instanceId, i130Player);
            defeatedCount++;
          }
          newState.log = logAction(newState.log, newState.turn, newState.phase, i130Player,
            'EFFECT_DEFEAT', `Ichibi (130) UPGRADE: Defeated ${defeatedCount} hidden enemy character(s) in mission ${mIdx + 1}.`,
            'game.log.effect.defeat', { card: 'ICHIBI', id: 'KS-130-R', target: `${defeatedCount} hidden enemies` });
          if (defeatedCount >= 2) {
            const i130Def: PlayerID = i130Player === 'player1' ? 'player2' : 'player1';
            newState.pendingDiscardReorder = { discardOwner: i130Def, chooser: i130Player, count: defeatedCount };
          }
          break;
        }
        // Multiple missions: mandatory child
        {
          const i130EffId = generateInstanceId();
          const i130ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i130EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'ICHIBI130_CHOOSE_MISSION',
            sourcePlayer: i130Player, requiresTargetSelection: true,
            validTargets: i130Missions, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i130ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i130Player,
            description: 'Ichibi (130) UPGRADE: Choose a mission to defeat all hidden enemies.',
            descriptionKey: 'game.effect.desc.ichibi130ChooseMission',
            options: i130Missions, minSelections: 1, maxSelections: 1,
            sourceEffectId: i130EffId,
          });
        }
        break;
      }

      case 'TSUNADE131_CONFIRM_MAIN': {
        // Apply POWERUP 1 to all friendly Leaf Village characters directly
        const t131Player = pendingEffect.sourcePlayer;
        const t131FriendlySide: 'player1Characters' | 'player2Characters' =
          t131Player === 'player1' ? 'player1Characters' : 'player2Characters';
        const t131Missions = [...newState.activeMissions];
        let t131Count = 0;
        for (let i = 0; i < t131Missions.length; i++) {
          const mission = { ...t131Missions[i] };
          const chars = [...mission[t131FriendlySide]];
          let changed = false;
          for (let j = 0; j < chars.length; j++) {
            const c = chars[j];
            if (c.isHidden) continue;
            if (c.instanceId === pendingEffect.sourceInstanceId) continue;
            const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            if (topCard.group === 'Leaf Village') {
              chars[j] = { ...c, powerTokens: c.powerTokens + 1 };
              t131Count++;
              changed = true;
            }
          }
          if (changed) {
            mission[t131FriendlySide] = chars;
            t131Missions[i] = mission;
          }
        }
        if (t131Count === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t131Player,
            'EFFECT_NO_TARGET', 'Tsunade (131): No friendly Leaf Village characters (state changed).',
            'game.log.effect.noTarget', { card: 'TSUNADE', id: 'KS-131-S' });
          break;
        }
        newState = { ...newState, activeMissions: t131Missions };
        newState.log = logAction(newState.log, newState.turn, newState.phase, t131Player,
          'EFFECT_POWERUP', `Tsunade (131): POWERUP 1 on ${t131Count} friendly Leaf Village character(s).`,
          'game.log.effect.powerupMultiple', { card: 'TSUNADE', id: 'KS-131-S', amount: 1, count: t131Count });
        break;
      }

      case 'JIRAIYA132_CONFIRM_MAIN': {
        // Re-compute affordable summons
        const j132Player = pendingEffect.sourcePlayer;
        const j132HandTargets = findAffordableSummonsInHand(newState, j132Player, 5);
        const j132HiddenTargets = findHiddenSummonsOnBoard(newState, j132Player, 5);
        const j132AllTargets = [
          ...j132HandTargets.map(i => `HAND_${i}`),
          ...j132HiddenTargets.map(h => `HIDDEN_${h.instanceId}`),
        ];
        if (j132AllTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j132Player,
            'EFFECT_NO_TARGET', 'Jiraya (132): No affordable Summon characters (state changed).',
            'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-132-S' });
          break;
        }
        {
          const j132EffId = generateInstanceId();
          const j132ActId = generateInstanceId();
          const j132ChildEffect = {
            id: j132EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ hiddenChars: j132HiddenTargets, costReduction: 5 }),
            targetSelectionType: 'JIRAIYA132_CHOOSE_SUMMON',
            sourcePlayer: j132Player, requiresTargetSelection: true,
            validTargets: j132AllTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          };
          pendingEffect.remainingEffectTypes = undefined;
          newState.pendingEffects.push(j132ChildEffect as any);
          newState.pendingActions.push({
            id: j132ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: j132Player,
            description: JSON.stringify({ text: 'Jiraya (132): Choose a Summon character to play (paying 5 less).', hiddenChars: j132HiddenTargets, costReduction: 5 }),
            descriptionKey: 'game.effect.desc.jiraiya132ChooseSummon',
            options: j132AllTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: j132EffId,
          });
        }
        break;
      }

      case 'JIRAIYA132_CONFIRM_UPGRADE': {
        // Re-check enemy count in this mission
        let j132uData: { missionIndex?: number; sourcePlayer?: string } = {};
        try { j132uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const j132uMIdx = j132uData.missionIndex ?? pendingEffect.sourceMissionIndex;
        const j132uSourcePlayer = (j132uData.sourcePlayer ?? pendingEffect.sourcePlayer) as PlayerID;
        const j132uOpponent = j132uSourcePlayer === 'player1' ? 'player2' : 'player1';
        const j132uEnemySide: 'player1Characters' | 'player2Characters' =
          j132uSourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const j132uMission = newState.activeMissions[j132uMIdx];
        if (!j132uMission || j132uMission[j132uEnemySide].length <= 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, j132uSourcePlayer,
            'EFFECT', 'Jiraya (132) UPGRADE: Opponent already has 2 or less characters in this mission.',
            'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-132-S' });
          break;
        }
        // Create mandatory child for opponent to choose defeat
        newState.pendingForcedResolver = j132uOpponent;
        {
          const j132uEffId = generateInstanceId();
          const j132uActId = generateInstanceId();
          // Exclude immune characters (Kyubi/Ichibi) from valid targets
          const j132uEnemyChars = j132uMission[j132uEnemySide]
            .filter((c: CharacterInPlay) => !isImmuneToEnemyHideOrDefeat(c));
          if (j132uEnemyChars.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, j132uSourcePlayer,
              'EFFECT', 'Jiraya (132) UPGRADE: All enemy characters are immune to defeat.',
              'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-132-S' });
            break;
          }
          const j132uChainData = JSON.stringify({
            missionIndex: j132uMIdx, sourcePlayer: j132uSourcePlayer,
            text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${j132uMIdx + 1} (${j132uEnemyChars.length} > 2).`,
          });
          newState.pendingEffects.push({
            id: j132uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: j132uChainData,
            targetSelectionType: 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT',
            sourcePlayer: j132uSourcePlayer, requiresTargetSelection: true,
            validTargets: j132uEnemyChars.map((c: CharacterInPlay) => c.instanceId),
            isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: j132uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: j132uOpponent,
            description: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${j132uMIdx + 1} (${j132uEnemyChars.length} > 2).`,
            descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
            descriptionParams: { mission: String(j132uMIdx + 1), count: String(j132uEnemyChars.length) },
            options: j132uEnemyChars.map((c: CharacterInPlay) => c.instanceId),
            minSelections: 1, maxSelections: 1,
            sourceEffectId: j132uEffId,
          });
        }
        break;
      }

      // --- Group C: Modifier CONFIRM_MAIN (6 cases) ---

      case 'ITACHI091_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup, else → execute base (hand reveal)
        const i091Player = pendingEffect.sourcePlayer;
        const i091Opponent = i091Player === 'player1' ? 'player2' : 'player1';
        if (newState[i091Opponent].hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i091Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (091): Opponent hand empty (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-091-UC' });
          break;
        }
        if (pendingEffect.isUpgrade) {
          // Modifier popup: ask if player wants to apply UPGRADE (also discard 1 from opponent hand)
          const i091mEffId = generateInstanceId();
          const i091mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i091mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '',
            targetSelectionType: 'ITACHI091_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: i091Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: i091mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i091Player,
            description: 'Itachi Uchiwa (091): Apply UPGRADE? Also discard 1 card from opponent hand.',
            descriptionKey: 'game.effect.desc.itachi091ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: i091mEffId,
          });
          break;
        }
        // Base MAIN: reveal opponent hand (create ITACHI091_HAND_REVEAL pending)
        {
          const i091EffId = generateInstanceId();
          const i091ActId = generateInstanceId();
          const i091OppHand = newState[i091Opponent].hand;
          const i091Cards = i091OppHand.map((c, i) => ({
            name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
            image_file: c.image_file, originalIndex: i,
          }));
          newState.pendingEffects.push({
            id: i091EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ isUpgrade: false, cards: i091Cards }),
            targetSelectionType: 'ITACHI091_HAND_REVEAL',
            sourcePlayer: i091Player, requiresTargetSelection: true,
            validTargets: ['confirm'],
            isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i091ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i091Player,
            description: JSON.stringify({ text: 'Itachi Uchiwa (091) MAIN: Opponent hand revealed.', cards: i091Cards }),
            descriptionKey: 'game.effect.desc.itachi091HandReveal',
            options: ['confirm'],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: i091EffId,
          });
        }
        break;
      }

      case 'ITACHI091_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: reveal hand + discard 1
        const i091uPlayer = pendingEffect.sourcePlayer;
        const i091uOpponent = i091uPlayer === 'player1' ? 'player2' : 'player1';
        const i091uOppHand = newState[i091uOpponent].hand;
        if (i091uOppHand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i091uPlayer,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (091): Opponent hand empty (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-091-UC' });
          break;
        }
        const i091uEffId = generateInstanceId();
        const i091uActId = generateInstanceId();
        const i091uCards = i091uOppHand.map((c, i) => ({
          name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
        }));
        newState.pendingEffects.push({
          id: i091uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ isUpgrade: true, cards: i091uCards }),
          targetSelectionType: 'ITACHI091_HAND_REVEAL',
          sourcePlayer: i091uPlayer, requiresTargetSelection: true,
          validTargets: ['confirm'],
          isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: i091uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: i091uPlayer,
          description: JSON.stringify({ text: 'Itachi Uchiwa (091) MAIN+UPGRADE: Opponent hand revealed. Choose a card to discard.', cards: i091uCards }),
          descriptionKey: 'game.effect.desc.itachi091HandReveal',
          options: ['confirm'],
          minSelections: 1, maxSelections: 1,
          sourceEffectId: i091uEffId,
        });
        break;
      }

      case 'KISAME093_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup, else → child STEAL_POWER_TOKENS_ENEMY_IN_PLAY
        const k093Player = pendingEffect.sourcePlayer;
        const k093EnemySide = k093Player === 'player1' ? 'player2Characters' : 'player1Characters';
        // Find enemies with tokens across all missions
        const k093ValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k093EnemySide]) {
            if (c.powerTokens > 0) k093ValidTargets.push(c.instanceId);
          }
        }
        if (k093ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k093Player,
            'EFFECT_NO_TARGET', 'Kisame Hoshigaki (093): No enemy with Power tokens in play (state changed).',
            'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-093-UC' });
          break;
        }
        if (pendingEffect.isUpgrade) {
          const k093mEffId = generateInstanceId();
          const k093mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k093mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '',
            targetSelectionType: 'KISAME093_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: k093Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: k093mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k093Player,
            description: 'Kisame Hoshigaki (093): Apply UPGRADE? Steal ALL Power tokens instead of 2.',
            descriptionKey: 'game.effect.desc.kisame093ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: k093mEffId,
          });
          break;
        }
        // Base MAIN: steal up to 2 tokens from enemy in play (isMandatory: true for char targeting, no SKIP)
        {
          const k093EffId = generateInstanceId();
          const k093ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k093EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY',
            sourcePlayer: k093Player, requiresTargetSelection: true,
            validTargets: k093ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k093ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k093Player,
            description: 'Kisame Hoshigaki (093): Choose an enemy character to steal Power tokens from.',
            descriptionKey: 'game.effect.desc.kisame093StealTarget',
            options: k093ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k093EffId,
          });
        }
        break;
      }

      case 'KISAME093_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed: steal ALL tokens (isMandatory: true for char targeting, no SKIP)
        const k093uPlayer = pendingEffect.sourcePlayer;
        const k093uEnemySide = k093uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k093uValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k093uEnemySide]) {
            if (c.powerTokens > 0) k093uValidTargets.push(c.instanceId);
          }
        }
        if (k093uValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k093uPlayer,
            'EFFECT_NO_TARGET', 'Kisame Hoshigaki (093): No enemy with Power tokens (state changed).',
            'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-093-UC' });
          break;
        }
        const k093uEffId = generateInstanceId();
        const k093uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k093uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY',
          sourcePlayer: k093uPlayer, requiresTargetSelection: true,
          validTargets: k093uValidTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: k093uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k093uPlayer,
          description: 'Kisame Hoshigaki (093) UPGRADE: Choose an enemy character to steal ALL Power tokens from.',
          descriptionKey: 'game.effect.desc.kisame093StealTargetUpgrade',
          options: k093uValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k093uEffId,
        });
        break;
      }

      case 'KAKASHI106_CONFIRM_MAIN': {
        const k106Player = pendingEffect.sourcePlayer;
        const k106EnemySide = k106Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const k106ValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k106EnemySide]) {
            if (c.stack?.length > 1) {
              k106ValidTargets.push(c.instanceId);
            }
          }
        }
        if (k106ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k106Player,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (106): No upgraded enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-106-R' });
          break;
        }
        if (pendingEffect.isUpgrade) {
          const k106mEffId = generateInstanceId();
          const k106mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k106mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '',
            targetSelectionType: 'KAKASHI106_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: k106Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: k106mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k106Player,
            description: 'Kakashi Hatake (106): Apply UPGRADE? Also copy a non-Upgrade effect of the discarded card.',
            descriptionKey: 'game.effect.desc.kakashi106ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: k106mEffId,
          });
          break;
        }
        // Base MAIN: devolve (isUpgrade: false)
        {
          const k106EffId = generateInstanceId();
          const k106ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k106EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'KAKASHI106_DEVOLVE_TARGET',
            sourcePlayer: k106Player, requiresTargetSelection: true,
            validTargets: k106ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k106ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k106Player,
            description: 'Kakashi Hatake (106): Choose an upgraded enemy character to de-evolve.',
            descriptionKey: 'game.effect.desc.kakashi106DevolveTarget',
            options: k106ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k106EffId,
          });
        }
        break;
      }

      case 'KAKASHI106_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: devolve with isUpgrade: true (will copy effect)
        const k106uPlayer = pendingEffect.sourcePlayer;
        const k106uEnemySide = k106uPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k106uValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k106uEnemySide]) {
            if (c.stack?.length > 1) {
              k106uValidTargets.push(c.instanceId);
            }
          }
        }
        if (k106uValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k106uPlayer,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (106): No upgraded enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-106-R' });
          break;
        }
        const k106uEffId = generateInstanceId();
        const k106uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k106uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'KAKASHI106_DEVOLVE_TARGET',
          sourcePlayer: k106uPlayer, requiresTargetSelection: true,
          validTargets: k106uValidTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: k106uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: k106uPlayer,
          description: 'Kakashi Hatake (106) UPGRADE: Choose an upgraded enemy character to de-evolve (+ copy effect).',
          descriptionKey: 'game.effect.desc.kakashi106DevolveTargetUpgrade',
          options: k106uValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: k106uEffId,
        });
        break;
      }

      case 'NARUTO108_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup, else → child NARUTO108_CHOOSE_HIDE_TARGET
        const n108Player = pendingEffect.sourcePlayer;
        const n108Opponent = n108Player === 'player1' ? 'player2' : 'player1';
        let n108Data: { missionIndex?: number } = {};
        try { n108Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n108MI = n108Data.missionIndex ?? pendingEffect.sourceMissionIndex;
        const n108Mission = newState.activeMissions[n108MI];
        if (!n108Mission) break;
        const n108EnemySide = n108Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const n108ValidTargets = n108Mission[n108EnemySide]
          .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(newState, c, n108Opponent as PlayerID) <= 3)
          .map((c: CharacterInPlay) => c.instanceId);
        if (n108ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n108Player,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (108): No enemy with Power 3 or less (state changed).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-108-R' });
          break;
        }
        if (pendingEffect.isUpgrade) {
          const n108mEffId = generateInstanceId();
          const n108mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n108mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n108MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: n108MI }),
            targetSelectionType: 'NARUTO108_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: n108Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: n108mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n108Player,
            description: 'Naruto Uzumaki (108): Apply UPGRADE? Also POWERUP X (X = hidden character Power).',
            descriptionKey: 'game.effect.desc.naruto108ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: n108mEffId,
          });
          break;
        }
        // Base MAIN: hide target (isUpgrade: false)
        {
          const n108EffId = generateInstanceId();
          const n108ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n108EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n108MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ isUpgrade: false }),
            targetSelectionType: 'NARUTO108_CHOOSE_HIDE_TARGET',
            sourcePlayer: n108Player, requiresTargetSelection: true,
            validTargets: n108ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: n108ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n108Player,
            description: 'Naruto Uzumaki (108): Choose an enemy with Power 3 or less to hide.',
            descriptionKey: 'game.effect.desc.naruto108ChooseHideTarget',
            options: n108ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: n108EffId,
          });
        }
        break;
      }

      case 'NARUTO108_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: hide + POWERUP X (isUpgrade: true)
        const n108uPlayer = pendingEffect.sourcePlayer;
        const n108uOpponent = n108uPlayer === 'player1' ? 'player2' : 'player1';
        let n108uData: { missionIndex?: number } = {};
        try { n108uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n108uMI = n108uData.missionIndex ?? pendingEffect.sourceMissionIndex;
        const n108uMission = newState.activeMissions[n108uMI];
        if (!n108uMission) break;
        const n108uEnemySide = n108uOpponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const n108uValidTargets = n108uMission[n108uEnemySide]
          .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(newState, c, n108uOpponent as PlayerID) <= 3)
          .map((c: CharacterInPlay) => c.instanceId);
        if (n108uValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n108uPlayer,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (108): No enemy with Power 3 or less (state changed).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-108-R' });
          break;
        }
        const n108uEffId = generateInstanceId();
        const n108uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: n108uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: n108uMI,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ isUpgrade: true }),
          targetSelectionType: 'NARUTO108_CHOOSE_HIDE_TARGET',
          sourcePlayer: n108uPlayer, requiresTargetSelection: true,
          validTargets: n108uValidTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: n108uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: n108uPlayer,
          description: 'Naruto Uzumaki (108) UPGRADE: Choose an enemy with Power 3 or less to hide (+ POWERUP X).',
          descriptionKey: 'game.effect.desc.naruto108ChooseHideTargetUpgrade',
          options: n108uValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: n108uEffId,
        });
        break;
      }

      case 'SAKURA109_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup, else → child SAKURA109_CHOOSE_DISCARD (costReduction: 0)
        const s109Player = pendingEffect.sourcePlayer;
        const s109PS = newState[s109Player];
        if (pendingEffect.isUpgrade) {
          // Check if there's at least one affordable card (cost-2 fresh OR upgrade) before showing modifier popup
          const s109HasAffordable = s109PS.discardPile.some((c) => {
            if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
            if (s109PS.chakra >= Math.max(0, (c.chakra ?? 0) - 2)) return true;
            return canAffordAsUpgrade(newState, s109Player, c as any, 2);
          });
          if (!s109HasAffordable) {
            // Fall back to base (no cost reduction) — check fresh OR upgrade
            const s109HasBase = s109PS.discardPile.some((c) => {
              if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
              if (s109PS.chakra >= (c.chakra ?? 0)) return true;
              return canAffordAsUpgrade(newState, s109Player, c as any, 0);
            });
            if (!s109HasBase) {
              newState.log = logAction(newState.log, newState.turn, newState.phase, s109Player,
                'EFFECT_NO_TARGET', 'Sakura Haruno (109): No affordable Leaf Village character in discard (state changed).',
                'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-109-R' });
              break;
            }
          }
          const s109mEffId = generateInstanceId();
          const s109mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s109mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '',
            targetSelectionType: 'SAKURA109_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: s109Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: s109mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s109Player,
            description: 'Sakura Haruno (109): Apply UPGRADE? Pay 2 less chakra.',
            descriptionKey: 'game.effect.desc.sakura109ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: s109mEffId,
          });
          break;
        }
        // Base MAIN: choose from discard (costReduction: 0)
        // Include cards affordable as fresh play OR as upgrade (same-name or flex)
        {
          const s109ValidTargets = s109PS.discardPile
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => {
              if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
              // Can afford fresh play?
              if (s109PS.chakra >= (c.chakra ?? 0)) return true;
              // Can afford as upgrade on any mission?
              return canAffordAsUpgrade(newState, s109Player, c as any, 0);
            })
            .map(({ i }) => String(i));
          if (s109ValidTargets.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, s109Player,
              'EFFECT_NO_TARGET', 'Sakura Haruno (109): No affordable Leaf Village character in discard (state changed).',
              'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-109-R' });
            break;
          }
          const s109EffId = generateInstanceId();
          const s109ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s109EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'SAKURA109_CHOOSE_DISCARD',
            sourcePlayer: s109Player, requiresTargetSelection: true,
            validTargets: s109ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: s109ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: s109Player,
            description: 'Sakura Haruno (109): Choose a Leaf Village character from your discard pile to play.',
            descriptionKey: 'game.effect.desc.sakura109ChooseDiscard',
            options: s109ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: s109EffId,
          });
        }
        break;
      }

      case 'SAKURA109_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: choose from discard (costReduction: 2)
        const s109uPlayer = pendingEffect.sourcePlayer;
        const s109uPS = newState[s109uPlayer];
        const s109uValidTargets = s109uPS.discardPile
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => {
            if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
            // Can afford as fresh play with -2 reduction?
            if (s109uPS.chakra >= Math.max(0, (c.chakra ?? 0) - 2)) return true;
            // Can afford as upgrade on any mission with -2 reduction?
            return canAffordAsUpgrade(newState, s109uPlayer, c as any, 2);
          })
          .map(({ i }) => String(i));
        if (s109uValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s109uPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (109): No affordable Leaf Village character (cost-2) in discard (state changed).',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-109-R' });
          break;
        }
        const s109uEffId = generateInstanceId();
        const s109uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: s109uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'SAKURA109_CHOOSE_DISCARD',
          sourcePlayer: s109uPlayer, requiresTargetSelection: true,
          validTargets: s109uValidTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: s109uActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
          player: s109uPlayer,
          description: 'Sakura Haruno (109) UPGRADE: Choose a Leaf Village character from discard (cost -2).',
          descriptionKey: 'game.effect.desc.sakura109ChooseDiscardUpgrade',
          options: s109uValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: s109uEffId,
        });
        break;
      }

      case 'INO110_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup, else → child INO110_CHOOSE_ENEMY (isUpgrade: false)
        const i110Player = pendingEffect.sourcePlayer;
        const i110Opponent = i110Player === 'player1' ? 'player2' : 'player1';
        let i110Data: { missionIndex?: number } = {};
        try { i110Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i110MI = i110Data.missionIndex ?? pendingEffect.sourceMissionIndex;
        const i110Mission = newState.activeMissions[i110MI];
        if (!i110Mission) break;
        const i110EnemySide = i110Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const i110Enemies = i110Mission[i110EnemySide];
        if (i110Enemies.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i110Player,
            'EFFECT_NO_TARGET', 'Ino Yamanaka (110): Fewer than 2 enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-110-R' });
          break;
        }
        const i110NonHidden = i110Enemies.filter((c: CharacterInPlay) => !c.isHidden);
        if (i110NonHidden.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i110Player,
            'EFFECT_NO_TARGET', 'Ino Yamanaka (110): No non-hidden enemies (state changed).',
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-110-R' });
          break;
        }
        // Find the weakest
        let i110MinPower = Infinity;
        for (const c of i110NonHidden) {
          const p = getEffectivePower(newState, c, i110Opponent as PlayerID);
          if (p < i110MinPower) i110MinPower = p;
        }
        const i110WeakestTargets = i110NonHidden
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, i110Opponent as PlayerID) === i110MinPower)
          .map((c: CharacterInPlay) => c.instanceId);

        if (pendingEffect.isUpgrade) {
          const i110mEffId = generateInstanceId();
          const i110mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i110mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: i110MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: i110MI }),
            targetSelectionType: 'INO110_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: i110Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: i110mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i110Player,
            description: 'Ino Yamanaka (110): Apply UPGRADE? Also hide the enemy after moving.',
            descriptionKey: 'game.effect.desc.ino110ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: i110mEffId,
          });
          break;
        }
        // Base MAIN: move weakest (isUpgrade: false)
        if (i110WeakestTargets.length === 1) {
          // Auto-select → move stage
          const i110EffId = generateInstanceId();
          const i110ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i110EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: i110MI,
            effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'INO110_CHOOSE_ENEMY',
            sourcePlayer: i110Player, requiresTargetSelection: true,
            validTargets: i110WeakestTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i110ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i110Player,
            description: 'Ino Yamanaka (110): Choose the weakest enemy to move.',
            descriptionKey: 'game.effect.desc.ino110ChooseEnemy',
            options: i110WeakestTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i110EffId,
          });
        } else {
          const i110EffId = generateInstanceId();
          const i110ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i110EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: i110MI,
            effectType: pendingEffect.effectType,
            effectDescription: '', targetSelectionType: 'INO110_CHOOSE_ENEMY',
            sourcePlayer: i110Player, requiresTargetSelection: true,
            validTargets: i110WeakestTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i110ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i110Player,
            description: 'Ino Yamanaka (110): Choose the weakest enemy to move.',
            descriptionKey: 'game.effect.desc.ino110ChooseEnemy',
            options: i110WeakestTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i110EffId,
          });
        }
        break;
      }

      case 'INO110_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed modifier: move weakest + hide (isUpgrade: true)
        const i110uPlayer = pendingEffect.sourcePlayer;
        const i110uOpponent = i110uPlayer === 'player1' ? 'player2' : 'player1';
        let i110uData: { missionIndex?: number } = {};
        try { i110uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i110uMI = i110uData.missionIndex ?? pendingEffect.sourceMissionIndex;
        const i110uMission = newState.activeMissions[i110uMI];
        if (!i110uMission) break;
        const i110uEnemySide = i110uOpponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const i110uEnemies = i110uMission[i110uEnemySide];
        const i110uNonHidden = i110uEnemies.filter((c: CharacterInPlay) => !c.isHidden);
        if (i110uNonHidden.length === 0 || i110uEnemies.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i110uPlayer,
            'EFFECT_NO_TARGET', 'Ino Yamanaka (110): No valid targets (state changed).',
            'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-110-R' });
          break;
        }
        let i110uMinPower = Infinity;
        for (const c of i110uNonHidden) {
          const p = getEffectivePower(newState, c, i110uOpponent as PlayerID);
          if (p < i110uMinPower) i110uMinPower = p;
        }
        const i110uWeakest = i110uNonHidden
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, i110uOpponent as PlayerID) === i110uMinPower)
          .map((c: CharacterInPlay) => c.instanceId);
        const i110uEffId = generateInstanceId();
        const i110uActId = generateInstanceId();
        newState.pendingEffects.push({
          id: i110uEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: i110uMI,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'INO110_CHOOSE_ENEMY',
          sourcePlayer: i110uPlayer, requiresTargetSelection: true,
          validTargets: i110uWeakest, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
        });
        newState.pendingActions.push({
          id: i110uActId, type: 'SELECT_TARGET' as PendingAction['type'],
          player: i110uPlayer,
          description: 'Ino Yamanaka (110) UPGRADE: Choose the weakest enemy to move (+ hide after).',
          descriptionKey: 'game.effect.desc.ino110ChooseEnemyUpgrade',
          options: i110uWeakest, minSelections: 1, maxSelections: 1,
          sourceEffectId: i110uEffId,
        });
        break;
      }

      // =============================================
      // END BATCH 10 CONFIRM POPUPS
      // =============================================

      case 'ZABUZA087_CONFIRM_MAIN': {
        // Re-check exactly 1 non-hidden enemy. If isUpgrade → modifier popup, else hide.
        const z087Player = pendingEffect.sourcePlayer;
        const z087Opponent = z087Player === 'player1' ? 'player2' : 'player1';
        let z087Data: { missionIndex?: number } = {};
        try { z087Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const z087MI = z087Data.missionIndex ?? pendingEffect.sourceMissionIndex;
        const z087Mission = newState.activeMissions[z087MI];
        if (!z087Mission) break;
        const z087EnemySide = z087Opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        const z087NonHidden = z087Mission[z087EnemySide].filter((c: CharacterInPlay) => !c.isHidden);

        if (z087NonHidden.length !== 1) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z087Player,
            'EFFECT_NO_TARGET', `Zabuza Momochi (087): ${z087NonHidden.length} non-hidden enemies (need exactly 1, state changed).`,
            'game.log.effect.noTarget', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC' });
          break;
        }

        const z087Target = z087NonHidden[0];

        if (pendingEffect.isUpgrade) {
          // Modifier popup: ask if player wants to apply UPGRADE (defeat instead of hide)
          const z087mEffId = generateInstanceId();
          const z087mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: z087mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: z087MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ targetInstanceId: z087Target.instanceId, missionIndex: z087MI }),
            targetSelectionType: 'ZABUZA087_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: z087Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: z087mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: z087Player,
            description: 'Zabuza Momochi (087): Apply UPGRADE? Defeat the enemy instead of hiding them.',
            descriptionKey: 'game.effect.desc.zabuza087ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: z087mEffId,
          });
          break;
        }

        // Base MAIN: hide the enemy
        if (!canBeHiddenByEnemy(newState, z087Target, z087Opponent as PlayerID)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, z087Player,
            'EFFECT_NO_TARGET', `Zabuza Momochi (087): ${z087Target.card.name_fr} is immune to being hidden.`,
            'game.log.effect.immune', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC', target: z087Target.card.name_fr });
          break;
        }
        newState = EffectEngine.hideCharacterWithLog(newState, z087Target.instanceId, z087Player);
        break;
      }

      case 'ZABUZA087_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed UPGRADE modifier: defeat the target instead of hiding
        const z087mPlayer = pendingEffect.sourcePlayer;
        let z087mData: { targetInstanceId?: string; missionIndex?: number } = {};
        try { z087mData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const z087mTargetId = z087mData.targetInstanceId;
        if (!z087mTargetId) break;

        newState = EffectEngine.defeatCharacter(newState, z087mTargetId, z087mPlayer);
        const z087mChar = EffectEngine.findCharByInstanceId(newState, z087mTargetId);
        newState.log = logAction(newState.log, newState.turn, newState.phase, z087mPlayer,
          'EFFECT_DEFEAT', `Zabuza Momochi (087): Defeated ${z087mChar?.character.card.name_fr ?? 'enemy'} (upgrade - defeat instead of hide).`,
          'game.log.effect.defeat', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC', target: z087mChar?.character.card.name_fr ?? '' });
        break;
      }

      case 'HAKU089_CONFIRM_MAIN': {
        // If isUpgrade → modifier popup. If not → discard from opponent deck + POWERUP X.
        const h089Player = pendingEffect.sourcePlayer;
        const h089Opponent = h089Player === 'player1' ? 'player2' : 'player1';
        let h089Data: { missionIndex?: number } = {};
        try { h089Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const h089MI = h089Data.missionIndex ?? pendingEffect.sourceMissionIndex;

        if (pendingEffect.isUpgrade) {
          // Check at least one deck has cards
          if (newState[h089Opponent].deck.length === 0 && newState[h089Player].deck.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, h089Player,
              'EFFECT_NO_TARGET', 'Haku (089): Both decks empty (state changed).',
              'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
            break;
          }
          // Modifier popup
          const h089mEffId = generateInstanceId();
          const h089mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: h089mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: h089MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: h089MI }),
            targetSelectionType: 'HAKU089_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: h089Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
          });
          newState.pendingActions.push({
            id: h089mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: h089Player,
            description: 'Haku (089): Apply UPGRADE? Discard from your own deck instead.',
            descriptionKey: 'game.effect.desc.haku089ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: h089mEffId,
          });
          break;
        }

        // Base MAIN: discard from opponent deck + POWERUP X
        if (newState[h089Opponent].deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, h089Player,
            'EFFECT_NO_TARGET', "Haku (089): Opponent's deck empty (state changed).",
            'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
          break;
        }
        newState = EffectEngine.haku089DiscardAndPowerup(newState, pendingEffect, h089Opponent, h089MI);
        break;
      }

      case 'HAKU089_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed: discard from OWN deck + POWERUP X
        const h089uPlayer = pendingEffect.sourcePlayer;
        let h089uData: { missionIndex?: number } = {};
        try { h089uData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const h089uMI = h089uData.missionIndex ?? pendingEffect.sourceMissionIndex;

        if (newState[h089uPlayer].deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, h089uPlayer,
            'EFFECT_NO_TARGET', 'Haku (089): Own deck empty (state changed).',
            'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
          break;
        }
        newState = EffectEngine.haku089DiscardAndPowerup(newState, pendingEffect, h089uPlayer, h089uMI);
        break;
      }

      // =============================================
      // KIBA113: Player chose which Akamaru to hide/defeat, then prompt for target (any side)
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
        const friendlySide_k113 = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
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

        // Gather valid targets for step 2: ANY non-hidden character in source mission
        // (both friendly and enemy), excluding Kiba himself and the Akamaru just targeted
        const srcMission_k113 = newState.activeMissions[srcMI];
        if (!srcMission_k113) break;
        const step2Targets: string[] = [];
        for (const char of [...srcMission_k113[friendlySide_k113], ...srcMission_k113[enemySide_k113]]) {
          if (!char.isHidden && char.instanceId !== targetId && char.instanceId !== pendingEffect.sourceInstanceId) {
            step2Targets.push(char.instanceId);
          }
        }

        if (step2Targets.length === 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kiba Inuzuka (113): No non-hidden character in this mission to target.',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-113-R' },
          );
          break;
        }

        const step2Type = isDefeatMode ? 'KIBA113_DEFEAT_TARGET' : 'KIBA113_HIDE_TARGET';
        const step2DescKey = isDefeatMode ? 'game.effect.desc.kiba113Defeat' : 'game.effect.desc.kiba113Hide';
        const step2Desc = isDefeatMode
          ? 'Kiba Inuzuka (113) UPGRADE: Choose a character in this mission to defeat.'
          : 'Kiba Inuzuka (113): Choose a character in this mission to hide.';

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
      case 'SAKON127_HIDE_TARGET':
      case 'SHIKAMARU111_HIDE_ENEMY':
      case 'KIBA149_CHOOSE_HIDE_TARGET':
      case 'SHIKAMARU150_CHOOSE_HIDE':
      case 'NARUTO141_CHOOSE_HIDE_TARGET':
      case 'JIRAIYA_HIDE_ENEMY_COST_3':
      case 'CHOJI018_HIDE_ENEMY':
      case 'GAARA139_HIDE_SAME_NAME':
      case 'GAARA153_HIDE_SAME_NAME':
      case 'KIBA026_OPPONENT_CHOOSE_HIDE': // legacy â€' kept for backward compat with old saved states
      case 'KIBA026_PLAYER_CHOOSE_HIDE':
      case 'AKAMARU029_CHOOSE_HIDE':
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Naruto 133 S: Two-stage hide/defeat ---
      case 'NARUTO133_CHOOSE_TARGET1': {
        // Stage 1: hide or defeat the chosen enemy (Power â‰¤5 in this mission)
        newState = EffectEngine.naruto133ApplyTarget1(newState, pendingEffect, targetId);
        break;
      }
      case 'NARUTO133_CHOOSE_TARGET2': {
        // Stage 2: hide or defeat a second enemy (Power ≤2 in any mission)
        let parsed133t2: { useDefeat?: boolean; target1Id?: string; discardSizeBefore?: number } = {};
        try { parsed133t2 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (parsed133t2.useDefeat) {
          const n133Defender: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const n133DiscardBefore = parsed133t2.discardSizeBefore ?? newState[n133Defender].discardPile.length;
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          const n133TotalDefeated = newState[n133Defender].discardPile.length - n133DiscardBefore;
          if (n133TotalDefeated >= 2) {
            newState.pendingDiscardReorder = { discardOwner: n133Defender, chooser: pendingEffect.sourcePlayer, count: n133TotalDefeated };
          }
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
      // MOVE types (two-stage: character selection â†' destination selection)
      // =============================================
      case 'JIRAIYA105_MOVE_ENEMY':
      case 'KANKURO119_MOVE_CHARACTER':
      case 'TEMARI121_MOVE_FRIENDLY':
      case 'TEMARI121_MOVE_ANY':
      case 'ITACHI152_CHOOSE_MOVE':
      case 'ITACHI128_MOVE_FRIENDLY':
      case 'SHINO115_MOVE_FRIENDLY': {
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
            // No valid destination â€' can't move
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_BLOCKED',
              `Cannot move ${moveCharResult.character.card.name_fr} â€' no valid destination mission.`,
              'game.log.effect.moveBlocked',
              { target: moveCharResult.character.card.name_fr },
            );
          } else if (validDestMissions.length === 1) {
            // Only one valid destination â€' auto-move
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDestMissions[0], 10),
              moveCharResult.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
              pendingEffect.sourcePlayer, // effectInitiator: the player who owns the move effect
            );
          } else {
            // Multiple valid destinations â€' prompt for selection
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
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
            });
            // Clear remaining from parent so processRemainingEffects only fires
            // once (from DESTINATION), not twice (from both MOVE and DESTINATION).
            pendingEffect.remainingEffectTypes = undefined;
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
      case 'ITACHI128_MOVE_FRIENDLY_DESTINATION':
      case 'ITACHI128_MOVE_DESTINATION':
      case 'SHINO115_MOVE_FRIENDLY_DESTINATION': {
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
                pendingEffect.sourcePlayer, // effectInitiator: the player who owns the move effect
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

      // --- Giant Spider 103 optional end-of-round: hide a character, then must return to hand ---
      case 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET': {
        // Hide the selected character
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        // Giant Spider must return to hand â€' UNLESS it hid itself (continuous effect gone)
        let k103Data: { giantSpiderInstanceId?: string } = {};
        try { k103Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (k103Data.giantSpiderInstanceId && targetId !== k103Data.giantSpiderInstanceId) {
          newState = returnCharacterToHand(newState, k103Data.giantSpiderInstanceId, pendingEffect.sourcePlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'END_RETURN',
            'Giant Spider (103): Returns to hand at end of round.',
            'game.log.effect.giantSpider103Return',
            { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
          );
        }
        break;
      }

      // --- MOVE types (destination selection â€' use moveSelfToMission) ---
      case 'KURENAI116B_MOVE_SELF':
      case 'KAKASHI137_MOVE_SELF':
      case 'PAKKUN_MOVE_DESTINATION':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      case 'KAKASHI137_HIDE_UPGRADED': {
        // Hide the selected upgraded character â€' use hideCharacterWithLog for proper protection checks
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

        let charMoved107 = false;

        // Move the character to the chosen mission
        if (charId107) {
          // Check Kurenai 035 movement block before moving
          let charSourceMission107 = -1;
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (newState.activeMissions[i][friendlySide107].some(c => c.instanceId === charId107)) {
              charSourceMission107 = i;
              break;
            }
          }
          if (charSourceMission107 >= 0 && isMovementBlockedByKurenai(newState, charSourceMission107, player107)) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, player107,
              'EFFECT_BLOCKED',
              `Sasuke Uchiwa (107): Movement blocked by Kurenai Yuhi (035) - character stays in place.`,
              'game.log.effect.moveBlocked',
              { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
            );
          } else {
            // Find char before move for trigger calls
            let preMovedChar107: CharacterInPlay | null = null;
            for (const m of newState.activeMissions) {
              const c = m[friendlySide107].find((ch) => ch.instanceId === charId107);
              if (c) { preMovedChar107 = c; break; }
            }

            newState = moveCharTo(newState, charId107, destMission107, player107);

            if (preMovedChar107) {
              const charName107 = preMovedChar107.card.name_fr;
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, player107,
                'EFFECT_MOVE',
                `Sasuke Uchiwa (107): Moved ${charName107} to mission ${destMission107 + 1}.`,
                'game.log.effect.move',
                { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: charName107, from: srcMission107, to: destMission107 },
              );

              // Call move triggers
              const charAtDest107 = newState.activeMissions[destMission107]?.[friendlySide107]
                ?.find((c) => c.instanceId === charId107);
              if (charAtDest107) {
                newState = checkNinjaHoundsTrigger(newState, charAtDest107, destMission107, player107);
                newState = checkChoji018PostMoveTrigger(newState, charAtDest107, destMission107, player107, player107);
              }

              movedCount107++;
              charMoved107 = true;
            }
          }
        }

        // Process remaining characters — delegate to CHOOSE_CHAR_TO_MOVE or handle directly
        const rem107StillMoveable: string[] = [];
        for (const rid of remaining107) {
          let exists = false;
          for (const m of newState.activeMissions) {
            if (m[friendlySide107].some(c => c.instanceId === rid)) { exists = true; break; }
          }
          if (!exists) continue;
          const vm = getValidMissions(newState, rid, player107, srcMission107);
          if (vm.length > 0) rem107StillMoveable.push(rid);
        }

        if (rem107StillMoveable.length === 0) {
          // All done — apply UPGRADE POWERUP if applicable
          if (isUpgrade107 && movedCount107 > 0) {
            newState = applyUpgradePowerup(newState, sasukeId107, movedCount107, player107, srcMission107);
          }
        } else if (rem107StillMoveable.length === 1) {
          // One remaining — create destination choice or auto-move
          const lastCharId107 = rem107StillMoveable[0];
          let lastName107 = '';
          for (const m of newState.activeMissions) {
            const c = m[friendlySide107].find((ch) => ch.instanceId === lastCharId107);
            if (c) { lastName107 = c.card.name_fr; break; }
          }
          const lastVm107 = getValidMissions(newState, lastCharId107, player107, srcMission107);
          if (lastVm107.length === 1) {
            // Auto-move last char
            let lastPreMoved: CharacterInPlay | null = null;
            for (const m of newState.activeMissions) {
              const c = m[friendlySide107].find((ch) => ch.instanceId === lastCharId107);
              if (c) { lastPreMoved = c; break; }
            }
            newState = moveCharTo(newState, lastCharId107, lastVm107[0], player107);
            newState.log = logAction(newState.log, newState.turn, newState.phase, player107,
              'EFFECT_MOVE', `Sasuke Uchiwa (107): Moved ${lastName107} to mission ${lastVm107[0] + 1}.`,
              'game.log.effect.move', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: lastName107, from: srcMission107, to: lastVm107[0] });
            if (lastPreMoved) {
              const lastAtDest = newState.activeMissions[lastVm107[0]]?.[friendlySide107]?.find((c) => c.instanceId === lastCharId107);
              if (lastAtDest) {
                newState = checkNinjaHoundsTrigger(newState, lastAtDest, lastVm107[0], player107);
                newState = checkChoji018PostMoveTrigger(newState, lastAtDest, lastVm107[0], player107, player107);
              }
            }
            if (isUpgrade107 && (movedCount107 + 1) > 0) {
              newState = applyUpgradePowerup(newState, sasukeId107, movedCount107 + 1, player107, srcMission107);
            }
          } else {
            // Multiple destinations — create CHOOSE_DESTINATION pending
            const eId107 = generateInstanceId();
            const aId107 = generateInstanceId();
            newState.pendingEffects.push({
              id: eId107, sourceCardId: pendingEffect.sourceCardId, sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
              effectDescription: JSON.stringify({ charInstanceId: lastCharId107, remainingCharIds: [], movedCount: movedCount107, isUpgrade: isUpgrade107, sasukeInstanceId: sasukeId107, sourceMissionIndex: srcMission107 }),
              targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION', sourcePlayer: player107,
              requiresTargetSelection: true, validTargets: lastVm107.map(String), isOptional: false, isMandatory: true, resolved: false, isUpgrade: isUpgrade107,
            });
            newState.pendingActions.push({
              id: aId107, type: 'SELECT_TARGET', player: player107,
              description: `Sasuke Uchiwa (107): Choose a mission to move ${lastName107} to.`,
              descriptionKey: 'game.effect.desc.sasuke107ChooseDestination', descriptionParams: { target: lastName107 },
              options: lastVm107.map(String), minSelections: 1, maxSelections: 1, sourceEffectId: eId107,
            });
          }
        } else {
          // 2+ remaining — create CHOOSE_CHAR_TO_MOVE pending
          const nextEId107 = generateInstanceId();
          const nextAId107 = generateInstanceId();
          newState.pendingEffects.push({
            id: nextEId107, sourceCardId: pendingEffect.sourceCardId, sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ remainingCharIds: rem107StillMoveable, movedCount: movedCount107, isUpgrade: isUpgrade107, sasukeInstanceId: sasukeId107, sourceMissionIndex: srcMission107 }),
            targetSelectionType: 'SASUKE107_CHOOSE_CHAR_TO_MOVE', sourcePlayer: player107,
            requiresTargetSelection: true, validTargets: rem107StillMoveable, isOptional: false, isMandatory: true, resolved: false, isUpgrade: isUpgrade107,
          });
          newState.pendingActions.push({
            id: nextAId107, type: 'SELECT_TARGET', player: player107,
            description: 'Sasuke Uchiwa (107): Choose which character to move next.',
            descriptionKey: 'game.effect.desc.sasuke107ChooseCharToMove',
            options: rem107StillMoveable, minSelections: 1, maxSelections: 1, sourceEffectId: nextEId107,
          });
        }
        break;
      }

      // --- Shikamaru 022 â€' move enemy character (two-stage: char then destination) ---
      case 'SHIKAMARU_MOVE_ENEMY': {
        // Stage 1: player chose which enemy character to move. Now prompt for destination.
        const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (charResult) {
          const validMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) validMissions.push(String(i));
          }
          if (validMissions.length === 0) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_BLOCKED',
              'Shikamaru Nara (022): No valid destination mission (same-name conflict on all missions).',
              'game.log.effect.moveBlocked',
              { card: 'SHIKAMARU NARA', id: 'KS-022-UC', target: charResult.character.card.name_fr },
            );
            break;
          }
          if (validMissions.length === 1) {
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validMissions[0], 10),
              charResult.player, 'Shikamaru Nara', 'KS-022-UC',
              pendingEffect.sourcePlayer, // effectInitiator: Shikamaru's owner
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
                pendingEffect.sourcePlayer, // effectInitiator: Shikamaru's owner
              );
            }
          }
        }
        break;
      }

      // --- Shizune 006 â€' move enemy with power 3 or less (two-stage: char then destination) ---
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
              pendingEffect.sourcePlayer, // effectInitiator: Shizune's owner
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
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: false,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
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
            pendingEffect.remainingEffectTypes = undefined;
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
                pendingEffect.sourcePlayer, // effectInitiator: Shizune's owner
              );
            }
          }
        }
        break;
      }

      // --- Zaku 071 â€' move enemy from this mission (two-stage: char then destination) ---
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
              pendingEffect.sourcePlayer, // effectInitiator: Zaku's owner
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
              isOptional: false,
              isMandatory: true,
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
                pendingEffect.sourcePlayer, // effectInitiator: Zaku's owner
              );
            }
          }
        }
        break;
      }

      // --- Ino 110 (R) â€' move weakest enemy (two-stage: char then destination, optional hide on upgrade) ---
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
              pendingEffect.sourcePlayer, // effectInitiator: Ino's owner, not the moved char's owner
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
              isOptional: false,
              isMandatory: true,
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
                pendingEffect.sourcePlayer, // effectInitiator: Ino's owner
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
              const charOwner_d = mission.player1Characters.includes(char) ? 'player1' : 'player2';
              if (getEffectivePower(newState, char, charOwner_d as PlayerID) <= maxPower) {
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
            const enemyPlayer_g2 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
            const toMove = mission[enemySide_g].filter(c => {
              if (c.isHidden) return false;
              return getEffectivePower(newState, c, enemyPlayer_g2 as PlayerID) <= maxPower_g;
            });
            for (const char of toMove) {
              // Move to a different mission (first available)
              for (let destIdx = 0; destIdx < newState.activeMissions.length; destIdx++) {
                if (destIdx !== mIdx) {
                  newState = EffectEngine.moveCharToMissionDirectPublic(
                    newState, char.instanceId, destIdx,
                    pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1',
                    'Might Guy', 'KS-119b-R',
                    pendingEffect.sourcePlayer, // effectInitiator
                  );
                  break;
                }
              }
            }
          }
        }
        break;
      }

      case 'KIMIMARO123_AUTO_DISCARD_DEFEAT': {
        // Kimimaro 123 UPGRADE with 1 card: auto-discard the only card, then defeat the chosen target
        newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, 0);
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
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
              const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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
              isOptional: false,
              isMandatory: true,
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
            const enemyPlayer_n2 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
            const hideTargets_n = thisMission[enemySide_n].filter(c => {
              if (c.isHidden) return false;
              return getEffectivePower(newState, c, enemyPlayer_n2 as PlayerID) <= 4;
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
                isOptional: false,
                isMandatory: true,
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

      // --- Naruto 133 (S) CONFIRM MAIN ---
      case 'NARUTO133_CONFIRM_MAIN': {
        const n133Player = pendingEffect.sourcePlayer;
        const n133Opponent: PlayerID = n133Player === 'player1' ? 'player2' : 'player1';
        const n133EnemySide: 'player1Characters' | 'player2Characters' =
          n133Player === 'player1' ? 'player2Characters' : 'player1Characters';
        let n133Parsed: { missionIndex?: number; useDefeat?: boolean } = {};
        try { n133Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n133MI = n133Parsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const n133UseDefeat = n133Parsed.useDefeat ?? false;
        const n133Mission = newState.activeMissions[n133MI];
        if (!n133Mission) break;

        // Re-validate target1: Power <= 5 in this mission
        // Include hidden chars if useDefeat=true OR if isUpgrade (modifier will enable defeat mode)
        const n133CanTargetHidden = n133UseDefeat || (pendingEffect.isUpgrade ?? false);
        const n133ValidT1 = n133Mission[n133EnemySide]
          .filter((c: CharacterInPlay) => (n133CanTargetHidden || !c.isHidden) && getEffectivePower(newState, c, n133Opponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId);

        // Re-validate target2: Power <= 2 in ANY mission (same hidden logic)
        const n133ValidT2: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const ch of newState.activeMissions[i][n133EnemySide]) {
            if ((n133CanTargetHidden || !ch.isHidden) && getEffectivePower(newState, ch, n133Opponent) <= 2) {
              n133ValidT2.push(ch.instanceId);
            }
          }
        }

        if (n133ValidT1.length === 0 && n133ValidT2.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n133Player,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (133): No valid targets (state changed).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-133-S' });
          break;
        }

        // If isUpgrade and not already using defeat, chain to CONFIRM_UPGRADE_MODIFIER first
        if (pendingEffect.isUpgrade && !n133UseDefeat) {
          const n133mEffId = generateInstanceId();
          const n133mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n133mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133MI,
            effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: n133MI }),
            targetSelectionType: 'NARUTO133_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: n133Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133Player,
            description: 'Naruto Uzumaki (133): Apply UPGRADE? Defeat both targets instead of hiding them.',
            descriptionKey: 'game.effect.desc.naruto133ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: n133mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        if (n133ValidT1.length > 0) {
          // Stage 1: choose target1 (Power <= 5 in this mission)
          const n133EffId = generateInstanceId();
          const n133ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n133EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133MI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: n133MI, useDefeat: n133UseDefeat }),
            targetSelectionType: 'NARUTO133_CHOOSE_TARGET1',
            sourcePlayer: n133Player, requiresTargetSelection: true,
            validTargets: n133ValidT1, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133Player,
            description: n133UseDefeat
              ? 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to defeat (this mission).'
              : 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to hide (this mission).',
            descriptionKey: n133UseDefeat ? 'game.effect.desc.naruto133ChooseDefeat1' : 'game.effect.desc.naruto133ChooseHide1',
            options: n133ValidT1, minSelections: 1, maxSelections: 1,
            sourceEffectId: n133EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        } else {
          // No target1, skip to target2 only
          const n133EffId2 = generateInstanceId();
          const n133ActId2 = generateInstanceId();
          newState.pendingEffects.push({
            id: n133EffId2, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133MI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useDefeat: n133UseDefeat, target1Id: null }),
            targetSelectionType: 'NARUTO133_CHOOSE_TARGET2',
            sourcePlayer: n133Player, requiresTargetSelection: true,
            validTargets: n133ValidT2, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133ActId2, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133Player,
            description: n133UseDefeat
              ? 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to defeat (any mission).'
              : 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to hide (any mission).',
            descriptionKey: n133UseDefeat ? 'game.effect.desc.naruto133ChooseDefeat2' : 'game.effect.desc.naruto133ChooseHide2',
            options: n133ValidT2, minSelections: 1, maxSelections: 1,
            sourceEffectId: n133EffId2,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Naruto 133 (S) CONFIRM UPGRADE MODIFIER ---
      case 'NARUTO133_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed UPGRADE modifier: defeat instead of hide
        // Re-enter CONFIRM_MAIN logic with useDefeat: true
        const n133mPlayer = pendingEffect.sourcePlayer;
        const n133mOpponent: PlayerID = n133mPlayer === 'player1' ? 'player2' : 'player1';
        const n133mEnemySide: 'player1Characters' | 'player2Characters' =
          n133mPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let n133mParsed: { missionIndex?: number } = {};
        try { n133mParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n133mMI = n133mParsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const n133mMission = newState.activeMissions[n133mMI];
        if (!n133mMission) break;

        // UPGRADE modifier = defeat mode: include hidden chars (power 0 qualifies)
        const n133mValidT1 = n133mMission[n133mEnemySide]
          .filter((c: CharacterInPlay) => getEffectivePower(newState, c, n133mOpponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId);
        const n133mValidT2: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const ch of newState.activeMissions[i][n133mEnemySide]) {
            if (getEffectivePower(newState, ch, n133mOpponent) <= 2) {
              n133mValidT2.push(ch.instanceId);
            }
          }
        }

        if (n133mValidT1.length === 0 && n133mValidT2.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n133mPlayer,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (133): No valid targets (state changed after modifier).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-133-S' });
          break;
        }

        if (n133mValidT1.length > 0) {
          const n133mEffId = generateInstanceId();
          const n133mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: n133mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133mMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ missionIndex: n133mMI, useDefeat: true }),
            targetSelectionType: 'NARUTO133_CHOOSE_TARGET1',
            sourcePlayer: n133mPlayer, requiresTargetSelection: true,
            validTargets: n133mValidT1, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133mPlayer,
            description: 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to defeat (this mission).',
            descriptionKey: 'game.effect.desc.naruto133ChooseDefeat1',
            options: n133mValidT1, minSelections: 1, maxSelections: 1,
            sourceEffectId: n133mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        } else {
          const n133mEffId2 = generateInstanceId();
          const n133mActId2 = generateInstanceId();
          newState.pendingEffects.push({
            id: n133mEffId2, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133mMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useDefeat: true, target1Id: null }),
            targetSelectionType: 'NARUTO133_CHOOSE_TARGET2',
            sourcePlayer: n133mPlayer, requiresTargetSelection: true,
            validTargets: n133mValidT2, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133mActId2, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133mPlayer,
            description: 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to defeat (any mission).',
            descriptionKey: 'game.effect.desc.naruto133ChooseDefeat2',
            options: n133mValidT2, minSelections: 1, maxSelections: 1,
            sourceEffectId: n133mEffId2,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Kyubi 134 (S) CONFIRM UPGRADE ---
      case 'KYUBI134_CONFIRM_UPGRADE': {
        const k134Player = pendingEffect.sourcePlayer;
        const k134Opponent: PlayerID = k134Player === 'player1' ? 'player2' : 'player1';

        // Re-validate: non-hidden characters with 0 < Power <= 6, not self
        const k134ValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const mission = newState.activeMissions[i];
          for (const side of ['player1Characters', 'player2Characters'] as const) {
            const sidePlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
            for (const char of mission[side]) {
              if (char.isHidden) continue;
              if (char.instanceId === pendingEffect.sourceInstanceId) continue;
              const power = getEffectivePower(newState, char, sidePlayer);
              if (power <= 6) {
                k134ValidTargets.push(char.instanceId);
              }
            }
          }
        }

        if (k134ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k134Player,
            'EFFECT_NO_TARGET', 'Kyubi (134): No valid targets to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KYUBI', id: 'KS-134-S' });
          break;
        }

        {
          const k134EffId = generateInstanceId();
          const k134ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k134EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ remainingPower: 6, hiddenIds: [] }),
            targetSelectionType: 'KYUBI134_CHOOSE_HIDE_TARGETS',
            sourcePlayer: k134Player, requiresTargetSelection: true,
            validTargets: k134ValidTargets, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k134ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k134Player,
            description: 'Kyubi (134) UPGRADE: Choose characters to hide (total Power 6 or less).',
            descriptionKey: 'game.effect.desc.kyubi134ChooseHide',
            descriptionParams: { remaining: '6' },
            options: k134ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k134EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Sakura 135 (S) CONFIRM MAIN ---
      case 'SAKURA135_CONFIRM_MAIN': {
        const s135Player = pendingEffect.sourcePlayer;
        const s135PlayerState = newState[s135Player];
        let s135Parsed: { costReduction?: number } = {};
        try { s135Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s135CostReduction = s135Parsed.costReduction ?? 0;

        // If isUpgrade and costReduction is still 0, chain to CONFIRM_UPGRADE_MODIFIER first
        if (pendingEffect.isUpgrade && s135CostReduction === 0) {
          const s135mEffId = generateInstanceId();
          const s135mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s135mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'SAKURA135_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: s135Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: s135mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s135Player,
            description: 'Sakura Haruno (135): Apply UPGRADE? Play the card paying 4 less chakra.',
            descriptionKey: 'game.effect.desc.sakura135ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: s135mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        if (s135PlayerState.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135Player,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          break;
        }

        // Draw top 3 cards from deck
        const s135Deck = [...s135PlayerState.deck];
        const s135Top3 = s135Deck.splice(0, Math.min(3, s135Deck.length));

        // Update state with the drawn cards removed from deck
        newState = {
          ...newState,
          [s135Player]: {
            ...s135PlayerState,
            deck: s135Deck,
          },
        };

        // Find which of the top 3 are character cards the player can afford (fresh OR upgrade)
        const s135Available = s135Top3.filter((card) => {
          if (card.card_type !== 'character') return false;
          const effectiveCost = Math.max(0, (card.chakra ?? 0) - s135CostReduction);
          if (effectiveCost <= newState[s135Player].chakra) return true;
          return canAffordAsUpgrade(newState, s135Player, card as any, s135CostReduction);
        });

        if (s135Available.length === 0) {
          // No affordable characters — discard all top 3
          newState = {
            ...newState,
            [s135Player]: {
              ...newState[s135Player],
              discardPile: [...newState[s135Player].discardPile, ...s135Top3],
            },
          };
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135Player,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): No affordable characters in top 3, all discarded.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          break;
        }

        // Store top 3 cards in a temp field on state (NOT in discard pile — avoids index desync)
        (newState as any)._sakura135DrawnCards = s135Top3;

        // Build indices of affordable cards within the top3 array
        {
          const s135EffId = generateInstanceId();
          const s135ActId = generateInstanceId();
          const s135ValidIndices = s135Top3
            .map((c, i) => ({ card: c, index: i }))
            .filter(({ card }) => s135Available.some((a) => a.id === card.id))
            .map(({ index }) => String(index));

          newState.pendingEffects.push({
            id: s135EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              topCards: s135Top3.map((c, i) => ({
                index: i, name: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0, isCharacter: c.card_type === 'character',
                cardId: c.id,
              })),
              // Store the actual card data so sakura135ChooseCard can recover them reliably
              storedCards: s135Top3,
              costReduction: s135CostReduction,
            }),
            targetSelectionType: 'SAKURA135_CHOOSE_CARD',
            sourcePlayer: s135Player, requiresTargetSelection: true,
            validTargets: s135ValidIndices, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: s135ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: s135Player,
            description: `Sakura Haruno (135): Choose a character from top 3 to play${s135CostReduction > 0 ? ` (cost reduced by ${s135CostReduction})` : ''}.`,
            descriptionKey: s135CostReduction > 0 ? 'game.effect.desc.sakura135ChooseCardUpgrade' : 'game.effect.desc.sakura135ChooseCard',
            descriptionParams: s135CostReduction > 0 ? { reduction: String(s135CostReduction) } : undefined,
            options: s135ValidIndices, minSelections: 1, maxSelections: 1,
            sourceEffectId: s135EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Sakura 135 (S) CONFIRM UPGRADE MODIFIER ---
      case 'SAKURA135_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed UPGRADE modifier: play paying 4 less
        // Go DIRECTLY to top-3 draw logic (don't re-create CONFIRM_MAIN to avoid double prompt)
        const s135mPlayer = pendingEffect.sourcePlayer;
        const s135mPlayerState = newState[s135mPlayer];
        const s135mCostReduction = 4;

        if (s135mPlayerState.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135mPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          break;
        }

        // Draw top 3 cards from deck
        const s135mDeck = [...s135mPlayerState.deck];
        const s135mTop3 = s135mDeck.splice(0, Math.min(3, s135mDeck.length));

        newState = {
          ...newState,
          [s135mPlayer]: { ...s135mPlayerState, deck: s135mDeck },
        };

        const s135mAvailable = s135mTop3.filter((card) => {
          if (card.card_type !== 'character') return false;
          const effectiveCost = Math.max(0, (card.chakra ?? 0) - s135mCostReduction);
          if (effectiveCost <= newState[s135mPlayer].chakra) return true;
          return canAffordAsUpgrade(newState, s135mPlayer, card as any, s135mCostReduction);
        });

        if (s135mAvailable.length === 0) {
          newState = {
            ...newState,
            [s135mPlayer]: {
              ...newState[s135mPlayer],
              discardPile: [...newState[s135mPlayer].discardPile, ...s135mTop3],
            },
          };
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135mPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): No affordable characters in top 3, all discarded.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          break;
        }

        // Store top 3 in discard pile as temporary storage
        newState = {
          ...newState,
          [s135mPlayer]: {
            ...newState[s135mPlayer],
            discardPile: [...newState[s135mPlayer].discardPile, ...s135mTop3],
          },
        };

        {
          const s135mEffId = generateInstanceId();
          const s135mActId = generateInstanceId();
          const s135mValidIndices = s135mTop3
            .map((c, i) => ({ card: c, index: i }))
            .filter(({ card }) => s135mAvailable.some((a) => a.id === card.id))
            .map(({ index }) => String(index));

          newState.pendingEffects.push({
            id: s135mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              topCards: s135mTop3.map((c, i) => ({
                index: i, name: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0, isCharacter: c.card_type === 'character',
              })),
              costReduction: s135mCostReduction,
            }),
            targetSelectionType: 'SAKURA135_CHOOSE_CARD',
            sourcePlayer: s135mPlayer, requiresTargetSelection: true,
            validTargets: s135mValidIndices, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: s135mActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: s135mPlayer,
            description: `Sakura Haruno (135): Choose a character from top 3 to play (cost reduced by ${s135mCostReduction}).`,
            descriptionKey: 'game.effect.desc.sakura135ChooseCardUpgrade',
            descriptionParams: { reduction: String(s135mCostReduction) },
            options: s135mValidIndices, minSelections: 1, maxSelections: 1,
            sourceEffectId: s135mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Kakashi 137 (S) CONFIRM MAIN ---
      case 'KAKASHI137_CONFIRM_MAIN': {
        const k137Player = pendingEffect.sourcePlayer;
        let k137Parsed: { missionIndex?: number } = {};
        try { k137Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k137MI = k137Parsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const k137Mission = newState.activeMissions[k137MI];
        if (!k137Mission) break;

        // Re-validate: upgraded, non-hidden characters (not self), exclude immune enemies
        const k137ValidTargets: string[] = [];
        for (const side of ['player1Characters', 'player2Characters'] as const) {
          const sidePlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
          const isEnemy = sidePlayer !== k137Player;
          for (const c of k137Mission[side]) {
            if (!c.isHidden && c.stack?.length >= 2) {
              if (isEnemy && !canBeHiddenByEnemy(newState, c, sidePlayer)) continue;
              k137ValidTargets.push(c.instanceId);
            }
          }
        }

        if (k137ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k137Player,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (137): No upgraded character to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-137-S' });
          break;
        }

        {
          const k137EffId = generateInstanceId();
          const k137ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k137EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: k137MI, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'KAKASHI137_HIDE_UPGRADED',
            sourcePlayer: k137Player, requiresTargetSelection: true,
            validTargets: k137ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k137ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k137Player,
            description: 'Kakashi Hatake (137) MAIN: Choose an upgraded character in this mission to hide.',
            descriptionKey: 'game.effect.desc.kakashi137HideUpgraded',
            options: k137ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k137EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Kakashi 137 (S) CONFIRM UPGRADE ---
      case 'KAKASHI137_CONFIRM_UPGRADE': {
        const k137uPlayer = pendingEffect.sourcePlayer;
        const k137uFriendlySide: 'player1Characters' | 'player2Characters' =
          k137uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        let k137uParsed: { missionIndex?: number } = {};
        try { k137uParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k137uMI = k137uParsed.missionIndex ?? pendingEffect.sourceMissionIndex;

        // Find the source card to get its name
        const k137uCharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        const k137uTopCard = k137uCharResult
          ? (k137uCharResult.character.stack?.length > 0
              ? k137uCharResult.character.stack[k137uCharResult.character.stack?.length - 1]
              : k137uCharResult.character.card)
          : null;
        const k137uCharName = k137uTopCard?.name_fr ?? '';

        // Re-validate: missions with no same-name conflict (not current)
        const k137uValidMissions: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === k137uMI) continue;
          const mission = newState.activeMissions[i];
          const friendlyChars = mission[k137uFriendlySide];
          const hasSameName = friendlyChars.some((c: CharacterInPlay) => {
            if (c.instanceId === pendingEffect.sourceInstanceId) return false;
            if (c.isHidden) return false;
            const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return tc.name_fr === k137uCharName;
          });
          if (!hasSameName) {
            k137uValidMissions.push(String(i));
          }
        }

        if (k137uValidMissions.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k137uPlayer,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (137): No valid mission to move to (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-137-S' });
          break;
        }

        {
          const k137uEffId = generateInstanceId();
          const k137uActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k137uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: k137uMI, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'KAKASHI137_MOVE_SELF',
            sourcePlayer: k137uPlayer, requiresTargetSelection: true,
            validTargets: k137uValidMissions, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k137uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k137uPlayer,
            description: 'Kakashi Hatake (137) UPGRADE: Choose a mission to move to.',
            descriptionKey: 'game.effect.desc.kakashi137MoveSelf',
            options: k137uValidMissions, minSelections: 1, maxSelections: 1,
            sourceEffectId: k137uEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Orochimaru 138 (S) CONFIRM UPGRADE ---
      case 'OROCHIMARU138_CONFIRM_UPGRADE': {
        const o138Player = pendingEffect.sourcePlayer;
        let o138Parsed: { previousCardName?: string; previousCardPower?: number } = {};
        try { o138Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        // Auto-apply: gain 2 mission points
        newState = {
          ...newState,
          [o138Player]: {
            ...newState[o138Player],
            missionPoints: newState[o138Player].missionPoints + 2,
          },
        };
        newState.log = logAction(newState.log, newState.turn, newState.phase, o138Player,
          'EFFECT_POINTS', `Orochimaru (138): Gained 2 mission points (upgraded from ${o138Parsed.previousCardName ?? 'unknown'} with Power ${o138Parsed.previousCardPower ?? '?'}).`,
          'game.log.effect.gainPoints', { card: 'OROCHIMARU', id: 'KS-138-S', amount: 2 });
        break;
      }

      // --- Gaara 139 (S) CONFIRM MAIN ---
      case 'GAARA139_CONFIRM_MAIN': {
        const g139Player = pendingEffect.sourcePlayer;
        const g139EnemySide: 'player1Characters' | 'player2Characters' =
          g139Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const g139FriendlySide: 'player1Characters' | 'player2Characters' =
          g139Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let g139Parsed: { useHideSameName?: boolean } = {};
        try { g139Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const g139UseHideSameName = g139Parsed.useHideSameName ?? false;

        // If isUpgrade and not already decided on modifier, chain to CONFIRM_UPGRADE_MODIFIER
        if (pendingEffect.isUpgrade && !g139UseHideSameName && !g139Parsed.hasOwnProperty('useHideSameName')) {
          const g139mEffId = generateInstanceId();
          const g139mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: g139mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex,
            effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'GAARA139_CONFIRM_UPGRADE_MODIFIER',
            sourcePlayer: g139Player, requiresTargetSelection: true,
            validTargets: [pendingEffect.sourceInstanceId],
            isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: g139mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: g139Player,
            description: 'Gaara (139): Apply UPGRADE? In addition, hide an enemy with same name and lower cost.',
            descriptionKey: 'game.effect.desc.gaara139ConfirmUpgradeModifier',
            options: [pendingEffect.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: g139mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
          break;
        }

        // Re-count friendly hidden characters
        let g139HiddenCount = 0;
        for (const mission of newState.activeMissions) {
          for (const char of mission[g139FriendlySide]) {
            if (char.isHidden) g139HiddenCount++;
          }
        }

        if (g139HiddenCount === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139Player,
            'EFFECT_NO_TARGET', 'Gaara (139): No friendly hidden characters (state changed).',
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          break;
        }

        // Re-validate targets: enemy with cost < hiddenCount
        const g139ValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const char of newState.activeMissions[i][g139EnemySide]) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const effectiveCost = char.isHidden ? 0 : topCard.chakra;
            if (effectiveCost < g139HiddenCount) {
              g139ValidTargets.push(char.instanceId);
            }
          }
        }

        if (g139ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139Player,
            'EFFECT_NO_TARGET', `Gaara (139): No enemy with cost less than ${g139HiddenCount} (state changed).`,
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          break;
        }

        {
          const g139EffId = generateInstanceId();
          const g139ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: g139EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useHideSameName: g139UseHideSameName }),
            targetSelectionType: 'GAARA139_DEFEAT_BY_COST',
            sourcePlayer: g139Player, requiresTargetSelection: true,
            validTargets: g139ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: g139ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: g139Player,
            description: `Gaara (139) MAIN: Choose an enemy with cost less than ${g139HiddenCount} to defeat.`,
            descriptionKey: 'game.effect.desc.gaara139DefeatByCost',
            descriptionParams: { count: String(g139HiddenCount) },
            options: g139ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: g139EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Gaara 139 (S) CONFIRM UPGRADE MODIFIER ---
      case 'GAARA139_CONFIRM_UPGRADE_MODIFIER': {
        // Player confirmed UPGRADE modifier: also hide same-name enemy after defeat
        // Go DIRECTLY to target selection (no re-prompt)
        const g139mPlayer = pendingEffect.sourcePlayer;
        const g139mEnemySide: 'player1Characters' | 'player2Characters' =
          g139mPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const g139mFriendlySide: 'player1Characters' | 'player2Characters' =
          g139mPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        // Re-count friendly hidden characters
        let g139mHiddenCount = 0;
        for (const mission of newState.activeMissions) {
          for (const char of mission[g139mFriendlySide]) {
            if (char.isHidden) g139mHiddenCount++;
          }
        }

        if (g139mHiddenCount === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139mPlayer,
            'EFFECT_NO_TARGET', 'Gaara (139): No friendly hidden characters (state changed).',
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          break;
        }

        // Re-validate targets: enemy with cost < hiddenCount
        const g139mValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const char of newState.activeMissions[i][g139mEnemySide]) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const effectiveCost = char.isHidden ? 0 : topCard.chakra;
            if (effectiveCost < g139mHiddenCount) {
              g139mValidTargets.push(char.instanceId);
            }
          }
        }

        if (g139mValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139mPlayer,
            'EFFECT_NO_TARGET', `Gaara (139): No enemy with cost less than ${g139mHiddenCount} (state changed).`,
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          break;
        }

        {
          const g139mEffId = generateInstanceId();
          const g139mActId = generateInstanceId();
          newState.pendingEffects.push({
            id: g139mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ useHideSameName: true }),
            targetSelectionType: 'GAARA139_DEFEAT_BY_COST',
            sourcePlayer: g139mPlayer, requiresTargetSelection: true,
            validTargets: g139mValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: g139mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: g139mPlayer,
            description: `Gaara (139) MAIN: Choose an enemy with cost less than ${g139mHiddenCount} to defeat (UPGRADE: will also hide same-name).`,
            descriptionKey: 'game.effect.desc.gaara139DefeatByCost',
            descriptionParams: { count: String(g139mHiddenCount) },
            options: g139mValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: g139mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Itachi 140 (S) CONFIRM MAIN ---
      case 'ITACHI140_CONFIRM_MAIN': {
        const i140Player = pendingEffect.sourcePlayer;
        const i140Opponent: PlayerID = i140Player === 'player1' ? 'player2' : 'player1';
        const i140OpponentState = newState[i140Opponent];
        const i140IsUpgrade = pendingEffect.isUpgrade;
        console.log(`[EffectEngine] ITACHI140_CONFIRM_MAIN: isUpgrade=${i140IsUpgrade} desc=${pendingEffect.effectDescription}`);

        const i140HandSize = i140OpponentState.hand.length;
        if (i140HandSize === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i140Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (140): Opponent hand is empty (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-140-S' });
          break;
        }

        // Auto-apply: discard opponent's entire hand, then draw the same number
        // Assign unique instanceIds to hand cards going to discard (needed for reorder popup)
        const i140DiscardedHand = i140OpponentState.hand.map((c: any) => ({
          ...c,
          instanceId: c.instanceId || generateInstanceId(),
        }));
        const i140OpDeck = [...i140OpponentState.deck];
        const i140DrawCount = Math.min(i140HandSize, i140OpDeck.length);
        const i140DrawnCards = i140OpDeck.splice(0, i140DrawCount);

        newState = {
          ...newState,
          [i140Opponent]: {
            ...i140OpponentState,
            hand: i140DrawnCards,
            deck: i140OpDeck,
            discardPile: [...i140OpponentState.discardPile, ...i140DiscardedHand],
          },
        };

        newState.log = logAction(newState.log, newState.turn, newState.phase, i140Player,
          'EFFECT_DISCARD', `Itachi Uchiwa (140): Opponent discarded ${i140HandSize} cards, then drew ${i140DrawCount} new cards.`,
          'game.log.effect.discardAndDraw', { card: 'ITACHI UCHIWA', id: 'KS-140-S', discarded: String(i140HandSize), drawn: String(i140DrawCount) });

        // Queue discard reorder for opponent (they choose order of their own discarded cards)
        if (i140HandSize >= 2) {
          newState.pendingDiscardReorder = { discardOwner: i140Opponent, chooser: i140Opponent, count: i140HandSize };
        }

        // If upgrade: chain to CONFIRM_UPGRADE popup for defeat
        if (i140IsUpgrade && i140HandSize > 0) {
          const i140EnemySide: 'player1Characters' | 'player2Characters' =
            i140Player === 'player1' ? 'player2Characters' : 'player1Characters';
          const i140DefeatTargets: string[] = [];
          for (let mi = 0; mi < newState.activeMissions.length; mi++) {
            for (const char of newState.activeMissions[mi][i140EnemySide]) {
              const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
              const effectiveCost = char.isHidden ? 0 : topCard.chakra;
              if (effectiveCost <= i140HandSize) {
                i140DefeatTargets.push(char.instanceId);
              }
            }
          }

          if (i140DefeatTargets.length > 0) {
            const i140ConfEffId = generateInstanceId();
            const i140ConfActId = generateInstanceId();
            newState.pendingEffects.push({
              id: i140ConfEffId, sourceCardId: pendingEffect.sourceCardId,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: 'UPGRADE' as const,
              effectDescription: JSON.stringify({ i140HandSize }),
              targetSelectionType: 'ITACHI140_CONFIRM_UPGRADE',
              sourcePlayer: i140Player, requiresTargetSelection: true,
              validTargets: [pendingEffect.sourceInstanceId],
              isOptional: true, isMandatory: false,
              resolved: false, isUpgrade: true,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
            });
            newState.pendingActions.push({
              id: i140ConfActId, type: 'SELECT_TARGET' as PendingAction['type'],
              player: i140Player,
              description: `Itachi Uchiwa (140) UPGRADE: Defeat an enemy with cost ${i140HandSize} or less?`,
              descriptionKey: 'game.effect.desc.itachi140ConfirmUpgrade',
              descriptionParams: { cost: String(i140HandSize) },
              options: [pendingEffect.sourceInstanceId],
              minSelections: 1, maxSelections: 1,
              sourceEffectId: i140ConfEffId,
            });
            pendingEffect.remainingEffectTypes = undefined;
          }
        }
        break;
      }

      // --- Itachi 140 (S) CONFIRM UPGRADE ---
      case 'ITACHI140_CONFIRM_UPGRADE': {
        // Player confirmed UPGRADE: create mandatory defeat target selection
        const i140cPlayer = pendingEffect.sourcePlayer;
        let i140cData: { i140HandSize?: number } = {};
        try { i140cData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i140cHandSize = i140cData.i140HandSize ?? 0;
        const i140cEnemySide: 'player1Characters' | 'player2Characters' =
          i140cPlayer === 'player1' ? 'player2Characters' : 'player1Characters';

        const i140cDefeatTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          for (const char of newState.activeMissions[mi][i140cEnemySide]) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const effectiveCost = char.isHidden ? 0 : topCard.chakra;
            if (effectiveCost <= i140cHandSize) {
              i140cDefeatTargets.push(char.instanceId);
            }
          }
        }

        if (i140cDefeatTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i140cPlayer,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (140) UPGRADE: No valid defeat targets (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-140-S' });
          break;
        }

        {
          const i140cEffId = generateInstanceId();
          const i140cActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i140cEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: 'UPGRADE' as const,
            effectDescription: `Itachi Uchiwa (140) UPGRADE: Defeat an enemy with cost ${i140cHandSize} or less.`,
            targetSelectionType: 'DEFEAT_BY_COST_UPGRADE',
            sourcePlayer: i140cPlayer, requiresTargetSelection: true,
            validTargets: i140cDefeatTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: i140cActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i140cPlayer,
            description: `Itachi Uchiwa (140) UPGRADE: Choose an enemy with cost ${i140cHandSize} or less to defeat.`,
            descriptionKey: 'game.effect.desc.itachi140DefeatByCost',
            descriptionParams: { cost: String(i140cHandSize) },
            options: i140cDefeatTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i140cEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Naruto 141 (M) CONFIRM MAIN ---
      case 'NARUTO141_CONFIRM_MAIN': {
        const n141Player = pendingEffect.sourcePlayer;
        const n141PlayerState = newState[n141Player];

        if (n141PlayerState.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, n141Player,
            'EFFECT_NO_TARGET', 'Naruto Uzumaki (141): No cards in hand (state changed).',
            'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-141-M' });
          break;
        }

        {
          const n141EffId = generateInstanceId();
          const n141ActId = generateInstanceId();
          const n141HandIndices = n141PlayerState.hand.map((_: unknown, idx: number) => String(idx));
          newState.pendingEffects.push({
            id: n141EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'NARUTO141_CHOOSE_DISCARD',
            sourcePlayer: n141Player, requiresTargetSelection: true,
            validTargets: n141HandIndices, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n141ActId, type: 'DISCARD_CARD' as PendingAction['type'],
            player: n141Player,
            description: 'Naruto Uzumaki (141): Choose a card from hand to discard.',
            descriptionKey: 'game.effect.desc.naruto141ChooseDiscard',
            options: n141HandIndices, minSelections: 1, maxSelections: 1,
            sourceEffectId: n141EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Sasuke 142 (M) CONFIRM MAIN ---
      case 'SASUKE142_CONFIRM_MAIN': {
        const s142Player = pendingEffect.sourcePlayer;
        const s142PlayerState = newState[s142Player];

        if (s142PlayerState.hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s142Player,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (142): No cards in hand (state changed).',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-142-M' });
          break;
        }

        {
          const s142EffId = generateInstanceId();
          const s142ActId = generateInstanceId();
          const s142HandIndices = s142PlayerState.hand.map((_: unknown, idx: number) => String(idx));
          newState.pendingEffects.push({
            id: s142EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'SASUKE142_CHOOSE_DISCARD',
            sourcePlayer: s142Player, requiresTargetSelection: true,
            validTargets: s142HandIndices, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: s142ActId, type: 'DISCARD_CARD' as PendingAction['type'],
            player: s142Player,
            description: 'Sasuke Uchiwa (142): Choose a card from hand to discard.',
            descriptionKey: 'game.effect.desc.sasuke142ChooseDiscard',
            options: s142HandIndices, minSelections: 1, maxSelections: 1,
            sourceEffectId: s142EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Itachi 143 (M) CONFIRM MAIN ---
      case 'ITACHI143_CONFIRM_MAIN': {
        const i143Player = pendingEffect.sourcePlayer;
        const i143FriendlySide: 'player1Characters' | 'player2Characters' =
          i143Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let i143Parsed: { sourceMissionIndex?: number } = {};
        try { i143Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i143MI = i143Parsed.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;

        // Re-validate friendly targets in other missions
        const i143ValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === i143MI) continue;
          for (const char of newState.activeMissions[i][i143FriendlySide]) {
            if (char.instanceId !== pendingEffect.sourceInstanceId) {
              i143ValidTargets.push(char.instanceId);
            }
          }
        }

        if (i143ValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i143Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (143): No friendly character to move here (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-143-M' });
          break;
        }

        {
          const i143EffId = generateInstanceId();
          const i143ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i143EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: i143MI, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'ITACHI143_CHOOSE_FRIENDLY',
            sourcePlayer: i143Player, requiresTargetSelection: true,
            validTargets: i143ValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: i143ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i143Player,
            description: 'Itachi Uchiwa (143) MAIN: Choose a friendly character to move to this mission.',
            descriptionKey: 'game.effect.desc.itachi143MoveFriendly',
            options: i143ValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i143EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Itachi 143 (M) CONFIRM AMBUSH ---
      case 'ITACHI143_CONFIRM_AMBUSH': {
        const i143aPlayer = pendingEffect.sourcePlayer;
        const i143aEnemySide: 'player1Characters' | 'player2Characters' =
          i143aPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let i143aParsed: { sourceMissionIndex?: number } = {};
        try { i143aParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i143aMI = i143aParsed.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;

        // Re-validate enemy targets in other missions
        const i143aValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === i143aMI) continue;
          for (const char of newState.activeMissions[i][i143aEnemySide]) {
            i143aValidTargets.push(char.instanceId);
          }
        }

        if (i143aValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i143aPlayer,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (143): No enemy character to move here (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-143-M' });
          break;
        }

        {
          const i143aEffId = generateInstanceId();
          const i143aActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i143aEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: i143aMI, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'ITACHI143_CHOOSE_ENEMY',
            sourcePlayer: i143aPlayer, requiresTargetSelection: true,
            validTargets: i143aValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: i143aActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i143aPlayer,
            description: 'Itachi Uchiwa (143) AMBUSH: Choose an enemy character to move to this mission.',
            descriptionKey: 'game.effect.desc.itachi143MoveEnemy',
            options: i143aValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i143aEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      // --- Kisame 144 (M) CONFIRM MAIN ---
      case 'KISAME144_CONFIRM_MAIN': {
        const k144Player = pendingEffect.sourcePlayer;
        const k144Opponent: PlayerID = k144Player === 'player1' ? 'player2' : 'player1';

        if (newState[k144Opponent].chakra <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k144Player,
            'EFFECT_NO_TARGET', 'Kisame Hoshigaki (144): Opponent has no chakra (state changed).',
            'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-144-M' });
          break;
        }

        // Auto-apply: steal 1 chakra
        newState = {
          ...newState,
          [k144Opponent]: { ...newState[k144Opponent], chakra: newState[k144Opponent].chakra - 1 },
          [k144Player]: { ...newState[k144Player], chakra: newState[k144Player].chakra + 1 },
        };
        newState.log = logAction(newState.log, newState.turn, newState.phase, k144Player,
          'EFFECT_STEAL_CHAKRA', 'Kisame Hoshigaki (144): Stole 1 chakra from opponent.',
          'game.log.effect.stealChakra', { card: 'KISAME HOSHIGAKI', id: 'KS-144-M', amount: 1 });
        break;
      }

      // --- Sasuke 146 (M) CONFIRM MAIN ---
      case 'SASUKE146_CONFIRM_MAIN': {
        const s146Player = pendingEffect.sourcePlayer;

        if (newState.edgeHolder !== s146Player) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s146Player,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (146): No longer holds the Edge (state changed).',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-146-M' });
          break;
        }

        // Directly apply: give Edge to opponent + POWERUP 3 on self (no second popup)
        {
          const s146Opponent: PlayerID = s146Player === 'player1' ? 'player2' : 'player1';
          newState = { ...newState, edgeHolder: s146Opponent };
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, s146Player,
            'EFFECT_EDGE',
            'Sasuke Uchiwa (146): Gave the Edge token to opponent.',
            'game.log.effect.giveEdge',
            { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
          );
          // POWERUP 3 on Sasuke 146
          const s146MI = pendingEffect.sourceMissionIndex;
          const s146Side: 'player1Characters' | 'player2Characters' =
            s146Player === 'player1' ? 'player1Characters' : 'player2Characters';
          const s146Missions = [...newState.activeMissions];
          const s146Mission = { ...s146Missions[s146MI] };
          const s146Chars = [...s146Mission[s146Side]];
          const s146SelfIdx = s146Chars.findIndex((c) => c.instanceId === pendingEffect.sourceInstanceId);
          if (s146SelfIdx !== -1) {
            s146Chars[s146SelfIdx] = { ...s146Chars[s146SelfIdx], powerTokens: s146Chars[s146SelfIdx].powerTokens + 3 };
            s146Mission[s146Side] = s146Chars;
            s146Missions[s146MI] = s146Mission;
            newState = {
              ...newState,
              activeMissions: s146Missions,
              log: logAction(
                newState.log, newState.turn, newState.phase, s146Player,
                'EFFECT_POWERUP',
                'Sasuke Uchiwa (146): POWERUP 3 on self.',
                'game.log.effect.powerupSelf',
                { card: 'SASUKE UCHIWA', id: 'KS-146-M', amount: 3 },
              ),
            };
          }
        }
        break;
      }

      // --- Kakashi 148 (M) CONFIRM MAIN ---
      case 'KAKASHI148_CONFIRM_MAIN': {
        const k148Player = pendingEffect.sourcePlayer;

        // Auto-apply: gain the Edge token
        newState = { ...newState, edgeHolder: k148Player };
        newState.log = logAction(newState.log, newState.turn, newState.phase, k148Player,
          'EFFECT_EDGE', 'Kakashi Hatake (148): Gained the Edge token.',
          'game.log.effect.gainEdge', { card: 'KAKASHI HATAKE', id: 'KS-148-M' });
        break;
      }

      // --- Kakashi 148 (M) CONFIRM AMBUSH ---
      case 'KAKASHI148_CONFIRM_AMBUSH': {
        const k148aPlayer = pendingEffect.sourcePlayer;
        const k148aFriendlySide: 'player1Characters' | 'player2Characters' =
          k148aPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        // Re-validate Team 7 allies with copyable effects
        const k148aValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const char of newState.activeMissions[i][k148aFriendlySide]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            if (!topCard.keywords || !topCard.keywords.includes('Team 7')) continue;
            const charIsUpgraded = char.stack?.length > 1;
            const hasCopyableEffect = topCard.effects.some((effect: { type: string; description: string }) => {
              if (effect.type === 'SCORE') return false;
              if (effect.type === 'UPGRADE' && !charIsUpgraded) return false;
              if (effect.description.includes('[⧗]')) return false;
              if (effect.description.startsWith('effect:') || effect.description.startsWith('effect.')) return false;
              return true;
            });
            if (hasCopyableEffect) {
              k148aValidTargets.push(char.instanceId);
            }
          }
        }

        if (k148aValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k148aPlayer,
            'EFFECT_NO_TARGET', 'Kakashi Hatake (148): No Team 7 character with copyable effect (state changed).',
            'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-148-M' });
          break;
        }

        {
          const k148aEffId = generateInstanceId();
          const k148aActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k148aEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: pendingEffect.effectType,
            effectDescription: pendingEffect.effectDescription,
            targetSelectionType: 'KAKASHI148_COPY_EFFECT',
            sourcePlayer: k148aPlayer, requiresTargetSelection: true,
            validTargets: k148aValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: k148aActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: k148aPlayer,
            description: 'Kakashi Hatake (148) AMBUSH: Choose a Team 7 character to copy an instant effect from.',
            descriptionKey: 'game.effect.desc.kakashi148CopyEffect',
            options: k148aValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k148aEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

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

      case 'JIRAIYA105_CHOOSE_SUMMON': {
        // Clear remainingEffectTypes BEFORE the summon play so they don't propagate
        // to child pending effects (GENERIC_CHOOSE_PLAY_MISSION, etc.)
        const j105Remaining = pendingEffect.remainingEffectTypes;
        pendingEffect.remainingEffectTypes = undefined;

        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 3);

        // Queue Jiraiya 105 UPGRADE as a separate CONFIRM pending effect.
        // This correctly decouples it from the summon play chain.
        if (j105Remaining?.length) {
          for (const remainingType of j105Remaining) {
            if (remainingType === 'UPGRADE') {
              const charResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
              if (charResult) {
                const actualMI = charResult.missionIndex;
                const enemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
                const mission = newState.activeMissions[actualMI];
                if (mission && mission[enemySide].length > 0) {
                  const j105uEffId = generateInstanceId();
                  const j105uActId = generateInstanceId();
                  newState.pendingEffects.push({
                    id: j105uEffId, sourceCardId: pendingEffect.sourceCardId,
                    sourceInstanceId: pendingEffect.sourceInstanceId,
                    sourceMissionIndex: actualMI, effectType: 'UPGRADE' as EffectType,
                    effectDescription: JSON.stringify({ missionIndex: actualMI }),
                    targetSelectionType: 'JIRAIYA105_CONFIRM_UPGRADE',
                    sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
                    validTargets: [pendingEffect.sourceInstanceId],
                    isOptional: true, isMandatory: false,
                    resolved: false, isUpgrade: true,
                  });
                  newState.pendingActions.push({
                    id: j105uActId, type: 'SELECT_TARGET' as PendingAction['type'],
                    player: pendingEffect.sourcePlayer,
                    description: 'Jiraiya (105) UPGRADE: Move an enemy character from this mission to another.',
                    descriptionKey: 'game.effect.desc.jiraiya105ConfirmUpgrade',
                    options: [pendingEffect.sourceInstanceId],
                    minSelections: 1, maxSelections: 1,
                    sourceEffectId: j105uEffId,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case 'JIRAIYA132_CHOOSE_SUMMON': {
        // Same pattern as JIRAIYA105: clear remaining and queue UPGRADE separately
        const j132Remaining = pendingEffect.remainingEffectTypes;
        pendingEffect.remainingEffectTypes = undefined;

        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 5);

        // Queue Jiraiya 132 UPGRADE as a separate CONFIRM pending effect
        if (j132Remaining?.length) {
          for (const remainingType of j132Remaining) {
            if (remainingType === 'UPGRADE') {
              const charResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
              if (charResult) {
                const actualMI = charResult.missionIndex;
                const enemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
                const mission = newState.activeMissions[actualMI];
                if (mission && mission[enemySide].length > 2) {
                  const j132uEffId = generateInstanceId();
                  const j132uActId = generateInstanceId();
                  newState.pendingEffects.push({
                    id: j132uEffId, sourceCardId: pendingEffect.sourceCardId,
                    sourceInstanceId: pendingEffect.sourceInstanceId,
                    sourceMissionIndex: actualMI, effectType: 'UPGRADE' as EffectType,
                    effectDescription: JSON.stringify({ missionIndex: actualMI, sourcePlayer: pendingEffect.sourcePlayer }),
                    targetSelectionType: 'JIRAIYA132_CONFIRM_UPGRADE',
                    sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
                    validTargets: [pendingEffect.sourceInstanceId],
                    isOptional: true, isMandatory: false,
                    resolved: false, isUpgrade: true,
                  });
                  newState.pendingActions.push({
                    id: j132uActId, type: 'SELECT_TARGET' as PendingAction['type'],
                    player: pendingEffect.sourcePlayer,
                    description: 'Jiraya (132) UPGRADE: Opponent must defeat characters until 2 remain in this mission.',
                    descriptionKey: 'game.effect.desc.jiraiya132ConfirmUpgrade',
                    options: [pendingEffect.sourceInstanceId],
                    minSelections: 1, maxSelections: 1,
                    sourceEffectId: j132uEffId,
                  });
                }
              }
            }
          }
        }
        break;
      }

      // =============================================
      // SPECIAL types
      // =============================================
      case 'TAYUYA125_CHOOSE_SOUND':
        if (targetId.startsWith('board:')) {
          // Reveal a hidden board character paying cost - 2
          newState = EffectEngine.revealHiddenWithReduction(newState, pendingEffect, targetId.slice(6), 2);
        } else {
          newState = EffectEngine.playCharFromHandWithReduction(newState, pendingEffect, targetId, 2, 'Sound Village', 'Tayuya', 'KS-125-R');
        }
        break;

      case 'ICHIBI130_CHOOSE_MISSION': {
        // Ichibi 130 UPGRADE: defeat all hidden enemies in the selected mission
        const missionIdx_i = parseInt(targetId, 10);
        if (!isNaN(missionIdx_i) && missionIdx_i >= 0 && missionIdx_i < newState.activeMissions.length) {
          const enemySide_i: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const mission_i = newState.activeMissions[missionIdx_i];
          const hiddenEnemies = mission_i[enemySide_i].filter((c: CharacterInPlay) => c.isHidden);
          // Sort targets so Gemma 049 is processed last (AoE ordering fix)
          const sortedHiddenEnemies = sortTargetsGemmaLast(hiddenEnemies);
          let defeatedCount = 0;
          for (const hidden of sortedHiddenEnemies) {
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
          if (defeatedCount >= 2) {
            const i130Defender: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
            newState.pendingDiscardReorder = { discardOwner: i130Defender, chooser: pendingEffect.sourcePlayer, count: defeatedCount };
          }
        }
        break;
      }

      case 'KAKASHI148_COPY_EFFECT': {
        // Kakashi 148 AMBUSH: copy a Team 7 character's instant effect (MAIN, AMBUSH, or UPGRADE)
        const k148Target = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!k148Target) break;

        const k148TopCard = k148Target.character.stack?.length > 0
          ? k148Target.character.stack[k148Target.character.stack?.length - 1]
          : k148Target.character.card;

        // Kakashi 148 AMBUSH (always revealed): can copy MAIN, AMBUSH, UPGRADE (not SCORE, not continuous)
        // UPGRADE only copyable if the target was actually played as an upgrade (stack > 1)
        const k148TargetIsUpgraded = k148Target.character.stack?.length > 1;
        const k148Copyable = (k148TopCard.effects ?? []).filter((eff) => {
          if (eff.type === 'SCORE') return false;
          if (eff.description.includes('[⧗]')) return false;
          if (eff.description.startsWith('effect:') || eff.description.startsWith('effect.')) return false;
          if (eff.type === 'UPGRADE' && !k148TargetIsUpgraded) return false;
          return eff.type === 'MAIN' || eff.type === 'AMBUSH' || eff.type === 'UPGRADE';
        });

        if (k148Copyable.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT', `Kakashi Hatake (148): ${k148TopCard.name_fr} has no copyable instant effect.`,
            'game.log.effect.copyFailed', { card: 'KAKASHI HATAKE', id: 'KS-148-M' });
          break;
        }

        if (k148Copyable.length === 1) {
          // Single copyable effect â€' execute directly
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, k148TopCard, k148Copyable[0].type as EffectType,
          );
        } else {
          // Multiple copyable effects â€' Stage 2: let the player choose which effect
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
              controllerInstanceId: pendingEffect.sourceInstanceId,
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

      // =============================================
      // REORDER_DISCARD: owner reorders top N cards of their discard pile
      // =============================================
      case 'REORDER_DISCARD': {
        // targetId is the instanceId of the card the owner selected as FIRST (bottom)
        // The TargetOrderPopup sends the ordered list as a JSON array in targetId
        let reorderList: string[] = [];
        try { reorderList = JSON.parse(targetId); } catch {
          // Single card fallback — shouldn't happen since we only trigger for 2+
          reorderList = [targetId];
        }
        let parsedReorder: { count?: number; discardOwner?: string; sakura135Chain?: boolean; costReduction?: number } = {};
        try { parsedReorder = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const reorderCount = parsedReorder.count ?? reorderList.length;
        // discardOwner = the player whose discard pile is being reordered (the defender)
        // sourcePlayer = the attacker who is choosing the order
        const reorderTarget = (parsedReorder.discardOwner as PlayerID) ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1');
        const ownerPS = { ...newState[reorderTarget] };
        const discard = [...ownerPS.discardPile];

        if (discard.length >= reorderCount && reorderList.length === reorderCount) {
          // Remove the last N cards
          const removedCards = discard.splice(-reorderCount, reorderCount);
          // Reorder based on the player's chosen order (first in list = bottom, last = top)
          // Use index tracking to handle duplicate cards correctly
          // Strip __dupN suffix if present (added by createReorderDiscardPending for dedup)
          const usedIndices = new Set<number>();
          const reorderedCards = reorderList.map(id => {
            const cleanId = id.replace(/__dup\d+$/, '');
            const idx = removedCards.findIndex((c: any, i: number) => {
              if (usedIndices.has(i)) return false;
              return (c.instanceId || c.id) === cleanId;
            });
            if (idx >= 0) {
              usedIndices.add(idx);
              return removedCards[idx];
            }
            return undefined;
          }).filter((c): c is NonNullable<typeof c> => c !== undefined);
          // Put them back in the chosen order
          discard.push(...reorderedCards);
          ownerPS.discardPile = discard;
          newState[reorderTarget] = ownerPS;

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            `Reordered ${reorderCount} cards in discard pile.`,
            'game.log.effect.reorderDiscard',
            { count: String(reorderCount) },
          );
        }

        // Chain: Sakura 135 placement after reorder
        if (parsedReorder.sakura135Chain) {
          const s135Player = reorderTarget;
          const s135Ps = newState[s135Player];
          // The chosen card is stored BEFORE the reordered cards in the discard pile
          const s135ChosenIdx = s135Ps.discardPile.length - 1 - reorderCount;
          const s135ChosenCard = s135ChosenIdx >= 0 ? s135Ps.discardPile[s135ChosenIdx] : null;
          if (s135ChosenCard) {
            const s135CostReduction = (parsedReorder as any).costReduction ?? 0;
            const fakePending = {
              ...pendingEffect,
              sourceCardId: 'KS-135-S',
              sourcePlayer: s135Player,
            };
            newState = EffectEngine.sakura135ContinuePlacement(newState, s135Player, s135ChosenCard, s135CostReduction, fakePending as any);
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

      // --- Effect-play upgrade choice: player chose "FRESH" or an upgrade target instanceId ---
      // Hidden reveal with upgrade-or-fresh choice (flexible upgrade cards like Ukon, Ichibi)
      case 'REVEAL_HIDDEN_UPGRADE_OR_FRESH': {
        let rhMeta: { hiddenInstanceId?: string; costReduction?: number; powerUpBonus?: number } = {};
        try { rhMeta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const rhInstanceId = rhMeta.hiddenInstanceId ?? '';
        const rhReduction = rhMeta.costReduction ?? 0;
        const rhPowerUp = rhMeta.powerUpBonus ?? 0;

        if (targetId === 'FRESH') {
          // Reveal as fresh play (no upgrade) — call revealHiddenWithReduction with no upgrade logic
          // Temporarily remove all potential upgrade targets from the mission so findUpgradeTargetIdx returns -1
          const rhChar = EffectEngine.findCharByInstanceId(newState, rhInstanceId);
          if (rhChar) {
            // Just reveal normally — revealHiddenWithReduction will handle it
            // But it might auto-upgrade. We need to force no-upgrade.
            // Simplest: reveal the hidden char, pay fresh cost, trigger effects
            const rhPlayer = pendingEffect.sourcePlayer;
            const rhPs = newState[rhPlayer];
            const rhTopCard = rhChar.character.stack?.length > 0 ? rhChar.character.stack[rhChar.character.stack.length - 1] : rhChar.character.card;
            const rhFreshCost = Math.max(0, (rhTopCard.chakra ?? 0) - rhReduction);
            if (rhPs.chakra >= rhFreshCost) {
              rhPs.chakra -= rhFreshCost;
              rhChar.character.isHidden = false;
              rhChar.character.wasRevealedAtLeastOnce = true;
              if (rhPowerUp > 0) rhChar.character.powerTokens += rhPowerUp;
              // Update in state
              const rhMission = newState.activeMissions[rhChar.missionIndex];
              const rhSide = rhPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
              const rhIdx = rhMission[rhSide].findIndex((c: CharacterInPlay) => c.instanceId === rhInstanceId);
              if (rhIdx >= 0) rhMission[rhSide][rhIdx] = { ...rhChar.character };
              rhPs.charactersInPlay = EffectEngine.countCharsForPlayer(newState, rhPlayer);
              newState = EffectEngine.resolvePlayEffects(newState, rhPlayer, rhChar.character, rhChar.missionIndex, false);
            }
          }
        } else {
          // Player chose to upgrade over a specific target
          const rhChar = EffectEngine.findCharByInstanceId(newState, rhInstanceId);
          const rhUpgradeTarget = EffectEngine.findCharByInstanceId(newState, targetId);
          if (rhChar && rhUpgradeTarget && rhChar.missionIndex === rhUpgradeTarget.missionIndex) {
            const rhPlayer = pendingEffect.sourcePlayer;
            const rhPs = newState[rhPlayer];
            const rhTopCard = rhChar.character.stack?.length > 0 ? rhChar.character.stack[rhChar.character.stack.length - 1] : rhChar.character.card;
            const rhUpgTop = rhUpgradeTarget.character.stack?.length > 0 ? rhUpgradeTarget.character.stack[rhUpgradeTarget.character.stack.length - 1] : rhUpgradeTarget.character.card;
            const rhUpgCost = Math.max(0, ((rhTopCard.chakra ?? 0) - (rhUpgTop.chakra ?? 0)) - rhReduction);
            if (rhPs.chakra >= rhUpgCost) {
              rhPs.chakra -= rhUpgCost;
              // Reveal + stack onto upgrade target
              rhChar.character.isHidden = false;
              rhChar.character.wasRevealedAtLeastOnce = true;
              if (rhPowerUp > 0) rhChar.character.powerTokens += rhPowerUp;
              const rhMIdx = rhChar.missionIndex;
              const rhSide = rhPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
              const rhMission = newState.activeMissions[rhMIdx];
              const rhChars = [...rhMission[rhSide]];
              const revIdx = rhChars.findIndex((c: CharacterInPlay) => c.instanceId === rhInstanceId);
              const upgIdx = rhChars.findIndex((c: CharacterInPlay) => c.instanceId === targetId);
              if (revIdx >= 0 && upgIdx >= 0) {
                const revealedChar = rhChars.splice(revIdx, 1)[0];
                const actualUpgIdx = rhChars.findIndex((c: CharacterInPlay) => c.instanceId === targetId);
                if (actualUpgIdx >= 0) {
                  rhChars[actualUpgIdx] = {
                    ...rhChars[actualUpgIdx],
                    card: revealedChar.card,
                    stack: [...rhChars[actualUpgIdx].stack, ...revealedChar.stack],
                    powerTokens: rhChars[actualUpgIdx].powerTokens + revealedChar.powerTokens,
                  };
                  rhMission[rhSide] = rhChars;
                  rhPs.charactersInPlay = EffectEngine.countCharsForPlayer(newState, rhPlayer);
                  newState = EffectEngine.resolvePlayEffects(newState, rhPlayer, rhChars[actualUpgIdx], rhMIdx, true);
                }
              }
            }
          }
        }
        break;
      }

      case 'EFFECT_PLAY_UPGRADE_OR_FRESH': {
        let meta_upch: { cardName?: string; cardId?: string; costReduction?: number; missionIndex?: number } = {};
        try { meta_upch = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const mi_upch = meta_upch.missionIndex ?? pendingEffect.sourceMissionIndex;
        if (targetId === 'FRESH') {
          // Player chose fresh play: call genericPlaceOnMission which will now not find an upgrade
          // (because the card is back in discard and we pass forceNoUpgrade via a flag)
          newState = EffectEngine.genericPlaceOnMissionForced(
            newState, pendingEffect.sourcePlayer, mi_upch,
            meta_upch.cardName ?? '', meta_upch.cardId ?? '', meta_upch.costReduction ?? 0, false,
          );
        } else {
          // Player chose to upgrade over a specific target
          newState = EffectEngine.genericPlaceOnMissionForced(
            newState, pendingEffect.sourcePlayer, mi_upch,
            meta_upch.cardName ?? '', meta_upch.cardId ?? '', meta_upch.costReduction ?? 0, true, targetId,
          );
        }
        break;
      }

      // --- Hiruzen 002: Player chose fresh play or upgrade target for the Leaf char ---
      case 'HIRUZEN002_UPGRADE_OR_FRESH': {
        let meta_h002: { cardIndex?: number; missionIndex?: number } = {};
        try { meta_h002 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const mi_h002 = meta_h002.missionIndex ?? pendingEffect.sourceMissionIndex;
        const ci_h002 = meta_h002.cardIndex ?? 0;
        const player_h002 = pendingEffect.sourcePlayer;
        const ps_h002 = newState[player_h002];
        if (ci_h002 < 0 || ci_h002 >= ps_h002.hand.length) break;
        const card_h002 = ps_h002.hand[ci_h002];

        const fSide_h002: 'player1Characters' | 'player2Characters' =
          player_h002 === 'player1' ? 'player1Characters' : 'player2Characters';
        const missions_h002 = [...newState.activeMissions];
        const mission_h002 = { ...missions_h002[mi_h002] };

        if (targetId === 'FRESH') {
          // Fresh play
          const freshCost_h002 = Math.max(0, card_h002.chakra - 1);
          if (ps_h002.chakra < freshCost_h002) break;
          ps_h002.chakra -= freshCost_h002;
          ps_h002.hand.splice(ci_h002, 1);

          const charInPlay_h002: CharacterInPlay = {
            instanceId: generateInstanceId(), card: card_h002, isHidden: false,
            wasRevealedAtLeastOnce: true, powerTokens: 0,
            stack: [card_h002], controlledBy: player_h002, originalOwner: player_h002, missionIndex: mi_h002,
          };
          mission_h002[fSide_h002] = [...mission_h002[fSide_h002], charInPlay_h002];
          missions_h002[mi_h002] = mission_h002;
          newState.activeMissions = missions_h002;
          ps_h002.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player_h002);

          newState.log = logAction(newState.log, newState.turn, 'action', player_h002,
            'EFFECT', `Hiruzen Sarutobi (002): Plays ${card_h002.name_fr} on mission ${mi_h002 + 1} (1 less).`,
            'game.log.effect.playLeafReduced',
            { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card_h002.name_fr, mission: String(mi_h002 + 1), cost: String(freshCost_h002) });

          // Track placed character for Hiruzen 002 UPGRADE (POWERUP 2)
          (newState as any)._hiruzen002PlayedCharId = charInPlay_h002.instanceId;

          newState = EffectEngine.resolvePlayEffects(newState, player_h002, charInPlay_h002, mi_h002, false);
        } else {
          // Upgrade over the chosen target
          const existIdx_h002 = mission_h002[fSide_h002].findIndex(c => c.instanceId === targetId);
          if (existIdx_h002 === -1) break;
          const existing_h002 = mission_h002[fSide_h002][existIdx_h002];
          const existStack_h002 = existing_h002.stack ?? [existing_h002.card];
          const eTop_h002 = existStack_h002.length > 0 ? existStack_h002[existStack_h002.length - 1] : existing_h002.card;
          const upgCost_h002 = Math.max(0, (card_h002.chakra - (eTop_h002?.chakra ?? 0)) - 1);
          if (ps_h002.chakra < upgCost_h002) break;
          ps_h002.chakra -= upgCost_h002;
          ps_h002.hand.splice(ci_h002, 1);

          const updatedChars_h002 = [...mission_h002[fSide_h002]];
          updatedChars_h002[existIdx_h002] = {
            ...existing_h002, card: card_h002, stack: [...existStack_h002, card_h002],
            powerTokens: existing_h002.powerTokens,
          };
          mission_h002[fSide_h002] = updatedChars_h002;
          missions_h002[mi_h002] = mission_h002;
          newState.activeMissions = missions_h002;

          newState.log = logAction(newState.log, newState.turn, 'action', player_h002,
            'EFFECT_UPGRADE', `Hiruzen Sarutobi (002): Upgraded ${card_h002.name_fr} on mission ${mi_h002 + 1}.`,
            'game.log.effect.upgradeLeafReduced',
            { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card_h002.name_fr, mission: String(mi_h002 + 1), cost: String(upgCost_h002) });

          // Track placed character for Hiruzen 002 UPGRADE (POWERUP 2)
          (newState as any)._hiruzen002PlayedCharId = updatedChars_h002[existIdx_h002].instanceId;

          newState = EffectEngine.resolvePlayEffects(newState, player_h002, updatedChars_h002[existIdx_h002], mi_h002, true);
        }
        break;
      }

      // =============================================
      // SIMPLE DEFEAT types (target = instanceId â†' defeat the character)
      // =============================================
      case 'DEFEAT_ANY_CHARACTER_THIS_MISSION':
      case 'DEFEAT_ENEMY_POWER_1_THIS_MISSION':
      case 'DEFEAT_ENEMY_SUMMON_THIS_MISSION':
      case 'DEFEAT_HIDDEN_CHARACTER_ANY':
      case 'TENTEN_DEFEAT_HIDDEN':
      case 'KIDOMARU060_DEFEAT_LOW_POWER':
      case 'ANKO_DEFEAT_HIDDEN_ENEMY':
      case 'OROCHIMARU051_DEFEAT_HIDDEN':
      case 'BAKI082_DEFEAT_LOW_POWER':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      // --- Yashamaru 085: Player confirmed optional self-defeat SCORE ---
      case 'YASHAMARU085_CONFIRM_SELF_DEFEAT': {
        // Step 1: Defeat self
        const yashMIdx = pendingEffect.sourceMissionIndex;
        const yashSourceId = pendingEffect.sourceInstanceId;
        const yashPlayer = pendingEffect.sourcePlayer;
        newState = defeatFriendlyCharacter(newState, yashMIdx, yashSourceId, yashPlayer);

        // Check if self was actually removed
        const yashMission = newState.activeMissions[yashMIdx];
        const yashFriendly = yashPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const yashSelfExists = yashMission[yashFriendly].some((c: CharacterInPlay) => c.instanceId === yashSourceId);

        if (yashSelfExists) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, yashPlayer,
            'SCORE_DEFEAT_FAILED',
            'Yashamaru (085): [SCORE] Self-defeat was prevented. Cannot defeat another character.',
            'game.log.score.defeatFailed',
            { card: 'YASHAMARU', id: 'KS-085-UC' },
          );
          break;
        }

        newState.log = logAction(
          newState.log, newState.turn, newState.phase, yashPlayer,
          'SCORE_SELF_DEFEAT',
          'Yashamaru (085): [SCORE] Defeated self.',
          'game.log.score.selfDefeat',
          { card: 'YASHAMARU', id: 'KS-085-UC' },
        );

        // Step 2: Find another character in this mission to defeat
        const yashUpdatedMission = newState.activeMissions[yashMIdx];
        const yashAllChars = [
          ...yashUpdatedMission.player1Characters,
          ...yashUpdatedMission.player2Characters,
        ];

        if (yashAllChars.length === 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, yashPlayer,
            'SCORE_NO_TARGET',
            'Yashamaru (085): [SCORE] No other characters in this mission to defeat.',
            'game.log.effect.noTarget',
            { card: 'YASHAMARU', id: 'KS-085-UC' },
          );
          break;
        }

        if (yashAllChars.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, yashAllChars[0].instanceId, yashPlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, yashPlayer,
            'SCORE_DEFEAT',
            `Yashamaru (085): [SCORE] Also defeated ${yashAllChars[0].card.name_fr} in this mission.`,
            'game.log.score.defeat',
            { card: 'YASHAMARU', id: 'KS-085-UC', target: yashAllChars[0].card.name_fr },
          );
          break;
        }

        // Multiple targets - queue another pending effect for selection
        const yashTargets = yashAllChars.map((c: CharacterInPlay) => c.instanceId);
        const yashEffId = generateInstanceId();
        const yashActId = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: yashEffId,
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourcePlayer: yashPlayer,
          sourceMissionIndex: yashMIdx,
          effectType: 'SCORE' as EffectType,
          effectDescription: 'Yashamaru (085) SCORE: Select another character in this mission to defeat.',
          targetSelectionType: 'DEFEAT_ANY_CHARACTER_THIS_MISSION',
          requiresTargetSelection: true,
          validTargets: yashTargets,
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: yashActId,
          type: 'SELECT_TARGET' as PendingAction['type'],
          player: yashPlayer,
          description: 'Yashamaru (085) SCORE: Select another character in this mission to defeat.',
          descriptionKey: 'game.effect.desc.yashamaru085ScoreDefeatAnother',
          options: yashTargets,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: yashEffId,
        }];
        break;
      }

      // --- Orochimaru 051: Choose destination mission after losing ---
      case 'OROCHIMARU051_CHOOSE_DESTINATION': {
        const destMIdx_o51 = parseInt(targetId, 10);
        if (!isNaN(destMIdx_o51) && destMIdx_o51 >= 0 && destMIdx_o51 < newState.activeMissions.length) {
          const srcMIdx_o51 = pendingEffect.sourceMissionIndex;
          const charResult_o51 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          if (charResult_o51) {
            const side_o51 = charResult_o51.player === 'player1' ? 'player1Characters' : 'player2Characters';
            // Move the character to the destination mission
            const missions_o51 = [...newState.activeMissions];
            const srcM_o51 = { ...missions_o51[srcMIdx_o51] };
            const destM_o51 = { ...missions_o51[destMIdx_o51] };
            const char_o51 = srcM_o51[side_o51].find(c => c.instanceId === pendingEffect.sourceInstanceId);
            if (char_o51) {
              srcM_o51[side_o51] = srcM_o51[side_o51].filter(c => c.instanceId !== pendingEffect.sourceInstanceId);
              const movedChar_o51 = { ...char_o51, missionIndex: destMIdx_o51 };
              destM_o51[side_o51] = [...destM_o51[side_o51], movedChar_o51];
              missions_o51[srcMIdx_o51] = srcM_o51;
              missions_o51[destMIdx_o51] = destM_o51;
              newState = { ...newState, activeMissions: missions_o51 };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
                'EFFECT_MOVE',
                `Orochimaru (051): Lost mission ${srcMIdx_o51 + 1}, moves to mission ${destMIdx_o51 + 1}.`,
                'game.log.effect.orochimaru051Move',
                { card: 'OROCHIMARU', id: 'KS-051-UC' },
              );
            }
          }
        }
        break;
      }

      // --- Gemma 049: Sacrifice choice (defeat protection) ---
      case 'GEMMA049_SACRIFICE_CHOICE': {
        // Player accepted â€' sacrifice Gemma to protect the original target from defeat
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
        // Player accepted - sacrifice Gemma to protect the original target from being hidden
        let g049HideData: { targetInstanceId?: string; sacrificeInstanceId?: string; effectSource?: string; batchRemainingTargets?: string[]; batchSourcePlayer?: string } = {};
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
        // Resume batch hide if there are remaining targets
        if (g049HideData.batchRemainingTargets && g049HideData.batchRemainingTargets.length > 0) {
          const batchPlayer = (g049HideData.batchSourcePlayer ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as PlayerID;
          newState = EffectEngine.resumeBatchHideAfterGemma(newState, g049HideData.batchRemainingTargets, batchPlayer);
        }
        break;
      }

      // --- Gemma 049: Choose which LV char to protect (batch hide with multiple LV targets) ---
      case 'GEMMA049_CHOOSE_PROTECT_HIDE': {
        let g049ChooseData: {
          sacrificeInstanceId?: string; effectSource?: string;
          batchAllTargets?: string[]; batchLVTargets?: string[];
          batchSourcePlayer?: string;
        } = {};
        try { g049ChooseData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const batchAll = g049ChooseData.batchAllTargets ?? [];
        const batchSourceP = (g049ChooseData.batchSourcePlayer ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as PlayerID;
        const protectedCharId = targetId; // The char the player chose to protect

        // Sacrifice Gemma
        const gemmaChooseId = g049ChooseData.sacrificeInstanceId;
        if (gemmaChooseId) {
          const gemmaRes = EffectEngine.findCharByInstanceId(newState, gemmaChooseId);
          newState = EffectEngine.defeatCharacterDirect(newState, gemmaChooseId);
          if (gemmaRes) {
            newState = triggerOnDefeatEffects(newState, gemmaRes.character, gemmaRes.player);
          }
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_SACRIFICE',
            'Gemma Shiranui (049): Sacrificed to protect an ally from being hidden.',
            'game.log.effect.gemma049SacrificeHide',
            { card: 'GEMMA SHIRANUI', id: 'KS-049-C' },
          );
        }

        // Process all batch targets, skipping the protected character
        let batchHiddenCount = 0;
        for (const batchTargetId of batchAll) {
          if (batchTargetId === protectedCharId) continue; // Skip the protected char
          const pendingCountBefore = newState.pendingEffects.length;
          newState = EffectEngine.hideCharacterWithLog(newState, batchTargetId, batchSourceP);
          // If another Gemma pending was created (shouldn't happen since Gemma is gone)
          const newGemmaPending = newState.pendingEffects.find(
            (pe) => pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' && !pe.resolved
              && newState.pendingEffects.length > pendingCountBefore,
          );
          if (newGemmaPending) {
            const restIds = batchAll.slice(batchAll.indexOf(batchTargetId) + 1).filter(id => id !== protectedCharId);
            const desc = JSON.parse(newGemmaPending.effectDescription);
            desc.batchRemainingTargets = restIds;
            desc.batchSourcePlayer = batchSourceP;
            desc.batchHiddenCount = batchHiddenCount;
            newGemmaPending.effectDescription = JSON.stringify(desc);
            break;
          }
          const charAfter = EffectEngine.findCharByInstanceId(newState, batchTargetId);
          if (charAfter && charAfter.character.isHidden) batchHiddenCount++;
        }
        if (batchHiddenCount > 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, batchSourceP,
            'EFFECT_HIDE',
            `Kabuto Yakushi (054): Hid ${batchHiddenCount} character(s) in this mission.`,
            'game.log.effect.hide',
            { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', count: String(batchHiddenCount) },
          );
        }
        break;
      }

      // =============================================
      // SIMPLE POWERUP types (target = instanceId â†' add power tokens)
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
      // SIMPLE DISCARD types (target = hand index â†' discard from hand)
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
              // Multiple cards â€' source player chooses
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
                isMandatory: true,
                description: JSON.stringify({
                  text: 'Sasuke (014) UPGRADE: Choose a card from opponent\'s hand to discard.',
                  cards: oppCards_ss,
                }),
                descriptionKey: 'game.effect.desc.sasuke014DiscardOpponent',
              };
              // Clean up old pending effect/action before chaining
              newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
              newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
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
        // Stage 1: discard from hand, then stage 2: hide a character with cost â‰¤ 4
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

          // Stage 2: find valid characters to hide (cost â‰¤ 4, not already hidden)
          // Kimimaro CAN hide itself. Filter out enemy chars immune to hide.
          const validHideTargets_km: string[] = [];
          for (const mission_km of newState.activeMissions) {
            for (const side_km of ['player1Characters', 'player2Characters'] as const) {
              const sideOwner_km = side_km === 'player1Characters' ? 'player1' as const : 'player2' as const;
              const isEnemy_km = sideOwner_km !== pendingEffect.sourcePlayer;
              for (const char_km of mission_km[side_km]) {
                if (char_km.isHidden) continue;
                if (isEnemy_km && !canBeHiddenByEnemy(newState, char_km, sideOwner_km)) continue;
                const topCard_km = char_km.stack?.length > 0 ? char_km.stack[char_km.stack?.length - 1] : char_km.card;
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
              isOptional: false,
              isMandatory: true,
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
        // Stage 2: hide the selected character (cost ≤ 4)
        // skipProtection=true because Kimimaro protection was already checked in the main switch
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
        // Now find non-hidden enemies IN PLAY (all missions) with effective power <= 4
        const enemyPlayer_k73d: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const enemySide_k73d: 'player1Characters' | 'player2Characters' =
          enemyPlayer_k73d === 'player1' ? 'player1Characters' : 'player2Characters';
        const k73HideTargets: string[] = [];
        for (const k73m of newState.activeMissions) {
          for (const enemy of k73m[enemySide_k73d]) {
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
          // Multiple targets â€' let player choose
          const charResult_k73d = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          const step2Result_k73d: EffectResult = {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'KIN073_CHOOSE_ENEMY',
            validTargets: k73HideTargets,
            isOptional: true,
            description: 'Kin Tsuchi (073): Choose an enemy character with Power 4 or less to hide.',
            descriptionKey: 'game.effect.desc.kin073ChooseEnemy',
          };
          // Clean up old pending effect/action before chaining
          newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pendingEffect.id);
          newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);
          return EffectEngine.createPendingTargetSelection(
            newState,
            pendingEffect.sourcePlayer,
            charResult_k73d?.character ?? null,
            pendingEffect.sourceMissionIndex,
            'MAIN',
            pendingEffect.isUpgrade,
            step2Result_k73d,
            pendingEffect.remainingEffectTypes ?? [],
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
      // MOVE SELF types (target = mission index â†' move self there)
      // =============================================
      case 'CHOJI_018_MOVE_SELF': {
        // Move Choji, then trigger post-move hide
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        const destMIdx018 = parseInt(targetId, 10);
        if (!isNaN(destMIdx018)) {
          const { postMoveHide } = require('./handlers/KS/uncommon/choji018');
          const hideResult = postMoveHide(newState, pendingEffect.sourceInstanceId, destMIdx018, pendingEffect.sourcePlayer);
          if (hideResult.requiresTargetSelection && hideResult.validTargets && hideResult.validTargets.length > 0) {
            // Clean up old pending effect/action before chaining
            hideResult.state = { ...hideResult.state };
            hideResult.state.pendingEffects = hideResult.state.pendingEffects.filter((e: { id: string }) => e.id !== pendingEffect.id);
            hideResult.state.pendingActions = hideResult.state.pendingActions.filter((a: { sourceEffectId: string }) => a.sourceEffectId !== pendingEffect.id);
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
          if (validDests_mv.length === 1) {
            // Auto-move to only valid destination
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDests_mv[0], 10),
              moveChar.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
              pendingEffect.sourcePlayer,
            );
          } else if (validDests_mv.length > 1) {
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
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: false,
              remainingEffectTypes: pendingEffect.remainingEffectTypes,
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
            pendingEffect.remainingEffectTypes = undefined;
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
                pendingEffect.sourcePlayer, // effectInitiator: the player who owns the move effect
              );
            }
          }
        }
        break;
      }

      // =============================================
      // KANKURO078_REVEAL_HIDDEN_REDUCED (Kankuro 078 UPGRADE â€' correct implementation)
      // Reveal a hidden friendly character paying 1 less than its reveal cost.
      // =============================================
      case 'KANKURO078_REVEAL_HIDDEN_REDUCED': {
        const charResult_k78 = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!charResult_k78) break;

        const { missionIndex: mIdx_k78, player: charPlayer_k78, character: hiddenChar_k78 } = charResult_k78;
        const side_k78 = charPlayer_k78 === 'player1' ? 'player1Characters' : 'player2Characters';
        if (!hiddenChar_k78.isHidden) break; // sanity check

        const topCard_k78 = hiddenChar_k78.stack?.length > 0
          ? hiddenChar_k78.stack[hiddenChar_k78.stack?.length - 1]
          : hiddenChar_k78.card;

        // Check if revealing this card would be an upgrade (same-name or flexible cross-name)
        const friendlySide_k78 = pendingEffect.sourcePlayer === "player1" ? "player1Characters" : "player2Characters";
        const m_k78_check = newState.activeMissions[mIdx_k78];
        const upgradeTargetIdx_k78 = findUpgradeTargetIdx(m_k78_check[friendlySide_k78], topCard_k78, targetId);
        const upgradeTarget_k78 = upgradeTargetIdx_k78 >= 0 ? m_k78_check[friendlySide_k78][upgradeTargetIdx_k78] : null;

        // If there's a flex upgrade target, check if fresh reveal is also possible and offer choice
        if (upgradeTarget_k78) {
          const existingTC_k78 = upgradeTarget_k78.stack?.length > 0 ? upgradeTarget_k78.stack[upgradeTarget_k78.stack?.length - 1] : upgradeTarget_k78.card;
          const isFlexUpgrade_k78 = checkFlexibleUpgrade(topCard_k78 as any, existingTC_k78);
          const hasNameConflict_k78 = m_k78_check[friendlySide_k78].some((c: CharacterInPlay) => {
            if (c.instanceId === targetId || c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return cTop.name_fr.toUpperCase() === topCard_k78.name_fr.toUpperCase();
          });
          const canFreshReveal_k78 = !hasNameConflict_k78;

          // Find ALL affordable upgrade targets (same-name + flex)
          const upgradeTargetIds_k78: string[] = [];
          for (const c of m_k78_check[friendlySide_k78]) {
            if (c.isHidden || c.instanceId === targetId) continue;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            const isSameName = cTop.name_fr.toUpperCase() === topCard_k78.name_fr.toUpperCase() && (topCard_k78.chakra ?? 0) > (cTop.chakra ?? 0);
            const isFlex = checkFlexibleUpgrade(topCard_k78 as any, cTop) && (topCard_k78.chakra ?? 0) > (cTop.chakra ?? 0);
            if (isSameName || isFlex) {
              const upgCost = Math.max(0, ((topCard_k78.chakra ?? 0) - (cTop.chakra ?? 0)) - 1);
              if (newState[pendingEffect.sourcePlayer].chakra >= upgCost) upgradeTargetIds_k78.push(c.instanceId);
            }
          }

          if (isFlexUpgrade_k78 && canFreshReveal_k78 && upgradeTargetIds_k78.length > 0) {
            // Offer choice: fresh reveal vs upgrade
            const effectId_k78r = `kankuro078-reveal-choice-${generateInstanceId()}`;
            const validTargets_k78r = ['FRESH', ...upgradeTargetIds_k78];
            newState.pendingEffects = [...newState.pendingEffects, {
              id: effectId_k78r,
              sourceCardId: 'KS-078-UC',
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: mIdx_k78,
              effectType: 'UPGRADE' as EffectType,
              effectDescription: JSON.stringify({ hiddenInstanceId: targetId, missionIndex: mIdx_k78 }),
              targetSelectionType: 'KANKURO078_REVEAL_UPGRADE_OR_FRESH',
              sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true,
              validTargets: validTargets_k78r,
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: true,
              description: `Choose: reveal ${topCard_k78.name_fr} as a new character, or upgrade over an existing one?`,
              descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
              descriptionParams: { card: topCard_k78.name_fr },
            } as PendingEffect];
            newState.pendingActions = [...newState.pendingActions, {
              id: generateInstanceId(),
              type: 'SELECT_TARGET',
              player: pendingEffect.sourcePlayer,
              description: `Choose: reveal ${topCard_k78.name_fr} as a new character, or upgrade over an existing one?`,
              descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
              descriptionParams: { card: topCard_k78.name_fr },
              options: validTargets_k78r,
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_k78r,
            }];
            break;
          }
        }

        // No choice needed — proceed with auto-reveal (possibly auto-upgrade)
        let revealCost_k78: number;
        if (upgradeTarget_k78) {
          const existingTC = upgradeTarget_k78.stack?.length > 0 ? upgradeTarget_k78.stack[upgradeTarget_k78.stack?.length - 1] : upgradeTarget_k78.card;
          revealCost_k78 = Math.max(0, ((topCard_k78.chakra ?? 0) - (existingTC.chakra ?? 0)) - 1);
        } else {
          revealCost_k78 = Math.max(0, (topCard_k78.chakra ?? 0) - 1);
        }
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

          // If there's an upgrade target, stack the revealed card onto it
          if (upgradeTarget_k78) {
            const upgradeCharIdx_k78 = chars_k78.findIndex(c => c.instanceId === upgradeTarget_k78.instanceId);
            if (upgradeCharIdx_k78 >= 0) {
              const revealedCharData = chars_k78[cidx_k78];
              chars_k78[upgradeCharIdx_k78] = {
                ...chars_k78[upgradeCharIdx_k78],
                card: revealedCharData.card,
                stack: [...chars_k78[upgradeCharIdx_k78].stack, ...revealedCharData.stack],
                powerTokens: chars_k78[upgradeCharIdx_k78].powerTokens + revealedCharData.powerTokens,
                controllerInstanceId: chars_k78[upgradeCharIdx_k78].controllerInstanceId && chars_k78[upgradeCharIdx_k78].controlledBy === pendingEffect.sourcePlayer ? undefined : chars_k78[upgradeCharIdx_k78].controllerInstanceId,
              };
              chars_k78.splice(cidx_k78, 1);
            }
          }

          m_k78[side_k78] = chars_k78;
          missions_k78[mIdx_k78] = m_k78;
          newState = { ...newState, activeMissions: missions_k78 };

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT',
            `Kankuro (078) UPGRADE: Revealed ${topCard_k78.name_fr}, paying ${revealCost_k78} chakra${upgradeTarget_k78 ? ' (auto-upgrade)' : ''}.`,
            'game.log.effect.kankuro078RevealHidden',
            { card: 'KANKURO', id: 'KS-078-UC', target: topCard_k78.name_fr, cost: String(revealCost_k78) },
          );

          const resultCharId_k78 = upgradeTarget_k78 ? upgradeTarget_k78.instanceId : targetId;
          const revealedChar_k78 = newState.activeMissions[mIdx_k78][side_k78].find(
            c => c.instanceId === resultCharId_k78,
          );
          if (revealedChar_k78) {
            newState = EffectEngine.resolveRevealEffects(newState, pendingEffect.sourcePlayer, revealedChar_k78, mIdx_k78);
          }
        }
        break;
      }

      // KANKURO078_REVEAL_UPGRADE_OR_FRESH: player chose to reveal as fresh or upgrade
      case 'KANKURO078_REVEAL_UPGRADE_OR_FRESH': {
        let meta_k78r: { hiddenInstanceId?: string; missionIndex?: number } = {};
        try { meta_k78r = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const hiddenId_k78r = meta_k78r.hiddenInstanceId;
        const mIdx_k78r = meta_k78r.missionIndex ?? pendingEffect.sourceMissionIndex;
        if (!hiddenId_k78r) break;

        const charResult_k78r = EffectEngine.findCharByInstanceId(newState, hiddenId_k78r);
        if (!charResult_k78r || !charResult_k78r.character.isHidden) break;
        const topCard_k78r = charResult_k78r.character.stack?.length > 0
          ? charResult_k78r.character.stack[charResult_k78r.character.stack?.length - 1]
          : charResult_k78r.character.card;
        const side_k78r = charResult_k78r.player === 'player1' ? 'player1Characters' : 'player2Characters';
        const doUpgrade_k78r = targetId !== 'FRESH';

        let revealCost_k78r: number;
        if (doUpgrade_k78r) {
          const upgradeTarget_k78r = newState.activeMissions[mIdx_k78r][side_k78r].find(
            (c: CharacterInPlay) => c.instanceId === targetId,
          );
          if (!upgradeTarget_k78r) break;
          const existingTC_k78r = upgradeTarget_k78r.stack?.length > 0 ? upgradeTarget_k78r.stack[upgradeTarget_k78r.stack?.length - 1] : upgradeTarget_k78r.card;
          revealCost_k78r = Math.max(0, ((topCard_k78r.chakra ?? 0) - (existingTC_k78r.chakra ?? 0)) - 1);
        } else {
          revealCost_k78r = Math.max(0, (topCard_k78r.chakra ?? 0) - 1);
        }

        const ps_k78r = { ...newState[pendingEffect.sourcePlayer] };
        if (ps_k78r.chakra < revealCost_k78r) break;
        ps_k78r.chakra -= revealCost_k78r;
        newState = { ...newState, [pendingEffect.sourcePlayer]: ps_k78r };

        // Reveal
        const missions_k78r = [...newState.activeMissions];
        const m_k78r = { ...missions_k78r[mIdx_k78r] };
        const chars_k78r = [...m_k78r[side_k78r]];
        const cidx_k78r = chars_k78r.findIndex(c => c.instanceId === hiddenId_k78r);
        if (cidx_k78r === -1) break;
        chars_k78r[cidx_k78r] = { ...chars_k78r[cidx_k78r], isHidden: false, wasRevealedAtLeastOnce: true };

        let isCardUpgrade_k78r = false;
        if (doUpgrade_k78r) {
          const upgradeCharIdx_k78r = chars_k78r.findIndex(c => c.instanceId === targetId);
          if (upgradeCharIdx_k78r >= 0) {
            const revealedData_k78r = chars_k78r[cidx_k78r];
            chars_k78r[upgradeCharIdx_k78r] = {
              ...chars_k78r[upgradeCharIdx_k78r],
              card: revealedData_k78r.card,
              stack: [...chars_k78r[upgradeCharIdx_k78r].stack, ...revealedData_k78r.stack],
              powerTokens: chars_k78r[upgradeCharIdx_k78r].powerTokens + revealedData_k78r.powerTokens,
              controllerInstanceId: chars_k78r[upgradeCharIdx_k78r].controllerInstanceId && chars_k78r[upgradeCharIdx_k78r].controlledBy === pendingEffect.sourcePlayer ? undefined : chars_k78r[upgradeCharIdx_k78r].controllerInstanceId,
            };
            chars_k78r.splice(cidx_k78r, 1);
            isCardUpgrade_k78r = true;
          }
        }

        m_k78r[side_k78r] = chars_k78r;
        missions_k78r[mIdx_k78r] = m_k78r;
        newState = { ...newState, activeMissions: missions_k78r };

        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT',
          `Kankuro (078) UPGRADE: Revealed ${topCard_k78r.name_fr}, paying ${revealCost_k78r} chakra${isCardUpgrade_k78r ? ' (upgrade)' : ''}.`,
          'game.log.effect.kankuro078RevealHidden',
          { card: 'KANKURO', id: 'KS-078-UC', target: topCard_k78r.name_fr, cost: String(revealCost_k78r) },
        );

        const resultId_k78r = isCardUpgrade_k78r ? targetId : hiddenId_k78r;
        const resultChar_k78r = newState.activeMissions[mIdx_k78r][side_k78r].find(c => c.instanceId === resultId_k78r);
        if (resultChar_k78r) {
          newState = EffectEngine.resolveRevealEffects(newState, pendingEffect.sourcePlayer, resultChar_k78r, mIdx_k78r);
        }
        break;
      }

      // =============================================
      // PLAY_HIDDEN_FROM_HAND_FREE (Kankuro 078 UPGRADE â€' deprecated, replaced by KANKURO078_REVEAL_HIDDEN_REDUCED)
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
        // The OPPONENT must choose: reveal (pay printed cost + 2, or upgrade cost + 2) or defeat.
        const opponentPlayer_dosu = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const charResult_dosu = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!charResult_dosu) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          break;
        }
        const topCard_dosu = charResult_dosu.character.stack?.length > 0
          ? charResult_dosu.character.stack[charResult_dosu.character.stack?.length - 1]
          : charResult_dosu.character.card;
        const fullRevealCost_dosu = (topCard_dosu.chakra ?? 0) + 2;
        // Check for upgrade target — minimum cost may be lower
        const dosuOppSide: 'player1Characters' | 'player2Characters' =
          opponentPlayer_dosu === 'player1' ? 'player1Characters' : 'player2Characters';
        const dosuFriendly = newState.activeMissions[charResult_dosu.missionIndex][dosuOppSide];
        const dosuUpgradeTarget = dosuFriendly.find((c) => {
          if (c.instanceId === targetId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          if ((topCard_dosu.chakra ?? 0) <= (cTop.chakra ?? 0)) return false;
          return cTop.name_fr.toUpperCase() === topCard_dosu.name_fr.toUpperCase();
        });
        let revealCost_dosu = fullRevealCost_dosu;
        if (dosuUpgradeTarget) {
          const dosuOldTop = dosuUpgradeTarget.stack?.length > 0
            ? dosuUpgradeTarget.stack[dosuUpgradeTarget.stack?.length - 1]
            : dosuUpgradeTarget.card;
          revealCost_dosu = Math.max(0, (topCard_dosu.chakra ?? 0) - (dosuOldTop.chakra ?? 0)) + 2;
        }
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
        // Store full cost — actual cost recalculated at resolution time (upgrade may appear/disappear)
        const effectId_dosu = generateInstanceId();
        const actionId_dosu = generateInstanceId();
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId_dosu,
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: charResult_dosu.missionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: JSON.stringify({ targetInstanceId: targetId, revealCost: fullRevealCost_dosu, sourcePlayer: pendingEffect.sourcePlayer }),
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
        // Track that the opponent is the forced resolver â€' they get the turn after resolution
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

        // Find the character and its mission BEFORE paying cost (need to check for upgrade)
        const charResult_dosu69 = EffectEngine.findCharByInstanceId(newState, targetInst_dosu69);
        if (!charResult_dosu69) break;
        const mIdx_dosu69 = charResult_dosu69.missionIndex;
        const side_dosu69: 'player1Characters' | 'player2Characters' =
          opponent_dosu69 === 'player1' ? 'player1Characters' : 'player2Characters';
        const charTopCard_dosu69 = charResult_dosu69.character.stack?.length > 0
          ? charResult_dosu69.character.stack[charResult_dosu69.character.stack?.length - 1]
          : charResult_dosu69.character.card;

        // Check for upgrade target at same mission (same name, non-hidden, lower cost)
        const friendlyChars_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69];
        const upgradeTarget_dosu69 = friendlyChars_dosu69.find((c) => {
          if (c.instanceId === targetInst_dosu69 || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          if ((charTopCard_dosu69.chakra ?? 0) <= (cTop.chakra ?? 0)) return false;
          return cTop.name_fr.toUpperCase() === charTopCard_dosu69.name_fr.toUpperCase();
        });

        // Calculate actual cost: if upgrading, use (new - old) + 2 instead of full + 2
        let actualCost_dosu69 = revCost_dosu69;
        if (upgradeTarget_dosu69) {
          const oldTop_dosu69 = upgradeTarget_dosu69.stack?.length > 0
            ? upgradeTarget_dosu69.stack[upgradeTarget_dosu69.stack?.length - 1]
            : upgradeTarget_dosu69.card;
          const upgradeDiff = Math.max(0, (charTopCard_dosu69.chakra ?? 0) - (oldTop_dosu69.chakra ?? 0));
          actualCost_dosu69 = upgradeDiff + 2; // Dosu penalty (+2) applies on top of upgrade cost difference
        }

        // Pay the (possibly reduced) reveal cost
        const ps_dosu69 = { ...newState[opponent_dosu69] };
        ps_dosu69.chakra -= actualCost_dosu69;
        newState = { ...newState, [opponent_dosu69]: ps_dosu69 };

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
              `Dosu Kinuta (069): ${charTopCard_dosu69.name_fr} revealed as upgrade, paying ${actualCost_dosu69} chakra.`,
              'game.log.effect.dosu069RevealUpgrade',
              { card: 'DOSU KINUTA', id: 'KS-069-UC', target: charTopCard_dosu69.name_fr, cost: String(actualCost_dosu69) });

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
              'EFFECT', `Dosu Kinuta (069): ${chars_dosu69[cidx_dosu69].card.name_fr} was revealed, paying ${actualCost_dosu69} chakra.`,
              'game.log.effect.dosu069Reveal', { card: 'DOSU KINUTA', id: 'KS-069-UC', target: chars_dosu69[cidx_dosu69].card.name_fr, cost: String(actualCost_dosu69) });

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

        const copyTargetTopCard = copyTargetResult.character.stack?.length > 0
          ? copyTargetResult.character.stack[copyTargetResult.character.stack?.length - 1]
          : copyTargetResult.character.card;

        // Copy effect filter:
        // - SCORE: never copyable
        // - UPGRADE: Kakashi 016 CANNOT copy, Sakon 062 CAN copy
        // - AMBUSH: only copyable if the copier was revealed from hidden
        const copierWasRevealed = pendingEffect.wasRevealed ?? false;
        const isSakon062 = pendingEffect.sourceCardId === 'KS-062-UC';
        const copyableEffects = (copyTargetTopCard.effects ?? []).filter((eff) => {
          if (eff.type === 'SCORE') return false;
          if (eff.type === 'UPGRADE' && !isSakon062) return false;
          if (eff.type === 'AMBUSH' && !copierWasRevealed) return false;
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
          // Single copyable effect â€' execute directly
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, copyTargetTopCard, copyableEffects[0].type as EffectType,
          );
        } else {
          // Multiple copyable effects â€' Stage 2: let the player choose
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
      // COPY_EFFECT_CHOSEN: Stage 2 â€' the player chose which specific effect to copy
      // Used by Kakashi 016, Kakashi 106, Kakashi 148, and Sakon 062 when multiple effects exist.
      // targetId format: "EFFECT_TYPE::description"
      // effectDescription stores JSON: { charInstanceId, cardId }
      // =============================================
      case 'COPY_EFFECT_CHOSEN': {
        let parsedCopy: { charInstanceId?: string; cardId?: string; cardName?: string } = {};
        try { parsedCopy = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const chosenEffectType = targetId.split('::')[0] as EffectType;

        if (!parsedCopy.cardId || !chosenEffectType) break;

        // Find the target character to get the card info for logging
        const chosenTarget = parsedCopy.charInstanceId
          ? EffectEngine.findCharByInstanceId(newState, parsedCopy.charInstanceId)
          : null;
        const chosenTopCard = chosenTarget
          ? (chosenTarget.character.stack?.length > 0
              ? chosenTarget.character.stack[chosenTarget.character.stack?.length - 1]
              : chosenTarget.character.card)
          : null;

        newState = EffectEngine.executeCopiedEffect(
          newState, pendingEffect, chosenTopCard ?? { id: parsedCopy.cardId, name_fr: parsedCopy.cardName ?? '?', effects: [] } as never,
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

        // Handle hidden Leaf Village character reveal
        if (targetId.startsWith('HIDDEN_')) {
          const instanceId_h002 = targetId.slice(7);

          // Determine resulting instanceId (may merge into upgrade target)
          let resultingInstanceId_h002 = instanceId_h002;
          const charBeforeReveal = EffectEngine.findCharByInstanceId(newState, instanceId_h002);
          if (charBeforeReveal) {
            const topCard_h002r = charBeforeReveal.character.stack?.length > 0
              ? charBeforeReveal.character.stack[charBeforeReveal.character.stack?.length - 1]
              : charBeforeReveal.character.card;
            const friendlySide_h002r: 'player1Characters' | 'player2Characters' =
              player === 'player1' ? 'player1Characters' : 'player2Characters';
            const mChars_h002r = newState.activeMissions[charBeforeReveal.missionIndex][friendlySide_h002r];
            const upgradeIdx_h002r = findUpgradeTargetIdx(mChars_h002r, topCard_h002r, instanceId_h002);
            if (upgradeIdx_h002r >= 0) {
              resultingInstanceId_h002 = mChars_h002r[upgradeIdx_h002r].instanceId;
            }
          }

          // Don't pass powerUpBonus — let UPGRADE handler prompt via processRemainingEffects
          newState = EffectEngine.revealHiddenWithReduction(newState, pendingEffect, instanceId_h002, 1, 0);

          // Track the played character so UPGRADE handler (POWERUP 2) can find it
          (newState as any)._hiruzen002PlayedCharId = resultingInstanceId_h002;
          break;
        }

        // Strip HAND_ prefix if present
        const rawId_h002 = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
        const cardIndex = parseInt(rawId_h002, 10);
        const ps = newState[player];
        if (cardIndex < 0 || cardIndex >= ps.hand.length) break;

        const card = ps.hand[cardIndex];

        // Find valid missions for this card (fresh play OR upgrade over same-name/flexible with lower cost).
        // Filter by affordability: upgrade missions cost (diff - 1), fresh play costs (card.chakra - 1).
        const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
        const validMissions: string[] = [];
        let minCost = Math.max(0, card.chakra - 1); // fresh play baseline
        for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
          const mission = newState.activeMissions[mIdx];
          const chars_h002 = mission[friendlySide];
          const upgradeIdx_h002 = findUpgradeTargetIdx(chars_h002, card);

          let h002MissionAdded = false;
          if (upgradeIdx_h002 >= 0) {
            const existingTop = chars_h002[upgradeIdx_h002].stack?.length > 0
              ? chars_h002[upgradeIdx_h002].stack[chars_h002[upgradeIdx_h002].stack?.length - 1]
              : chars_h002[upgradeIdx_h002].card;
            const upgradeCost = Math.max(0, (card.chakra - existingTop.chakra) - 1);
            if (ps.chakra >= upgradeCost) {
              validMissions.push(String(mIdx));
              minCost = Math.min(minCost, upgradeCost);
              h002MissionAdded = true;
            }
            // If upgrade unaffordable, fall through to check fresh play (for cross-name flex upgrades)
          }
          if (!h002MissionAdded && !hasSameNameConflict(chars_h002, card)) {
            const freshCost = Math.max(0, card.chakra - 1);
            if (ps.chakra >= freshCost) {
              validMissions.push(String(mIdx));
              minCost = Math.min(minCost, freshCost);
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

        // Multiple valid missions â€' create second pending for mission selection
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
        // until <= 2 in THIS mission only. Chain more selections if needed.
        let jirDesc: { missionIndex?: number; sourcePlayer?: string; defeatedIds?: string[] } = {};
        try { jirDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const missionIdx_j = jirDesc.missionIndex ?? pendingEffect.sourceMissionIndex;
        const jirSourcePlayer = (jirDesc.sourcePlayer ?? pendingEffect.sourcePlayer) as PlayerID;
        const defeatedIds_j: string[] = jirDesc.defeatedIds ?? [];

        // Defeat the opponent's selected character
        newState = EffectEngine.defeatCharacter(newState, targetId, jirSourcePlayer);
        defeatedIds_j.push(targetId);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, jirSourcePlayer,
          'EFFECT_DEFEAT',
          `Jiraya (132) UPGRADE: Opponent's character defeated in mission ${missionIdx_j + 1}.`,
          'game.log.effect.defeat',
          { card: 'JIRAYA', id: 'KS-132-S', target: targetId },
        );

        // Check if THIS mission still has > 2 enemy characters (only Jiraiya's mission)
        const enemySide_j: 'player1Characters' | 'player2Characters' =
          jirSourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const opponent_j = jirSourcePlayer === 'player1' ? 'player2' : 'player1';

        // Track forced resolver - opponent gets the turn after all defeats resolve
        newState.pendingForcedResolver = opponent_j;

        const mission_j = newState.activeMissions[missionIdx_j];
        if (mission_j) {
          // Count ACTUAL enemy characters still in this mission (not using defeatedIds)
          const allEnemyChars_j = mission_j[enemySide_j];
          // Valid targets: exclude immune characters (Kyubi/Ichibi)
          const defeatableChars_j = allEnemyChars_j
            .filter((c: CharacterInPlay) => !isImmuneToEnemyHideOrDefeat(c));

          // Safety guard: max 10 iterations to prevent infinite loops
          if (allEnemyChars_j.length > 2 && defeatableChars_j.length > 0 && defeatedIds_j.length < 10) {
            // Chain another selection for the opponent (same mission)
            const chainData_j = JSON.stringify({
              missionIndex: missionIdx_j,
              sourcePlayer: jirSourcePlayer,
              defeatedIds: defeatedIds_j,
              text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${missionIdx_j + 1} (${allEnemyChars_j.length} > 2).`,
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
              validTargets: defeatableChars_j.map((c: CharacterInPlay) => c.instanceId),
              isOptional: false,
              isMandatory: true,
              resolved: false,
              isUpgrade: pendingEffect.isUpgrade,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: actionId_j,
              type: 'SELECT_TARGET' as PendingAction['type'],
              player: opponent_j,
              description: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${missionIdx_j + 1} (${allEnemyChars_j.length} > 2).`,
              descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
              descriptionParams: { mission: String(missionIdx_j + 1), count: String(allEnemyChars_j.length) },
              options: defeatableChars_j.map((c: CharacterInPlay) => c.instanceId),
              minSelections: 1,
              maxSelections: 1,
              sourceEffectId: effectId_j,
            }];
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

        // Log chosen target details before defeating
        {
          const chosenChar = EffectEngine.findCharByInstanceId(newState, targetId);
          if (chosenChar) {
            const chosenTop = chosenChar.character.stack?.length > 0 ? chosenChar.character.stack[chosenChar.character.stack?.length - 1] : chosenChar.character.card;
            console.log(`[GAARA120_CHOOSE_DEFEAT] Player chose targetId=${targetId} name=${chosenTop.name_fr} id=${chosenTop.id} hidden=${chosenChar.character.isHidden} mission=${chosenChar.missionIndex} validTargets=[${pendingEffect.validTargets?.join(', ')}]`);
          } else {
            console.warn(`[GAARA120_CHOOSE_DEFEAT] Chosen targetId=${targetId} NOT FOUND in state! validTargets=[${pendingEffect.validTargets?.join(', ')}]`);
          }
        }

        // Defeat selected target (may be replaced by hide via Hayate/Gaara075/Gemma)
        const g120DefenderSide: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const g120DiscardBefore = newState[g120DefenderSide].discardPile.length;
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        // Only count if the character actually went to the discard pile
        if (newState[g120DefenderSide].discardPile.length > g120DiscardBefore) {
          defeatedCount_g++;
        }
        let defeatName_g = '';
        for (const m of newState.activeMissions) {
          for (const c of [...m.player1Characters, ...m.player2Characters]) {
            if (c.instanceId === targetId) {
              const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
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
          const opponentPlayer_g2 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const validTargets_g = mission_g[enemySide_g].filter((c: CharacterInPlay) =>
            getEffectivePower(newState, c, opponentPlayer_g2 as PlayerID) <= 1
          );

          if (validTargets_g.length === 0) continue;

          // Always prompt for remaining missions too â€' player can skip (optional "up to 1")
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

        // Queue discard reorder for after all effects resolve
        if (!chainedToNext && defeatedCount_g >= 2) {
          const g120DefenderPile: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          newState.pendingDiscardReorder = { discardOwner: g120DefenderPile, chooser: pendingEffect.sourcePlayer, count: defeatedCount_g };
        }
        if (!chainedToNext && gaaraDesc.isUpgrade && defeatedCount_g > 0 && gaaraDesc.sourceInstanceId && gaaraDesc.sourceMissionIndex != null) {
          const g120uEffId = generateInstanceId();
          const g120uActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: g120uEffId,
            sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: gaaraDesc.sourceInstanceId,
            sourceMissionIndex: gaaraDesc.sourceMissionIndex ?? pendingEffect.sourceMissionIndex,
            effectType: 'UPGRADE' as EffectType,
            effectDescription: JSON.stringify({ defeatedCount: defeatedCount_g }),
            targetSelectionType: 'GAARA120_CONFIRM_UPGRADE',
            sourcePlayer: pendingEffect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: [gaaraDesc.sourceInstanceId],
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: true,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: g120uActId,
            type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: `Gaara (120) UPGRADE: POWERUP ${defeatedCount_g}?`,
            descriptionKey: 'game.effect.desc.gaara120ConfirmUpgrade',
            descriptionParams: { count: String(defeatedCount_g) },
            options: [gaaraDesc.sourceInstanceId],
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: g120uEffId,
          }];
        }
        break;
      }

      case 'GAARA120_CONFIRM_UPGRADE': {
        // Apply POWERUP X on self (Gaara 120 UPGRADE effect)
        let g120uDesc: { defeatedCount?: number } = {};
        try { g120uDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const g120uCount = g120uDesc.defeatedCount ?? 0;
        if (g120uCount > 0 && pendingEffect.sourceInstanceId) {
          const g120uPlayer = pendingEffect.sourcePlayer;
          const g120uFriendlySide: 'player1Characters' | 'player2Characters' =
            g120uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const g120uMI = pendingEffect.sourceMissionIndex;
          if (g120uMI != null && newState.activeMissions[g120uMI]) {
            const g120uMission = { ...newState.activeMissions[g120uMI] };
            const g120uChars = [...g120uMission[g120uFriendlySide]];
            const g120uIdx = g120uChars.findIndex((c: CharacterInPlay) => c.instanceId === pendingEffect.sourceInstanceId);
            if (g120uIdx !== -1) {
              g120uChars[g120uIdx] = { ...g120uChars[g120uIdx], powerTokens: g120uChars[g120uIdx].powerTokens + g120uCount };
              g120uMission[g120uFriendlySide] = g120uChars;
              const g120uMissions = [...newState.activeMissions];
              g120uMissions[g120uMI] = g120uMission;
              newState = { ...newState, activeMissions: g120uMissions };
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, g120uPlayer,
                'EFFECT_POWERUP',
                `Gaara (120): POWERUP ${g120uCount} (upgrade).`,
                'game.log.effect.powerupSelf',
                { card: 'GAARA', id: 'KS-120-R', amount: g120uCount },
              );
            }
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

          const powerupAmount = chakraAmount;
          const charResult104 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          if (charResult104) {
            const missions104 = [...newState.activeMissions];
            const mission104 = { ...missions104[charResult104.missionIndex] };
            const side104: 'player1Characters' | 'player2Characters' =
              charResult104.player === 'player1' ? 'player1Characters' : 'player2Characters';
            mission104[side104] = mission104[side104].map((c: CharacterInPlay) =>
              c.instanceId === pendingEffect.sourceInstanceId
                ? { ...c, powerTokens: c.powerTokens + powerupAmount }
                : c,
            );
            missions104[charResult104.missionIndex] = mission104;
            newState.activeMissions = missions104;
          }

          // Store the amount spent so UPGRADE can reference it
          (newState as any)._tsunade104ChakraSpent = chakraAmount;

          newState.log = logAction(
            newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_POWERUP',
            `Tsunade (104): Spent ${chakraAmount} extra chakra for POWERUP ${chakraAmount}.`,
            'game.log.effect.powerupSelf',
            { card: 'TSUNADE', id: 'KS-104-R', amount: powerupAmount },
          );
        } else {
          (newState as any)._tsunade104ChakraSpent = 0;
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

      // --- Choose token amount (up to 2) for remove/steal effects ---
      case 'CHOOSE_TOKEN_AMOUNT_REMOVE': {
        const amountRemove = parseInt(targetId, 10);
        if (!isNaN(amountRemove) && amountRemove > 0) {
          let parsedRemoveInfo: { targetInstanceId?: string } = {};
          try { parsedRemoveInfo = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
          const removeTargetId = parsedRemoveInfo.targetInstanceId;
          if (removeTargetId) {
            newState = EffectEngine.removeTokensFromTarget(newState, removeTargetId, amountRemove);
            const removedChar = EffectEngine.findCharByInstanceId(newState, removeTargetId);
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_REMOVE_TOKENS',
              `Removed ${amountRemove} Power token(s) from ${removedChar?.character.card.name_fr ?? 'target'}.`,
              'game.log.effect.removeTokens',
              { amount: amountRemove, target: removedChar?.character.card.name_fr ?? 'target' },
            );
          }
        }
        break;
      }

      case 'CHOOSE_TOKEN_AMOUNT_STEAL': {
        const amountSteal = parseInt(targetId, 10);
        if (!isNaN(amountSteal) && amountSteal > 0) {
          let parsedStealInfo: { targetInstanceId?: string; sourceInstanceId?: string } = {};
          try { parsedStealInfo = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
          const stealFromId = parsedStealInfo.targetInstanceId;
          const stealToId = parsedStealInfo.sourceInstanceId ?? pendingEffect.sourceInstanceId;
          if (stealFromId) {
            newState = EffectEngine.removeTokensFromTarget(newState, stealFromId, amountSteal);
            newState = EffectEngine.applyPowerupToTarget(newState, stealToId, amountSteal);
            const stolenFromChar = EffectEngine.findCharByInstanceId(newState, stealFromId);
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_STEAL_TOKENS',
              `Stole ${amountSteal} Power token(s) from ${stolenFromChar?.character.card.name_fr ?? 'target'}.`,
              'game.log.effect.stealTokens',
              { amount: amountSteal, target: stolenFromChar?.character.card.name_fr ?? 'target' },
            );
          }
        }
        break;
      }

      default:
        // Unknown target selection type - log as error (likely a missing case in this switch)
        console.error(`[EffectEngine] UNHANDLED targetSelectionType: "${pendingEffect.targetSelectionType}" for card ${pendingEffect.sourceCardId} (${pendingEffect.effectType}). Effect DROPPED. Add a case to applyTargetedEffect().`);
        break;
    }

    } catch (err) {
      console.error(`[EffectEngine] Error in applyTargetedEffect for ${pendingEffect.targetSelectionType}:`, err);
      // Recover gracefully — remove the broken pending effect and continue the game
      newState = deepClone(state);
    }

    newState.pendingEffects = newState.pendingEffects.filter((pe) => pe.id !== pendingEffect.id);
    newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);

    // Process remaining effects (continuation) if any
    if (pendingEffect.remainingEffectTypes && pendingEffect.remainingEffectTypes.length > 0) {
      // If other pendings exist (reactions from existing cards, e.g. on-move triggers),
      // defer remaining effects so existing cards resolve first (rule priority).
      const hasOtherPendings = newState.pendingEffects.length > 0 || newState.pendingActions.length > 0;
      if (hasOtherPendings) {
        // Store continuation on state — GameEngine will fire it after reactions resolve
        newState.pendingContinuation = {
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          sourcePlayer: pendingEffect.sourcePlayer,
          remainingEffectTypes: [...pendingEffect.remainingEffectTypes],
          isUpgrade: pendingEffect.isUpgrade,
          wasRevealed: pendingEffect.wasRevealed ?? false,
        };
      } else {
        // No reactions — chain immediately (same as before)
        newState = EffectEngine.processRemainingEffects(newState, pendingEffect);
      }
    }

    return newState;
  }

  /**
   * After resolving a pending effect, continue processing remaining effect types.
   */
  static processRemainingEffects(state: GameState, resolvedPending: PendingEffect): GameState {
    let newState = state;
    const remaining = resolvedPending.remainingEffectTypes ?? [];

    // Find the character in its current location (may have moved since the original effect)
    const charResult = EffectEngine.findCharByInstanceId(newState, resolvedPending.sourceInstanceId);
    if (!charResult) {
      console.warn(`[EffectEngine] processRemainingEffects: source character ${resolvedPending.sourceInstanceId} (${resolvedPending.sourceCardId}) not found on board. Remaining effects [${remaining.join(', ')}] skipped.`);
      return newState;
    }

    const { character, missionIndex } = charResult;
    const topCard = character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card;

    for (const effectType of remaining) {
      const hasEffect = (topCard.effects ?? []).some((e) => e.type === effectType);
      if (!hasEffect) {
        console.warn(`[EffectEngine] processRemainingEffects: card ${topCard.id} (${topCard.name_fr}) has no ${effectType} effect. Skipping.`);
        continue;
      }

      const handler = getEffectHandler(topCard.id, effectType);
      if (!handler) {
        console.warn(`[EffectEngine] processRemainingEffects: no handler registered for ${topCard.id} ${effectType}. Skipping.`);
        continue;
      }

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

    // Kurenai 035 (UC): ENEMY characters cannot move from this mission
    if (isMovementBlockedByKurenai(state, charResult.missionIndex, charResult.player)) {
      const loggedState = deepClone(state);
      loggedState.log = logAction(
        loggedState.log, loggedState.turn, loggedState.phase, charResult.player,
        'EFFECT_BLOCKED',
        `Yuhi Kurenai (035): ${charResult.character.card.name_fr} cannot be moved from this mission.`,
        'game.log.effect.moveBlockedKurenai',
        { card: 'YUHI KURENAI', id: 'KS-035-UC', target: charResult.character.card.name_fr },
      );
      return loggedState;
    }

    // Enforce same-name-per-mission rule
    if (!EffectEngine.validateNameUniquenessForMove(state, charResult.character, destMissionIndex, charResult.player)) {
      const loggedState = deepClone(state);
      loggedState.log = logAction(
        loggedState.log, loggedState.turn, loggedState.phase, charResult.player,
        'EFFECT_BLOCKED',
        `Cannot move ${charResult.character.card.name_fr} to mission ${destMissionIndex + 1} â€' a character with the same name already exists there.`,
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
    const movedTopCard = movedChar.stack?.length > 0 ? movedChar.stack[movedChar.stack?.length - 1] : movedChar.card;
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
    if (character.stack?.length <= 1) {
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

    // UPGRADE: copy the discarded card's non-Upgrade instant effect
    // Kakashi 106 CANNOT copy: UPGRADE, SCORE, continuous [⧗], or effect: modifiers
    // AMBUSH is only copyable if Kakashi was revealed (wasRevealed flag)
    if (pending.isUpgrade) {
      const copier106WasRevealed = pending.wasRevealed ?? false;
      const copyableEffects = (discardedCard.effects ?? []).filter(
        (e) => {
          if (e.type === 'SCORE') return false;
          if (e.type === 'UPGRADE') return false;
          if (e.type === 'AMBUSH' && !copier106WasRevealed) return false;
          if (e.description.includes('[⧗]')) return false;
          if (e.description.startsWith('effect:') || e.description.startsWith('effect.')) return false;
          return true;
        },
      );
      if (copyableEffects.length === 1) {
        // Single copyable effect - execute directly
        return EffectEngine.executeCopiedEffect(
          newState, pending, discardedCard, copyableEffects[0].type as EffectType,
        );
      } else if (copyableEffects.length > 1) {
        // Multiple copyable effects - let the player choose
        const choiceEffectId = generateInstanceId();
        const choiceActionId = generateInstanceId();
        const effectOptions = copyableEffects.map((eff) => `${eff.type}::${eff.description}`);
        newState.pendingEffects.push({
          id: choiceEffectId,
          sourceCardId: pending.sourceCardId,
          sourceInstanceId: pending.sourceInstanceId,
          sourceMissionIndex: pending.sourceMissionIndex,
          effectType: pending.effectType,
          effectDescription: JSON.stringify({ charInstanceId: null, cardId: discardedCard.id, cardName: discardedCard.name_fr }),
          targetSelectionType: 'COPY_EFFECT_CHOSEN',
          sourcePlayer: pending.sourcePlayer,
          requiresTargetSelection: true,
          validTargets: effectOptions,
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: pending.isUpgrade,
        });
        newState.pendingActions.push({
          id: choiceActionId,
          type: 'CHOOSE_EFFECT',
          player: pending.sourcePlayer,
          description: `Choose which effect of ${discardedCard.name_fr} to copy.`,
          descriptionKey: 'game.effect.desc.chooseEffectToCopy',
          descriptionParams: { target: discardedCard.name_fr },
          options: effectOptions,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: choiceEffectId,
        });
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
      // Cost > 3, cannot steal â€' just log
      return {
        ...state,
        log: logAction(
          state.log, state.turn, 'action', pending.sourcePlayer,
          'EFFECT', `${parsed.cardName} costs too much â€' Orochimaru cannot take control.`,
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
    targetChar.controllerInstanceId = pending.sourceInstanceId;
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
   * Ninja Hounds 100: After selecting which hidden enemy to look at,
   * reveal its info to the player via a DOSU_LOOK_REVEAL pending.
   */
  static ninjaHoundsLookAtHidden(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || !charResult.character.isHidden) {
      return {
        ...state,
        log: logAction(state.log, state.turn, 'action', pending.sourcePlayer,
          'EFFECT_NO_TARGET', 'Ninja Hounds (100): Target is no longer hidden.',
          'game.log.effect.noTarget', { card: 'Chiens Ninjas', id: 'KS-100-C' }),
      };
    }

    const targetChar = charResult.character;
    const newState = deepClone(state);

    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Ninja Hounds (100): Looked at hidden character ${targetChar.card.name_fr}.`,
      'game.log.effect.lookAtHidden',
      { card: 'Chiens Ninjas', id: 'KS-100-C', target: targetChar.card.name_fr },
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
      description: `Ninja Hounds (100): Revealed ${targetChar.card.name_fr} (Cost ${targetChar.card.chakra}, Power ${targetChar.card.power}).`,
      descriptionKey: 'game.effect.desc.ninjaHounds100LookReveal',
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

  // sasuke014ResolveReveal removed â€' AMBUSH now just shows hand, UPGRADE is separate handler

  /**
   * Defeat a character (remove from play, add to owner's discard).
   * Handles:
   * 1. Defeat replacement checks (Hayate 048, Gaara 075, Gemma 049)
   * 2. On-defeat triggers (Tsunade 003, Sasuke 136) via shared triggerOnDefeatEffects
   */

  /**
   * Create a REORDER_DISCARD pending action for the owner of defeated cards.
   * Lets the owner choose the order of the last N cards in their discard pile.
   * Last card placed = top of pile (matters for Kabuto 053).
   */
  static createReorderDiscardPending(
    state: GameState, discardOwner: PlayerID, effectSourcePlayer: PlayerID, count: number,
    selectingPlayer?: PlayerID, chainData?: Record<string, unknown>,
  ): GameState {
    const newState = { ...state };
    const discard = newState[discardOwner].discardPile;
    if (discard.length < 2 || count < 2) return state;

    const actualCount = Math.min(count, discard.length);
    const cardsToOrder = discard.slice(-actualCount);
    // Ensure unique IDs even for duplicate cards (e.g. 2x same version)
    const seenIds = new Map<string, number>();
    const cardInstanceIds = cardsToOrder.map((c: any) => {
      const baseId = c.instanceId || c.id || generateInstanceId();
      const count = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, count + 1);
      return count > 0 ? `${baseId}__dup${count}` : baseId;
    });

    const chooser = selectingPlayer ?? effectSourcePlayer;
    const effId = generateInstanceId();
    const actId = generateInstanceId();
    newState.pendingEffects = [...newState.pendingEffects, {
      id: effId,
      sourceCardId: 'REORDER_DISCARD',
      sourceInstanceId: effId,
      sourceMissionIndex: 0,
      effectType: 'MAIN' as EffectType,
      effectDescription: JSON.stringify({ count: actualCount, discardOwner, ...(chainData ?? {}) }),
      targetSelectionType: 'REORDER_DISCARD',
      sourcePlayer: effectSourcePlayer,
      selectingPlayer: chooser !== effectSourcePlayer ? chooser : undefined,
      requiresTargetSelection: true,
      validTargets: cardInstanceIds,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    }];
    newState.pendingActions = [...newState.pendingActions, {
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: chooser,
      description: `Choose the order for ${actualCount} defeated cards in the discard pile. Last selected = top of pile.`,
      descriptionKey: 'game.effect.desc.reorderDiscard',
      descriptionParams: { count: String(actualCount) },
      options: cardInstanceIds,
      minSelections: actualCount,
      maxSelections: actualCount,
      sourceEffectId: effId,
    }];
    return newState;
  }

  static defeatCharacter(state: GameState, targetId: string, sourcePlayer?: PlayerID): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) {
      console.warn(`[EffectEngine] defeatCharacter: character ${targetId} not found in any mission. Cannot defeat.`);
      return state;
    }

    const charTopCard = charResult.character.stack?.length > 0
      ? charResult.character.stack[charResult.character.stack?.length - 1]
      : charResult.character.card;
    console.log(`[EffectEngine] defeatCharacter: defeating ${charTopCard.name_fr} (${charTopCard.id}) instanceId=${targetId} hidden=${charResult.character.isHidden} mission=${charResult.missionIndex} player=${charResult.player}`);

    const effectSource = sourcePlayer ?? (charResult.player === 'player1' ? 'player2' : 'player1');
    const isEnemyEffect = effectSource !== charResult.player;

    // Check for defeat replacement (Hayate, Gaara 075, Gemma)
    const replacement = EffectEngine.checkDefeatReplacement(
      state, charResult.character, charResult.player, charResult.missionIndex, isEnemyEffect,
    );
    if (replacement.replaced) {
      if (replacement.replacement === 'immune') {
        // Character is immune to defeat â€' do nothing
        return state;
      }
      if (replacement.replacement === 'hide') {
        return EffectEngine.hideCharacter(state, targetId);
      }
      if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
        // Gemma 049: optional sacrifice â€' create pending choice for the owning player
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

    // Before removing, return any characters this one was controlling
    let preState = EffectEngine.restoreControlOnLeave(state, targetId);

    const newState = deepClone(preState);
    const charResult2 = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult2) return newState;
    const mission = newState.activeMissions[charResult2.missionIndex];
    const key = charResult2.player === 'player1' ? 'player1Characters' : 'player2Characters';

    const idx = mission[key].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (idx === -1) return state;

    const defeated = mission[key].splice(idx, 1)[0];

    // Tsunade 004 UC: [⧗] Defeated friendly characters go to hand instead of discard pile
    const owner = defeated.originalOwner;
    const hasTsunade004 = EffectEngine.hasTsunade004Active(newState, charResult2.player);
    if (hasTsunade004 && charResult2.player === owner) {
      // Only TOP card goes to hand; cards underneath go to discard pile
      const topCard = defeated.stack?.length > 0 ? defeated.stack[defeated.stack?.length - 1] : null;
      const underCards = defeated.stack?.length > 1 ? defeated.stack.slice(0, -1) : [];
      if (topCard) newState[owner].hand.push(topCard);
      for (let ui = 0; ui < underCards.length; ui++) {
        const card = underCards[ui];
        const discardCard = { ...card, instanceId: defeated.instanceId + `-stack-${ui}` };
        newState[owner].discardPile.push(discardCard as any);
      }
    } else {
      // Normal: add all cards in the stack to the original owner's discard pile
      // Assign instanceIds from the CharacterInPlay for discard ordering features
      for (let si = 0; si < defeated.stack.length; si++) {
        const card = defeated.stack[si];
        const discardCard = { ...card, instanceId: defeated.instanceId + (si > 0 ? `-stack-${si}` : '') };
        newState[owner].discardPile.push(discardCard as any);
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
          // When a controller is hidden, return any characters it took control of
          return EffectEngine.restoreControlOnLeave(newState, targetId);
        }
      }
    }
    return state;
  }

  /**
   * When a character leaves play (hidden or defeated), return any characters
   * it was controlling back to their original owner.
   */
  static restoreControlOnLeave(state: GameState, controllerInstanceId: string): GameState {
    // First pass: find all characters controlled by the leaving controller
    const controlledChars: { instanceId: string; missionIndex: number }[] = [];
    for (let mi = 0; mi < state.activeMissions.length; mi++) {
      const mission = state.activeMissions[mi];
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (char.controllerInstanceId === controllerInstanceId && char.controlledBy !== char.originalOwner) {
            controlledChars.push({ instanceId: char.instanceId, missionIndex: mi });
          }
        }
      }
    }

    if (controlledChars.length === 0) return state;

    let newState = deepClone(state);

    for (const { instanceId } of controlledChars) {
      // Re-find the character in the cloned state (indices may shift after each move)
      let currentMission: (typeof newState.activeMissions)[number] | null = null;
      let char: CharacterInPlay | null = null;
      let fromSide: 'player1Characters' | 'player2Characters' | null = null;
      let idx = -1;

      for (const mission of newState.activeMissions) {
        for (const side of ['player1Characters', 'player2Characters'] as const) {
          const i = mission[side].findIndex((c: CharacterInPlay) => c.instanceId === instanceId);
          if (i >= 0) {
            currentMission = mission;
            char = mission[side][i];
            fromSide = side;
            idx = i;
            break;
          }
        }
        if (char) break;
      }

      if (!currentMission || !char || !fromSide || idx === -1) continue;

            // If the stolen card has been upgraded (stack > 1), it stays — the upgrade
            // merged it with the controller's card, so it's no longer purely stolen
            if (char.stack && char.stack.length > 1) {
              // Just clear the controller link, card stays in place
              char.controllerInstanceId = undefined;
              continue;
            }

            const toSide = char.originalOwner === 'player1' ? 'player1Characters' : 'player2Characters';

            // Check same-name conflict on the destination side (use top-of-stack name for upgraded chars)
            const topCardCtrl = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
            const charName = topCardCtrl.name_fr.toUpperCase();
            const hasSameName = currentMission[toSide].some(
              (c: CharacterInPlay) => {
                if (c.isHidden || c.instanceId === char.instanceId) return false;
                const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                return cTop.name_fr.toUpperCase() === charName;
              }
            );
            if (hasSameName && !char.isHidden) {
              // Same-name conflict — the returning character is discarded
              // (the player chose to play another copy knowing the original was stolen)
              const removed = currentMission[fromSide].splice(idx, 1)[0];
              for (let si = 0; si < removed.stack.length; si++) {
                const card = removed.stack[si];
                newState[removed.originalOwner].discardPile.push({ ...card, instanceId: removed.instanceId + (si > 0 ? `-stack-${si}` : '') } as any);
              }
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, char.originalOwner,
                'EFFECT', `${topCardCtrl.name_fr} returned to owner but same name already in play — discarded.`,
                'game.log.effect.controlReturnedConflict',
                { card: topCardCtrl.name_fr, target: topCardCtrl.name_fr },
              );
            } else {
              // Returns to owner's side (Ino/Orochimaru/Kabuto)
              const removed = currentMission[fromSide].splice(idx, 1)[0];
              removed.controlledBy = removed.originalOwner;
              removed.controllerInstanceId = undefined;
              currentMission[toSide].push(removed);
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, char.originalOwner,
                'EFFECT', `${topCardCtrl.name_fr} returned to original owner (controller left play).`,
                'game.log.effect.controlReturned',
                { card: topCardCtrl.name_fr },
              );
            }
    }

    newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
    newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');

    return newState;
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

  /** Naruto 133 S â€' Stage 1: hide/defeat target 1, then chain to target 2 */
  static naruto133ApplyTarget1(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { missionIndex?: number; useDefeat?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const useDefeat = parsed.useDefeat ?? false;

    // Track discard size before target 1 for accurate reorder count later
    const n133DefenderT1: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';
    const discardSizeBeforeT1 = state[n133DefenderT1].discardPile.length;

    // Apply hide or defeat to target 1
    let newState: GameState;
    if (useDefeat) {
      newState = EffectEngine.defeatCharacter(state, targetId, pending.sourcePlayer);
    } else {
      newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);
    }

    // Now find valid targets for Stage 2: enemy Power â‰¤ 2 in ANY mission
    const enemySideKey: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const enemyPlayer: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';

    const validTarget2: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      for (const char of newState.activeMissions[i][enemySideKey]) {
        // When useDefeat (upgrade), include hidden chars (power 0 qualifies); otherwise exclude (hiding hidden is redundant)
        if (!useDefeat && char.isHidden) continue;
        // Use effective power (includes continuous effects like MSS02 +1) â€' not just base+tokens
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
        newState = EffectEngine.defeatCharacter(newState, validTarget2[0], pending.sourcePlayer);
        const n133AutoDefeated = newState[n133DefenderT1].discardPile.length - discardSizeBeforeT1;
        if (n133AutoDefeated >= 2) {
          newState.pendingDiscardReorder = { discardOwner: n133DefenderT1, chooser: pending.sourcePlayer, count: n133AutoDefeated };
        }
        return newState;
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
      effectDescription: JSON.stringify({ useDefeat, target1Id: targetId, discardSizeBefore: discardSizeBeforeT1 }),
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

  /** Naruto 108 R â€' hide target and apply POWERUP if upgrade */
  static naruto108ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { isUpgrade?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const isUpgrade = parsed.isUpgrade ?? false;

    // Get the target's effective power BEFORE hiding (includes continuous modifiers)
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;
    const targetPower = getEffectivePower(state, charResult.character, charResult.player);

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

  /** Kyubi 134 S â€' iterative multi-hide: hide target, then offer more picks if budget remains */
  static kyubi134ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { remainingPower?: number; hiddenIds?: string[] } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    let remainingPower = parsed.remainingPower ?? 6;
    const hiddenIds = parsed.hiddenIds ?? [];

    // Get target's effective power before hiding (includes continuous modifiers)
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || charResult.character.isHidden) return state;
    const targetPower = getEffectivePower(state, charResult.character, charResult.player);

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
          const charOwner3 = newState.activeMissions[i].player1Characters.includes(char) ? 'player1' : 'player2';
          const pw = getEffectivePower(newState, char, charOwner3 as PlayerID);
          if (pw <= remainingPower) {
            validNext.push(char.instanceId);
          }
        }
      }
    }

    if (validNext.length === 0) return newState; // No more valid targets

    // Offer another pick (optional â€' player can decline)
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

  /** Check if Tsunade 004 UC is face-visible on a player's side (defeat â†' hand redirect) */
  static hasTsunade004Active(state: GameState, player: PlayerID): boolean {
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const char of chars) {
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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
  static hideCharacterWithLog(state: GameState, targetInstanceId: string, sourcePlayer: PlayerID, skipProtection: boolean = false): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetInstanceId);
    if (!charResult) return state;
    if (charResult.character.isHidden) return state;

    const isEnemyEffect = charResult.player !== sourcePlayer;

    // Kimimaro 056 continuous protection: if an enemy effect targets this character,
    // the opponent must pay 1 chakra or the effect fails (hide is blocked).
    // Skip if already checked in the main switch (skipProtection flag)
    if (isEnemyEffect && !skipProtection) {
      const topCard = charResult.character.stack?.length > 0
        ? charResult.character.stack[charResult.character.stack?.length - 1]
        : charResult.character.card;
      if (topCard.number === 56) {
        const hasProtection = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('chakra'),
        );
        if (hasProtection) {
          if (state[sourcePlayer].chakra >= 1) {
            state = {
              ...state,
              [sourcePlayer]: { ...state[sourcePlayer], chakra: state[sourcePlayer].chakra - 1 },
              log: logAction(
                state.log, state.turn, state.phase, charResult.player,
                'EFFECT_CONTINUOUS',
                `Kimimaro (056): ${sourcePlayer} pays 1 Chakra for targeting this character.`,
                'game.log.effect.kimimaro056Protection',
                { card: 'KIMIMARO', id: 'KS-056-UC' },
              ),
            };
          } else {
            return {
              ...state,
              log: logAction(
                state.log, state.turn, state.phase, charResult.player,
                'EFFECT_CONTINUOUS',
                `Kimimaro (056): ${sourcePlayer} cannot pay 1 Chakra - effect fails.`,
                'game.log.effect.kimimaro056ProtectionBlocked',
                { card: 'KIMIMARO', id: 'KS-056-UC' },
              ),
            };
          }
        }
      }
    }

    // Check hide immunity from enemy effects (Ichibi 076/130, Kyubi 129)
    if (isEnemyEffect && EffectEngine.isImmuneToEnemyHide(charResult.character)) {
      return state; // Immune â€' hide blocked
    }

    // Check Shino 115 mission-level protection: friendly allies cannot be hidden by enemy effects
    if (isEnemyEffect && isProtectedFromEnemyHide(state, charResult.character, charResult.player)) {
      return state; // Protected by Shino 115 â€' hide blocked
    }

    // Check Gemma 049 sacrifice: can sacrifice Gemma to protect friendly Leaf Village from enemy hide
    // Skip if there's already a pending Gemma sacrifice choice (batch hide dedup - Gemma can only sacrifice once)
    const alreadyHasGemmaPending = state.pendingEffects.some(
      (pe) => (pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' || pe.targetSelectionType === 'GEMMA049_CHOOSE_PROTECT_HIDE') && !pe.resolved,
    );
    if (isEnemyEffect && charResult.character.card.group === 'Leaf Village' && !alreadyHasGemmaPending) {
      const mission = state.activeMissions[charResult.missionIndex];
      const friendlyChars = charResult.player === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const friendly of friendlyChars) {
        if (friendly.isHidden || friendly.instanceId === charResult.character.instanceId) continue;
        const fTopCard = friendly.stack?.length > 0 ? friendly.stack[friendly.stack?.length - 1] : friendly.card;
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

  /** Resume batch hide processing after Gemma 049 sacrifice choice resolves.
   *  Hides remaining targets that were deferred when Gemma's sacrifice interrupted the batch. */
  static resumeBatchHideAfterGemma(state: GameState, remainingTargetIds: string[], batchSourcePlayer: PlayerID): GameState {
    let currentState = state;
    let hiddenCount = 0;
    for (const targetId of remainingTargetIds) {
      const pendingCountBefore = currentState.pendingEffects.length;
      currentState = EffectEngine.hideCharacterWithLog(currentState, targetId, batchSourcePlayer);
      // If another Gemma pending was created (shouldn't happen since Gemma is gone, but just in case)
      const newGemmaPending = currentState.pendingEffects.find(
        (pe) => pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' && !pe.resolved
          && currentState.pendingEffects.length > pendingCountBefore,
      );
      if (newGemmaPending) {
        // Store remaining targets in this new pending too
        const restIds = remainingTargetIds.slice(remainingTargetIds.indexOf(targetId) + 1);
        const desc = JSON.parse(newGemmaPending.effectDescription);
        desc.batchRemainingTargets = restIds;
        desc.batchSourcePlayer = batchSourcePlayer;
        desc.batchHiddenCount = hiddenCount;
        newGemmaPending.effectDescription = JSON.stringify(desc);
        break;
      }
      const charAfter = EffectEngine.findCharByInstanceId(currentState, targetId);
      if (charAfter && charAfter.character.isHidden) hiddenCount++;
    }
    return currentState;
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
    // Handle hidden character reveal
    if (targetId.startsWith('HIDDEN_')) {
      return EffectEngine.revealHiddenWithReduction(state, pending, targetId.slice(7), costReduction);
    }
    // Strip HAND_ prefix if present
    const rawId = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
    // Delegate to the generic handler which supports upgrade-or-fresh choice
    return EffectEngine.playCharFromHandWithReduction(
      state, pending, rawId, costReduction, 'Summon', 'Jiraya', pending.sourceCardId ?? '',
    );
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
    // Cost deferred to placement time (upgrade vs fresh play)
    ps.hand.splice(handIndex, 1);

    // Find valid missions (fresh play or upgrade over same-name/flexible with lower cost)
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      if (isMissionValidForPlay(mission, friendlySide, chosenCard, ps.chakra, costReduction)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) {
      // Refund -- no valid mission
      ps.hand.push(chosenCard);
      // No refund needed (cost not paid upfront)
      return state;
    }

    // Store chosen card in discard temporarily for auto-place to recover
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.genericPlaceOnMission(newState, player, parseInt(validMissions[0], 10), 0, cardName, cardId, costReduction);
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
      effectDescription: JSON.stringify({ cost: 0, cardName, cardId, costReduction }),
      targetSelectionType: 'GENERIC_CHOOSE_PLAY_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
      remainingEffectTypes: pending.remainingEffectTypes,
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

    // Check if there's an upgrade target (same-name or flexible cross-name)
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

    // Check if fresh play is also possible (no name conflict with existing visible chars)
    const hasNameConflict = mission[friendlySide].some((c: CharacterInPlay) => {
      if (c.isHidden) return false;
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    });

    // Find ALL affordable upgrade targets (same-name + flex, filtering out name-conflicting flex targets)
    if (existingIdx >= 0) {
      const upgradeTargetIds: string[] = [];
      for (let i = 0; i < mission[friendlySide].length; i++) {
        const c = mission[friendlySide][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          // For flex upgrades, skip targets that would create a post-upgrade name conflict
          if (isFlex) {
            const wouldConflict = mission[friendlySide].some((other: CharacterInPlay) => {
              if (other.instanceId === c.instanceId || other.isHidden) return false;
              const oTop = other.stack?.length > 0 ? other.stack[other.stack?.length - 1] : other.card;
              return oTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
            });
            if (wouldConflict) continue;
          }
          // Only include if the upgrade is affordable
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - costReduction);
          if (ps.chakra >= upgCost) upgradeTargetIds.push(c.instanceId);
        }
      }

      if (upgradeTargetIds.length > 0) {
        const canFreshPlay = !hasNameConflict;
        const validTargets = canFreshPlay ? ['FRESH', ...upgradeTargetIds] : [...upgradeTargetIds];

        // If there's only one option total (single upgrade, no fresh play), auto-upgrade (fall through)
        if (validTargets.length === 1 && !canFreshPlay) {
          // Single upgrade target with name conflict — fall through to auto-upgrade below
        } else {
          // Multiple options — offer choice to player
          ps.discardPile.push(card);

          const effectId = `generic-upgrade-choice-${generateInstanceId()}`;
          state.pendingEffects = [...state.pendingEffects, {
            id: effectId,
            sourceCardId: cardId,
            sourceInstanceId: '',
            sourceMissionIndex: missionIndex,
            effectType: 'MAIN' as EffectType,
            effectDescription: JSON.stringify({ cardName, cardId, costReduction, missionIndex }),
            targetSelectionType: 'EFFECT_PLAY_UPGRADE_OR_FRESH',
            sourcePlayer: player,
            requiresTargetSelection: true,
            validTargets,
            isOptional: false,
            isMandatory: true,
            resolved: false,
            isUpgrade: false,
            description: canFreshPlay
              ? `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`
              : `Choose which character to upgrade ${card.name_fr} over.`,
            descriptionKey: canFreshPlay ? 'game.effect.desc.effectPlayUpgradeChoice' : 'game.effect.desc.effectUpgradeChoice',
            descriptionParams: { card: card.name_fr },
          } as PendingEffect];

          state.pendingActions = [...state.pendingActions, {
            id: generateInstanceId(),
            type: 'SELECT_TARGET',
            player,
            description: canFreshPlay
              ? `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`
              : `Choose which character to upgrade ${card.name_fr} over.`,
            descriptionKey: canFreshPlay ? 'game.effect.desc.effectPlayUpgradeChoice' : 'game.effect.desc.effectUpgradeChoice',
            descriptionParams: { card: card.name_fr },
            options: validTargets,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effectId,
          }];
          return state;
        }
      }
      // No affordable upgrades (or single forced upgrade with name conflict) — fall through
    }

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],
        // Upgrading a controlled character locks control permanently (Ino rule)
        controllerInstanceId: existing.controllerInstanceId && existing.controlledBy === player ? undefined : existing.controllerInstanceId,
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      // Calculate actual upgrade cost with reduction
      const eTopGpm = existing.stack?.length > 0 ? existing.stack[existing.stack?.length - 1] : existing.card;
      const actualCost = Math.max(0, ((card.chakra ?? 0) - (eTopGpm.chakra ?? 0)) - costReduction);
      if (ps.chakra < actualCost) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost;

      state.log = logAction(
        state.log, state.turn, 'action', player,
        'EFFECT_UPGRADE',
        `${cardName} (${cardId}): Upgraded ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (reduced by ${costReduction}).`,
        'game.log.effect.upgradeFromHand',
        { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    } else {
      // Safety check: ensure no same-name visible character exists (name uniqueness)
      const hasNameConflict = mission[friendlySide].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflict) {
        // Can't place â€' discard instead of creating a duplicate
        ps.discardPile.push(card);
        state.log = logAction(
          state.log, state.turn, 'action', player,
          'EFFECT_BLOCKED',
          `${cardName} (${cardId}): Cannot play ${card.name_fr} on mission ${missionIndex + 1} â€' same name already present.`,
          'game.log.effect.nameConflictBlocked',
          { card: cardName, id: cardId, target: card.name_fr },
        );
        return state;
      }

      // Calculate fresh play cost with reduction
      const actualCost = Math.max(0, (card.chakra ?? 0) - costReduction);
      if (ps.chakra < actualCost) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost;

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
        'EFFECT', `${cardName} (${cardId}): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (reduced by ${costReduction}).`,
        'game.log.effect.playSummon',
        { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    }

    // Trigger the placed card's MAIN effects (and UPGRADE if it was an upgrade)
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

    // Trigger opponent's continuous on-play reactions (e.g., Hinata 031 chakra, Neji 037 powerup)
    if (!placedChar.isHidden) {
      state = triggerOnPlayReactions(state, player, missionIndex, false, placedChar.instanceId);
    }

    return state;
  }

  /**
   * Place a card on a mission with an explicit choice: fresh play or upgrade over a specific target.
   * Called after the player responds to EFFECT_PLAY_UPGRADE_OR_FRESH.
   */
  private static genericPlaceOnMissionForced(
    state: GameState, player: PlayerID, missionIndex: number,
    cardName: string, cardId: string, costReduction: number,
    doUpgrade: boolean, upgradeTargetId?: string,
  ): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };
    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (doUpgrade && upgradeTargetId) {
      const existingIdx = mission[friendlySide].findIndex(c => c.instanceId === upgradeTargetId);
      if (existingIdx === -1) { ps.discardPile.push(card); return state; }
      const existing = mission[friendlySide][existingIdx];
      const eTop = existing.stack?.length > 0 ? existing.stack[existing.stack?.length - 1] : existing.card;

      // Safety: check post-upgrade name conflict for flex upgrades
      const isSameNameUpgrade = eTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      if (!isSameNameUpgrade) {
        const wouldConflict = mission[friendlySide].some((c: CharacterInPlay) => {
          if (c.instanceId === upgradeTargetId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
        });
        if (wouldConflict) { ps.discardPile.push(card); return state; }
      }

      const actualCost = Math.max(0, ((card.chakra ?? 0) - (eTop.chakra ?? 0)) - costReduction);
      if (ps.chakra < actualCost) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost;

      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing, card: card as any, stack: [...existing.stack, card as any],
        controllerInstanceId: existing.controllerInstanceId && existing.controlledBy === player ? undefined : existing.controllerInstanceId,
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      state.log = logAction(state.log, state.turn, 'action', player,
        'EFFECT_UPGRADE', `${cardName} (${cardId}): Upgraded ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra.`,
        'game.log.effect.upgradeFromHand', { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) });
    } else {
      // Fresh play — verify no name conflict
      const hasNameConflictFresh = mission[friendlySide].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflictFresh) { ps.discardPile.push(card); return state; }

      const actualCost = Math.max(0, (card.chakra ?? 0) - costReduction);
      if (ps.chakra < actualCost) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost;

      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(), card: card as any, isHidden: false,
        wasRevealedAtLeastOnce: true, powerTokens: 0, stack: [card as any],
        controlledBy: player, originalOwner: player, missionIndex,
      };
      mission[friendlySide] = [...mission[friendlySide], charInPlay];
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = charInPlay;
      ps.charactersInPlay = EffectEngine.countCharsForPlayer(state, player);

      state.log = logAction(state.log, state.turn, 'action', player,
        'EFFECT', `${cardName} (${cardId}): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra.`,
        'game.log.effect.playSummon', { card: cardName, id: cardId, target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) });
    }

    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

    // Trigger opponent's continuous on-play reactions (e.g., Hinata 031 chakra, Neji 037 powerup)
    if (!placedChar.isHidden) {
      state = triggerOnPlayReactions(state, player, missionIndex, false, placedChar.instanceId);
    }

    return state;
  }

  /** Public wrapper for moveCharToMissionDirect.
   *  effectInitiator: the player who initiated the move effect (defaults to charOwner).
   */
  static moveCharToMissionDirectPublic(
    state: GameState, charInstanceId: string, destMissionIndex: number,
    charOwner: PlayerID, effectCardName: string, effectCardId: string,
    effectInitiator?: PlayerID,
  ): GameState {
    return EffectEngine.moveCharToMissionDirect(state, charInstanceId, destMissionIndex, charOwner, effectCardName, effectCardId, effectInitiator);
  }

  /** Jiraiya 007: play a Summon card from hand. targetId format: "cardIndex:missionIndex" */
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

    // Remove from hand (cost deferred to genericPlaceOnMission)
    ps.hand.splice(cardIndex, 1);

    // Store in discard temporarily for genericPlaceOnMission to recover
    ps.discardPile.push(card);

    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'Jiraya', pending.sourceCardId ?? 'KS-007-C', 1);
  }

  /** Kimimaro step 2: hide the selected target character */
  static kimimaroDiscardAndHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    // targetId is now just an instanceId (discard was already done in step 1)
    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return newState;

    const topCard = charResult.character.stack?.length > 0
      ? charResult.character.stack[charResult.character.stack?.length - 1]
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
      // Enemy chars â€' check immunity
      for (const char of mission[enemySide]) {
        if (char.isHidden) continue;
        if (!canBeHiddenByEnemy(newState, char, opponent)) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
      // Friendly chars â€' no immunity check needed (Kimimaro CAN hide itself)
      for (const char of mission[friendlySide]) {
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
    }

    if (validHideTargets.length === 0) {
      return newState; // No valid target â€' card was discarded but no hide
    }

    if (validHideTargets.length === 1) {
      // Auto-hide the only valid target (use hideCharacterWithLog for protection checks)
      return EffectEngine.hideCharacterWithLog(newState, validHideTargets[0], player);
    }

    // Multiple targets â€' create a new pending for hide target selection
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
      isOptional: false,
      isMandatory: true,
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
  // Haku 088 â€' Draw 1, put 1 back (two-step)
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

  /**
   * Haku 089: Discard top card from target player's deck, POWERUP X on self.
   * Shared between base MAIN (opponent deck) and UPGRADE modifier (own deck).
   */
  static haku089DiscardAndPowerup(state: GameState, pending: PendingEffect, discardFromPlayer: PlayerID, missionIndex: number): GameState {
    const newState = deepClone(state);
    const sourcePlayer = pending.sourcePlayer;
    const ps = newState[discardFromPlayer];

    if (ps.deck.length === 0) return newState;

    const discardedCard = ps.deck.shift()!;
    ps.discardPile.push(discardedCard);

    const powerupAmount = discardedCard.chakra || 0;

    // POWERUP on self
    const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const mission = newState.activeMissions[missionIndex];
    if (mission && powerupAmount > 0) {
      const charIdx = mission[friendlySide].findIndex((c: CharacterInPlay) => c.instanceId === pending.sourceInstanceId);
      if (charIdx !== -1) {
        mission[friendlySide] = [...mission[friendlySide]];
        mission[friendlySide][charIdx] = {
          ...mission[friendlySide][charIdx],
          powerTokens: mission[friendlySide][charIdx].powerTokens + powerupAmount,
        };
        newState.activeMissions = [...newState.activeMissions];
        newState.activeMissions[missionIndex] = { ...mission };
      }
    }

    const deckOwner = discardFromPlayer === sourcePlayer ? 'own' : "opponent's";
    const upgradeNote = discardFromPlayer === sourcePlayer ? ' (upgrade - own deck)' : '';
    newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_DISCARD_AND_POWERUP',
      `Haku (089): Discarded ${discardedCard.name_fr} (cost ${discardedCard.chakra}) from ${deckOwner} deck. POWERUP ${powerupAmount}${upgradeNote}.`,
      'game.log.effect.discardPowerup',
      { card: 'HAKU', id: 'KS-089-UC', target: discardedCard.name_fr, amount: String(powerupAmount) });

    return newState;
  }

  // =====================================
  // MSS 08 â€' Set a Trap (two-stage)
  // =====================================

  /** MSS 08 Stage 1: player chose which card from hand. Store it and prompt for mission. */
  static mss08ChooseCard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    // Remove card from hand — store it directly in pending effect description
    // (NOT in discard pile, to prevent information leak)
    const chosenCard = ps.hand.splice(handIndex, 1)[0];

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
      effectDescription: JSON.stringify({ cardName: chosenCard.name_fr, cardId: chosenCard.id, storedCard: chosenCard }),
      targetSelectionType: 'MSS08_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: missionIndices,
      isOptional: false,
      isMandatory: true,
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

    // Recover the card stored in the pending effect description (not in discard pile)
    let chosenCard: any = null;
    try {
      const parsed = JSON.parse(pending.effectDescription || '{}');
      chosenCard = parsed.storedCard || null;
    } catch { /* fallback */ }
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
  // MSS 03 â€' Find the Traitor (opponent discard)
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
  // MSS 05 â€' Bring it Back (return to hand)
  // =====================================

  /** MSS 05: Player chose a character to return to hand. */
  // =====================================
  // Kimimaro 056 â€' Continuous protection
  // =====================================

  /**
   * Check if the target of an effect is Kimimaro 056 with the continuous protection.
   * If so, the opponent (effect source) must pay 1 chakra if able.
   */
  static applyKimimaro056Protection(state: GameState, pending: PendingEffect, targetId: string): { state: GameState; blocked: boolean } {
    // Find the targeted character across all missions
    for (const mission of state.activeMissions) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (char.instanceId !== targetId) continue;
          if (char.isHidden) return { state, blocked: false }; // Hidden = no continuous effects

          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.number !== 56) return { state, blocked: false };

          // Check if this card has the continuous protection effect
          const hasProtection = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('chakra'),
          );
          if (!hasProtection) return { state, blocked: false };

          // Only triggers for enemy effects (not friendly)
          const charOwner = char.controlledBy;
          if (charOwner === pending.sourcePlayer) return { state, blocked: false }; // Friendly effect, no protection

          // Opponent must pay 1 chakra to affect Kimimaro. If they can't pay, the effect is CANCELLED.
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
            return { state, blocked: false };
          } else {
            // Can't pay - effect is cancelled
            state.log = logAction(
              state.log, state.turn, state.phase, charOwner,
              'EFFECT_CONTINUOUS',
              `Kimimaro (056): ${opponent} cannot pay 1 Chakra - effect on Kimimaro is cancelled.`,
              'game.log.effect.kimimaro056Blocked',
              { card: 'KIMIMARO', id: 'KS-056-UC' },
            );
            return { state, blocked: true };
          }
        }
      }
    }
    return { state, blocked: false };
  }

  // =====================================
  // Hiruzen 002 â€' Place chosen Leaf character
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
    // Cost deferred to placement time (upgrade vs fresh play)

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...newState.activeMissions];
    const mission = { ...missions[missionIdx] };

    // Check if there's an upgrade target (same-name or flexible cross-name)
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

    // Check if fresh play is also possible (no same-name conflict)
    const hasNameConflict_k053 = hasSameNameConflict(mission[friendlySide], card);

    // If upgrade AND fresh play are both possible, let the player choose
    if (existingIdx >= 0 && !hasNameConflict_k053) {
      // Find ALL affordable upgrade targets (there could be multiple)
      const upgradeTargetIds_k053: string[] = [];
      for (let i = 0; i < mission[friendlySide].length; i++) {
        const c = mission[friendlySide][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          // Only include if the upgrade is affordable
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - 3);
          if (ps.chakra >= upgCost) upgradeTargetIds_k053.push(c.instanceId);
        }
      }

      // If there are affordable upgrade targets, offer the choice
      if (upgradeTargetIds_k053.length > 0) {
        // Push card back to discard (will be re-popped when choice is resolved)
        ps.discardPile.push(card);

        // Create pending effect for the choice
        const effectId_k053 = `kabuto053-upgrade-choice-${generateInstanceId()}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId_k053,
          sourceCardId: 'KS-053-UC',
          sourceInstanceId: '',
          sourceMissionIndex: missionIdx,
          effectType: 'MAIN' as EffectType,
          effectDescription: JSON.stringify({ cardName: 'KABUTO YAKUSHI', cardId: 'KS-053-UC', costReduction: 3, missionIndex: missionIdx }),
          targetSelectionType: 'EFFECT_PLAY_UPGRADE_OR_FRESH',
          sourcePlayer: player,
        requiresTargetSelection: true,
        validTargets: ['FRESH', ...upgradeTargetIds_k053],
        isOptional: false,
        isMandatory: true,
        resolved: false,
        isUpgrade: false,
        description: `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`,
        descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
        descriptionParams: { card: card.name_fr },
      } as PendingEffect];

        newState.pendingActions = [...newState.pendingActions, {
          id: generateInstanceId(),
          type: 'SELECT_TARGET',
          player,
          originPlayer: player,
          description: `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`,
          descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
          descriptionParams: { card: card.name_fr },
          options: ['FRESH', ...upgradeTargetIds_k053],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId_k053,
        }];
        return newState;
      }
      // No affordable upgrades — fall through to fresh play
    }

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existing.stack, card],
        controllerInstanceId: existing.controllerInstanceId && existing.controlledBy === player ? undefined : existing.controllerInstanceId,
      };
      mission[friendlySide] = updatedChars;
      missions[missionIdx] = mission;
      newState.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;


      // Calculate actual upgrade cost with reduction
      const existingTop_k053 = existing.stack?.length > 0 ? existing.stack[existing.stack?.length - 1] : existing.card;
      const actualCost = Math.max(0, ((card.chakra ?? 0) - (existingTop_k053.chakra ?? 0)) - 3);
      if (ps.chakra < actualCost) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost;
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT_UPGRADE',
        `Kabuto Yakushi (053): Upgraded ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${actualCost} chakra (3 less).`,
        'game.log.effect.upgradeFromDiscard',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr, mission: String(missionIdx + 1), cost: String(cost) },
      );
    } else {
      // Safety check: name uniqueness
      if (hasNameConflict_k053) {
        ps.discardPile.push(card);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, player,
          'EFFECT_BLOCKED',
          `Kabuto Yakushi (053): Cannot play ${card.name_fr} on mission ${missionIdx + 1} - same name already present.`,
          'game.log.effect.nameConflictBlocked',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr },
        );
        return newState;
      }

      // Calculate fresh play cost with reduction
      const actualCost_fresh = Math.max(0, (card.chakra ?? 0) - 3);
      if (ps.chakra < actualCost_fresh) { ps.discardPile.push(card); return state; }
      ps.chakra -= actualCost_fresh;

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

      ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

      newState.log = logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT',
        `Kabuto Yakushi (053): Played ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${actualCost_fresh} chakra (3 less).`,
        'game.log.effect.playFromDiscard',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr, mission: String(missionIdx + 1), cost: String(actualCost_fresh) },
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

    // Check if there's an upgrade target (same-name or flexible cross-name)
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide_h002], card);

    // Check if fresh play is also possible (no same-name conflict)
    const hasNameConflict_h002 = hasSameNameConflict(mission[friendlySide_h002], card);

    // Safety check: name conflict without upgrade possibility
    if (existingIdx < 0 && hasNameConflict_h002) return state;

    // If upgrade AND fresh play are both possible, let the player choose
    if (existingIdx >= 0 && !hasNameConflict_h002) {
      // Find ALL affordable upgrade targets (there could be multiple)
      const upgradeTargetIds_h002: string[] = [];
      for (let i = 0; i < mission[friendlySide_h002].length; i++) {
        const c = mission[friendlySide_h002][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          // Only include if the upgrade is affordable (Hiruzen gives -1 reduction)
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - 1);
          if (ps.chakra >= upgCost) upgradeTargetIds_h002.push(c.instanceId);
        }
      }

      // If there are affordable upgrade targets, offer the choice
      if (upgradeTargetIds_h002.length > 0) {
        // Card is still in hand (splice hasn't happened yet) - it will be removed when the choice resolves.

        // Create pending effect for the choice
        const effectId_h002 = `hiruzen002-upgrade-choice-${generateInstanceId()}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId_h002,
          sourceCardId: 'KS-002-UC',
          sourceInstanceId: pending.sourceInstanceId,
          sourceMissionIndex: missionIndex,
          effectType: 'MAIN' as EffectType,
          effectDescription: JSON.stringify({ cardIndex, missionIndex }),
          targetSelectionType: 'HIRUZEN002_UPGRADE_OR_FRESH',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: ['FRESH', ...upgradeTargetIds_h002],
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: pending.isUpgrade,
          remainingEffectTypes: pending.remainingEffectTypes,
          description: `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`,
          descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
          descriptionParams: { card: card.name_fr },
        } as PendingEffect];

        newState.pendingActions = [...newState.pendingActions, {
          id: generateInstanceId(),
          type: 'SELECT_TARGET',
          player,
          description: `Choose: play ${card.name_fr} as a new character, or upgrade over an existing one?`,
          descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
          descriptionParams: { card: card.name_fr },
          options: ['FRESH', ...upgradeTargetIds_h002],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId_h002,
        }];
        return newState;
      }
      // No affordable upgrades — fall through to fresh play
    }

    // Compute actual cost: for upgrades pay (diff - 1), for fresh play pay (cost - 1)
    let actualCost: number;
    if (existingIdx >= 0) {
      const existing_h002 = mission[friendlySide_h002][existingIdx];
      const existStack_h002p = existing_h002.stack ?? [existing_h002.card];
      const existingTop_h002 = existStack_h002p.length > 0
        ? existStack_h002p[existStack_h002p.length - 1]
        : existing_h002.card;
      actualCost = Math.max(0, (card.chakra - (existingTop_h002?.chakra ?? 0)) - 1);
    } else {
      actualCost = Math.max(0, card.chakra - 1);
    }
    if (ps.chakra < actualCost) return state;

    // Pay cost
    ps.chakra -= actualCost;
    ps.hand.splice(cardIndex, 1);

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      // Upgrade the existing character (stack new card on top)
      const existing = mission[friendlySide_h002][existingIdx];
      const existStackPlace = existing.stack ?? [existing.card];
      const updatedChars = [...mission[friendlySide_h002]];
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existStackPlace, card],
        powerTokens: existing.powerTokens,
        controllerInstanceId: existing.controllerInstanceId && existing.controlledBy === player ? undefined : existing.controllerInstanceId,
      };
      mission[friendlySide_h002] = updatedChars;
      missions[missionIndex] = mission;
      newState.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      newState.log = logAction(
        newState.log, newState.turn, 'action', player,
        'EFFECT_UPGRADE',
        `Hiruzen Sarutobi (002): Upgraded ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (diff-1).`,
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
        powerTokens: 0,
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

      newState.log = logAction(
        newState.log, newState.turn, 'action', player,
        'EFFECT',
        `Hiruzen Sarutobi (002): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (1 less).`,
        'game.log.effect.playLeafReduced',
        { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    }

    // Track the placed character for Hiruzen 002 UPGRADE (POWERUP 2)
    (newState as any)._hiruzen002PlayedCharId = placedChar.instanceId;

    // Resolve the played card's MAIN effects (and UPGRADE if it was a card-level upgrade)
    return EffectEngine.resolvePlayEffects(newState, player, placedChar, missionIndex, isCardUpgrade);
  }

  // =====================================
  // MSS 05 â€' Bring it Back
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

    // Return only the top card to hand; discard underlying stack cards
    const ps = newState[player];
    const topCard = target.stack?.length > 0 ? target.stack[target.stack?.length - 1] : target.card;
    const underCards = target.stack?.length > 1 ? target.stack.slice(0, -1) : [];
    ps.hand = [...ps.hand, topCard];
    ps.discardPile = [...ps.discardPile, ...underCards];
    ps.charactersInPlay = Math.max(0, ps.charactersInPlay - 1);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'SCORE_RETURN',
      `MSS 05 (Bring it Back): Returned ${topCard.name_fr} to hand (mandatory).`,
      'game.log.score.returnToHand',
      { card: 'Ramener', target: topCard.name_fr },
    );

    return newState;
  }

  // =====================================
  // MSS 07 â€' I Have to Go (move hidden, two-stage)
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
      isOptional: false,
      isMandatory: true,
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
  // Jiraiya 007 â€' Play Summon (two-stage)
  // =====================================

  /** Jiraiya Stage 1: player chose a Summon card from hand. Store it and prompt for mission. */
  static jiraiyaChooseSummon(state: GameState, pending: PendingEffect, targetId: string): GameState {
    // Handle hidden character reveal
    if (targetId.startsWith('HIDDEN_')) {
      return EffectEngine.revealHiddenWithReduction(state, pending, targetId.slice(7), 1);
    }
    // Strip HAND_ prefix if present
    const rawId = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
    // Delegate to the generic handler which supports upgrade-or-fresh choice
    return EffectEngine.playCharFromHandWithReduction(
      state, pending, rawId, 1, 'Summon', 'Jiraya', pending.sourceCardId ?? 'KS-007-C',
    );
  }

  /** Jiraiya Stage 2: player chose a mission. Place the Summon there. */
  static jiraiyaChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let costReduction = 0;
    try {
      const desc = JSON.parse(pending.effectDescription);
      costReduction = desc.costReduction ?? 0;
    } catch { /* ignore */ }
    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'Jiraya', pending.sourceCardId ?? '', costReduction);
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

    // Check if there's an upgrade target (same-name or flexible cross-name)
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

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
  // Asuma 023 â€' Move Team 10 (two-stage)
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
      isOptional: false,
      isMandatory: true,
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
  // Iruka 047 â€' Move Naruto (two-stage)
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
      isOptional: false,
      isMandatory: true,
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
  // Kidomaru 059 â€' Multi-move (multi-stage)
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
      isOptional: false,
      isMandatory: true,
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
      isOptional: false,
      isMandatory: true,
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
  // Sakura 109 (R) â€' Play from discard (two-stage)
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

    // Cost deferred to placement time (upgrade vs fresh play)
    ps.discardPile.splice(discardIndex, 1);

    // Find valid missions
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      if (isMissionValidForPlay(mission, friendlySide, chosenCard, ps.chakra, costReduction)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) {
      // Refund
      ps.discardPile.push(chosenCard);
      return state;
    }

    // Store card temporarily in discard pile end for genericPlaceOnMission to recover
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.genericPlaceOnMission(newState, player, parseInt(validMissions[0], 10), 0, 'SAKURA HARUNO', 'KS-109-R', costReduction);
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();

    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost: 0, cardName: 'SAKURA HARUNO', cardId: 'KS-109-R', costReduction }),
      targetSelectionType: 'GENERIC_CHOOSE_PLAY_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: false,
      isMandatory: true,
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

  /** Sakura 109 Stage 2 (legacy compat): redirect to genericPlaceOnMission. */
  static sakura109ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let costReduction = 0;
    try { const d = JSON.parse(pending.effectDescription); costReduction = d.costReduction ?? 0; } catch { /* ignore */ }
    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'SAKURA HARUNO', 'KS-109-R', costReduction);
  }

  // sakura109Place removed - now uses genericPlaceOnMission via sakura109ChooseMission

  // =====================================
  // Sakura 135 (S) â€' Top 3 cards (two-stage)
  // =====================================

  /** Sakura 135 Stage 1: player chose a card from the top 3. Discard others, prompt for mission. */
  static sakura135ChooseCard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const cardIndex = parseInt(targetId, 10);
    if (isNaN(cardIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    let costReduction = 0;
    let storedCards: any[] = [];
    try {
      const parsed = JSON.parse(pending.effectDescription);
      costReduction = parsed.costReduction ?? 0;
      storedCards = parsed.storedCards ?? [];
    } catch { /* ignore */ }

    // Recover drawn cards from storedCards in description (reliable, not affected by discard pile changes)
    // Fallback: try _sakura135DrawnCards temp field, then discard pile (legacy)
    let drawnCards: any[] = storedCards;
    if (drawnCards.length === 0) {
      drawnCards = (newState as any)._sakura135DrawnCards ?? [];
      delete (newState as any)._sakura135DrawnCards;
    }
    if (drawnCards.length === 0) {
      // Legacy fallback: read from discard pile
      let topCardsInfo: any[] = [];
      try { topCardsInfo = JSON.parse(pending.effectDescription).topCards ?? []; } catch { /* ignore */ }
      const numDrawn = topCardsInfo.length;
      if (numDrawn > 0) {
        drawnCards = ps.discardPile.splice(ps.discardPile.length - numDrawn, numDrawn);
      }
    }

    if (cardIndex < 0 || cardIndex >= drawnCards.length) return state;

    const chosenCard = drawnCards[cardIndex];
    const otherCards = drawnCards.filter((_: any, i: number) => i !== cardIndex);

    // Store chosen card FIRST (before discards) so it's not affected by reorder
    ps.discardPile.push(chosenCard);

    // Discard the non-chosen cards AFTER the chosen card (assign instanceIds for reorder tracking)
    for (let oi = 0; oi < otherCards.length; oi++) {
      const oc = otherCards[oi];
      ps.discardPile.push({ ...oc, instanceId: (oc as any).instanceId || (oc as any).id + `-discard-${oi}` } as any);
    }

    // If 2+ cards discarded, show reorder popup FIRST, then chain to placement
    if (otherCards.length >= 2) {
      const chainData = { sakura135Chain: true, costReduction, cardName: chosenCard.name_fr };
      return EffectEngine.createReorderDiscardPending(newState, player, player, otherCards.length, player, chainData);
    }

    // No reorder needed — proceed to placement directly
    return EffectEngine.sakura135ContinuePlacement(newState, player, chosenCard, costReduction, pending);
  }

  /** Sakura 135: continue placement after optional reorder. */
  static sakura135ContinuePlacement(
    state: GameState, player: PlayerID, chosenCard: any, costReduction: number,
    pending: PendingEffect,
  ): GameState {
    const newState = state;
    const ps = newState[player];
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      if (isMissionValidForPlay(mission, friendlySide, chosenCard, ps.chakra, costReduction)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) {
      return newState;
    }

    if (validMissions.length === 1) {
      return EffectEngine.genericPlaceOnMission(newState, player, parseInt(validMissions[0], 10), 0, 'SAKURA HARUNO', 'KS-135-S', costReduction);
    }

    const effectId = generateInstanceId();
    const actionId = generateInstanceId();
    newState.pendingEffects.push({
      id: effectId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({ cost: 0, cardName: 'SAKURA HARUNO', cardId: 'KS-135-S', costReduction }),
      targetSelectionType: 'SAKURA135_CHOOSE_MISSION',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: validMissions,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: costReduction > 0,
    });
    newState.pendingActions.push({
      id: actionId,
      type: 'SELECT_TARGET',
      player,
      originPlayer: player,
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

  /** Sakura 135 Stage 2 (legacy compat): redirect to genericPlaceOnMission. */
  static sakura135ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let costReduction = 0;
    try { const d = JSON.parse(pending.effectDescription); costReduction = d.costReduction ?? 0; } catch { /* ignore */ }
    // Place the card — this may create pending effects for the played card's MAIN/UPGRADE
    // Don't add REORDER_DISCARD here — it conflicts with the played card's pending effects
    // The discarded cards are already in the pile and their order was set when discarded
    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'SAKURA HARUNO', 'KS-135-S', costReduction);
  }

  // =====================================
  // Choji 112 (R) â€' Discard + POWERUP
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

    // If upgrade and hand is not empty, show CONFIRM popup for the UPGRADE repeat
    if (pending.isUpgrade && ps.hand.length > 0) {
      const effectId = generateInstanceId();
      const actionId = generateInstanceId();

      newState.pendingEffects.push({
        id: effectId,
        sourceCardId: pending.sourceCardId,
        sourceInstanceId: pending.sourceInstanceId,
        sourceMissionIndex: pending.sourceMissionIndex,
        effectType: pending.effectType,
        effectDescription: '',
        targetSelectionType: 'CHOJI112_CONFIRM_UPGRADE',
        sourcePlayer: player,
        requiresTargetSelection: true,
        validTargets: [pending.sourceInstanceId],
        isOptional: true,
        isMandatory: false,
        resolved: false,
        isUpgrade: false,
      });

      newState.pendingActions.push({
        id: actionId,
        type: 'SELECT_TARGET',
        player,
        description: 'Choji Akimichi (112) UPGRADE: Repeat MAIN? Discard another card for POWERUP.',
        descriptionKey: 'game.effect.desc.choji112ConfirmUpgrade',
        options: [pending.sourceInstanceId],
        minSelections: 1,
        maxSelections: 1,
        sourceEffectId: effectId,
      });
    }

    return newState;
  }

  // =====================================
  // Ino 020 â€' Take control of enemy character
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
          `Ino Yamanaka (020): Cannot take control of ${charResult.character.card.name_fr} â€' a character with the same name already exists on your side of this mission.`,
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

    const targetChar = { ...mission[enemySide][targetIdx], controlledBy: player, controllerInstanceId: pending.sourceInstanceId };
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
  // Itachi 143 (M) â€' Move character to this mission
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
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, opponent, 'Itachi Uchiwa', 'KS-143-M', player);
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

  /** Move a character (by instanceId) to a specific mission. Used by multiple handlers.
   *  effectInitiator: the player who initiated the move effect (defaults to charOwner).
   *  Used by Choji 018 trigger to determine if the move was initiated by Choji's controller.
   */
  private static moveCharToMissionDirect(
    state: GameState,
    charInstanceId: string,
    destMissionIndex: number,
    charOwner: PlayerID,
    effectCardName: string,
    effectCardId: string,
    effectInitiator?: PlayerID,
  ): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, charInstanceId);
    if (!charResult) return state;
    if (charResult.missionIndex === destMissionIndex) return state;

    // Enforce same-name-per-mission rule (FAQ: if forced by an effect, discard the moved character)
    if (!EffectEngine.validateNameUniquenessForMove(state, charResult.character, destMissionIndex, charResult.player)) {
      // Before discarding, return any characters this one was controlling
      state = EffectEngine.restoreControlOnLeave(state, charInstanceId);
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
        const cardsToDiscard = discardedChar.stack?.length > 0 ? [...discardedChar.stack] : [discardedChar.card];
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

    // Check Gaara 075 continuous protection: if moved by enemy effects, hide instead
    const moveInitiator = effectInitiator ?? charOwner;
    if (moveInitiator !== charResult.player) {
      // This is an enemy effect moving the character
      const topCard = charResult.character.stack?.length > 0
        ? charResult.character.stack[charResult.character.stack?.length - 1]
        : charResult.character.card;
      if (topCard.number === 75 && !charResult.character.isHidden) {
        const hasMoveProtection = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moved or defeated'),
        );
        if (hasMoveProtection) {
          state.log = logAction(
            state.log, state.turn, state.phase, charOwner,
            'EFFECT',
            `Gaara (075): Would be moved by ${effectCardName} (${effectCardId}) — hidden instead.`,
            'game.log.effect.gaara075HideOnMove',
            { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr },
          );
          return EffectEngine.hideCharacter(state, charInstanceId);
        }
      }
    }

    // Kurenai 035 (UC): ENEMY characters cannot move from this mission
    // Only blocks characters that are enemies relative to Kurenai's controller
    {
      const sourceMission = state.activeMissions[charResult.missionIndex];
      const allCharsInMission = [...sourceMission.player1Characters, ...sourceMission.player2Characters];
      for (const ch of allCharsInMission) {
        if (ch.isHidden) continue;
        const chTop = ch.stack?.length > 0 ? ch.stack[ch.stack?.length - 1] : ch.card;
        if (chTop.number === 35) {
          const hasRestriction = (chTop.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && (e.description.includes('cannot move') || e.description.includes("can't be moved")),
          );
          if (hasRestriction) {
            // Determine Kurenai's controller
            const kurenaiOwner = sourceMission.player1Characters.some(c => c.instanceId === ch.instanceId) ? 'player1' : 'player2';
            // Only block if the character being moved is an ENEMY of Kurenai's controller
            if (charResult.player !== kurenaiOwner) {
              state.log = logAction(
                state.log, state.turn, state.phase, charOwner,
                'EFFECT_BLOCKED',
                `${effectCardName} (${effectCardId}): Cannot move ${charResult.character.card.name_fr} - Kurenai blocks enemy movement from this mission.`,
                'game.log.effect.moveBlocked',
                { card: effectCardName, id: effectCardId, target: charResult.character.card.name_fr },
              );
              return state;
            }
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
    // If Rashomon moves, clear its locked target so it retargets in the new mission
    const movedChar = { ...charResult.character, missionIndex: destMissionIndex };
    const movedTop = movedChar.stack?.length > 0 ? movedChar.stack[movedChar.stack?.length - 1] : movedChar.card;
    if (movedTop.number === 67 && movedChar.rempartLockedTargetId) {
      movedChar.rempartLockedTargetId = undefined;
    }
    destMission[friendlySide] = [...destMission[friendlySide], movedChar];
    missions[destMissionIndex] = destMission;

    state.activeMissions = missions;
    // If the moved character is hidden, don't reveal its name in the log
    const movedCharName = charResult.character.isHidden ? '???' : charResult.character.card.name_fr;
    state.log = logAction(
      state.log, state.turn, state.phase, charOwner,
      'EFFECT_MOVE',
      `${effectCardName} (${effectCardId}): Moved ${movedCharName} from mission ${charResult.missionIndex + 1} to mission ${destMissionIndex + 1}.`,
      'game.log.effect.move',
      { card: effectCardName, id: effectCardId, target: movedCharName, mission: `mission ${destMissionIndex + 1}` },
    );

    // Check Ninja Hounds 100 trigger
    state = checkNinjaHoundsTrigger(state, movedChar, destMissionIndex, charOwner);

    // Check Choji 018 post-move hide trigger (only on friendly moves)
    // effectInitiator tracks who initiated the move; charResult.player is the character's controller
    state = checkChoji018PostMoveTrigger(state, movedChar, destMissionIndex, effectInitiator ?? charOwner, charResult.player);

    // Re-apply Rashomon token removal — moving may change which character is strongest
    state = applyRempartTokenRemoval(state);

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

    const copierTopCard = copierResult.character.stack?.length > 0
      ? copierResult.character.stack[copierResult.character.stack?.length - 1]
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
  /**
   * Reveal a hidden character on the board with a cost reduction.
   * Pays reduced cost, sets isHidden=false, triggers resolveRevealEffects (MAIN + AMBUSH).
   * Optionally applies POWERUP (e.g., Hiruzen 002 upgrade gives +2 power tokens).
   */
  static revealHiddenWithReduction(
    state: GameState,
    pending: PendingEffect,
    instanceId: string,
    costReduction: number,
    powerUpBonus: number = 0,
  ): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    const charResult = EffectEngine.findCharByInstanceId(newState, instanceId);
    if (!charResult || !charResult.character.isHidden) return state;

    const char = charResult.character;
    const mIdx = charResult.missionIndex;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

    // Check if revealing this card would be an upgrade (same-name or flexible cross-name)
    const friendlySideRhr = player === "player1" ? "player1Characters" : "player2Characters";
    const missionRhr = newState.activeMissions[mIdx];

    // Find ALL affordable upgrade targets (not just the first)
    const allUpgradeTargets: string[] = [];
    for (const c of missionRhr[friendlySideRhr]) {
      if (c.instanceId === instanceId || c.isHidden) continue;
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      const isSameName = cTop.name_fr.toUpperCase() === topCard.name_fr.toUpperCase() && (topCard.chakra ?? 0) > (cTop.chakra ?? 0);
      const isFlex = checkFlexibleUpgrade(topCard as any, cTop) && (topCard.chakra ?? 0) > (cTop.chakra ?? 0);
      if (isSameName || isFlex) {
        const upgCost = Math.max(0, ((topCard.chakra ?? 0) - (cTop.chakra ?? 0)) - costReduction);
        if (ps.chakra >= upgCost) allUpgradeTargets.push(c.instanceId);
      }
    }

    // Check if fresh play is possible (no name conflict)
    const hasNameConflictRhr = missionRhr[friendlySideRhr].some((c: CharacterInPlay) => {
      if (c.isHidden || c.instanceId === instanceId) return false;
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return cTop.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
    });
    const freshCost = Math.max(0, (topCard.chakra ?? 0) - costReduction);
    const canFreshPlay = !hasNameConflictRhr && ps.chakra >= freshCost;

    // If both upgrade and fresh play are possible, let the player choose
    if (allUpgradeTargets.length > 0 && canFreshPlay) {
      // Put the card data back — don't reveal yet, wait for choice
      const choiceEffId = generateInstanceId();
      const choiceActId = generateInstanceId();
      const validOpts = ['FRESH', ...allUpgradeTargets];
      newState.pendingEffects.push({
        id: choiceEffId, sourceCardId: pending.sourceCardId,
        sourceInstanceId: pending.sourceInstanceId, sourceMissionIndex: mIdx,
        effectType: pending.effectType,
        effectDescription: JSON.stringify({ hiddenInstanceId: instanceId, costReduction, powerUpBonus }),
        targetSelectionType: 'REVEAL_HIDDEN_UPGRADE_OR_FRESH',
        sourcePlayer: player, requiresTargetSelection: true,
        validTargets: validOpts, isOptional: false, isMandatory: true,
        resolved: false, isUpgrade: false,
      });
      newState.pendingActions.push({
        id: choiceActId, type: 'SELECT_TARGET' as PendingAction['type'],
        player,
        description: `Play ${topCard.name_fr} normally or upgrade?`,
        descriptionKey: 'game.effect.desc.effectPlayUpgradeChoice',
        descriptionParams: { card: topCard.name_fr },
        options: validOpts, minSelections: 1, maxSelections: 1,
        sourceEffectId: choiceEffId,
      });
      return newState;
    }

    // Determine upgrade target (if any, and fresh play not possible)
    const upgradeTargetIdxRhr = findUpgradeTargetIdx(missionRhr[friendlySideRhr], topCard, instanceId);
    const upgradeTargetRhr = upgradeTargetIdxRhr >= 0 ? missionRhr[friendlySideRhr][upgradeTargetIdxRhr] : null;

    let cost: number;
    if (upgradeTargetRhr) {
      const existingTC = upgradeTargetRhr.stack?.length > 0 ? upgradeTargetRhr.stack[upgradeTargetRhr.stack?.length - 1] : upgradeTargetRhr.card;
      cost = Math.max(0, ((topCard.chakra ?? 0) - (existingTC.chakra ?? 0)) - costReduction);
    } else {
      cost = Math.max(0, (topCard.chakra ?? 0) - costReduction);
    }
    if (ps.chakra < cost) return state;
    ps.chakra -= cost;

    // Reveal the character
    char.isHidden = false;
    char.wasRevealedAtLeastOnce = true;

    // Apply POWERUP bonus if any (e.g., Hiruzen 002 UPGRADE)
    if (powerUpBonus > 0) {
      char.powerTokens += powerUpBonus;
    }

    // If there's an upgrade target, stack the revealed card onto it
    let resultChar = char;
    if (upgradeTargetRhr) {
      const missions_rhr = [...newState.activeMissions];
      const m_rhr = { ...missions_rhr[mIdx] };
      const chars_rhr = [...m_rhr[friendlySideRhr]];
      const revealedIdx = chars_rhr.findIndex(c => c.instanceId === instanceId);
      const upgradeIdx_rhr = chars_rhr.findIndex(c => c.instanceId === upgradeTargetRhr.instanceId);
      if (revealedIdx >= 0 && upgradeIdx_rhr >= 0) {
        const revealedCharData = chars_rhr[revealedIdx];
        chars_rhr[upgradeIdx_rhr] = {
          ...chars_rhr[upgradeIdx_rhr],
          card: revealedCharData.card,
          stack: [...chars_rhr[upgradeIdx_rhr].stack, ...revealedCharData.stack],
          powerTokens: chars_rhr[upgradeIdx_rhr].powerTokens + revealedCharData.powerTokens,
          controllerInstanceId: chars_rhr[upgradeIdx_rhr].controllerInstanceId && chars_rhr[upgradeIdx_rhr].controlledBy === player ? undefined : chars_rhr[upgradeIdx_rhr].controllerInstanceId,
        };
        // Remove the revealed character slot (it's now merged)
        chars_rhr.splice(revealedIdx, 1);
        m_rhr[friendlySideRhr] = chars_rhr;
        missions_rhr[mIdx] = m_rhr;
        newState.activeMissions = missions_rhr;
        resultChar = chars_rhr.find(c => c.instanceId === upgradeTargetRhr.instanceId)!;
      }
    }

    newState.log = logAction(
      newState.log, newState.turn, 'action', player,
      'EFFECT',
      `Effect: Revealed ${topCard.name_fr} on mission ${mIdx + 1} for ${cost} chakra (cost reduced by ${costReduction})${upgradeTargetRhr ? ' (auto-upgrade)' : ''}.`,
      'game.log.effect.revealHiddenReduced',
      { card: topCard.name_fr, mission: String(mIdx + 1), cost: String(cost), reduction: String(costReduction) },
    );

    // Update character count
    ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

    // Trigger reveal effects (MAIN + AMBUSH)
    return EffectEngine.resolveRevealEffects(newState, player, resultChar, mIdx);
  }

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

    const topCard = targetChar.stack?.length > 0 ? targetChar.stack[targetChar.stack?.length - 1] : targetChar.card;

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
        const fTopCard = friendly.stack?.length > 0 ? friendly.stack[friendly.stack?.length - 1] : friendly.card;

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

  /**
   * Hiruzen 002 (UC): Queue card choice after confirmation popup.
   * Re-computes affordable Leaf Village targets and creates HIRUZEN002_CHOOSE_CARD pending effect.
   */
  static queueHiruzen002Choose(state: GameState, pending: PendingEffect, isUpgrade: boolean): GameState {
    let newState = { ...state };
    const player = pending.sourcePlayer;
    const playerState = newState[player];
    const costReduction = 1;
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

    // Re-compute affordable Leaf Village characters in hand
    const affordableLeafIndices: string[] = [];
    for (let i = 0; i < playerState.hand.length; i++) {
      const card = playerState.hand[i];
      if (card.group !== 'Leaf Village') continue;
      let canPlace = false;
      for (const mission of newState.activeMissions) {
        const chars = mission[friendlySide];
        let upgradeTarget: CharacterInPlay | undefined;
        for (const c of chars) {
          if (c.isHidden) continue;
          const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          if (topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (topCard.chakra ?? 0)) {
            upgradeTarget = c; break;
          }
        }
        if (!upgradeTarget) {
          for (const c of chars) {
            if (c.isHidden) continue;
            const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            if (checkFlexibleUpgrade(card as any, topCard) && (card.chakra ?? 0) > (topCard.chakra ?? 0)) {
              upgradeTarget = c; break;
            }
          }
        }
        if (upgradeTarget) {
          const existingTop = upgradeTarget.stack?.length > 0
            ? upgradeTarget.stack[upgradeTarget.stack?.length - 1] : upgradeTarget.card;
          const upgradeCost = Math.max(0, (card.chakra - existingTop.chakra) - costReduction);
          if (playerState.chakra >= upgradeCost) { canPlace = true; break; }
        } else {
          const hasNameConflict = chars.some((c) => {
            if (c.isHidden) return false;
            const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
          });
          if (!hasNameConflict) {
            const freshCost = Math.max(0, card.chakra - costReduction);
            if (playerState.chakra >= freshCost) { canPlace = true; break; }
          }
        }
      }
      if (canPlace) affordableLeafIndices.push(`HAND_${i}`);
    }

    // Find hidden Leaf Village characters on the board
    const hiddenTargets = findHiddenLeafOnBoard(newState, player, costReduction);
    const hiddenLeafIds = hiddenTargets.map(h => `HIDDEN_${h.instanceId}`);
    const allTargets = [...affordableLeafIndices, ...hiddenLeafIds];

    if (allTargets.length === 0) {
      newState.log = logAction(newState.log, newState.turn, newState.phase, player,
        'EFFECT_NO_TARGET', 'Hiruzen Sarutobi (002): No affordable Leaf Village character could be played.',
        'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' });
      return newState;
    }

    const effId = generateInstanceId();
    const actId = generateInstanceId();
    newState.pendingEffects = [...newState.pendingEffects, {
      id: effId, sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: pending.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: JSON.stringify({
        text: 'Hiruzen Sarutobi (002): Choose a Leaf Village character to play (cost -1).',
        hiddenChars: hiddenTargets, costReduction, isUpgrade,
      }),
      targetSelectionType: 'HIRUZEN002_CHOOSE_CARD',
      sourcePlayer: player, requiresTargetSelection: true,
      validTargets: allTargets, isOptional: false, isMandatory: true,
      resolved: false, isUpgrade,
      remainingEffectTypes: pending.remainingEffectTypes,
    }];
    newState.pendingActions = [...newState.pendingActions, {
      id: actId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
      player,
      description: 'Hiruzen Sarutobi (002): Choose a Leaf Village character to play (cost -1).',
      descriptionKey: 'game.effect.desc.hiruzen002PlayLeaf',
      options: allTargets, minSelections: 1, maxSelections: 1,
      sourceEffectId: effId,
    }];

    return newState;
  }

  /**
   * Kiba 113 (R): Queue Akamaru choice (step after confirmation).
   * Creates KIBA113_CHOOSE_AKAMARU or KIBA113_CHOOSE_AKAMARU_DEFEAT pending effect.
   */
  static kiba113QueueAkamaruChoice(state: GameState, pending: PendingEffect, useDefeat: boolean): GameState {
    let newState = { ...state };
    let confData: { sourceMissionIndex: number; sourceCardInstanceId: string } | null = null;
    try { confData = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    if (!confData) return newState;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    // Collect all non-hidden friendly Akamarous
    const akamaruTargets: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      const mission = newState.activeMissions[i];
      for (const char of mission[friendlySide]) {
        if (!char.isHidden) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.name_fr.toLowerCase().includes('akamaru')) {
            akamaruTargets.push(char.instanceId);
          }
        }
      }
    }

    if (akamaruTargets.length === 0) {
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Kiba Inuzuka (113): No friendly non-hidden Akamaru in play.',
        'game.log.effect.noTarget',
        { card: 'KIBA INUZUKA', id: 'KS-113-R' },
      );
      return newState;
    }

    const selType = useDefeat ? 'KIBA113_CHOOSE_AKAMARU_DEFEAT' : 'KIBA113_CHOOSE_AKAMARU';
    const descKey = useDefeat
      ? 'game.effect.desc.kiba113ChooseAkamaruDefeat'
      : 'game.effect.desc.kiba113ChooseAkamaru';
    const extraData = JSON.stringify({ sourceMissionIndex: confData.sourceMissionIndex });

    const effId = generateInstanceId();
    const actId = generateInstanceId();
    newState.pendingEffects = [...newState.pendingEffects, {
      id: effId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: confData.sourceMissionIndex,
      effectType: pending.effectType,
      effectDescription: extraData,
      targetSelectionType: selType,
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets: akamaruTargets,
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: useDefeat,
    }];
    newState.pendingActions = [...newState.pendingActions, {
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: pending.sourcePlayer,
      description: useDefeat
        ? 'Kiba Inuzuka (113): Choose which Akamaru to defeat.'
        : 'Kiba Inuzuka (113): Choose which Akamaru to hide.',
      descriptionKey: descKey,
      options: akamaruTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    }];

    return newState;
  }

  /**
   * Kiba 149 (MV): Execute step 1 - auto-pick first Akamaru, hide/defeat it,
   * then queue second target selection.
   */
  static kiba149ExecuteStep1(state: GameState, pending: PendingEffect, useDefeat: boolean): GameState {
    let newState = { ...state };
    let confData: { sourceMissionIndex: number; sourceCardInstanceId: string } | null = null;
    try { confData = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    if (!confData) return newState;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const enemySide: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const opponentPlayer: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';

    // Find first non-hidden Akamaru
    let akamaru: CharacterInPlay | null = null;
    let akamaruMI = -1;
    for (let i = 0; i < newState.activeMissions.length; i++) {
      for (const char of newState.activeMissions[i][friendlySide]) {
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if (topCard.name_fr.toUpperCase().includes('AKAMARU')) {
          akamaru = char;
          akamaruMI = i;
          break;
        }
      }
      if (akamaru) break;
    }

    if (!akamaru || akamaruMI === -1) {
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Kiba Inuzuka (113 MV): No friendly non-hidden Akamaru in play.',
        'game.log.effect.noTarget',
        { card: 'KIBA INUZUKA', id: 'KS-113-MV' },
      );
      return newState;
    }

    // Apply action to Akamaru
    if (useDefeat) {
      newState = defeatFriendlyCharacter(newState, akamaruMI, akamaru.instanceId, pending.sourcePlayer);
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_DEFEAT',
        `Kiba Inuzuka (113 MV): Defeated friendly ${akamaru.card.name_fr} (upgrade).`,
        'game.log.effect.defeat',
        { card: 'KIBA INUZUKA', id: 'KS-113-MV', target: akamaru.card.name_fr },
      );
    } else {
      // Hide Akamaru
      const missions = [...newState.activeMissions];
      const mission = { ...missions[akamaruMI] };
      const chars = [...mission[friendlySide]];
      const idx = chars.findIndex((c) => c.instanceId === akamaru!.instanceId);
      if (idx !== -1) {
        chars[idx] = { ...chars[idx], isHidden: true };
        mission[friendlySide] = chars;
        missions[akamaruMI] = mission;
        newState = {
          ...newState,
          activeMissions: missions,
          log: logAction(
            newState.log, newState.turn, newState.phase, pending.sourcePlayer,
            'EFFECT_HIDE',
            `Kiba Inuzuka (113 MV): Hid friendly ${akamaru.card.name_fr}.`,
            'game.log.effect.hide',
            { card: 'KIBA INUZUKA', id: 'KS-113-MV', target: akamaru.card.name_fr, mission: `mission ${akamaruMI}` },
          ),
        };
      }
    }

    // Gather second targets in source mission (not self, not Akamaru)
    const srcMI = confData.sourceMissionIndex;
    const thisMission = newState.activeMissions[srcMI];
    if (!thisMission) return newState;

    const validTargets: string[] = [];
    for (const char of thisMission[friendlySide]) {
      if (char.isHidden) continue;
      if (char.instanceId === confData.sourceCardInstanceId) continue;
      if (char.instanceId === akamaru.instanceId) continue;
      validTargets.push(char.instanceId);
    }
    for (const char of thisMission[enemySide]) {
      if (char.isHidden) continue;
      if (!useDefeat && !canBeHiddenByEnemy(newState, char, opponentPlayer)) continue;
      validTargets.push(char.instanceId);
    }

    if (validTargets.length === 0) {
      newState.log = logAction(
        newState.log, newState.turn, newState.phase, pending.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Kiba Inuzuka (113 MV): No other non-hidden character in this mission to target.',
        'game.log.effect.noTarget',
        { card: 'KIBA INUZUKA', id: 'KS-113-MV' },
      );
      return newState;
    }

    const step2Type = useDefeat ? 'KIBA149_CHOOSE_DEFEAT_TARGET' : 'KIBA149_CHOOSE_HIDE_TARGET';
    const step2DescKey = useDefeat ? 'game.effect.desc.kiba149Defeat' : 'game.effect.desc.kiba149Hide';

    const effId = generateInstanceId();
    const actId = generateInstanceId();
    newState.pendingEffects = [...newState.pendingEffects, {
      id: effId,
      sourceCardId: pending.sourceCardId,
      sourceInstanceId: pending.sourceInstanceId,
      sourceMissionIndex: srcMI,
      effectType: pending.effectType,
      effectDescription: '',
      targetSelectionType: step2Type,
      sourcePlayer: pending.sourcePlayer,
      requiresTargetSelection: true,
      validTargets,
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: useDefeat,
    }];
    newState.pendingActions = [...newState.pendingActions, {
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: pending.sourcePlayer,
      description: useDefeat
        ? 'Kiba Inuzuka (113 MV): Choose another character in this mission to defeat.'
        : 'Kiba Inuzuka (113 MV): Choose another character in this mission to hide.',
      descriptionKey: step2DescKey,
      options: validTargets,
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    }];

    return newState;
  }
}
