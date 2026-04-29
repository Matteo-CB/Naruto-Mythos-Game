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
import { isProtectedFromEnemyHide, isImmuneToEnemyHideOrDefeat, canBeHiddenByEnemy, isMovementBlockedByKurenai, triggerOnPlayReactions, applyRempartTokenRemoval, isHiddenRevealBlocked } from './ContinuousEffects';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { getEffectivePower } from './powerUtils';
import { checkFlexibleUpgrade } from '../engine/rules/PlayValidation';
import { canAffordAsUpgrade } from './handlers/KS/shared/upgradeCheck';
import { moveCharTo, getValidMissions, applyUpgradePowerup } from './handlers/KS/rare/sasuke107';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard, findHiddenLeafOnBoard } from './handlers/KS/shared/summonSearch';
import { isCharacterCopyable } from './handlers/KS/shared/copyExclusions';


function findUpgradeTargetIdx(
  chars: CharacterInPlay[],
  card: { name_fr: string; chakra: number; number?: number; effects?: Array<{ type: string; description: string }> },
  excludeInstanceId?: string,
): number {
  
  
  const hasFlexibleRestriction = (card.number === 51 || card.number === 138) &&
    (card.effects ?? []).some(e => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'));

  
  const sameNameIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    
    if (hasFlexibleRestriction) {
      const isSummon = (topCard.keywords ?? []).includes('Summon');
      const isOrochimaru = topCard.name_fr.toUpperCase().includes('OROCHIMARU');
      if (isSummon || isOrochimaru) return false;
    }
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase()
      && (card.chakra ?? 0) > (topCard.chakra ?? 0);
  });
  if (sameNameIdx >= 0) return sameNameIdx;

  
  const flexIdx = chars.findIndex(c => {
    if (c.isHidden) return false;
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    if (!checkFlexibleUpgrade(card as any, topCard) || (card.chakra ?? 0) <= (topCard.chakra ?? 0)) return false;
    
    
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
    
  }

  
  if (hasSameNameConflict(chars, card, excludeInstanceId)) {
    return false; // Same name exists but can't upgrade (lower or equal cost)
  }

  
  const freshCost = Math.max(0, (card.chakra ?? 0) - costReduction);
  return availableChakra >= freshCost;
}


export class EffectEngine {
  
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

    if (!character.isHidden) {
      newState = triggerOnPlayReactions(newState, player, missionIndex, false, character.instanceId);
    }

    
    
    
    const relevantTypes = new Set<string>(isUpgrade ? ['MAIN', 'UPGRADE'] : ['MAIN']);
    const orderedTypes: EffectType[] = [];
    for (const effect of (topCard.effects ?? [])) {
      if (relevantTypes.has(effect.type) && !orderedTypes.includes(effect.type as EffectType)) {
        
        if (effect.type === 'MAIN' && (effect.description.startsWith('effect:') || effect.description.startsWith('effect.'))) {
          continue;
        }
        orderedTypes.push(effect.type as EffectType);
      }
    }

    
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

  
  static resolveRevealUpgradeEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card;

    if (!character.isHidden) {
      newState = triggerOnPlayReactions(newState, player, missionIndex, true, character.instanceId);
    }

    
    
    const relevantTypes = new Set<string>(['MAIN', 'UPGRADE', 'AMBUSH']);
    const orderedTypes: EffectType[] = [];
    for (const effect of (topCard.effects ?? [])) {
      if (relevantTypes.has(effect.type) && !orderedTypes.includes(effect.type as EffectType)) {
        orderedTypes.push(effect.type as EffectType);
      }
    }

    for (let i = 0; i < orderedTypes.length; i++) {
      const effectType = orderedTypes[i];

      
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

  
  static resolveRevealEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);

    const topCard = character.stack?.length > 0 ? character.stack[character.stack?.length - 1] : character.card;

    if (!character.isHidden) {
      newState = triggerOnPlayReactions(newState, player, missionIndex, true, character.instanceId);
    }

    
    
    
    

    
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
            
            const remainingEffectTypes: EffectType[] = [];
            const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
            if (hasAmbushEffect) remainingEffectTypes.push('AMBUSH');

            
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

  
  static resolveScoreEffects(
    state: GameState,
    player: PlayerID,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const mission = newState.activeMissions[missionIndex];

    
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

    const isThisOptional = !result.isMandatory;
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
      isOptional: isThisOptional,
      isMandatory: result.isMandatory ?? false,
      resolved: false,
      isUpgrade,
      wasRevealed: wasRevealed ?? false,
      remainingEffectTypes: remainingEffectTypes.length > 0 ? remainingEffectTypes : undefined,
      selectingPlayer: result.selectingPlayer,
      
      
      rootOptional: isThisOptional,
    };

    
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

  
  static applyTargetedEffect(
    state: GameState,
    pendingEffect: PendingEffect,
    selectedTargets: string[],
  ): GameState {
    let newState = deepClone(state);
    const targetId = selectedTargets[0]; // Most effects select 1 target

    
    
    
    
    const preDispatchPendingIds = new Set(state.pendingEffects.map((pe) => pe.id));
    const parentWasOptional = !!(pendingEffect.rootOptional || pendingEffect.isOptional);

    
    
    const isMultiSelectType = pendingEffect.targetSelectionType === 'KIBA026_UPGRADE_CHOOSE'
      || pendingEffect.targetSelectionType === 'TAYUYA065_UPGRADE_CHOOSE';
    if (isMultiSelectType) {
      
      if (targetId !== 'skip' && pendingEffect.validTargets && pendingEffect.validTargets.length > 0) {
        const indices = targetId.split(',');
        const allValid = indices.every(idx => pendingEffect.validTargets!.includes(idx));
        if (!allValid) {
          console.warn(`[EffectEngine] Invalid multi-select target ${targetId} - not all in validTargets [${pendingEffect.validTargets.join(', ')}] for ${pendingEffect.targetSelectionType}`);
          return state;
        }
      }
    } else if (pendingEffect.targetSelectionType === 'REORDER_DISCARD' || pendingEffect.targetSelectionType === 'ORDERED_DEFEAT') {
      
    } else if (pendingEffect.validTargets && pendingEffect.validTargets.length > 0 && !pendingEffect.validTargets.includes(targetId)) {
      console.warn(`[EffectEngine] Invalid target ${targetId} - not in validTargets [${pendingEffect.validTargets.join(', ')}] for ${pendingEffect.targetSelectionType}`);
      return state;
    }

    
    
    
    const isConfirmPopup = targetId === pendingEffect.sourceInstanceId && pendingEffect.validTargets?.length === 1 && pendingEffect.validTargets[0] === pendingEffect.sourceInstanceId;
    const kimimaro056Result = isConfirmPopup
      ? { state: newState, blocked: false }
      : EffectEngine.applyKimimaro056Protection(newState, pendingEffect, targetId);
    newState = kimimaro056Result.state;
    if (kimimaro056Result.blocked) {
      
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
        
        let parsed091: { isUpgrade?: boolean } = {};
        try { parsed091 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (parsed091.isUpgrade) {
          const opp091 = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const oppHand091 = newState[opp091].hand;
          if (oppHand091.length > 0) {
            
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
        
        break;

      case 'TAYUYA065_UPGRADE_REVEAL':
        
        break;

      case 'KIBA026_UPGRADE_REVEAL':
        
        break;

      case 'KIBA026_UPGRADE_CHOOSE': {
        
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
        
        break;

      case 'SASUKE014_UPGRADE_HAND_REVEAL': {
        
        
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
        
        const nlmPlayer = pendingEffect.sourcePlayer;
        const nlmOpponent: PlayerID = nlmPlayer === 'player1' ? 'player2' : 'player1';
        const nlmEnemySide: 'player1Characters' | 'player2Characters' =
          nlmPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let nlmParsed: { missionIndex?: number } = {};
        try { nlmParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const nlmMI = nlmParsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const nlmMission = newState.activeMissions[nlmMI];
        if (!nlmMission) break;

        
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

      
      case 'HAKU088_CONFIRM_DRAW':
        newState = EffectEngine.haku088ConfirmDraw(newState, pendingEffect);
        break;

      
      case 'MSS01_CONFIRM_SCORE': {
        const m01Player = pendingEffect.sourcePlayer;
        
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
          
          const m03Ps = { ...newState[m03OpponentId], hand: [...m03OpponentHand], discardPile: [...newState[m03OpponentId].discardPile] };
          const [m03Discarded] = m03Ps.hand.splice(0, 1);
          m03Ps.discardPile.push(m03Discarded);
          newState[m03OpponentId] = m03Ps;
          newState.log = logAction(newState.log, newState.turn, newState.phase, m03Player,
            'SCORE_DISCARD', `MSS 03 (Find the Traitor): Opponent discarded ${m03Discarded.name_fr} from hand.`,
            'game.log.score.discard', { card: 'Trouver le traitre', count: 1 });
          break;
        }

        
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
          
          newState = EffectEngine.defeatCharacter(newState, m04Targets[0], m04Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, m04Player,
            'SCORE_DEFEAT', 'MSS 04 (Assassination): Defeated the only hidden enemy character.',
            'game.log.score.defeat', { card: 'Assassinat', target: m04Targets[0] });
          break;
        }

        
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
          
          const m07CharId = m07Targets[0];
          const m07FromMI = m07CharMissionMap[m07CharId];
          const m07OtherMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== m07FromMI) m07OtherMissions.push(String(i));
          }

          if (m07OtherMissions.length === 1) {
            
            newState = EffectEngine.mss07ApplyMove(newState, m07CharId, m07FromMI, parseInt(m07OtherMissions[0], 10), m07Player);
            break;
          }

          
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

      
      case 'MSS08_CHOOSE_CARD':
        newState = EffectEngine.mss08ChooseCard(newState, pendingEffect, targetId);
        break;
      case 'MSS08_CHOOSE_MISSION':
        newState = EffectEngine.mss08ChooseMission(newState, pendingEffect, targetId);
        break;

      
      case 'MSS01_POWERUP_TARGET':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 2);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'SCORE_POWERUP', `MSS 01 (Call for Support): POWERUP 2 on selected target.`,
          'game.log.score.powerup', { card: 'Appel de soutien', amount: 2, target: targetId },
        );
        break;

      
      case 'MSS03_OPPONENT_DISCARD':
        newState = EffectEngine.mss03OpponentDiscard(newState, pendingEffect, targetId);
        break;

      
      case 'MSS04_DEFEAT_HIDDEN':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'SCORE_DEFEAT', `MSS 04 (Assassination): Defeated hidden enemy character.`,
          'game.log.score.defeat', { card: 'Assassinat', target: targetId },
        );
        break;

      
      case 'MSS05_RETURN_TO_HAND':
        newState = EffectEngine.mss05ReturnToHand(newState, pendingEffect, targetId);
        break;

      
      case 'MSS07_MOVE_HIDDEN':
        newState = EffectEngine.mss07ChooseCharacter(newState, pendingEffect, targetId);
        break;

      
      case 'MSS07_CHOOSE_DESTINATION':
        newState = EffectEngine.mss07ChooseDestination(newState, pendingEffect, targetId);
        break;

      
      case 'JIRAIYA_CHOOSE_SUMMON':
        newState = EffectEngine.jiraiyaChooseSummon(newState, pendingEffect, targetId);
        break;
      case 'JIRAIYA_CHOOSE_MISSION':
        newState = EffectEngine.jiraiyaChooseMission(newState, pendingEffect, targetId);
        break;

      
      case 'ASUMA_CHOOSE_TEAM10':
        newState = EffectEngine.asumaChooseTeam10(newState, pendingEffect, targetId);
        break;
      case 'ASUMA_CHOOSE_DESTINATION':
        newState = EffectEngine.asumaChooseDestination(newState, pendingEffect, targetId);
        break;

      
      case 'IRUKA_CHOOSE_NARUTO':
        newState = EffectEngine.irukaChooseNaruto(newState, pendingEffect, targetId);
        break;
      case 'IRUKA_CHOOSE_DESTINATION':
        newState = EffectEngine.irukaChooseDestination(newState, pendingEffect, targetId);
        break;

      
      case 'KIDOMARU_CHOOSE_CHARACTER':
        newState = EffectEngine.kidomaruChooseCharacter(newState, pendingEffect, targetId);
        break;
      case 'KIDOMARU_CHOOSE_DESTINATION':
        newState = EffectEngine.kidomaruChooseDestination(newState, pendingEffect, targetId);
        break;

      
      case 'SAKURA109_CHOOSE_DISCARD':
        newState = EffectEngine.sakura109ChooseFromDiscard(newState, pendingEffect, targetId);
        break;
      case 'SAKURA109_CHOOSE_MISSION':
        newState = EffectEngine.sakura109ChooseMission(newState, pendingEffect, targetId);
        break;

      
      case 'SAKURA135_CHOOSE_CARD':
        newState = EffectEngine.sakura135ChooseCard(newState, pendingEffect, targetId);
        break;
      case 'SAKURA135_CHOOSE_MISSION':
        newState = EffectEngine.sakura135ChooseMission(newState, pendingEffect, targetId);
        break;

      
      case 'CHOJI_CHOOSE_DISCARD':
        newState = EffectEngine.chojiChooseDiscard(newState, pendingEffect, targetId);
        break;

      
      case 'ITACHI143_CHOOSE_FRIENDLY':
        newState = EffectEngine.itachi143MoveFriendly(newState, pendingEffect, targetId);
        break;
      case 'ITACHI143_CHOOSE_ENEMY':
        newState = EffectEngine.itachi143MoveEnemy(newState, pendingEffect, targetId);
        break;

      
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

      
      case 'DEFEAT_ENEMY_BY_COST':
      case 'GAARA139_DEFEAT_BY_COST': {
        
        const gaara139Info = EffectEngine.findCharByInstanceId(newState, targetId);
        const gaara139DefeatedName = gaara139Info ? gaara139Info.character.card.name_fr : '';
        const gaara139DefeatedCost = gaara139Info
          ? (gaara139Info.character.stack?.length > 0
              ? gaara139Info.character.stack[gaara139Info.character.stack?.length - 1]
              : gaara139Info.character.card
            ).chakra
          : 0;

        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        
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
              
              newState = EffectEngine.hideCharacterWithLog(newState, hideTargets[0], pendingEffect.sourcePlayer);
            } else {
              
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

      
      case 'DEFEAT_BY_COST_UPGRADE':
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;

      
      case 'TAKE_CONTROL_ENEMY_THIS_MISSION':
        newState = EffectEngine.takeControlOfEnemy(newState, pendingEffect, targetId);
        break;

      
      case 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY': {
        if (pendingEffect.isUpgrade) {
          
          newState = EffectEngine.stealTokensFromTarget(newState, pendingEffect, targetId, 99);
        } else {
          
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

      
      case 'TENTEN_118_DEFEAT_HIDDEN_IN_MISSION': {
        
        const tenten118Char = EffectEngine.findCharByInstanceId(newState, targetId);
        let tenten118PrintedPower = 99;
        if (tenten118Char) {
          const tTop = tenten118Char.character.stack?.length > 0
            ? tenten118Char.character.stack[tenten118Char.character.stack?.length - 1]
            : tenten118Char.character.card;
          tenten118PrintedPower = tTop.power ?? 0;
        }

        
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);

        
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

      
      case 'SASUKE136_CHOOSE_FRIENDLY': {
        
        newState = EffectEngine.defeatFriendlyForSasuke136(newState, pendingEffect, targetId);
        break;
      }

      
      
      
      case 'KIBA113_CONFIRM_MAIN':
      case 'KIBA149_CONFIRM_MAIN': {
        
        const isK149 = pendingEffect.targetSelectionType === 'KIBA149_CONFIRM_MAIN';
        const cardLabel = isK149 ? 'KS-113-MV' : 'KS-113-R';
        let confirmData: { sourceMissionIndex: number; sourceCardInstanceId: string; isUpgrade: string } | null = null;
        try { confirmData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (!confirmData) break;

        const isUpgradeMode = confirmData.isUpgrade === 'true';
        const srcMI_c = confirmData.sourceMissionIndex;

        if (isUpgradeMode) {
          
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
          
          if (isK149) {
            
            newState = EffectEngine.kiba149ExecuteStep1(newState, pendingEffect, false);
          } else {
            
            newState = EffectEngine.kiba113QueueAkamaruChoice(newState, pendingEffect, false);
          }
        }
        break;
      }

      case 'KIBA113_CONFIRM_UPGRADE':
      case 'KIBA149_CONFIRM_UPGRADE': {
        
        const isK149_u = pendingEffect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE';
        if (isK149_u) {
          newState = EffectEngine.kiba149ExecuteStep1(newState, pendingEffect, true);
        } else {
          newState = EffectEngine.kiba113QueueAkamaruChoice(newState, pendingEffect, true);
        }
        break;
      }

      
      
      
      case 'HIRUZEN001_CONFIRM_MAIN': {
        
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
        
        newState = EffectEngine.queueHiruzen002Choose(newState, pendingEffect, pendingEffect.isUpgrade);
        pendingEffect.remainingEffectTypes = undefined; // propagated into queueHiruzen002Choose
        break;
      }

      case 'HIRUZEN002_CONFIRM_UPGRADE': {
        
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
        
        delete (newState as any)._hiruzen002PlayedCharId;
        break;
      }

      case 'TSUNADE004_CONFIRM_UPGRADE': {
        
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
        
        const s006Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const s006EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const s006Targets: string[] = [];
        for (let s006mIdx = 0; s006mIdx < newState.activeMissions.length; s006mIdx++) {
          
          if (isMovementBlockedByKurenai(newState, s006mIdx, s006Opponent)) continue;
          const s006Mission = newState.activeMissions[s006mIdx];
          for (const char of (s006Mission as any)[s006EnemySide]) {
            if (getEffectivePower(newState, char, s006Opponent) <= 3) {
              
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
        
        let n010Data: { sourceMissionIndex?: number } | null = null;
        try { n010Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n010MIdx = n010Data?.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const n010FriendlySide = pendingEffect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        
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

      
      
      

      case 'CHOJI017_CONFIRM_MAIN': {
        
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

        
        
        
        const allCards014 = oppHand014.map((c: any, i: number) => ({
          id: c.id, name_fr: c.name_fr, name_en: c.name_en,
          title_fr: c.title_fr, title_en: c.title_en,
          chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
          effects: c.effects, keywords: c.keywords, group: c.group,
          rarity: c.rarity, card_type: c.card_type,
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
        
        const s014umOpponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const oppHand014um = newState[s014umOpponent].hand;

        if (oppHand014um.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (014): Opponent hand empty.',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });
          break;
        }

        const allCards014um = oppHand014um.map((c: any, i: number) => ({
          id: c.id, name_fr: c.name_fr, name_en: c.name_en,
          title_fr: c.title_fr, title_en: c.title_en,
          chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
          effects: c.effects, keywords: c.keywords, group: c.group,
          rarity: c.rarity, card_type: c.card_type,
        }));

        newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_LOOK_HAND', 'Sasuke Uchiwa (014): Revealed all cards in opponent\'s hand.',
          'game.log.effect.sasuke014Reveal', { card: 'SASUKE UCHIWA', id: 'KS-014-UC' });

        
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
        
        let k016Meta: { isUpgrade?: boolean } = {};
        try { k016Meta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        if (k016Meta.isUpgrade) {
          
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
        
        let i020Meta: { isUpgrade?: boolean } = {};
        try { i020Meta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        if (i020Meta.isUpgrade) {
          
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

      
      
      

      case 'SHIKAMARU021_CONFIRM_MAIN': {
        
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
        let s022LastOwnIdx = -1;
        let s022SkippedSource = false;
        for (let i = newState.log.length - 1; i >= 0; i--) {
          const entry = newState.log[i];
          if (entry.turn !== s022Turn || entry.phase !== 'action') break;
          if (entry.player !== pendingEffect.sourcePlayer) continue;
          if (
            entry.action === 'PASS' ||
            entry.action === 'PLAY_HIDDEN' ||
            PLAY_ACTIONS_022.has(entry.action)
          ) {
            if (!s022SkippedSource) {
              s022SkippedSource = true;
              continue;
            }
            s022LastOwnIdx = i;
            break;
          }
        }
        for (let i = s022LastOwnIdx + 1; i < newState.log.length; i++) {
          const entry = newState.log[i];
          if (entry.turn !== s022Turn || entry.phase !== 'action') break;
          if (entry.player !== s022Opponent) continue;
          if (entry.action === 'PASS') continue;
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

        const s022Targets: string[] = [];
        for (const played of s022PlayedChars) {
          const mission = newState.activeMissions[played.mission];
          if (!mission) continue;
          for (const char of mission[s022EnemySide]) {
            if (s022Targets.includes(char.instanceId)) continue;
            if (played.instanceId) {
              
              if (char.instanceId === played.instanceId) {
                s022Targets.push(char.instanceId);
              }
            } else if (played.name) {
              
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
        
        const k026SrcChar = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!k026SrcChar) break;
        const k026MIdx = k026SrcChar.missionIndex;
        const k026Mission = newState.activeMissions[k026MIdx];
        if (!k026Mission) break;
        const k026EnemySide: 'player1Characters' | 'player2Characters' =
          pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k026Opponent = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';

        
        const k026AllNonHidden = k026Mission[k026EnemySide].filter((c: CharacterInPlay) => !c.isHidden);

        if (k026AllNonHidden.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kiba Inuzuka (026): No non-hidden enemy to hide (state changed).',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' });
          break;
        }

        
        let k026LowestCost = Infinity;
        for (const char of k026AllNonHidden) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.chakra < k026LowestCost) k026LowestCost = topCard.chakra;
        }

        
        const k026Tied = k026AllNonHidden.filter((c: CharacterInPlay) => {
          const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return topCard.chakra === k026LowestCost && canBeHiddenByEnemy(newState, c, k026Opponent);
        });

        if (k026Tied.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Kiba Inuzuka (026): Lowest cost enemy is protected from being hidden.',
            'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' });
          break;
        }

        if (k026Tied.length === 1) {
          
          newState = EffectEngine.hideCharacterWithLog(newState, k026Tied[0].instanceId, pendingEffect.sourcePlayer);
          break;
        }

        
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
          
          newState = EffectEngine.applyPowerupToTarget(newState, a028KibaTargets[0], 2);
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_POWERUP', 'Akamaru (028): POWERUP 2 on Kiba Inuzuka (ambush).',
            'game.log.effect.powerup', { card: 'AKAMARU', id: 'KS-028-UC', amount: 2, target: 'KIBA INUZUKA' });
          break;
        }

        
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

      
      
      
      case 'SHINO032_CONFIRM_MAIN': {
        
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
        
        const s033SrcMI = pendingEffect.sourceMissionIndex;
        const s033Player = pendingEffect.sourcePlayer;
        const s033FriendlySide = s033Player === 'player1' ? 'player1Characters' : 'player2Characters';

        
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
          
          newState = EffectEngine.defeatCharacter(newState, k035Targets[0], k035Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, k035Player,
            'EFFECT_DEFEAT', 'Yuhi Kurenai (035): Defeated enemy character with Power 1 or less (upgrade).',
            'game.log.effect.defeat', { card: 'YUHI KURENAI', id: 'KS-035-UC' });
          break;
        }

        
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

      
      
      

      case 'TENTEN041_CONFIRM_MAIN': {
        
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
          
          newState = EffectEngine.defeatCharacter(newState, tt041Targets[0], pendingEffect.sourcePlayer);
          break;
        }

        
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
          
          newState = EffectEngine.defeatCharacter(newState, a045Targets[0], pendingEffect.sourcePlayer);
          break;
        }

        
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
          
          newState = EffectEngine.irukaChooseNaruto(newState, pendingEffect, i047Targets[0]);
          break;
        }

        
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
          
          newState = EffectEngine.orochimaruLookAndSteal(newState, pendingEffect, o050Targets[0]);
          break;
        }

        
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

      
      
      

      case 'OROCHIMARU051_CONFIRM_UPGRADE': {
        
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
          
          const canUpgrade = mChars.some((c: CharacterInPlay) => {
            if (c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            const isSameName = cTop.name_fr.toUpperCase() === kb053mTopCard.name_fr.toUpperCase()
              && (kb053mTopCard.chakra ?? 0) > (cTop.chakra ?? 0);
            const isFlex = checkFlexibleUpgrade(kb053mTopCard as any, cTop)
              && (kb053mTopCard.chakra ?? 0) > (cTop.chakra ?? 0);
            if (!isSameName && !isFlex) return false;
            
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

        
        const kb054mSorted = sortTargetsGemmaLast(kb054mTargets.map(t => t.char));
        const kb054mSortedIds = kb054mSorted.map((c: CharacterInPlay) => c.instanceId);
        const kb054mOrdered = kb054mSortedIds.map((id: string) => kb054mTargets.find(t => t.instanceId === id)!);

        
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

        const kb054mAllTargetIds = kb054mOrdered.map(t => t.instanceId);
        let kb054mHiddenCount = 0;
        for (const kb054mTargetId of kb054mAllTargetIds) {
          newState = EffectEngine.hideCharacterWithLog(newState, kb054mTargetId, kb054mPlayer, true);
          const kb054mAfter = EffectEngine.findCharByInstanceId(newState, kb054mTargetId);
          if (kb054mAfter && kb054mAfter.character.isHidden) kb054mHiddenCount++;
        }
        if (kb054mHiddenCount > 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, kb054mPlayer,
            'EFFECT_HIDE',
            `Kabuto Yakushi (054): Hid ${kb054mHiddenCount} character(s) in this mission.`,
            'game.log.effect.hide',
            { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', count: String(kb054mHiddenCount) },
          );
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
          
          const km056Hand = [...km056Ps.hand];
          const km056Discarded = km056Hand.splice(0, 1)[0];
          const km056NewPs = { ...km056Ps, hand: km056Hand, discardPile: [...km056Ps.discardPile, km056Discarded] };
          newState = { ...newState, [km056Player]: km056NewPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, km056Player,
            'EFFECT_DISCARD', `Kimimaro (056) UPGRADE: Discarded ${km056Discarded.name_fr} from hand.`,
            'game.log.effect.discard', { card: 'KIMIMARO', id: 'KS-056-UC', target: km056Discarded.name_fr });

          
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

      
      
      

      case 'SAKON061_CONFIRM_MAIN': {
        
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
              
              
              
              
              wasRevealed: true,
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
          
          
          wasRevealed: true,
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
          
          newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, d068mTargets[0]);
          break;
        }

        
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
          
          newState = EffectEngine.defeatCharacter(newState, d068aTargets[0], pendingEffect.sourcePlayer);
          break;
        }

        
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
          
          newState = EffectEngine.dosuLookAtHidden(newState, pendingEffect, d069uTargets[0]);
          break;
        }

        
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
          const d069mLocked = isHiddenRevealBlocked(newState, d069mCharResult.missionIndex, d069mOpponent);

          if (!d069mCanAfford || d069mLocked) {
            newState = EffectEngine.defeatCharacter(newState, d069mAutoTargetId, d069mPlayer);
            if (d069mLocked) {
              newState.log = logAction(newState.log, newState.turn, newState.phase, d069mPlayer,
                'EFFECT_DEFEAT', `Dosu Kinuta (069): Reveal blocked by Shikamaru Nara, ${d069mTopCard.name_fr} defeated.`,
                'game.log.effect.dosu069LockDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', target: d069mTopCard.name_fr });
            } else {
              newState.log = logAction(newState.log, newState.turn, newState.phase, d069mPlayer,
                'EFFECT_DEFEAT', `Dosu Kinuta (069): Opponent cannot afford to reveal (cost ${d069mRevealCost}), character defeated.`,
                'game.log.effect.dosu069AutoDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', cost: String(d069mRevealCost) });
            }
            break;
          }

          
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

      
      
      

      case 'ZAKU071_CONFIRM_MAIN': {
        
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

        
        if (k073Ps.hand.length === 1) {
          
          const k073Hand = [...k073Ps.hand];
          const k073Discarded = k073Hand.splice(0, 1)[0];
          const k073NewPs = { ...k073Ps, hand: k073Hand, discardPile: [...k073Ps.discardPile, k073Discarded] };
          newState = { ...newState, [k073Player]: k073NewPs };
          newState.log = logAction(newState.log, newState.turn, newState.phase, k073Player,
            'EFFECT_DISCARD', `Kin Tsuchi (073): Discarded ${k073Discarded.name_fr} from hand.`,
            'game.log.effect.discard', { card: 'KIN TSUCHI', id: 'KS-073-UC', target: k073Discarded.name_fr });

          
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

        
        const k078cEffId = generateInstanceId();
        const k078cActId = generateInstanceId();
        newState.pendingEffects.push({
          id: k078cEffId, sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          effectType: pendingEffect.effectType,
          effectDescription: '', targetSelectionType: 'MOVE_CHARACTER_POWER_4_OR_LESS',
          sourcePlayer: k078Player, requiresTargetSelection: true,
          validTargets: k078ValidTargets, isOptional: false, isMandatory: true,
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
        
        const k078uPlayer = pendingEffect.sourcePlayer;
        const k078uSide = k078uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        const k078uTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[k078uSide]) {
            if (!char.isHidden || char.instanceId === pendingEffect.sourceInstanceId) continue;
            const topCard_u = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            const charName_u = topCard_u.name_fr.toUpperCase();
            
            const hasConflict_u = mission[k078uSide].some((c: CharacterInPlay) => {
              if (c.instanceId === char.instanceId || c.isHidden) return false;
              const cTop = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              return cTop.name_fr.toUpperCase() === charName_u;
            });
            if (hasConflict_u) {
              
              const hasUpgrade_u = mission[k078uSide].some((c: CharacterInPlay) => {
                if (c.instanceId === char.instanceId || c.isHidden) return false;
                const cTop = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
                return cTop.name_fr.toUpperCase() === charName_u && (topCard_u.chakra ?? 0) > (cTop.chakra ?? 0);
              });
              if (!hasUpgrade_u) continue; // Can't reveal: name conflict + no upgrade target
            }
            k078uTargets.push(char.instanceId);
          }
        }

        if (k078uTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k078uPlayer,
            'EFFECT_NO_TARGET', 'Kankuro (078): No hidden friendly characters (state changed).',
            'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' });
          break;
        }

        
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
          
          newState = EffectEngine.moveCharToMissionDirectPublic(
            newState, pendingEffect.sourceInstanceId, parseInt(t080uDests[0], 10),
            t080uCharRes.player, 'Temari', 'KS-080-UC', t080uPlayer);
          break;
        }

        
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

      
      
      

      case 'BAKI081_CONFIRM_SCORE': {
        
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

      
      
      

      

      case 'GAMAHIRO095_CONFIRM_MAIN': {
        
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

      

      case 'KISAME092_CONFIRM_AMBUSH': {
        
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
        
        const p099Player = pendingEffect.sourcePlayer;
        const p099CharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        if (!p099CharResult) break;
        const p099MI = p099CharResult.missionIndex;
        
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
          remainingEffectTypes: pendingEffect.remainingEffectTypes,
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
        
        const t104uPlayer = pendingEffect.sourcePlayer;
        const mainSpent = (newState as any)._tsunade104ChakraSpent ?? 0;
        delete (newState as any)._tsunade104ChakraSpent;

        if (mainSpent <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t104uPlayer,
            'EFFECT', 'Tsunade (104) UPGRADE: No chakra was spent on MAIN, no bonus POWERUP.',
            'game.log.effect.tsunade104Decline', { card: 'TSUNADE', id: 'KS-104-R' });
          break;
        }

        
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

        
        let ctm107CharName = '';
        for (const m of newState.activeMissions) {
          const c = m[ctm107Side].find((ch) => ch.instanceId === targetId);
          if (c) { ctm107CharName = c.card.name_fr; break; }
        }

        if (!ctm107CharName) {
          
          break;
        }

        
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
          
          
        } else {
          const ctm107ValidMissions = getValidMissions(newState, targetId, ctm107Player, ctm107SrcMission);

          if (ctm107ValidMissions.length === 0) {
            
            newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
              'EFFECT_SKIP', `Sasuke Uchiwa (107): ${ctm107CharName} cannot move (no valid destination).`,
              'game.log.effect.sasuke107Skip', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: ctm107CharName });
          } else if (ctm107ValidMissions.length === 1) {
            
            const ctm107Dest = ctm107ValidMissions[0];
            
            let ctm107MovedChar: CharacterInPlay | null = null;
            for (const m of newState.activeMissions) {
              const c = m[ctm107Side].find((ch) => ch.instanceId === targetId);
              if (c) { ctm107MovedChar = c; break; }
            }

            newState = moveCharTo(newState, targetId, ctm107Dest, ctm107Player);
            newState.log = logAction(newState.log, newState.turn, newState.phase, ctm107Player,
              'EFFECT_MOVE', `Sasuke Uchiwa (107): Moved ${ctm107CharName} to mission ${ctm107Dest + 1}.`,
              'game.log.effect.move', { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: ctm107CharName, from: ctm107SrcMission, to: ctm107Dest });

            
            if (ctm107MovedChar) {
              const ctm107CharAtDest = newState.activeMissions[ctm107Dest]?.[ctm107Side]
                ?.find((c) => c.instanceId === targetId);
              if (ctm107CharAtDest) {
                newState = checkNinjaHoundsTrigger(newState, ctm107CharAtDest, ctm107Dest, ctm107Player);
                newState = checkChoji018PostMoveTrigger(newState, ctm107CharAtDest, ctm107Dest, ctm107Player, ctm107Player);
              }
            }

            
            const ctm107NewMovedCount = ctm107MovedCount + 1;

            
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
              
              if (ctm107IsUpgrade && ctm107NewMovedCount > 0) {
                newState = applyUpgradePowerup(newState, ctm107SasukeId, ctm107NewMovedCount, ctm107Player, ctm107SrcMission);
              }
            } else if (ctm107StillMoveable.length === 1) {
              
              const lastCharId = ctm107StillMoveable[0];
              let lastName = '';
              for (const m of newState.activeMissions) {
                const c = m[ctm107Side].find((ch) => ch.instanceId === lastCharId);
                if (c) { lastName = c.card.name_fr; break; }
              }
              const lastValidMissions = getValidMissions(newState, lastCharId, ctm107Player, ctm107SrcMission);
              if (lastValidMissions.length === 1) {
                
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

        
        if (ctm107CharMission >= 0 && isMovementBlockedByKurenai(newState, ctm107CharMission, ctm107Player)) {
          
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

        
        const am107CharAtDest = newState.activeMissions[am107Dest]?.[am107Side]
          ?.find((c) => c.instanceId === am107CharId);
        if (am107CharAtDest) {
          newState = checkNinjaHoundsTrigger(newState, am107CharAtDest, am107Dest, am107Player);
          newState = checkChoji018PostMoveTrigger(newState, am107CharAtDest, am107Dest, am107Player, am107Player);
        }

        
        if (am107IsUpgrade && am107MovedCount > 0) {
          newState = applyUpgradePowerup(newState, am107SasukeId, am107MovedCount, am107Player, am107SrcMission);
        }
        break;
      }

      

      case 'KIMIMARO123_CONFIRM_UPGRADE': {
        
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
          
          newState = EffectEngine.discardFromHand(newState, k123Player, 0);
          
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
        
        let k124Data: { wasUpgraded?: boolean; powerLimit?: number; sourceMissionIndex?: number } = {};
        try { k124Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k124Upgraded = k124Data.wasUpgraded ?? false;
        const k124Player = pendingEffect.sourcePlayer;

        if (k124Upgraded) {
          
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
        
        
        
        const t125Player = pendingEffect.sourcePlayer;
        const t125State = newState[t125Player];
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
        if (t125Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, t125Player,
            'EFFECT_NO_TARGET', 'Tayuya (125) UPGRADE: No affordable Sound Village character in hand (state changed).',
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
            effectDescription: JSON.stringify({ costReduction: 2 }),
            targetSelectionType: 'TAYUYA125_CHOOSE_SOUND',
            sourcePlayer: t125Player, requiresTargetSelection: true,
            validTargets: t125Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: t125ActId, type: 'CHOOSE_CARD_FROM_LIST' as PendingAction['type'],
            player: t125Player,
            description: JSON.stringify({ text: 'Tayuya (125) UPGRADE: Choose a Sound Village character to play (paying 2 less).' }),
            descriptionKey: 'game.effect.desc.tayuya125PlaySound',
            options: t125Targets, minSelections: 1, maxSelections: 1,
            sourceEffectId: t125EffId,
          });
        }
        break;
      }

      case 'OROCHIMARU126_CONFIRM_SCORE': {
        
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
        
        const o126uPlayer = pendingEffect.sourcePlayer;
        newState = EffectEngine.applyPowerupToTarget(newState, pendingEffect.sourceInstanceId, 3);
        newState.log = logAction(newState.log, newState.turn, newState.phase, o126uPlayer,
          'EFFECT_POWERUP', 'Orochimaru (126) UPGRADE: POWERUP 3 on self.',
          'game.log.effect.powerupSelf', { card: 'OROCHIMARU', id: 'KS-126-R', amount: 3 });
        break;
      }

      case 'SAKON127_CONFIRM_AMBUSH': {
        
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
        const s115MI = pendingEffect.sourceMissionIndex; // Shino's mission (destination)
        if (newState.activeMissions.length < 2) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s115Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (115) AMBUSH: Only 1 mission in play.',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-115-R' });
          break;
        }
        const s115DestChars = newState.activeMissions[s115MI][s115Side];
        
        const s115Targets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === s115MI) continue;
          if (isMovementBlockedByKurenai(newState, i, s115Player)) continue;
          for (const c of newState.activeMissions[i][s115Side]) {
            
            if (!c.isHidden) {
              const topC = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              const cName = topC.name_fr.toUpperCase();
              if (s115DestChars.some((dc: CharacterInPlay) => dc.instanceId !== c.instanceId && !dc.isHidden && (dc.stack?.length > 0 ? dc.stack[dc.stack.length - 1] : dc.card).name_fr.toUpperCase() === cName)) continue;
            }
            s115Targets.push(c.instanceId);
          }
        }
        if (s115Targets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s115Player,
            'EFFECT_NO_TARGET', 'Shino Aburame (115) AMBUSH: No friendly character in another mission to move here.',
            'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-115-R' });
          break;
        }
        if (s115Targets.length === 1) {
          
          newState = EffectEngine.moveCharToMissionDirectPublic(
            newState, s115Targets[0], s115MI,
            s115Player, 'Shino Aburame', 'KS-115-R',
          );
          break;
        }
        {
          const s115EffId = generateInstanceId();
          const s115ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s115EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: s115MI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({ destMissionIndex: s115MI }),
            targetSelectionType: 'SHINO115_MOVE_FRIENDLY',
            sourcePlayer: s115Player, requiresTargetSelection: true,
            validTargets: s115Targets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
          });
          newState.pendingActions.push({
            id: s115ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: s115Player,
            description: 'Shino Aburame (115) AMBUSH: Choose a friendly character to move to this mission.',
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
        
        
        const j122mPlayer = pendingEffect.sourcePlayer;
        const j122mMI = pendingEffect.sourceMissionIndex;
        const j122mMission = newState.activeMissions[j122mMI];
        if (!j122mMission) break;
        const j122mAll = [...j122mMission.player1Characters, ...j122mMission.player2Characters];
        const j122mSelfCounted = j122mAll.some((c) => c.instanceId === pendingEffect.sourceInstanceId);
        const j122mTotal = j122mAll.length + (j122mSelfCounted ? 0 : 1);
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
        
        const g120Player = pendingEffect.sourcePlayer;
        const g120Opponent = g120Player === 'player1' ? 'player2' : 'player1';
        const g120EnemySide: 'player1Characters' | 'player2Characters' =
          g120Player === 'player1' ? 'player2Characters' : 'player1Characters';
        let g120Desc: { isUpgrade?: boolean } = {};
        try { g120Desc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        
        const g120AllTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          const targets = newState.activeMissions[i][g120EnemySide]
            .filter((c: CharacterInPlay) => getEffectivePower(newState, c, g120Opponent as PlayerID) <= 1)
            .map((c: CharacterInPlay) => c.instanceId);
          g120AllTargets.push(...targets);
        }
        if (g120AllTargets.length === 0) {
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
              isUpgrade: g120Desc.isUpgrade ?? false,
              sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: pendingEffect.sourceMissionIndex,
              constraintMode: 'one-per-mission',
            }),
            targetSelectionType: 'ORDERED_DEFEAT',
            sourcePlayer: g120Player, requiresTargetSelection: true,
            validTargets: g120AllTargets, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: g120ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: g120Player,
            description: `Gaara (120): Choose enemies with Power 1 or less to defeat (click in order).`,
            descriptionKey: 'game.effect.desc.gaara120OrderDefeat',
            options: g120AllTargets, minSelections: 1, maxSelections: g120AllTargets.length,
            sourceEffectId: g120EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      case 'ITACHI128_CONFIRM_UPGRADE': {
        
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
        
        const i130Player = pendingEffect.sourcePlayer;
        const i130EnemySide: 'player1Characters' | 'player2Characters' =
          i130Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const i130AllHidden: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const c of newState.activeMissions[i][i130EnemySide]) {
            if (c.isHidden) i130AllHidden.push(c.instanceId);
          }
        }
        if (i130AllHidden.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i130Player,
            'EFFECT_NO_TARGET', 'Ichibi (130) UPGRADE: No hidden enemy characters (state changed).',
            'game.log.effect.noTarget', { card: 'ICHIBI', id: 'KS-130-R' });
          break;
        }
        if (i130AllHidden.length === 1) {
          
          newState = EffectEngine.defeatCharacter(newState, i130AllHidden[0], i130Player);
          newState.log = logAction(newState.log, newState.turn, newState.phase, i130Player,
            'EFFECT_DEFEAT', 'Ichibi (130) UPGRADE: Defeated 1 hidden enemy character.',
            'game.log.effect.defeat', { card: 'ICHIBI', id: 'KS-130-R', target: '1 hidden enemy' });
          break;
        }
        {
          const i130EffId = generateInstanceId();
          const i130ActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i130EffId, sourceCardId: 'KS-130-R', sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: pendingEffect.sourceMissionIndex, effectType: 'UPGRADE' as EffectType,
            effectDescription: JSON.stringify({ constraintMode: 'all-in-mission' }),
            targetSelectionType: 'ORDERED_DEFEAT', sourcePlayer: i130Player,
            requiresTargetSelection: true, validTargets: i130AllHidden,
            isOptional: false, isMandatory: true, resolved: false, isUpgrade: true,
            descriptionKey: 'game.effect.desc.ichibi130OrderDefeat',
            descriptionParams: { count: String(i130AllHidden.length) },
          } as PendingEffect);
          newState.pendingActions.push({
            id: i130ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i130Player,
            description: `Ichibi (130) UPGRADE: Choose defeat order for ${i130AllHidden.length} hidden enemies.`,
            descriptionKey: 'game.effect.desc.ichibi130OrderDefeat',
            descriptionParams: { count: String(i130AllHidden.length) },
            options: i130AllHidden, minSelections: i130AllHidden.length, maxSelections: i130AllHidden.length,
            sourceEffectId: i130EffId,
          });
        }
        break;
      }

      case 'TSUNADE131_CONFIRM_MAIN': {
        
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
        
        newState.pendingForcedResolver = j132uOpponent;
        {
          const j132uEffId = generateInstanceId();
          const j132uActId = generateInstanceId();
          
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

      

      case 'ITACHI091_CONFIRM_MAIN': {
        
        const i091Player = pendingEffect.sourcePlayer;
        const i091Opponent = i091Player === 'player1' ? 'player2' : 'player1';
        if (newState[i091Opponent].hand.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, i091Player,
            'EFFECT_NO_TARGET', 'Itachi Uchiwa (091): Opponent hand empty (state changed).',
            'game.log.effect.noTarget', { card: 'ITACHI UCHIWA', id: 'KS-091-UC' });
          break;
        }
        if (pendingEffect.isUpgrade) {
          
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
        
        {
          const i091EffId = generateInstanceId();
          const i091ActId = generateInstanceId();
          const i091OppHand = newState[i091Opponent].hand;
          const i091Cards = i091OppHand.map((c: any, i: number) => ({
            id: c.id, name_fr: c.name_fr, name_en: c.name_en,
            title_fr: c.title_fr, title_en: c.title_en,
            chakra: c.chakra ?? 0, power: c.power ?? 0,
            image_file: c.image_file, originalIndex: i,
            effects: c.effects, keywords: c.keywords, group: c.group,
            rarity: c.rarity, card_type: c.card_type,
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
        const i091uCards = i091uOppHand.map((c: any, i: number) => ({
          id: c.id, name_fr: c.name_fr, name_en: c.name_en,
          title_fr: c.title_fr, title_en: c.title_en,
          chakra: c.chakra ?? 0, power: c.power ?? 0,
          image_file: c.image_file, originalIndex: i,
          effects: c.effects, keywords: c.keywords, group: c.group,
          rarity: c.rarity, card_type: c.card_type,
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
        
        const k093Player = pendingEffect.sourcePlayer;
        const k093EnemySide = k093Player === 'player1' ? 'player2Characters' : 'player1Characters';
        
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
        
        const s109Player = pendingEffect.sourcePlayer;
        const s109PS = newState[s109Player];
        if (pendingEffect.isUpgrade) {
          
          const s109HasAffordable = s109PS.discardPile.some((c) => {
            if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
            if (s109PS.chakra >= Math.max(0, (c.chakra ?? 0) - 2)) return true;
            return canAffordAsUpgrade(newState, s109Player, c as any, 2);
          });
          if (!s109HasAffordable) {
            
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
        
        
        {
          const s109ValidTargets = s109PS.discardPile
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => {
              if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
              
              if (s109PS.chakra >= (c.chakra ?? 0)) return true;
              
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
        
        const s109uPlayer = pendingEffect.sourcePlayer;
        const s109uPS = newState[s109uPlayer];
        const s109uValidTargets = s109uPS.discardPile
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => {
            if (c.card_type !== 'character' || c.group !== 'Leaf Village') return false;
            
            if (s109uPS.chakra >= Math.max(0, (c.chakra ?? 0) - 2)) return true;
            
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
        
        if (i110WeakestTargets.length === 1) {
          
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

      
      
      

      case 'ZABUZA087_CONFIRM_MAIN': {
        
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
        
        const h089Player = pendingEffect.sourcePlayer;
        const h089Opponent = h089Player === 'player1' ? 'player2' : 'player1';
        let h089Data: { missionIndex?: number } = {};
        try { h089Data = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const h089MI = h089Data.missionIndex ?? pendingEffect.sourceMissionIndex;

        if (pendingEffect.isUpgrade) {
          
          if (newState[h089Opponent].deck.length === 0 && newState[h089Player].deck.length === 0) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, h089Player,
              'EFFECT_NO_TARGET', 'Haku (089): Both decks empty (state changed).',
              'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
            break;
          }
          
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

      
      case 'NARUTO133_CHOOSE_TARGET1': {
        
        newState = EffectEngine.naruto133ApplyTarget1(newState, pendingEffect, targetId);
        break;
      }
      case 'NARUTO133_CHOOSE_TARGET2': {
        
        let parsed133t2: { useDefeat?: boolean; target1Id?: string; discardSizeBefore?: number } = {};
        try { parsed133t2 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        if (parsed133t2.useDefeat) {
          
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        } else {
          newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        }
        break;
      }

      
      case 'NARUTO108_CHOOSE_HIDE_TARGET': {
        
        newState = EffectEngine.naruto108ApplyHide(newState, pendingEffect, targetId);
        break;
      }

      
      case 'KYUBI134_CHOOSE_HIDE_TARGETS': {
        newState = EffectEngine.kyubi134ApplyHide(newState, pendingEffect, targetId);
        break;
      }

      
      
      
      case 'SHINO115_MOVE_FRIENDLY': {
        
        let s115Dest = pendingEffect.sourceMissionIndex;
        try { const d = JSON.parse(pendingEffect.effectDescription); s115Dest = d.destMissionIndex ?? s115Dest; } catch { /* use sourceMissionIndex */ }
        newState = EffectEngine.moveCharToMissionDirectPublic(
          newState, targetId, s115Dest,
          pendingEffect.sourcePlayer, 'Shino Aburame', 'KS-115-R',
        );
        break;
      }
      case 'JIRAIYA105_MOVE_ENEMY':
      case 'KANKURO119_MOVE_CHARACTER':
      case 'TEMARI121_MOVE_FRIENDLY':
      case 'TEMARI121_MOVE_ANY':
      case 'ITACHI152_CHOOSE_MOVE':
      case 'ITACHI128_MOVE_FRIENDLY': {
        
        const moveCharResult = EffectEngine.findCharByInstanceId(newState, targetId);
        if (moveCharResult) {
          const validDestMissions: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== moveCharResult.missionIndex) {
              
              if (EffectEngine.validateNameUniquenessForMove(newState, moveCharResult.character, i, moveCharResult.player)) {
                validDestMissions.push(String(i));
              }
            }
          }
          if (validDestMissions.length === 0) {
            
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_BLOCKED',
              `Cannot move ${moveCharResult.character.card.name_fr} â€' no valid destination mission.`,
              'game.log.effect.moveBlocked',
              { target: moveCharResult.character.card.name_fr },
            );
          } else if (validDestMissions.length === 1) {
            
            newState = EffectEngine.moveCharToMissionDirectPublic(
              newState, targetId, parseInt(validDestMissions[0], 10),
              moveCharResult.player, pendingEffect.sourceCardId, pendingEffect.sourceCardId,
              pendingEffect.sourcePlayer, // effectInitiator: the player who owns the move effect
            );
          } else {
            
            const moveEffectId = generateInstanceId();
            const moveActionId = generateInstanceId();
            
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

      
      case 'ROCK_LEE_END_MOVE':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      
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

      
      case 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET': {
        
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        
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

      
      case 'KURENAI116B_MOVE_SELF':
      case 'KAKASHI137_MOVE_SELF':
      case 'PAKKUN_MOVE_DESTINATION':
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        break;

      case 'KAKASHI137_HIDE_UPGRADED': {
        
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }

      
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

        
        if (charId107) {
          
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
          
          if (isUpgrade107 && movedCount107 > 0) {
            newState = applyUpgradePowerup(newState, sasukeId107, movedCount107, player107, srcMission107);
          }
        } else if (rem107StillMoveable.length === 1) {
          
          const lastCharId107 = rem107StillMoveable[0];
          let lastName107 = '';
          for (const m of newState.activeMissions) {
            const c = m[friendlySide107].find((ch) => ch.instanceId === lastCharId107);
            if (c) { lastName107 = c.card.name_fr; break; }
          }
          const lastVm107 = getValidMissions(newState, lastCharId107, player107, srcMission107);
          if (lastVm107.length === 1) {
            
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

      
      case 'SHIKAMARU_MOVE_ENEMY': {
        
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

      
      case 'MOVE_ENEMY_FROM_THIS_MISSION': {
        
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

      
      case 'INO110_CHOOSE_ENEMY': {
        
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
              
              if (pendingEffect.isUpgrade) {
                newState = EffectEngine.hideCharacterWithLog(newState, ino110CharId, pendingEffect.sourcePlayer);
              }
            }
          }
        }
        break;
      }

      
      
      
      case 'HINATA114_POWERUP_TARGET':
        newState = EffectEngine.applyPowerupToTarget(newState, targetId, 1);
        break;

      
      
      
      case 'HINATA114_REMOVE_TOKENS':
        newState = EffectEngine.removeTokensFromTarget(newState, targetId, 99);
        break;

      
      
      
      case 'ASUMA113B_CHOOSE_DISCARD': {
        
        const handIndex_a = parseInt(targetId, 10);
        if (!isNaN(handIndex_a)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_a);
          const discardedCard_a = newState[pendingEffect.sourcePlayer].discardPile[newState[pendingEffect.sourcePlayer].discardPile.length - 1];
          const maxPower = discardedCard_a?.power ?? 0;
          
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
        
        const handIndex_g = parseInt(targetId, 10);
        if (!isNaN(handIndex_g)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_g);
          const discardedCard_g = newState[pendingEffect.sourcePlayer].discardPile[newState[pendingEffect.sourcePlayer].discardPile.length - 1];
          const maxPower_g = discardedCard_g?.power ?? 0;
          
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
        
        newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, 0);
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }

      case 'KIMIMARO123_CHOOSE_DISCARD': {
        
        const handIndex_k = parseInt(targetId, 10);
        if (!isNaN(handIndex_k)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_k);
          
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
        
        const handIndex_n = parseInt(targetId, 10);
        if (!isNaN(handIndex_n)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_n);
          
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
        
        const handIndex_s = parseInt(targetId, 10);
        if (!isNaN(handIndex_s)) {
          newState = EffectEngine.discardFromHand(newState, pendingEffect.sourcePlayer, handIndex_s);
          
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

        
        
        const n133CanTargetHidden = n133UseDefeat || (pendingEffect.isUpgrade ?? false);
        const n133ValidT1 = n133Mission[n133EnemySide]
          .filter((c: CharacterInPlay) => (n133CanTargetHidden || !c.isHidden) && getEffectivePower(newState, c, n133Opponent) <= 5)
          .map((c: CharacterInPlay) => c.instanceId);

        
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

        
        {
          const n133AllTargets = [...new Set([...n133ValidT1, ...n133ValidT2])];
          const n133EffId = generateInstanceId();
          const n133ActId = generateInstanceId();
          
          
          const hasCardInBothGroups = n133ValidT1.some(id => n133ValidT2.includes(id));
          const groupsWithTargets = (n133ValidT1.length > 0 ? 1 : 0) + (n133ValidT2.filter(id => !n133ValidT1.includes(id)).length > 0 ? 1 : 0);
          const n133Min = hasCardInBothGroups ? 1 : Math.max(1, groupsWithTargets);
          newState.pendingEffects.push({
            id: n133EffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133MI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              useDefeat: n133UseDefeat, constraintMode: 'naruto133',
              sourceMissionIndex: n133MI,
              group1: n133ValidT1, group2: n133ValidT2,
            }),
            targetSelectionType: 'ORDERED_DEFEAT',
            sourcePlayer: n133Player, requiresTargetSelection: true,
            validTargets: n133AllTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: pendingEffect.isUpgrade,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133ActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133Player,
            description: n133UseDefeat
              ? 'Naruto Uzumaki (133): Choose enemies to defeat (P≤5 this mission + P≤2 any).'
              : 'Naruto Uzumaki (133): Choose enemies to hide (P≤5 this mission + P≤2 any).',
            descriptionKey: n133UseDefeat ? 'game.effect.desc.naruto133OrderDefeat' : 'game.effect.desc.naruto133OrderHide',
            options: n133AllTargets, minSelections: n133Min, maxSelections: 2,
            sourceEffectId: n133EffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      
      case 'NARUTO133_CONFIRM_UPGRADE_MODIFIER': {
        
        
        const n133mPlayer = pendingEffect.sourcePlayer;
        const n133mOpponent: PlayerID = n133mPlayer === 'player1' ? 'player2' : 'player1';
        const n133mEnemySide: 'player1Characters' | 'player2Characters' =
          n133mPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let n133mParsed: { missionIndex?: number } = {};
        try { n133mParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const n133mMI = n133mParsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const n133mMission = newState.activeMissions[n133mMI];
        if (!n133mMission) break;

        
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

        
        {
          const n133mAllTargets = [...new Set([...n133mValidT1, ...n133mValidT2])];
          const n133mEffId = generateInstanceId();
          const n133mActId = generateInstanceId();
          const hasCardInBothGroupsM = n133mValidT1.some(id => n133mValidT2.includes(id));
          const groupsWithTargetsM = (n133mValidT1.length > 0 ? 1 : 0) + (n133mValidT2.filter(id => !n133mValidT1.includes(id)).length > 0 ? 1 : 0);
          const n133mMin = hasCardInBothGroupsM ? 1 : Math.max(1, groupsWithTargetsM);
          newState.pendingEffects.push({
            id: n133mEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: pendingEffect.sourceInstanceId,
            sourceMissionIndex: n133mMI, effectType: pendingEffect.effectType,
            effectDescription: JSON.stringify({
              useDefeat: true, constraintMode: 'naruto133',
              sourceMissionIndex: n133mMI,
              group1: n133mValidT1, group2: n133mValidT2,
            }),
            targetSelectionType: 'ORDERED_DEFEAT',
            sourcePlayer: n133mPlayer, requiresTargetSelection: true,
            validTargets: n133mAllTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: n133mActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: n133mPlayer,
            description: 'Naruto Uzumaki (133): Choose enemies to defeat (P≤5 this mission + P≤2 any).',
            descriptionKey: 'game.effect.desc.naruto133OrderDefeat',
            options: n133mAllTargets, minSelections: n133mMin, maxSelections: 2,
            sourceEffectId: n133mEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      
      case 'KYUBI134_CONFIRM_UPGRADE': {
        const k134Player = pendingEffect.sourcePlayer;
        const k134Opponent: PlayerID = k134Player === 'player1' ? 'player2' : 'player1';

        
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

      
      case 'SAKURA135_CONFIRM_MAIN': {
        const s135Player = pendingEffect.sourcePlayer;
        const s135PlayerState = newState[s135Player];
        let s135Parsed: { costReduction?: number } = {};
        try { s135Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const s135CostReduction = s135Parsed.costReduction ?? 0;

        
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

        
        const s135Deck = [...s135PlayerState.deck];
        const s135Top3 = s135Deck.splice(0, Math.min(3, s135Deck.length));

        
        newState = {
          ...newState,
          [s135Player]: {
            ...s135PlayerState,
            deck: s135Deck,
          },
        };

        
        const s135Available = s135Top3.filter((card) => {
          if (card.card_type !== 'character') return false;
          const effectiveCost = Math.max(0, (card.chakra ?? 0) - s135CostReduction);
          if (effectiveCost <= newState[s135Player].chakra) return true;
          return canAffordAsUpgrade(newState, s135Player, card as any, s135CostReduction);
        });

        if (s135Available.length === 0) {
          
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

        
        (newState as any)._sakura135DrawnCards = s135Top3;

        
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
                cardId: c.id, image_file: c.image_file,
              })),
              
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

      
      case 'SAKURA135_CONFIRM_UPGRADE_MODIFIER': {
        
        
        const s135mPlayer = pendingEffect.sourcePlayer;
        const s135mPlayerState = newState[s135mPlayer];
        const s135mCostReduction = 4;

        if (s135mPlayerState.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135mPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): Deck is empty (state changed).',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          break;
        }

        
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

        
        (newState as any)._sakura135DrawnCards = s135mTop3;

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
                cardId: c.id, image_file: c.image_file,
              })),
              storedCards: s135mTop3,
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

      
      case 'KAKASHI137_CONFIRM_MAIN': {
        const k137Player = pendingEffect.sourcePlayer;
        let k137Parsed: { missionIndex?: number } = {};
        try { k137Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k137MI = k137Parsed.missionIndex ?? pendingEffect.sourceMissionIndex;
        const k137Mission = newState.activeMissions[k137MI];
        if (!k137Mission) break;

        
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

      
      case 'KAKASHI137_CONFIRM_UPGRADE': {
        const k137uPlayer = pendingEffect.sourcePlayer;
        const k137uFriendlySide: 'player1Characters' | 'player2Characters' =
          k137uPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        let k137uParsed: { missionIndex?: number } = {};
        try { k137uParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const k137uMI = k137uParsed.missionIndex ?? pendingEffect.sourceMissionIndex;

        
        const k137uCharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
        const k137uTopCard = k137uCharResult
          ? (k137uCharResult.character.stack?.length > 0
              ? k137uCharResult.character.stack[k137uCharResult.character.stack?.length - 1]
              : k137uCharResult.character.card)
          : null;
        const k137uCharName = k137uTopCard?.name_fr ?? '';

        
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

      
      case 'OROCHIMARU138_CONFIRM_UPGRADE': {
        const o138Player = pendingEffect.sourcePlayer;
        let o138Parsed: { previousCardName?: string; previousCardPower?: number } = {};
        try { o138Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        
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

      
      case 'GAARA139_CONFIRM_MAIN': {
        const g139Player = pendingEffect.sourcePlayer;
        const g139EnemySide: 'player1Characters' | 'player2Characters' =
          g139Player === 'player1' ? 'player2Characters' : 'player1Characters';
        const g139FriendlySide: 'player1Characters' | 'player2Characters' =
          g139Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let g139Parsed: { useHideSameName?: boolean } = {};
        try { g139Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const g139UseHideSameName = g139Parsed.useHideSameName ?? false;

        
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

      
      case 'GAARA139_CONFIRM_UPGRADE_MODIFIER': {
        
        
        const g139mPlayer = pendingEffect.sourcePlayer;
        const g139mEnemySide: 'player1Characters' | 'player2Characters' =
          g139mPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const g139mFriendlySide: 'player1Characters' | 'player2Characters' =
          g139mPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        
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

        
        
        
        
        
        if (i140HandSize >= 2) {
          newState.pendingDiscardReorder = { discardOwner: i140Opponent, chooser: i140Opponent, count: i140HandSize };
        }

        
        
        
        
        if (i140IsUpgrade && i140HandSize > 0) {
          const i140DefeatTargets: string[] = [];
          for (let mi = 0; mi < newState.activeMissions.length; mi++) {
            const m = newState.activeMissions[mi];
            for (const char of [...m.player1Characters, ...m.player2Characters]) {
              if (char.instanceId === pendingEffect.sourceInstanceId) continue;
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
              description: `Itachi Uchiwa (140) UPGRADE: Defeat a character with cost ${i140HandSize} or less?`,
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

      
      case 'ITACHI140_CONFIRM_UPGRADE': {
        
        
        const i140cPlayer = pendingEffect.sourcePlayer;
        let i140cData: { i140HandSize?: number } = {};
        try { i140cData = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i140cHandSize = i140cData.i140HandSize ?? 0;

        const i140cDefeatTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          const m = newState.activeMissions[mi];
          for (const char of [...m.player1Characters, ...m.player2Characters]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
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
            effectDescription: `Itachi Uchiwa (140) UPGRADE: Defeat a character with cost ${i140cHandSize} or less.`,
            targetSelectionType: 'DEFEAT_BY_COST_UPGRADE',
            sourcePlayer: i140cPlayer, requiresTargetSelection: true,
            validTargets: i140cDefeatTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: true,
            remainingEffectTypes: pendingEffect.remainingEffectTypes,
          });
          newState.pendingActions.push({
            id: i140cActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: i140cPlayer,
            description: `Itachi Uchiwa (140) UPGRADE: Choose a character with cost ${i140cHandSize} or less to defeat.`,
            descriptionKey: 'game.effect.desc.itachi140DefeatByCost',
            descriptionParams: { cost: String(i140cHandSize) },
            options: i140cDefeatTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: i140cEffId,
          });
          pendingEffect.remainingEffectTypes = undefined;
        }
        break;
      }

      
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

      
      case 'ITACHI143_CONFIRM_MAIN': {
        const i143Player = pendingEffect.sourcePlayer;
        const i143FriendlySide: 'player1Characters' | 'player2Characters' =
          i143Player === 'player1' ? 'player1Characters' : 'player2Characters';
        let i143Parsed: { sourceMissionIndex?: number } = {};
        try { i143Parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i143MI = i143Parsed.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const i143DestChars = newState.activeMissions[i143MI][i143FriendlySide];

        
        const i143ValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === i143MI) continue;
          if (isMovementBlockedByKurenai(newState, i, i143Player)) continue;
          for (const char of newState.activeMissions[i][i143FriendlySide]) {
            if (char.instanceId === pendingEffect.sourceInstanceId) continue;
            
            if (!char.isHidden) {
              const topC = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
              const cName = topC.name_fr.toUpperCase();
              if (i143DestChars.some((c: CharacterInPlay) => c.instanceId !== char.instanceId && !c.isHidden && (c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card).name_fr.toUpperCase() === cName)) continue;
            }
            i143ValidTargets.push(char.instanceId);
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

      
      case 'ITACHI143_CONFIRM_AMBUSH': {
        const i143aPlayer = pendingEffect.sourcePlayer;
        const i143aEnemySide: 'player1Characters' | 'player2Characters' =
          i143aPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        let i143aParsed: { sourceMissionIndex?: number } = {};
        try { i143aParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const i143aMI = i143aParsed.sourceMissionIndex ?? pendingEffect.sourceMissionIndex;
        const i143aDestChars = newState.activeMissions[i143aMI][i143aEnemySide];

        
        const i143aValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === i143aMI) continue;
          for (const char of newState.activeMissions[i][i143aEnemySide]) {
            if (isMovementBlockedByKurenai(newState, i, char.controlledBy)) continue;
            
            if (!char.isHidden) {
              const topC = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
              const cName = topC.name_fr.toUpperCase();
              if (i143aDestChars.some((c: CharacterInPlay) => c.instanceId !== char.instanceId && !c.isHidden && (c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card).name_fr.toUpperCase() === cName)) continue;
            }
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

      
      case 'KISAME144_CONFIRM_MAIN': {
        const k144Player = pendingEffect.sourcePlayer;
        const k144Opponent: PlayerID = k144Player === 'player1' ? 'player2' : 'player1';

        if (newState[k144Opponent].chakra <= 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, k144Player,
            'EFFECT_NO_TARGET', 'Kisame Hoshigaki (144): Opponent has no chakra (state changed).',
            'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-144-M' });
          break;
        }

        
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

      
      case 'SASUKE146_CONFIRM_MAIN': {
        const s146Player = pendingEffect.sourcePlayer;

        if (newState.edgeHolder !== s146Player) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s146Player,
            'EFFECT_NO_TARGET', 'Sasuke Uchiwa (146): No longer holds the Edge (state changed).',
            'game.log.effect.noTarget', { card: 'SASUKE UCHIWA', id: 'KS-146-M' });
          break;
        }

        
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

      
      case 'KAKASHI148_CONFIRM_MAIN': {
        const k148Player = pendingEffect.sourcePlayer;

        
        newState = { ...newState, edgeHolder: k148Player };
        newState.log = logAction(newState.log, newState.turn, newState.phase, k148Player,
          'EFFECT_EDGE', 'Kakashi Hatake (148): Gained the Edge token.',
          'game.log.effect.gainEdge', { card: 'KAKASHI HATAKE', id: 'KS-148-M' });
        break;
      }

      
      case 'KAKASHI148_CONFIRM_AMBUSH': {
        const k148aPlayer = pendingEffect.sourcePlayer;
        const k148aFriendlySide: 'player1Characters' | 'player2Characters' =
          k148aPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

        
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
        
        const opponentId146: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        newState = { ...newState, edgeHolder: opponentId146 };
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_EDGE',
          'Sasuke Uchiwa (146): Gave the Edge token to opponent.',
          'game.log.effect.giveEdge',
          { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
        );
        
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

      
      
      
      case 'JIRAIYA008_CHOOSE_SUMMON': {
        
        
        const j008Remaining = pendingEffect.remainingEffectTypes;
        pendingEffect.remainingEffectTypes = undefined;

        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 2);

        
        if (j008Remaining?.length) {
          for (const remainingType of j008Remaining) {
            if (remainingType === 'UPGRADE') {
              const j008CharResult = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
              if (j008CharResult) {
                const j008MI = j008CharResult.missionIndex;
                const j008EnemySide = pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
                const j008Mission = newState.activeMissions[j008MI];
                const j008HideTargets = j008Mission ? (j008Mission as any)[j008EnemySide].filter((c: CharacterInPlay) => {
                  if (c.isHidden) return false;
                  const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
                  return tc.chakra <= 3;
                }) : [];
                if (j008HideTargets.length > 0) {
                  const j008uEffId = generateInstanceId();
                  const j008uActId = generateInstanceId();
                  newState.pendingEffects.push({
                    id: j008uEffId, sourceCardId: pendingEffect.sourceCardId,
                    sourceInstanceId: pendingEffect.sourceInstanceId,
                    sourceMissionIndex: j008MI, effectType: 'UPGRADE' as EffectType,
                    effectDescription: JSON.stringify({ sourceMissionIndex: j008MI }),
                    targetSelectionType: 'JIRAIYA008_CONFIRM_UPGRADE',
                    sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
                    validTargets: [pendingEffect.sourceInstanceId],
                    isOptional: true, isMandatory: false,
                    resolved: false, isUpgrade: true,
                  });
                  newState.pendingActions.push({
                    id: j008uActId, type: 'SELECT_TARGET' as PendingAction['type'],
                    player: pendingEffect.sourcePlayer,
                    description: 'Jiraiya (008) UPGRADE: Hide an enemy with cost 3 or less?',
                    descriptionKey: 'game.effect.desc.jiraiya008ConfirmUpgrade',
                    options: [pendingEffect.sourceInstanceId],
                    minSelections: 1, maxSelections: 1,
                    sourceEffectId: j008uEffId,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case 'JIRAIYA105_CHOOSE_SUMMON': {
        
        
        const j105Remaining = pendingEffect.remainingEffectTypes;
        pendingEffect.remainingEffectTypes = undefined;

        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 3);

        
        
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
        
        const j132Remaining = pendingEffect.remainingEffectTypes;
        pendingEffect.remainingEffectTypes = undefined;

        newState = EffectEngine.playSummonFromHandWithReduction(newState, pendingEffect, targetId, 5);

        
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

      
      
      
      case 'TAYUYA125_CHOOSE_SOUND':
        
        newState = EffectEngine.playCharFromHandWithReduction(newState, pendingEffect, targetId, 2, 'Sound Village', 'Tayuya', 'KS-125-R');
        break;

      case 'ICHIBI130_CHOOSE_MISSION': {
        
        const missionIdx_i = parseInt(targetId, 10);
        if (!isNaN(missionIdx_i) && missionIdx_i >= 0 && missionIdx_i < newState.activeMissions.length) {
          const enemySide_i: 'player1Characters' | 'player2Characters' =
            pendingEffect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const mission_i = newState.activeMissions[missionIdx_i];
          const hiddenEnemies = mission_i[enemySide_i].filter((c: CharacterInPlay) => c.isHidden);
          if (hiddenEnemies.length >= 2) {
            
            const i130cmEffId = generateInstanceId();
            const i130cmActId = generateInstanceId();
            newState.pendingEffects.push({
              id: i130cmEffId, sourceCardId: 'KS-130-R', sourceInstanceId: pendingEffect.sourceInstanceId,
              sourceMissionIndex: missionIdx_i, effectType: 'UPGRADE' as EffectType,
              effectDescription: JSON.stringify({ missionIndex: missionIdx_i }),
              targetSelectionType: 'ORDERED_DEFEAT', sourcePlayer: pendingEffect.sourcePlayer,
              requiresTargetSelection: true, validTargets: hiddenEnemies.map(h => h.instanceId),
              isOptional: false, isMandatory: true, resolved: false, isUpgrade: true,
              descriptionKey: 'game.effect.desc.ichibi130OrderDefeat',
              descriptionParams: { count: String(hiddenEnemies.length) },
            } as PendingEffect);
            newState.pendingActions.push({
              id: i130cmActId, type: 'SELECT_TARGET', player: pendingEffect.sourcePlayer,
              description: `Ichibi (130) UPGRADE: Choose defeat order.`,
              descriptionKey: 'game.effect.desc.ichibi130OrderDefeat',
              descriptionParams: { count: String(hiddenEnemies.length) },
              options: hiddenEnemies.map(h => h.instanceId),
              minSelections: hiddenEnemies.length, maxSelections: hiddenEnemies.length,
              sourceEffectId: i130cmEffId,
            });
          } else {
            
            for (const hidden of hiddenEnemies) {
              newState = EffectEngine.defeatCharacter(newState, hidden.instanceId, pendingEffect.sourcePlayer);
            }
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_DEFEAT',
              `Ichibi (130) UPGRADE: Defeated ${hiddenEnemies.length} hidden enemy character(s) in mission ${missionIdx_i + 1}.`,
              'game.log.effect.defeat',
              { card: 'ICHIBI', id: 'KS-130-R', target: `${hiddenEnemies.length} hidden enemies` },
            );
          }
        }
        break;
      }

      case 'KAKASHI148_COPY_EFFECT': {
        
        const k148Target = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!k148Target) break;

        const k148TopCard = k148Target.character.stack?.length > 0
          ? k148Target.character.stack[k148Target.character.stack?.length - 1]
          : k148Target.character.card;

        
        
        const k148TargetIsUpgraded = k148Target.character.stack?.length > 1;
        const k148Copyable = !isCharacterCopyable(k148TopCard) ? [] : (k148TopCard.effects ?? []).filter((eff) => {
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
          
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, k148TopCard, k148Copyable[0].type as EffectType,
          );
        } else {
          
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
        
        const missionIdx_kb = parseInt(targetId, 10);
        if (!isNaN(missionIdx_kb) && missionIdx_kb >= 0 && missionIdx_kb < newState.activeMissions.length) {
          const player_kb = pendingEffect.sourcePlayer;
          const friendlySide_kb: 'player1Characters' | 'player2Characters' =
            player_kb === 'player1' ? 'player1Characters' : 'player2Characters';
          const opponent_kb = player_kb === 'player1' ? 'player2' : 'player1';
          
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

      
      
      
      
      case 'ORDERED_DEFEAT': {
        let odList: string[] = [];
        try { odList = JSON.parse(targetId); } catch { odList = [targetId]; }
        const odCount = odList.length;
        let odParsed: { isUpgrade?: boolean; sourceInstanceId?: string; sourceMissionIndex?: number; useDefeat?: boolean; constraintMode?: string } = {};
        try { odParsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        
        const odUseDefeat = odParsed.useDefeat !== false; // default true (Gaara, Ichibi always defeat)
        
        
        for (const charId of odList) {
          if (odUseDefeat) {
            newState = EffectEngine.defeatCharacter(newState, charId, pendingEffect.sourcePlayer, odList);
          } else {
            newState = EffectEngine.hideCharacterWithLog(newState, charId, pendingEffect.sourcePlayer);
          }
        }
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          odUseDefeat ? 'EFFECT_DEFEAT' : 'EFFECT_HIDE',
          `${odUseDefeat ? 'Defeated' : 'Hid'} ${odCount} character(s) in chosen order.`,
          'game.log.effect.orderedDefeat', { count: String(odCount) },
        );
        if (odParsed.isUpgrade && odCount > 0 && odParsed.sourceInstanceId != null && odParsed.sourceMissionIndex != null) {
          const g120uEffId = generateInstanceId();
          const g120uActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: g120uEffId, sourceCardId: pendingEffect.sourceCardId,
            sourceInstanceId: odParsed.sourceInstanceId,
            sourceMissionIndex: odParsed.sourceMissionIndex,
            effectType: 'UPGRADE' as EffectType,
            effectDescription: JSON.stringify({ defeatedCount: odCount }),
            targetSelectionType: 'GAARA120_CONFIRM_UPGRADE',
            sourcePlayer: pendingEffect.sourcePlayer, requiresTargetSelection: true,
            validTargets: [odParsed.sourceInstanceId],
            isOptional: true, isMandatory: false, resolved: false, isUpgrade: true,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: g120uActId, type: 'SELECT_TARGET' as PendingAction['type'],
            player: pendingEffect.sourcePlayer,
            description: `Gaara (120) UPGRADE: POWERUP ${odCount}.`,
            descriptionKey: 'game.effect.desc.gaara120ConfirmUpgrade',
            descriptionParams: { count: String(odCount) },
            options: [odParsed.sourceInstanceId],
            minSelections: 1, maxSelections: 1,
            sourceEffectId: g120uEffId,
          }];
        }
        break;
      }

      case 'REORDER_DISCARD': {
        
        
        let reorderList: string[] = [];
        try { reorderList = JSON.parse(targetId); } catch {
          
          reorderList = [targetId];
        }
        let parsedReorder: { count?: number; discardOwner?: string; sakura135Chain?: boolean; costReduction?: number } = {};
        try { parsedReorder = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const reorderCount = parsedReorder.count ?? reorderList.length;
        
        
        const reorderTarget = (parsedReorder.discardOwner as PlayerID) ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1');
        const ownerPS = { ...newState[reorderTarget] };
        const discard = [...ownerPS.discardPile];

        if (discard.length >= reorderCount && reorderList.length === reorderCount) {
          
          const removedCards = discard.splice(-reorderCount, reorderCount);
          
          
          
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

        
        if (parsedReorder.sakura135Chain) {
          const s135Player = reorderTarget;
          
          const s135ChosenCard = (parsedReorder as any).chosenCard ?? null;
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

      
      
      case 'REVEAL_HIDDEN_UPGRADE_OR_FRESH': {
        let rhMeta: { hiddenInstanceId?: string; costReduction?: number; powerUpBonus?: number } = {};
        try { rhMeta = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const rhInstanceId = rhMeta.hiddenInstanceId ?? '';
        const rhReduction = rhMeta.costReduction ?? 0;
        const rhPowerUp = rhMeta.powerUpBonus ?? 0;

        if (targetId === 'FRESH') {
          
          
          const rhChar = EffectEngine.findCharByInstanceId(newState, rhInstanceId);
          if (rhChar) {
            
            
            
            const rhPlayer = pendingEffect.sourcePlayer;
            const rhPs = newState[rhPlayer];
            const rhTopCard = rhChar.character.stack?.length > 0 ? rhChar.character.stack[rhChar.character.stack.length - 1] : rhChar.character.card;
            const rhFreshCost = Math.max(0, (rhTopCard.chakra ?? 0) - rhReduction);
            if (rhPs.chakra >= rhFreshCost) {
              rhPs.chakra -= rhFreshCost;
              rhChar.character.isHidden = false;
              rhChar.character.wasRevealedAtLeastOnce = true;
              if (rhPowerUp > 0) rhChar.character.powerTokens += rhPowerUp;
              
              const rhMission = newState.activeMissions[rhChar.missionIndex];
              const rhSide = rhPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
              const rhIdx = rhMission[rhSide].findIndex((c: CharacterInPlay) => c.instanceId === rhInstanceId);
              if (rhIdx >= 0) rhMission[rhSide][rhIdx] = { ...rhChar.character };
              rhPs.charactersInPlay = EffectEngine.countCharsForPlayer(newState, rhPlayer);
              newState = EffectEngine.resolvePlayEffects(newState, rhPlayer, rhChar.character, rhChar.missionIndex, false);
            }
          }
        } else {
          
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
          
          
          newState = EffectEngine.genericPlaceOnMissionForced(
            newState, pendingEffect.sourcePlayer, mi_upch,
            meta_upch.cardName ?? '', meta_upch.cardId ?? '', meta_upch.costReduction ?? 0, false,
          );
        } else {
          
          newState = EffectEngine.genericPlaceOnMissionForced(
            newState, pendingEffect.sourcePlayer, mi_upch,
            meta_upch.cardName ?? '', meta_upch.cardId ?? '', meta_upch.costReduction ?? 0, true, targetId,
          );
        }
        break;
      }

      
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

          
          (newState as any)._hiruzen002PlayedCharId = charInPlay_h002.instanceId;

          newState = EffectEngine.resolvePlayEffects(newState, player_h002, charInPlay_h002, mi_h002, false);
        } else {
          
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

          
          (newState as any)._hiruzen002PlayedCharId = updatedChars_h002[existIdx_h002].instanceId;

          newState = EffectEngine.resolvePlayEffects(newState, player_h002, updatedChars_h002[existIdx_h002], mi_h002, true);
        }
        break;
      }

      
      
      
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

      
      case 'YASHAMARU085_CONFIRM_SELF_DEFEAT': {
        
        const yashMIdx = pendingEffect.sourceMissionIndex;
        const yashSourceId = pendingEffect.sourceInstanceId;
        const yashPlayer = pendingEffect.sourcePlayer;
        newState = defeatFriendlyCharacter(newState, yashMIdx, yashSourceId, yashPlayer);

        
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

      
      case 'OROCHIMARU051_CHOOSE_DESTINATION': {
        const destMIdx_o51 = parseInt(targetId, 10);
        if (!isNaN(destMIdx_o51) && destMIdx_o51 >= 0 && destMIdx_o51 < newState.activeMissions.length) {
          const srcMIdx_o51 = pendingEffect.sourceMissionIndex;
          const charResult_o51 = EffectEngine.findCharByInstanceId(newState, pendingEffect.sourceInstanceId);
          if (charResult_o51) {
            const side_o51 = charResult_o51.player === 'player1' ? 'player1Characters' : 'player2Characters';
            
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

      
      case 'GEMMA049_SACRIFICE_CHOICE': {
        
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

      
      case 'GEMMA049_SACRIFICE_HIDE_CHOICE': {
        
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
        
        if (g049HideData.batchRemainingTargets && g049HideData.batchRemainingTargets.length > 0) {
          const batchPlayer = (g049HideData.batchSourcePlayer ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as PlayerID;
          newState = EffectEngine.resumeBatchHideAfterGemma(newState, g049HideData.batchRemainingTargets, batchPlayer);
        }
        break;
      }

      
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

        
        
        let batchHiddenCount = 0;
        for (const batchTargetId of batchAll) {
          if (batchTargetId === protectedCharId) continue; // Skip the protected char
          newState = EffectEngine.hideCharacterWithLog(newState, batchTargetId, batchSourceP, true);
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
        
        const idx_as = parseInt(targetId, 10);
        const ps_as = { ...newState[pendingEffect.sourcePlayer] };
        if (idx_as >= 0 && idx_as < ps_as.hand.length) {
          const hand_as = [...ps_as.hand];
          const discarded_as = hand_as.splice(idx_as, 1)[0];
          ps_as.hand = hand_as;
          ps_as.discardPile = [...ps_as.discardPile, discarded_as];
          newState = { ...newState, [pendingEffect.sourcePlayer]: ps_as };
          
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

          
          const opponentPlayer_ss = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
          const oppHand_ss = newState[opponentPlayer_ss].hand;
          if (oppHand_ss.length > 0) {
            if (oppHand_ss.length === 1) {
              
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
            
            newState = EffectEngine.hideCharacterWithLog(newState, validHideTargets_km[0], pendingEffect.sourcePlayer);
          } else if (validHideTargets_km.length > 1) {
            
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
        
        
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }
      case 'KIN073_CHOOSE_DISCARD': {
        
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
        
        newState = EffectEngine.hideCharacterWithLog(newState, targetId, pendingEffect.sourcePlayer);
        break;
      }
      case 'DISCARD_FROM_OPPONENT_HAND': {
        
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

      
      
      
      case 'CHOJI_018_MOVE_SELF': {
        
        newState = EffectEngine.moveSelfToMission(newState, pendingEffect, targetId);
        const destMIdx018 = parseInt(targetId, 10);
        if (!isNaN(destMIdx018)) {
          const { postMoveHide } = require('./handlers/KS/uncommon/choji018');
          const hideResult = postMoveHide(newState, pendingEffect.sourceInstanceId, destMIdx018, pendingEffect.sourcePlayer);
          if (hideResult.requiresTargetSelection && hideResult.validTargets && hideResult.validTargets.length > 0) {
            
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

      
      
      
      case 'MOVE_CHARACTER_POWER_4_OR_LESS':
      case 'MOVE_FRIENDLY_SAND_VILLAGE':
      case 'KIDOMARU060_CHOOSE_CHARACTER': {
        
        const moveChar = EffectEngine.findCharByInstanceId(newState, targetId);
        if (moveChar) {
          const validDests_mv: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            if (i !== moveChar.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, moveChar.character, i, moveChar.player)) validDests_mv.push(String(i));
          }
          if (validDests_mv.length === 1) {
            
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

      
      
      
      
      case 'KANKURO078_REVEAL_HIDDEN_REDUCED': {
        const charResult_k78 = EffectEngine.findCharByInstanceId(newState, targetId);
        if (!charResult_k78) break;

        const { missionIndex: mIdx_k78, player: charPlayer_k78, character: hiddenChar_k78 } = charResult_k78;
        const side_k78 = charPlayer_k78 === 'player1' ? 'player1Characters' : 'player2Characters';
        if (!hiddenChar_k78.isHidden) break; // sanity check

        const topCard_k78 = hiddenChar_k78.stack?.length > 0
          ? hiddenChar_k78.stack[hiddenChar_k78.stack?.length - 1]
          : hiddenChar_k78.card;

        if (isHiddenRevealBlocked(newState, mIdx_k78, pendingEffect.sourcePlayer)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_BLOCKED', `Kankuro (078): Cannot reveal ${topCard_k78.name_fr}, Shikamaru Nara is blocking hidden plays in this mission.`,
            'game.log.effect.shikamaruBlockReveal', { card: topCard_k78.name_fr });
          break;
        }

        
        const friendlySide_k78 = pendingEffect.sourcePlayer === "player1" ? "player1Characters" : "player2Characters";
        const m_k78_check = newState.activeMissions[mIdx_k78];
        const upgradeTargetIdx_k78 = findUpgradeTargetIdx(m_k78_check[friendlySide_k78], topCard_k78, targetId);
        const upgradeTarget_k78 = upgradeTargetIdx_k78 >= 0 ? m_k78_check[friendlySide_k78][upgradeTargetIdx_k78] : null;

        
        if (upgradeTarget_k78) {
          const existingTC_k78 = upgradeTarget_k78.stack?.length > 0 ? upgradeTarget_k78.stack[upgradeTarget_k78.stack?.length - 1] : upgradeTarget_k78.card;
          const isFlexUpgrade_k78 = checkFlexibleUpgrade(topCard_k78 as any, existingTC_k78);
          const hasNameConflict_k78 = m_k78_check[friendlySide_k78].some((c: CharacterInPlay) => {
            if (c.instanceId === targetId || c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return cTop.name_fr.toUpperCase() === topCard_k78.name_fr.toUpperCase();
          });
          const canFreshReveal_k78 = !hasNameConflict_k78;

          
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

        
        if (!upgradeTarget_k78) {
          const hasNameConflictFresh_k78 = newState.activeMissions[mIdx_k78][friendlySide_k78].some((c: CharacterInPlay) => {
            if (c.instanceId === targetId || c.isHidden) return false;
            const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
            return cTop.name_fr.toUpperCase() === topCard_k78.name_fr.toUpperCase();
          });
          if (hasNameConflictFresh_k78) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_BLOCKED', `Kankuro (078): Cannot reveal ${topCard_k78.name_fr} — same name already visible in this mission.`,
              'game.log.effect.nameConflictBlocked', { card: 'KANKURO', id: 'KS-078-UC', target: topCard_k78.name_fr });
            break;
          }
        }

        
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

        
        const missions_k78 = [...newState.activeMissions];
        const m_k78 = { ...missions_k78[mIdx_k78] };
        const chars_k78 = [...m_k78[side_k78]];
        const cidx_k78 = chars_k78.findIndex(c => c.instanceId === targetId);
        if (cidx_k78 !== -1) {
          chars_k78[cidx_k78] = { ...chars_k78[cidx_k78], isHidden: false, wasRevealedAtLeastOnce: true };


          if (upgradeTarget_k78) {
            const upgradeCharIdx_k78 = chars_k78.findIndex(c => c.instanceId === upgradeTarget_k78.instanceId);
            if (upgradeCharIdx_k78 >= 0) {
              const revealedCharData = chars_k78[cidx_k78];
              const prev_k78 = chars_k78[upgradeCharIdx_k78];
              const wasControlled_k78 = prev_k78.controlledBy !== prev_k78.originalOwner;
              chars_k78[upgradeCharIdx_k78] = {
                ...prev_k78,
                card: revealedCharData.card,
                stack: [...prev_k78.stack, ...revealedCharData.stack],
                powerTokens: prev_k78.powerTokens + revealedCharData.powerTokens,
                controllerInstanceId:
                  wasControlled_k78 ||
                  (prev_k78.controllerInstanceId && prev_k78.controlledBy === pendingEffect.sourcePlayer)
                    ? undefined
                    : prev_k78.controllerInstanceId,
                originalOwner: wasControlled_k78 ? pendingEffect.sourcePlayer : prev_k78.originalOwner,
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
            if (upgradeTarget_k78) {
              
              newState = EffectEngine.resolveRevealUpgradeEffects(newState, pendingEffect.sourcePlayer, revealedChar_k78, mIdx_k78);
            } else {
              
              newState = EffectEngine.resolveRevealEffects(newState, pendingEffect.sourcePlayer, revealedChar_k78, mIdx_k78);
            }
          }
        }
        break;
      }

      
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

        if (isHiddenRevealBlocked(newState, mIdx_k78r, pendingEffect.sourcePlayer)) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
            'EFFECT_BLOCKED', `Kankuro (078): Cannot reveal ${topCard_k78r.name_fr}, Shikamaru Nara is blocking hidden plays in this mission.`,
            'game.log.effect.shikamaruBlockReveal', { card: topCard_k78r.name_fr });
          break;
        }

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
            const prev_k78r = chars_k78r[upgradeCharIdx_k78r];
            const wasControlled_k78r = prev_k78r.controlledBy !== prev_k78r.originalOwner;
            chars_k78r[upgradeCharIdx_k78r] = {
              ...prev_k78r,
              card: revealedData_k78r.card,
              stack: [...prev_k78r.stack, ...revealedData_k78r.stack],
              powerTokens: prev_k78r.powerTokens + revealedData_k78r.powerTokens,
              controllerInstanceId:
                wasControlled_k78r ||
                (prev_k78r.controllerInstanceId && prev_k78r.controlledBy === pendingEffect.sourcePlayer)
                  ? undefined
                  : prev_k78r.controllerInstanceId,
              originalOwner: wasControlled_k78r ? pendingEffect.sourcePlayer : prev_k78r.originalOwner,
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
          if (isCardUpgrade_k78r) {
            newState = EffectEngine.resolveRevealUpgradeEffects(newState, pendingEffect.sourcePlayer, resultChar_k78r, mIdx_k78r);
          } else {
            newState = EffectEngine.resolveRevealEffects(newState, pendingEffect.sourcePlayer, resultChar_k78r, mIdx_k78r);
          }
        }
        break;
      }

      
      
      
      case 'PLAY_HIDDEN_FROM_HAND_FREE': {
        
        const validMissions_ph: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          validMissions_ph.push(String(i));
        }
        if (validMissions_ph.length === 1) {
          
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

      
      
      
      
      case 'FORCE_REVEAL_OR_DEFEAT': {
        
        
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
        const revealLocked_dosu = isHiddenRevealBlocked(newState, charResult_dosu.missionIndex, opponentPlayer_dosu);

        if (!canAfford_dosu || revealLocked_dosu) {
          newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
          if (revealLocked_dosu) {
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_DEFEAT', `Dosu Kinuta (069): Reveal blocked by Shikamaru Nara, ${topCard_dosu.name_fr} defeated.`,
              'game.log.effect.dosu069LockDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', target: topCard_dosu.name_fr });
          } else {
            newState.log = logAction(newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
              'EFFECT_DEFEAT', `Dosu Kinuta (069): Opponent cannot afford to reveal (cost ${revealCost_dosu}), character defeated.`,
              'game.log.effect.dosu069AutoDefeat', { card: 'DOSU KINUTA', id: 'KS-069-UC', cost: String(revealCost_dosu) });
          }
          break;
        }

        
        
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
        
        newState.pendingForcedResolver = opponentPlayer_dosu;
        break;
      }

      case 'DOSU069_OPPONENT_CHOICE': {
        
        let parsed_dosu69: { targetInstanceId?: string; revealCost?: number; sourcePlayer?: string } = {};
        try { parsed_dosu69 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const targetInst_dosu69 = parsed_dosu69.targetInstanceId ?? targetId;
        const revCost_dosu69 = parsed_dosu69.revealCost ?? 0;
        const opponent_dosu69 = pendingEffect.selectingPlayer ?? (pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1');

        
        const charResult_dosu69 = EffectEngine.findCharByInstanceId(newState, targetInst_dosu69);
        if (!charResult_dosu69) break;
        const mIdx_dosu69 = charResult_dosu69.missionIndex;
        const side_dosu69: 'player1Characters' | 'player2Characters' =
          opponent_dosu69 === 'player1' ? 'player1Characters' : 'player2Characters';
        const charTopCard_dosu69 = charResult_dosu69.character.stack?.length > 0
          ? charResult_dosu69.character.stack[charResult_dosu69.character.stack?.length - 1]
          : charResult_dosu69.character.card;

        
        const friendlyChars_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69];
        const upgradeTarget_dosu69 = friendlyChars_dosu69.find((c) => {
          if (c.instanceId === targetInst_dosu69 || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          if ((charTopCard_dosu69.chakra ?? 0) <= (cTop.chakra ?? 0)) return false;
          return cTop.name_fr.toUpperCase() === charTopCard_dosu69.name_fr.toUpperCase();
        });

        
        let actualCost_dosu69 = revCost_dosu69;
        if (upgradeTarget_dosu69) {
          const oldTop_dosu69 = upgradeTarget_dosu69.stack?.length > 0
            ? upgradeTarget_dosu69.stack[upgradeTarget_dosu69.stack?.length - 1]
            : upgradeTarget_dosu69.card;
          const upgradeDiff = Math.max(0, (charTopCard_dosu69.chakra ?? 0) - (oldTop_dosu69.chakra ?? 0));
          actualCost_dosu69 = upgradeDiff + 2; // Dosu penalty (+2) applies on top of upgrade cost difference
        }

        
        const ps_dosu69 = { ...newState[opponent_dosu69] };
        ps_dosu69.chakra -= actualCost_dosu69;
        newState = { ...newState, [opponent_dosu69]: ps_dosu69 };

        if (upgradeTarget_dosu69) {
          
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

            
            const upgradedChar_dosu69 = newState.activeMissions[mIdx_dosu69][side_dosu69].find(
              c => c.instanceId === upgradeTarget_dosu69.instanceId
            );
            if (upgradedChar_dosu69) {
              newState = EffectEngine.resolveRevealUpgradeEffects(newState, opponent_dosu69, upgradedChar_dosu69, mIdx_dosu69);
            }
          }
        } else {
          
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

      
      
      
      case 'KAKASHI106_DEVOLVE_TARGET': {
        newState = EffectEngine.devolveUpgradedCharacter(newState, pendingEffect, targetId);
        break;
      }

      
      
      
      
      
      
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
          
          newState = EffectEngine.executeCopiedEffect(
            newState, pendingEffect, copyTargetTopCard, copyableEffects[0].type as EffectType,
          );
        } else {
          
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
            
            
            wasRevealed: pendingEffect.wasRevealed ?? false,
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

      
      
      
      
      
      
      case 'COPY_EFFECT_CHOSEN': {
        let parsedCopy: { charInstanceId?: string; cardId?: string; cardName?: string } = {};
        try { parsedCopy = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const chosenEffectType = targetId.split('::')[0] as EffectType;

        if (!parsedCopy.cardId || !chosenEffectType) break;

        
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

      
      case 'KABUTO053_CHOOSE_MISSION': {
        let parsed_kb3: { discardIndex?: number; reducedCost?: number } = {};
        try { parsed_kb3 = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const missionIdx_kb3 = parseInt(targetId, 10);
        const cost_kb3 = parsed_kb3.reducedCost ?? 0;
        const discardIdx_kb3 = parsed_kb3.discardIndex;
        newState = EffectEngine.kabuto053PlayFromDiscard(newState, pendingEffect.sourcePlayer, missionIdx_kb3, cost_kb3, discardIdx_kb3);
        break;
      }

      
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

      
      case 'HIRUZEN002_CHOOSE_CARD': {
        const player = pendingEffect.sourcePlayer;

        
        if (targetId.startsWith('HIDDEN_')) {
          const instanceId_h002 = targetId.slice(7);

          
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

          
          newState = EffectEngine.revealHiddenWithReduction(newState, pendingEffect, instanceId_h002, 1, 0);

          
          (newState as any)._hiruzen002PlayedCharId = resultingInstanceId_h002;
          break;
        }

        
        const rawId_h002 = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
        const cardIndex = parseInt(rawId_h002, 10);
        const ps = newState[player];
        if (cardIndex < 0 || cardIndex >= ps.hand.length) break;

        const card = ps.hand[cardIndex];

        
        
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

        
        if (validMissions.length === 1) {
          newState = EffectEngine.hiruzen002PlaceCard(newState, pendingEffect, cardIndex, parseInt(validMissions[0], 10));
          break;
        }

        
        
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

      
      case 'HIRUZEN002_CHOOSE_MISSION': {
        let parsed: { cardIndex: number; isUpgrade?: boolean } = { cardIndex: -1 };
        try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
        const missionIdx = parseInt(targetId, 10);
        newState = EffectEngine.hiruzen002PlaceCard(newState, pendingEffect, parsed.cardIndex, missionIdx);
        break;
      }

      case 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT': {
        
        
        let jirDesc: { missionIndex?: number; sourcePlayer?: string; defeatedIds?: string[] } = {};
        try { jirDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const missionIdx_j = jirDesc.missionIndex ?? pendingEffect.sourceMissionIndex;
        const jirSourcePlayer = (jirDesc.sourcePlayer ?? pendingEffect.sourcePlayer) as PlayerID;
        const defeatedIds_j: string[] = jirDesc.defeatedIds ?? [];

        
        newState = EffectEngine.defeatCharacter(newState, targetId, jirSourcePlayer);
        defeatedIds_j.push(targetId);
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, jirSourcePlayer,
          'EFFECT_DEFEAT',
          `Jiraya (132) UPGRADE: Opponent's character defeated in mission ${missionIdx_j + 1}.`,
          'game.log.effect.defeat',
          { card: 'JIRAYA', id: 'KS-132-S', target: targetId },
        );

        
        const enemySide_j: 'player1Characters' | 'player2Characters' =
          jirSourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const opponent_j = jirSourcePlayer === 'player1' ? 'player2' : 'player1';

        
        newState.pendingForcedResolver = opponent_j;

        const mission_j = newState.activeMissions[missionIdx_j];
        if (mission_j) {
          
          const allEnemyChars_j = mission_j[enemySide_j];
          
          const defeatableChars_j = allEnemyChars_j
            .filter((c: CharacterInPlay) => !isImmuneToEnemyHideOrDefeat(c));

          
          if (allEnemyChars_j.length > 2 && defeatableChars_j.length > 0 && defeatedIds_j.length < 10) {
            
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
        
        let gaaraDesc: { defeatedCount?: number; nextMissionIndex?: number; isUpgrade?: boolean; sourceInstanceId?: string; sourceMissionIndex?: number; missionIndex?: number } = {};
        try { gaaraDesc = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

        const missionIdx_g = gaaraDesc.missionIndex ?? 0;
        let defeatedCount_g = gaaraDesc.defeatedCount ?? 0;

        
        {
          const chosenChar = EffectEngine.findCharByInstanceId(newState, targetId);
          if (chosenChar) {
            const chosenTop = chosenChar.character.stack?.length > 0 ? chosenChar.character.stack[chosenChar.character.stack?.length - 1] : chosenChar.character.card;
            console.log(`[GAARA120_CHOOSE_DEFEAT] Player chose targetId=${targetId} name=${chosenTop.name_fr} id=${chosenTop.id} hidden=${chosenChar.character.isHidden} mission=${chosenChar.missionIndex} validTargets=[${pendingEffect.validTargets?.join(', ')}]`);
          } else {
            console.warn(`[GAARA120_CHOOSE_DEFEAT] Chosen targetId=${targetId} NOT FOUND in state! validTargets=[${pendingEffect.validTargets?.join(', ')}]`);
          }
        }

        
        const g120DefenderSide: PlayerID = pendingEffect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        const g120DiscardBefore = newState[g120DefenderSide].discardPile.length;
        newState = EffectEngine.defeatCharacter(newState, targetId, pendingEffect.sourcePlayer);
        
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
        
        if (!defeatName_g) defeatName_g = 'enemy';
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pendingEffect.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (120): Defeated enemy ${defeatName_g} in mission ${missionIdx_g + 1}.`,
          'game.log.effect.defeat',
          { card: 'GAARA', id: 'KS-120-R', target: defeatName_g },
        );

        
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

      
      case 'TSUNADE104_CHOOSE_CHAKRA': {
        const chakraAmount = parseInt(targetId, 10);
        if (!isNaN(chakraAmount) && chakraAmount > 0) {
          
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
        
        console.error(`[EffectEngine] UNHANDLED targetSelectionType: "${pendingEffect.targetSelectionType}" for card ${pendingEffect.sourceCardId} (${pendingEffect.effectType}). Effect DROPPED. Add a case to applyTargetedEffect().`);
        break;
    }

    } catch (err) {
      console.error(`[EffectEngine] Error in applyTargetedEffect for ${pendingEffect.targetSelectionType}:`, err);
      
      newState = deepClone(state);
    }

    
    
    
    if (parentWasOptional) {
      for (const pe of newState.pendingEffects) {
        if (!preDispatchPendingIds.has(pe.id) && pe.id !== pendingEffect.id) {
          pe.rootOptional = true;
        }
      }
    }

    newState.pendingEffects = newState.pendingEffects.filter((pe) => pe.id !== pendingEffect.id);
    newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== pendingEffect.id);

    
    if (pendingEffect.remainingEffectTypes && pendingEffect.remainingEffectTypes.length > 0) {
      
      
      const hasOtherPendings = newState.pendingEffects.length > 0 || newState.pendingActions.length > 0;
      if (hasOtherPendings) {
        
        
        const chainData: Record<string, unknown> = {};
        if ((newState as any)._tsunade104ChakraSpent !== undefined) {
          chainData._tsunade104ChakraSpent = (newState as any)._tsunade104ChakraSpent;
        }
        newState.pendingContinuation = {
          sourceCardId: pendingEffect.sourceCardId,
          sourceInstanceId: pendingEffect.sourceInstanceId,
          sourceMissionIndex: pendingEffect.sourceMissionIndex,
          sourcePlayer: pendingEffect.sourcePlayer,
          remainingEffectTypes: [...pendingEffect.remainingEffectTypes],
          isUpgrade: pendingEffect.isUpgrade,
          wasRevealed: pendingEffect.wasRevealed ?? false,
          chainData: Object.keys(chainData).length > 0 ? chainData : undefined,
        };
      } else {
        
        newState = EffectEngine.processRemainingEffects(newState, pendingEffect);
      }
    }

    return newState;
  }

  
  static processRemainingEffects(state: GameState, resolvedPending: PendingEffect): GameState {
    let newState = state;
    const remaining = resolvedPending.remainingEffectTypes ?? [];

    
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

  
  static stealTokensFromTarget(state: GameState, pending: PendingEffect, targetId: string, maxSteal: number): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const stolen = Math.min(charResult.character.powerTokens, maxSteal);
    let newState = EffectEngine.removeTokensFromTarget(state, targetId, stolen);
    newState = EffectEngine.applyPowerupToTarget(newState, pending.sourceInstanceId, stolen);
    return newState;
  }

  
  static moveCharacterToMission(state: GameState, targetId: string): GameState {
    const parts = targetId.split(':');
    if (parts.length < 2) return state;
    const instanceId = parts[0];
    const destMissionIndex = parseInt(parts[1], 10);
    if (isNaN(destMissionIndex)) return state;

    const charResult = EffectEngine.findCharByInstanceId(state, instanceId);
    if (!charResult) return state;
    if (charResult.missionIndex === destMissionIndex) return state;

    
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

    
    const isP1 = charResult.player === 'player1';
    const srcKey = isP1 ? 'player1Characters' : 'player2Characters';
    const charIdx = srcMission[srcKey].findIndex((c: CharacterInPlay) => c.instanceId === instanceId);
    if (charIdx === -1) return state;

    const [movedChar] = srcMission[srcKey].splice(charIdx, 1);
    movedChar.missionIndex = destMissionIndex;

    
    destMission[srcKey].push(movedChar);

    
    const movedTopCard = movedChar.stack?.length > 0 ? movedChar.stack[movedChar.stack?.length - 1] : movedChar.card;
    if (movedTopCard.number === 100 && !movedChar.isHidden) {
      const hasNHEffect = (movedTopCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moves to a different mission'),
      );
      if (hasNHEffect) {
        
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

  
  static devolveUpgradedCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const { character, missionIndex, player } = charResult;
    if (character.stack?.length <= 1) {
      
      return state;
    }

    const newState = deepClone(state);
    const isP1 = player === 'player1';
    const sideKey: 'player1Characters' | 'player2Characters' = isP1 ? 'player1Characters' : 'player2Characters';
    const mission = newState.activeMissions[missionIndex];
    const charIdx = mission[sideKey].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (charIdx === -1) return state;

    const targetChar = mission[sideKey][charIdx];

    
    const newStack = [...targetChar.stack];
    const discardedCard = newStack.pop()!;
    const newTopCard = newStack[newStack.length - 1];

    
    mission[sideKey][charIdx] = {
      ...targetChar,
      stack: newStack,
      card: newTopCard,
    };

    
    const enemyPS = { ...newState[player] };
    enemyPS.discardPile = [...enemyPS.discardPile, discardedCard];
    newState[player] = enemyPS;

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, pending.sourcePlayer,
      'EFFECT_DEVOLVE',
      `Kakashi Hatake (106): Removed ${discardedCard.name_en || discardedCard.name_fr} from enemy ${newTopCard.name_en || newTopCard.name_fr}'s stack (de-evolved).`,
      'game.log.effect.devolve',
      { card: 'KAKASHI HATAKE', id: 'KS-106-R', target: discardedCard.name_fr, target_en: discardedCard.name_en || discardedCard.name_fr },
    );

    
    
    
    
    if (!mission[sideKey][charIdx].isHidden) {
      const newTopName = newTopCard.name_fr.toUpperCase();
      const duplicate = mission[sideKey].some((c: CharacterInPlay, i: number) => {
        if (i === charIdx) return false;
        if (c.isHidden) return false;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return cTop.name_fr.toUpperCase() === newTopName;
      });
      if (duplicate) {
        const removed = mission[sideKey].splice(charIdx, 1)[0];
        for (const card of removed.stack) {
          newState[removed.originalOwner].discardPile.push({ ...card, instanceId: removed.instanceId } as any);
        }
        newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
        newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');
        newState.log = logAction(
          newState.log, newState.turn, newState.phase, pending.sourcePlayer,
          'EFFECT',
          `${newTopCard.name_en || newTopCard.name_fr} revealed under the stack but a duplicate was already in this mission — discarded (No Repetition).`,
          'game.log.effect.controlReturnedConflict',
          { card: newTopCard.name_fr, card_en: newTopCard.name_en || newTopCard.name_fr, target: newTopCard.name_fr, target_en: newTopCard.name_en || newTopCard.name_fr },
        );
      }
    }

    
    
    
    if (pending.isUpgrade) {
      const copier106WasRevealed = pending.wasRevealed ?? false;
      const copyableEffects = !isCharacterCopyable(discardedCard) ? [] : (discardedCard.effects ?? []).filter(
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
        
        return EffectEngine.executeCopiedEffect(
          newState, pending, discardedCard, copyableEffects[0].type as EffectType,
        );
      } else if (copyableEffects.length > 1) {
        
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

  
  static moveSelfToMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const destMissionIndex = parseInt(targetId, 10);
    if (isNaN(destMissionIndex)) return state;

    return EffectEngine.moveCharacterToMission(state, `${pending.sourceInstanceId}:${destMissionIndex}`);
  }

  
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

    
    newState.log = logAction(
      newState.log, newState.turn, 'action', pending.sourcePlayer,
      'EFFECT', `Orochimaru looks at hidden enemy: ${targetChar.card.name_fr} (cost ${actualCost}).`,
      'game.log.effect.lookAtHidden',
      { card: 'Orochimaru', id: pending.sourceCardId, target: targetChar.card.name_fr },
    );

    
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

  
  static orochimaruExecuteSteal(state: GameState, pending: PendingEffect): GameState {
    let parsed: { targetInstanceId: string; canSteal: boolean; cardName: string; missionIndex: number };
    try { parsed = JSON.parse(pending.effectDescription); } catch { return state; }

    if (!parsed.canSteal) {
      
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

  
  static itachi091ResolveReveal(state: GameState, pending: PendingEffect): GameState {
    let parsed: { cardName: string; isUpgrade: boolean; chosenIndex: number; randomIndex?: number };
    try { parsed = JSON.parse(pending.effectDescription); } catch { return state; }

    if (!parsed.isUpgrade) {
      
      return state;
    }

    
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

  

  

  
  static createReorderDiscardPending(
    state: GameState, discardOwner: PlayerID, effectSourcePlayer: PlayerID, count: number,
    selectingPlayer?: PlayerID, chainData?: Record<string, unknown>,
  ): GameState {
    const newState = { ...state };
    const discard = newState[discardOwner].discardPile;
    if (discard.length < 2 || count < 2) return state;

    const actualCount = Math.min(count, discard.length);
    const cardsToOrder = discard.slice(-actualCount);
    
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
      originPlayer: effectSourcePlayer,
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

  static defeatCharacter(state: GameState, targetId: string, sourcePlayer?: PlayerID, simultaneousDefeatIds?: string[]): GameState {
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

    
    const replacement = EffectEngine.checkDefeatReplacement(
      state, charResult.character, charResult.player, charResult.missionIndex, isEnemyEffect,
    );
    if (replacement.replaced) {
      if (replacement.replacement === 'immune') {
        
        return state;
      }
      if (replacement.replacement === 'hide') {
        return EffectEngine.hideCharacter(state, targetId);
      }
      if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
        
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
    
    
    newState = triggerOnDefeatEffects(newState, charResult.character, charResult.player, simultaneousDefeatIds);
    return newState;
  }

  
  static defeatCharacterDirect(state: GameState, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    
    let preState = EffectEngine.restoreControlOnLeave(state, targetId);

    const newState = deepClone(preState);
    const charResult2 = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult2) return newState;
    const mission = newState.activeMissions[charResult2.missionIndex];
    const key = charResult2.player === 'player1' ? 'player1Characters' : 'player2Characters';

    const idx = mission[key].findIndex((c: CharacterInPlay) => c.instanceId === targetId);
    if (idx === -1) return state;

    const defeated = mission[key].splice(idx, 1)[0];

    
    const owner = defeated.originalOwner;
    const hasTsunade004 = EffectEngine.hasTsunade004Active(newState, charResult2.player);
    if (hasTsunade004 && charResult2.player === owner) {
      
      const topCard = defeated.stack?.length > 0 ? defeated.stack[defeated.stack?.length - 1] : null;
      const underCards = defeated.stack?.length > 1 ? defeated.stack.slice(0, -1) : [];
      if (topCard) newState[owner].hand.push(topCard);
      for (let ui = 0; ui < underCards.length; ui++) {
        const card = underCards[ui];
        const discardCard = { ...card, instanceId: defeated.instanceId + `-stack-${ui}` };
        newState[owner].discardPile.push(discardCard as any);
      }
    } else {
      
      
      for (let si = 0; si < defeated.stack.length; si++) {
        const card = defeated.stack[si];
        const discardCard = { ...card, instanceId: defeated.instanceId + (si > 0 ? `-stack-${si}` : ''), wasHiddenBeforeDefeat: defeated.isHidden };
        newState[owner].discardPile.push(discardCard as any);
      }
    }

    
    newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
    newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');

    return newState;
  }

  
  static hideCharacter(state: GameState, targetId: string): GameState {
    const newState = deepClone(state);
    let found = false;
    for (const mission of newState.activeMissions) {
      for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
        if (char.instanceId === targetId) {
          for (const m of newState.activeMissions) {
            for (const c of [...m.player1Characters, ...m.player2Characters]) {
              if (c.instanceId === targetId) {
                c.isHidden = true;
                break;
              }
            }
          }
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) return state;
    return EffectEngine.restoreControlOnLeave(newState, targetId);
  }

  
  static restoreControlOnLeave(state: GameState, controllerInstanceId: string): GameState {
    
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
    console.log(`[restoreControlOnLeave] Controller ${controllerInstanceId} leaving — returning ${controlledChars.length} controlled character(s)`);

    let newState = deepClone(state);

    for (const { instanceId } of controlledChars) {
      
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

            
            
            if (char.stack && char.stack.length > 1) {
              
              char.controllerInstanceId = undefined;
              continue;
            }

            const toSide = char.originalOwner === 'player1' ? 'player1Characters' : 'player2Characters';

            
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
              
              
              
              const removed = currentMission[fromSide].splice(idx, 1)[0];
              for (let si = 0; si < removed.stack.length; si++) {
                const card = removed.stack[si];
                newState[removed.originalOwner].discardPile.push({ ...card, instanceId: removed.instanceId + (si > 0 ? `-stack-${si}` : '') } as any);
              }
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, char.originalOwner,
                'EFFECT', `${topCardCtrl.name_en || topCardCtrl.name_fr} returned to owner but same name already in play — discarded (No Repetition).`,
                'game.log.effect.controlReturnedConflict',
                { card: topCardCtrl.name_fr, card_en: topCardCtrl.name_en || topCardCtrl.name_fr, target: topCardCtrl.name_fr, target_en: topCardCtrl.name_en || topCardCtrl.name_fr },
              );
            } else {
              
              
              
              
              const removed = currentMission[fromSide].splice(idx, 1)[0];
              removed.controlledBy = removed.originalOwner;
              removed.controllerInstanceId = undefined;
              currentMission[toSide].push(removed);
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, char.originalOwner,
                'EFFECT', `${topCardCtrl.name_en || topCardCtrl.name_fr} returned to original owner (controller left play).`,
                'game.log.effect.controlReturned',
                { card: topCardCtrl.name_fr, card_en: topCardCtrl.name_en || topCardCtrl.name_fr },
              );
            }
    }

    newState.player1.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player1');
    newState.player2.charactersInPlay = EffectEngine.countCharsForPlayer(newState, 'player2');

    return newState;
  }

  
  static defeatFriendlyForSasuke136(state: GameState, pending: PendingEffect, targetId: string): GameState {
    
    let newState = EffectEngine.defeatCharacter(state, targetId, pending.sourcePlayer);

    
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
      
      return EffectEngine.defeatCharacter(newState, enemyTargets[0], pending.sourcePlayer);
    }

    
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

  
  static naruto133ApplyTarget1(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { missionIndex?: number; useDefeat?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const useDefeat = parsed.useDefeat ?? false;

    
    const n133DefenderT1: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';
    const discardSizeBeforeT1 = state[n133DefenderT1].discardPile.length;

    
    let newState: GameState;
    if (useDefeat) {
      newState = EffectEngine.defeatCharacter(state, targetId, pending.sourcePlayer);
    } else {
      newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);
    }

    
    const enemySideKey: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const enemyPlayer: PlayerID = pending.sourcePlayer === 'player1' ? 'player2' : 'player1';

    const validTarget2: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      for (const char of newState.activeMissions[i][enemySideKey]) {
        
        if (!useDefeat && char.isHidden) continue;
        
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
      
      if (useDefeat) {
        
        newState = EffectEngine.defeatCharacter(newState, validTarget2[0], pending.sourcePlayer);
        return newState;
      } else {
        return EffectEngine.hideCharacterWithLog(newState, validTarget2[0], pending.sourcePlayer);
      }
    }

    
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

  
  static naruto108ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { isUpgrade?: boolean } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    const isUpgrade = parsed.isUpgrade ?? false;

    
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;
    const targetPower = getEffectivePower(state, charResult.character, charResult.player);

    
    let newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);

    
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

  
  static kyubi134ApplyHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    let parsed: { remainingPower?: number; hiddenIds?: string[] } = {};
    try { parsed = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    let remainingPower = parsed.remainingPower ?? 6;
    const hiddenIds = parsed.hiddenIds ?? [];

    
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult || charResult.character.isHidden) return state;
    const targetPower = getEffectivePower(state, charResult.character, charResult.player);

    
    let newState = EffectEngine.hideCharacterWithLog(state, targetId, pending.sourcePlayer);
    remainingPower -= targetPower;
    hiddenIds.push(targetId);

    if (remainingPower <= 0) return newState; // No budget left

    
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

  
  static isImmuneToEnemyHide(char: CharacterInPlay): boolean {
    return isImmuneToEnemyHideOrDefeat(char);
  }

  
  static hideCharacterWithLog(state: GameState, targetInstanceId: string, sourcePlayer: PlayerID, skipProtection: boolean = false): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetInstanceId);
    if (!charResult) return state;
    if (charResult.character.isHidden) return state;

    const isEnemyEffect = charResult.player !== sourcePlayer;

    
    
    
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
            
            state = {
              ...state,
              log: logAction(
                state.log, state.turn, state.phase, charResult.player,
                'EFFECT_CONTINUOUS',
                `Kimimaro (056): ${sourcePlayer} has 0 Chakra, cannot pay - effect proceeds.`,
                'game.log.effect.kimimaro056NoPay',
                { card: 'KIMIMARO', id: 'KS-056-UC' },
              ),
            };
          }
        }
      }
    }

    
    if (isEnemyEffect && EffectEngine.isImmuneToEnemyHide(charResult.character)) {
      return state; // Immune â€' hide blocked
    }

    
    if (isEnemyEffect && isProtectedFromEnemyHide(state, charResult.character, charResult.player)) {
      return state; // Protected by Shino 115 â€' hide blocked
    }

    
    
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

  
  static resumeBatchHideAfterGemma(state: GameState, remainingTargetIds: string[], batchSourcePlayer: PlayerID): GameState {
    let currentState = state;
    
    for (const targetId of remainingTargetIds) {
      currentState = EffectEngine.hideCharacterWithLog(currentState, targetId, batchSourcePlayer, true);
    }
    return currentState;
  }

  
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

  
  static playSummonFromHandWithReduction(state: GameState, pending: PendingEffect, targetId: string, costReduction: number): GameState {
    
    if (targetId.startsWith('HIDDEN_')) {
      return EffectEngine.revealHiddenWithReduction(state, pending, targetId.slice(7), costReduction);
    }
    
    const rawId = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
    
    return EffectEngine.playCharFromHandWithReduction(
      state, pending, rawId, costReduction, 'Summon', 'Jiraya', pending.sourceCardId ?? '',
    );
  }

  
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
    
    ps.hand.splice(handIndex, 1);

    
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
      
      ps.hand.push(chosenCard);
      
      return state;
    }

    
    ps.discardPile.push(chosenCard);

    if (validMissions.length === 1) {
      return EffectEngine.genericPlaceOnMission(newState, player, parseInt(validMissions[0], 10), 0, cardName, cardId, costReduction);
    }

    
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

  
  private static genericPlaceOnMission(state: GameState, player: PlayerID, missionIndex: number, cost: number, cardName: string, cardId: string, costReduction: number): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

    
    const hasNameConflict = mission[friendlySide].some((c: CharacterInPlay) => {
      if (c.isHidden) return false;
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    });

    
    if (existingIdx >= 0) {
      const upgradeTargetIds: string[] = [];
      for (let i = 0; i < mission[friendlySide].length; i++) {
        const c = mission[friendlySide][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          
          if (isFlex) {
            const wouldConflict = mission[friendlySide].some((other: CharacterInPlay) => {
              if (other.instanceId === c.instanceId || other.isHidden) return false;
              const oTop = other.stack?.length > 0 ? other.stack[other.stack?.length - 1] : other.card;
              return oTop.name_fr.toUpperCase() === card.name_fr.toUpperCase();
            });
            if (wouldConflict) continue;
          }
          
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - costReduction);
          if (ps.chakra >= upgCost) upgradeTargetIds.push(c.instanceId);
        }
      }

      if (upgradeTargetIds.length > 0) {
        const canFreshPlay = !hasNameConflict;
        const validTargets = canFreshPlay ? ['FRESH', ...upgradeTargetIds] : [...upgradeTargetIds];

        
        if (validTargets.length === 1 && !canFreshPlay) {
          
        } else {
          
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
      
    }

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      const existingWasControlled = existing.controlledBy !== existing.originalOwner;
      updatedChars[existingIdx] = {
        ...existing,
        card: card as any,
        stack: [...existing.stack, card as any],

        controllerInstanceId:
          existingWasControlled ||
          (existing.controllerInstanceId && existing.controlledBy === player)
            ? undefined
            : existing.controllerInstanceId,
        originalOwner: existingWasControlled ? player : existing.originalOwner,
      };
      mission[friendlySide] = updatedChars;
      missions[missionIndex] = mission;
      state.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;

      
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
      
      const hasNameConflict = mission[friendlySide].some((c: CharacterInPlay) => {
        if (c.isHidden) return false;
        const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      });
      if (hasNameConflict) {
        
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

    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

    return state;
  }


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
      const existingWasControlledU = existing.controlledBy !== existing.originalOwner;
      updatedChars[existingIdx] = {
        ...existing, card: card as any, stack: [...existing.stack, card as any],
        controllerInstanceId:
          existingWasControlledU ||
          (existing.controllerInstanceId && existing.controlledBy === player)
            ? undefined
            : existing.controllerInstanceId,
        originalOwner: existingWasControlledU ? player : existing.originalOwner,
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

    return state;
  }

  
  static moveCharToMissionDirectPublic(
    state: GameState, charInstanceId: string, destMissionIndex: number,
    charOwner: PlayerID, effectCardName: string, effectCardId: string,
    effectInitiator?: PlayerID,
  ): GameState {
    return EffectEngine.moveCharToMissionDirect(state, charInstanceId, destMissionIndex, charOwner, effectCardName, effectCardId, effectInitiator);
  }

  
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

    
    ps.hand.splice(cardIndex, 1);

    
    ps.discardPile.push(card);

    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'Jiraya', pending.sourceCardId ?? 'KS-007-C', 1);
  }

  
  static kimimaroDiscardAndHide(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    
    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return newState;

    const topCard = charResult.character.stack?.length > 0
      ? charResult.character.stack[charResult.character.stack?.length - 1]
      : charResult.character.card;

    if ((topCard.chakra ?? 0) <= 3 && !charResult.character.isHidden) {
      
      return EffectEngine.hideCharacterWithLog(newState, targetId, player);
    }

    return newState;
  }

  
  static kimimaroChooseDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    
    const discardedCard = ps.hand.splice(handIndex, 1)[0];
    ps.discardPile.push(discardedCard);

    newState.log = logAction(
      newState.log, newState.turn, newState.phase, player,
      'EFFECT_DISCARD',
      `Kimimaro (055): Discarded ${discardedCard.name_fr}.`,
      'game.log.effect.discardCards',
      { card: 'Kimimaro', id: 'KS-055-C', count: 1 },
    );

    
    const opponent = player === 'player1' ? 'player2' : 'player1';
    const enemySide = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';
    const validHideTargets: string[] = [];

    for (const mission of newState.activeMissions) {
      
      for (const char of mission[enemySide]) {
        if (char.isHidden) continue;
        if (!canBeHiddenByEnemy(newState, char, opponent)) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          validHideTargets.push(char.instanceId);
        }
      }
      
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
      
      return EffectEngine.hideCharacterWithLog(newState, validHideTargets[0], player);
    }

    
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

  
  static haku089DiscardAndPowerup(state: GameState, pending: PendingEffect, discardFromPlayer: PlayerID, missionIndex: number): GameState {
    const newState = deepClone(state);
    const sourcePlayer = pending.sourcePlayer;
    const ps = newState[discardFromPlayer];

    if (ps.deck.length === 0) return newState;

    const discardedCard = ps.deck.shift()!;
    ps.discardPile.push(discardedCard);

    const powerupAmount = discardedCard.chakra || 0;

    
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

  
  
  

  
  static mss08ChooseCard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    
    
    const chosenCard = ps.hand.splice(handIndex, 1)[0];

    
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

  
  static mss08ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (missionIndex < 0 || missionIndex >= newState.activeMissions.length) return state;

    
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

  
  
  

  
  static mss03OpponentDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    
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

  
  
  

  
  
  
  

  
  static applyKimimaro056Protection(state: GameState, pending: PendingEffect, targetId: string): { state: GameState; blocked: boolean } {
    
    for (const mission of state.activeMissions) {
      for (const side of ['player1Characters', 'player2Characters'] as const) {
        for (const char of mission[side]) {
          if (char.instanceId !== targetId) continue;
          if (char.isHidden) return { state, blocked: false }; // Hidden = no continuous effects

          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.number !== 56) return { state, blocked: false };

          
          const hasProtection = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('chakra'),
          );
          if (!hasProtection) return { state, blocked: false };

          
          const charOwner = char.controlledBy;
          if (charOwner === pending.sourcePlayer) return { state, blocked: false }; // Friendly effect, no protection

          
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
          } else {
            
            state.log = logAction(
              state.log, state.turn, state.phase, charOwner,
              'EFFECT_CONTINUOUS',
              `Kimimaro (056): ${opponent} has 0 Chakra, cannot pay - effect proceeds.`,
              'game.log.effect.kimimaro056NoPay',
              { card: 'KIMIMARO', id: 'KS-056-UC' },
            );
          }
          return { state, blocked: false };
        }
      }
    }
    return { state, blocked: false };
  }

  
  
  

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
    

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...newState.activeMissions];
    const mission = { ...missions[missionIdx] };

    
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

    
    const hasNameConflict_k053 = hasSameNameConflict(mission[friendlySide], card);

    
    if (existingIdx >= 0 && !hasNameConflict_k053) {
      
      const upgradeTargetIds_k053: string[] = [];
      for (let i = 0; i < mission[friendlySide].length; i++) {
        const c = mission[friendlySide][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - 3);
          if (ps.chakra >= upgCost) upgradeTargetIds_k053.push(c.instanceId);
        }
      }

      
      if (upgradeTargetIds_k053.length > 0) {
        
        ps.discardPile.push(card);

        
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
      
    }

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {
      const existing = mission[friendlySide][existingIdx];
      const updatedChars = [...mission[friendlySide]];
      const existingWasControlled17a = existing.controlledBy !== existing.originalOwner;
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existing.stack, card],
        controllerInstanceId:
          existingWasControlled17a ||
          (existing.controllerInstanceId && existing.controlledBy === player)
            ? undefined
            : existing.controllerInstanceId,
        originalOwner: existingWasControlled17a ? player : existing.originalOwner,
      };
      mission[friendlySide] = updatedChars;
      missions[missionIdx] = mission;
      newState.activeMissions = missions;
      placedChar = updatedChars[existingIdx];
      isCardUpgrade = true;


      
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

    
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide_h002], card);

    
    const hasNameConflict_h002 = hasSameNameConflict(mission[friendlySide_h002], card);

    
    if (existingIdx < 0 && hasNameConflict_h002) return state;

    
    if (existingIdx >= 0 && !hasNameConflict_h002) {
      
      const upgradeTargetIds_h002: string[] = [];
      for (let i = 0; i < mission[friendlySide_h002].length; i++) {
        const c = mission[friendlySide_h002][i];
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        const isSameName = cTop.name_fr.toUpperCase() === card.name_fr.toUpperCase() && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        const isFlex = checkFlexibleUpgrade(card as any, cTop) && (card.chakra ?? 0) > (cTop.chakra ?? 0);
        if (isSameName || isFlex) {
          
          const upgCost = Math.max(0, ((card.chakra ?? 0) - (cTop.chakra ?? 0)) - 1);
          if (ps.chakra >= upgCost) upgradeTargetIds_h002.push(c.instanceId);
        }
      }

      
      if (upgradeTargetIds_h002.length > 0) {
        

        
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
      
    }

    
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

    
    ps.chakra -= actualCost;
    ps.hand.splice(cardIndex, 1);

    let placedChar: CharacterInPlay;
    let isCardUpgrade = false;

    if (existingIdx >= 0) {

      const existing = mission[friendlySide_h002][existingIdx];
      const existStackPlace = existing.stack ?? [existing.card];
      const updatedChars = [...mission[friendlySide_h002]];
      const existingWasControlledH = existing.controlledBy !== existing.originalOwner;
      updatedChars[existingIdx] = {
        ...existing,
        card,
        stack: [...existStackPlace, card],
        powerTokens: existing.powerTokens,
        controllerInstanceId:
          existingWasControlledH ||
          (existing.controllerInstanceId && existing.controlledBy === player)
            ? undefined
            : existing.controllerInstanceId,
        originalOwner: existingWasControlledH ? player : existing.originalOwner,
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

      
      ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

      newState.log = logAction(
        newState.log, newState.turn, 'action', player,
        'EFFECT',
        `Hiruzen Sarutobi (002): Plays ${card.name_fr} on mission ${missionIndex + 1} for ${actualCost} chakra (1 less).`,
        'game.log.effect.playLeafReduced',
        { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC', target: card.name_fr, mission: String(missionIndex + 1), cost: String(actualCost) },
      );
    }

    
    (newState as any)._hiruzen002PlayedCharId = placedChar.instanceId;

    
    return EffectEngine.resolvePlayEffects(newState, player, placedChar, missionIndex, isCardUpgrade);
  }

  
  
  

  static mss05ReturnToHand(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    
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

    
    
    const stateAfterRestore = EffectEngine.restoreControlOnLeave(newState, targetId);
    
    let finalMissionIdx = -1;
    let finalCharIdx = -1;
    for (let i = 0; i < stateAfterRestore.activeMissions.length; i++) {
      const cs = stateAfterRestore.activeMissions[i][friendlySide];
      for (let j = 0; j < cs.length; j++) {
        if (cs[j].instanceId === targetId) {
          finalMissionIdx = i;
          finalCharIdx = j;
          break;
        }
      }
      if (finalMissionIdx >= 0) break;
    }
    if (finalMissionIdx === -1 || finalCharIdx === -1) return stateAfterRestore;

    
    const mission = { ...stateAfterRestore.activeMissions[finalMissionIdx] };
    const chars = [...mission[friendlySide]];
    const removedTarget = chars[finalCharIdx];
    chars.splice(finalCharIdx, 1);
    mission[friendlySide] = chars;
    stateAfterRestore.activeMissions = [...stateAfterRestore.activeMissions];
    stateAfterRestore.activeMissions[finalMissionIdx] = mission;

    
    const ps = stateAfterRestore[player];
    const topCard = removedTarget.stack?.length > 0 ? removedTarget.stack[removedTarget.stack?.length - 1] : removedTarget.card;
    const underCards = removedTarget.stack?.length > 1 ? removedTarget.stack.slice(0, -1) : [];
    ps.hand = [...ps.hand, topCard];
    ps.discardPile = [...ps.discardPile, ...underCards];
    ps.charactersInPlay = Math.max(0, ps.charactersInPlay - 1);

    stateAfterRestore.log = logAction(
      stateAfterRestore.log, stateAfterRestore.turn, stateAfterRestore.phase, player,
      'SCORE_RETURN',
      `MSS 05 (Bring it Back): Returned ${topCard.name_fr} to hand (mandatory).`,
      'game.log.score.returnToHand',
      { card: 'Ramener', target: topCard.name_fr },
    );

    return stateAfterRestore;
  }

  
  
  

  
  static mss07ChooseCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    const fromMissionIndex = charResult.missionIndex;

    
    const otherMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== fromMissionIndex) otherMissions.push(String(i));
    }

    if (otherMissions.length === 0) return state;

    if (otherMissions.length === 1) {
      
      return EffectEngine.mss07ApplyMove(newState, targetId, fromMissionIndex, parseInt(otherMissions[0], 10), pending.sourcePlayer);
    }

    
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

  
  static mss07ApplyMove(state: GameState, charInstanceId: string, fromMissionIndex: number, toMissionIndex: number, sourcePlayer: PlayerID): GameState {
    const newState = deepClone(state);
    const friendlySide: 'player1Characters' | 'player2Characters' =
      sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    const mission = newState.activeMissions[fromMissionIndex];
    const chars = mission[friendlySide];
    const charIndex = chars.findIndex((c: CharacterInPlay) => c.instanceId === charInstanceId);

    if (charIndex === -1) return state;

    const targetChar = chars[charIndex];

    
    const sourceMission = { ...newState.activeMissions[fromMissionIndex] };
    const sourceChars = [...sourceMission[friendlySide]];
    sourceChars.splice(charIndex, 1);
    sourceMission[friendlySide] = sourceChars;
    newState.activeMissions[fromMissionIndex] = sourceMission;

    
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

  
  
  

  
  static jiraiyaChooseSummon(state: GameState, pending: PendingEffect, targetId: string): GameState {
    
    if (targetId.startsWith('HIDDEN_')) {
      return EffectEngine.revealHiddenWithReduction(state, pending, targetId.slice(7), 1);
    }
    
    const rawId = targetId.startsWith('HAND_') ? targetId.slice(5) : targetId;
    
    return EffectEngine.playCharFromHandWithReduction(
      state, pending, rawId, 1, 'Summon', 'Jiraya', pending.sourceCardId ?? 'KS-007-C',
    );
  }

  
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

  
  private static jiraiyaPlaceOnMission(state: GameState, player: PlayerID, missionIndex: number, cost: number): GameState {
    const ps = state[player];
    const card = ps.discardPile.pop();
    if (!card) return state;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    const missions = [...state.activeMissions];
    const mission = { ...missions[missionIndex] };

    
    const existingIdx = findUpgradeTargetIdx(mission[friendlySide], card);

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
        `Jiraiya effect: Upgraded ${card.name_fr} as Summon on mission ${missionIndex + 1} for ${cost} chakra.`,
        'game.log.effect.upgradeSummon',
        { card: 'Jiraya', target: card.name_fr, mission: String(missionIndex + 1), cost: String(cost) },
      );
    } else {
      
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

    
    state = EffectEngine.resolvePlayEffects(state, player, placedChar, missionIndex, isCardUpgrade);

    return state;
  }

  
  
  

  
  static asumaChooseTeam10(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      
      return EffectEngine.moveCharToMissionDirect(newState, targetId, parseInt(validMissions[0], 10), player, 'Asuma Sarutobi', 'KS-023-C');
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

  
  
  

  
  static irukaChooseNaruto(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    
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

  
  
  

  
  static kidomaruChooseCharacter(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;

    const charResult = EffectEngine.findCharByInstanceId(newState, targetId);
    if (!charResult) return state;

    
    let movesRemaining = 1;
    try {
      const desc = JSON.parse(pending.effectDescription);
      movesRemaining = desc.movesRemaining ?? 1;
    } catch { /* ignore */ }

    
    const validMissions: string[] = [];
    for (let i = 0; i < newState.activeMissions.length; i++) {
      if (i !== charResult.missionIndex && EffectEngine.validateNameUniquenessForMove(newState, charResult.character, i, charResult.player)) {
        validMissions.push(String(i));
      }
    }

    if (validMissions.length === 0) return state;

    if (validMissions.length === 1) {
      
      let result = EffectEngine.moveCharToMissionDirect(
        newState, targetId, parseInt(validMissions[0], 10), player, 'Kidomaru', 'KS-059-C',
      );
      const remaining = movesRemaining - 1;
      if (remaining > 0) {
        result = EffectEngine.createKidomaruNextMove(result, pending, player, remaining);
      }
      return result;
    }

    
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

  
  private static createKidomaruNextMove(state: GameState, prevPending: PendingEffect, player: PlayerID, movesRemaining: number): GameState {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      player === 'player1' ? 'player1Characters' : 'player2Characters';

    
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

    
    ps.discardPile.splice(discardIndex, 1);

    
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
      
      ps.discardPile.push(chosenCard);
      return state;
    }

    
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

  
  static sakura109ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let costReduction = 0;
    try { const d = JSON.parse(pending.effectDescription); costReduction = d.costReduction ?? 0; } catch { /* ignore */ }
    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'SAKURA HARUNO', 'KS-109-R', costReduction);
  }

  

  
  
  

  
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

    
    
    let drawnCards: any[] = storedCards;
    if (drawnCards.length === 0) {
      drawnCards = (newState as any)._sakura135DrawnCards ?? [];
      delete (newState as any)._sakura135DrawnCards;
    }
    if (drawnCards.length === 0) {
      
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

    
    
    for (let oi = 0; oi < otherCards.length; oi++) {
      const oc = otherCards[oi];
      ps.discardPile.push({ ...oc, instanceId: (oc as any).instanceId || (oc as any).id + `-discard-${oi}` } as any);
    }

    
    if (otherCards.length >= 2) {
      
      const chainData = { sakura135Chain: true, costReduction, cardName: chosenCard.name_fr, chosenCard };
      return EffectEngine.createReorderDiscardPending(newState, player, player, otherCards.length, player, chainData);
    }

    
    return EffectEngine.sakura135ContinuePlacement(newState, player, chosenCard, costReduction, pending);
  }

  
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

    
    ps.discardPile.push(chosenCard);

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

  
  static sakura135ChooseMission(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const missionIndex = parseInt(targetId, 10);
    if (isNaN(missionIndex)) return state;
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    let costReduction = 0;
    try { const d = JSON.parse(pending.effectDescription); costReduction = d.costReduction ?? 0; } catch { /* ignore */ }
    
    
    
    return EffectEngine.genericPlaceOnMission(newState, player, missionIndex, 0, 'SAKURA HARUNO', 'KS-135-S', costReduction);
  }

  
  
  

  
  static chojiChooseDiscard(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const handIndex = parseInt(targetId, 10);
    if (isNaN(handIndex)) return state;

    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const ps = newState[player];

    if (handIndex < 0 || handIndex >= ps.hand.length) return state;

    
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

  
  
  

  
  static takeControlOfEnemy(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const charResult = EffectEngine.findCharByInstanceId(state, targetId);
    if (!charResult) return state;

    const player = pending.sourcePlayer;
    const missionIndex = charResult.missionIndex;

    
    
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

  
  
  

  
  static itachi143MoveFriendly(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, player, 'Itachi Uchiwa', 'KS-143-M');
  }

  
  static itachi143MoveEnemy(state: GameState, pending: PendingEffect, targetId: string): GameState {
    const newState = deepClone(state);
    const player = pending.sourcePlayer;
    const opponent = player === 'player1' ? 'player2' : 'player1';
    return EffectEngine.moveCharToMissionDirect(newState, targetId, pending.sourceMissionIndex, opponent, 'Itachi Uchiwa', 'KS-143-M', player);
  }

  
  
  

  
  static validateNameUniquenessForMove(
    state: GameState,
    charToMove: CharacterInPlay,
    destMissionIndex: number,
    controllingPlayer: PlayerID,
  ): boolean {
    
    if (charToMove.isHidden) return true;

    const destMission = state.activeMissions[destMissionIndex];
    if (!destMission) return true;

    const charName = charToMove.card.name_fr.toUpperCase();
    const friendlyChars = controllingPlayer === 'player1'
      ? destMission.player1Characters
      : destMission.player2Characters;

    
    
    return !friendlyChars.some(
      (c) =>
        c.instanceId !== charToMove.instanceId &&
        !c.isHidden &&
        c.card.name_fr.toUpperCase() === charName,
    );
  }

  
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

    
    if (!EffectEngine.validateNameUniquenessForMove(state, charResult.character, destMissionIndex, charResult.player)) {
      
      state = EffectEngine.restoreControlOnLeave(state, charInstanceId);
      
      const friendlySideDiscard: 'player1Characters' | 'player2Characters' =
        charResult.player === 'player1' ? 'player1Characters' : 'player2Characters';
      const missions = [...state.activeMissions];
      const srcMission = { ...missions[charResult.missionIndex] };
      const discardedChar = srcMission[friendlySideDiscard].find(c => c.instanceId === charInstanceId);
      srcMission[friendlySideDiscard] = srcMission[friendlySideDiscard].filter(c => c.instanceId !== charInstanceId);
      missions[charResult.missionIndex] = srcMission;
      state.activeMissions = missions;

      
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

    
    const moveInitiator = effectInitiator ?? charOwner;
    if (moveInitiator !== charResult.player) {
      
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
            
            const kurenaiOwner = sourceMission.player1Characters.some(c => c.instanceId === ch.instanceId) ? 'player1' : 'player2';
            
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

    
    const missions = [...state.activeMissions];
    const sourceMission = { ...missions[charResult.missionIndex] };
    sourceMission[friendlySide] = sourceMission[friendlySide].filter(c => c.instanceId !== charInstanceId);
    missions[charResult.missionIndex] = sourceMission;

    
    const destMission = { ...missions[destMissionIndex] };
    
    const movedChar = { ...charResult.character, missionIndex: destMissionIndex };
    const movedTop = movedChar.stack?.length > 0 ? movedChar.stack[movedChar.stack?.length - 1] : movedChar.card;
    if (movedTop.number === 67 && movedChar.rempartLockedTargetId) {
      movedChar.rempartLockedTargetId = undefined;
    }
    destMission[friendlySide] = [...destMission[friendlySide], movedChar];
    missions[destMissionIndex] = destMission;

    state.activeMissions = missions;
    
    const movedCharName = charResult.character.isHidden ? '???' : charResult.character.card.name_fr;
    state.log = logAction(
      state.log, state.turn, state.phase, charOwner,
      'EFFECT_MOVE',
      `${effectCardName} (${effectCardId}): Moved ${movedCharName} from mission ${charResult.missionIndex + 1} to mission ${destMissionIndex + 1}.`,
      'game.log.effect.move',
      { card: effectCardName, id: effectCardId, target: movedCharName, mission: `mission ${destMissionIndex + 1}` },
    );

    
    state = checkNinjaHoundsTrigger(state, movedChar, destMissionIndex, charOwner);

    
    
    state = checkChoji018PostMoveTrigger(state, movedChar, destMissionIndex, effectInitiator ?? charOwner, charResult.player);

    
    state = applyRempartTokenRemoval(state);

    return state;
  }

  
  
  

  
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

    if (isHiddenRevealBlocked(newState, mIdx, player)) {
      return {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, player,
          'EFFECT_BLOCKED',
          `Cannot reveal ${topCard.name_fr}: Shikamaru Nara is blocking hidden plays in this mission.`,
          'game.log.effect.shikamaruBlockReveal',
          { card: topCard.name_fr },
        ),
      };
    }

    
    const friendlySideRhr = player === "player1" ? "player1Characters" : "player2Characters";
    const missionRhr = newState.activeMissions[mIdx];

    
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

    
    const hasNameConflictRhr = missionRhr[friendlySideRhr].some((c: CharacterInPlay) => {
      if (c.isHidden || c.instanceId === instanceId) return false;
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return cTop.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
    });
    const freshCost = Math.max(0, (topCard.chakra ?? 0) - costReduction);
    const canFreshPlay = !hasNameConflictRhr && ps.chakra >= freshCost;

    
    if (allUpgradeTargets.length > 0 && canFreshPlay) {
      
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

    
    char.isHidden = false;
    char.wasRevealedAtLeastOnce = true;

    
    if (powerUpBonus > 0) {
      char.powerTokens += powerUpBonus;
    }

    
    let resultChar = char;
    if (upgradeTargetRhr) {
      const missions_rhr = [...newState.activeMissions];
      const m_rhr = { ...missions_rhr[mIdx] };
      const chars_rhr = [...m_rhr[friendlySideRhr]];
      const revealedIdx = chars_rhr.findIndex(c => c.instanceId === instanceId);
      const upgradeIdx_rhr = chars_rhr.findIndex(c => c.instanceId === upgradeTargetRhr.instanceId);
      if (revealedIdx >= 0 && upgradeIdx_rhr >= 0) {
        const revealedCharData = chars_rhr[revealedIdx];
        const prev_rhr = chars_rhr[upgradeIdx_rhr];
        const wasControlled_rhr = prev_rhr.controlledBy !== prev_rhr.originalOwner;
        chars_rhr[upgradeIdx_rhr] = {
          ...prev_rhr,
          card: revealedCharData.card,
          stack: [...prev_rhr.stack, ...revealedCharData.stack],
          powerTokens: prev_rhr.powerTokens + revealedCharData.powerTokens,
          controllerInstanceId:
            wasControlled_rhr ||
            (prev_rhr.controllerInstanceId && prev_rhr.controlledBy === player)
              ? undefined
              : prev_rhr.controllerInstanceId,
          originalOwner: wasControlled_rhr ? player : prev_rhr.originalOwner,
        };
        
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

    
    ps.charactersInPlay = EffectEngine.countCharsForPlayer(newState, player);

    
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

  
  static countCharsForPlayer(state: GameState, player: PlayerID): number {
    let count = 0;
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      count += chars.length;
    }
    return count;
  }

  
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

    
    if (topCard.number === 48) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    
    if (topCard.number === 75 && isEnemyEffect) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated by enemy') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    
    if (isEnemyEffect && isImmuneToEnemyHideOrDefeat(targetChar)) {
      return { replaced: true, replacement: 'immune' };
    }

    
    
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

  
  static queueHiruzen002Choose(state: GameState, pending: PendingEffect, isUpgrade: boolean): GameState {
    let newState = { ...state };
    const player = pending.sourcePlayer;
    const playerState = newState[player];
    const costReduction = 1;
    const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

    
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

  
  static kiba113QueueAkamaruChoice(state: GameState, pending: PendingEffect, useDefeat: boolean): GameState {
    let newState = { ...state };
    let confData: { sourceMissionIndex: number; sourceCardInstanceId: string } | null = null;
    try { confData = JSON.parse(pending.effectDescription); } catch { /* ignore */ }
    if (!confData) return newState;

    const friendlySide: 'player1Characters' | 'player2Characters' =
      pending.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    
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
      
      
      
      
      newState = EffectEngine.hideCharacter(newState, akamaru.instanceId);
      newState = {
        ...newState,
        log: logAction(
          newState.log, newState.turn, newState.phase, pending.sourcePlayer,
          'EFFECT_HIDE',
          `Kiba Inuzuka (113 MV): Hid friendly ${akamaru.card.name_fr}.`,
          'game.log.effect.hide',
          { card: 'KIBA INUZUKA', id: 'KS-113-MV', target: akamaru.card.name_fr, mission: `mission ${akamaruMI}` },
        ),
      };
    }

    
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
