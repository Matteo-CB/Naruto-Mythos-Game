import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { sortTargetsGemmaLast } from '@/lib/effects/defeatUtils';
import type { PlayerID, CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 054/130 - KABUTO YAKUSHI (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: POWERUP 1 (self).
 *   - Add 1 power token to this character when played as an upgrade.
 *
 * MAIN: Hide all non-hidden characters in this mission with less Power than this character.
 *   - Get effective power of self (printed power + power tokens; if hidden, 0).
 *   - Find ALL characters (friend + foe, excluding self) in this mission whose
 *     effective power is strictly less than self's effective power.
 *   - Hide them all via hideCharacterWithLog (respects Gemma 049 sacrifice, Kimimaro 056
 *     protection, Shino 115 protection, and hide immunity).
 *   - Note: When isUpgrade, the UPGRADE POWERUP 1 is applied first, so self's power
 *     is already incremented before the MAIN effect evaluates.
 */

function handleKabuto054Upgrade(ctx: EffectContext): EffectResult {
  // UPGRADE: POWERUP 1 on self
  const state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const side: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (charIndex !== -1) {
    chars[charIndex] = {
      ...chars[charIndex],
      powerTokens: chars[charIndex].powerTokens + 1,
    };
    mission[side] = chars;
    missions[ctx.sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_POWERUP',
      'Kabuto Yakushi (054): POWERUP 1 (upgrade effect).',
      'game.log.effect.powerupSelf',
      { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', amount: 1 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

function handleKabuto054Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Get effective power of self
  const selfPower = getEffectivePower(state, sourceCard, sourcePlayer);

  if (selfPower <= 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (054): Self has 0 power, cannot hide characters with less.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' }) } };
  }

  // Collect all valid hide targets (friend + foe, excluding self) with power < self power
  const hideTargets: { instanceId: string; char: CharacterInPlay; sidePlayer: PlayerID }[] = [];

  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const sidePlayer = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
    for (const char of mission[side]) {
      if (char.instanceId === sourceCard.instanceId) continue; // skip self
      if (char.isHidden) continue;
      const charPower = getEffectivePower(state, char, sidePlayer);
      if (charPower < selfPower) {
        hideTargets.push({ instanceId: char.instanceId, char, sidePlayer });
      }
    }
  }

  if (hideTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (054): No characters with less than ${selfPower} power in this mission.`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' }) } };
  }

  // Sort targets so Gemma 049 is processed last (she can sacrifice to protect one ally)
  const sortedTargets = sortTargetsGemmaLast(hideTargets.map(t => t.char));
  const sortedInstanceIds = sortedTargets.map(c => c.instanceId);
  const orderedTargets = sortedInstanceIds.map(id => hideTargets.find(t => t.instanceId === id)!);

  // --- Gemma 049 pre-scan: if Gemma is present and multiple friendly LV targets are being hidden,
  //     let the player choose WHICH character to protect before processing the batch ---
  const alreadyHasGemmaPending = state.pendingEffects.some(
    (pe) => (pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' || pe.targetSelectionType === 'GEMMA049_CHOOSE_PROTECT_HIDE') && !pe.resolved,
  );
  if (!alreadyHasGemmaPending) {
    const friendlyChars = sourcePlayer === 'player1'
      ? mission.player2Characters  // Kabuto is on sourcePlayer's side → enemies are the other side
      : mission.player1Characters;

    // Check both sides for Gemma + multiple LV targets
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const sidePlayer = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
      if (sidePlayer === sourcePlayer) continue; // Gemma protects from ENEMY effects, so only check the opponent's side
      const sideChars = mission[side];

      // Find Gemma on this side
      let gemmaChar: CharacterInPlay | null = null;
      for (const ch of sideChars) {
        if (ch.isHidden) continue;
        const fTopCard = ch.stack.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
        if (fTopCard.number === 49) {
          const hasSacrifice = (fTopCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              e.description.includes('Leaf Village') && e.description.includes('defeat this character instead'),
          );
          if (hasSacrifice) { gemmaChar = ch; break; }
        }
      }
      if (!gemmaChar) continue;

      // Find LV targets being hidden on Gemma's side
      const lvTargetIds = orderedTargets
        .filter(t => t.sidePlayer === sidePlayer && t.char.card.group === 'Leaf Village')
        .map(t => t.instanceId);

      if (lvTargetIds.length >= 2) {
        // Multiple LV targets → let player choose which to protect
        let newState = { ...state };
        const effectId = generateInstanceId();
        const actionId = generateInstanceId();
        const allTargetIds = orderedTargets.map(t => t.instanceId);

        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: 'KS-049-C',
          sourceInstanceId: gemmaChar.instanceId,
          sourceMissionIndex: sourceMissionIndex,
          effectType: 'MAIN' as const,
          effectDescription: JSON.stringify({
            sacrificeInstanceId: gemmaChar.instanceId,
            effectSource: sourcePlayer,
            batchAllTargets: allTargetIds,
            batchLVTargets: lvTargetIds,
            batchSourcePlayer: sourcePlayer,
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
          type: 'SELECT_TARGET' as 'SELECT_TARGET',
          player: sidePlayer,
          description: `Gemma Shiranui (049): Choose which Leaf Village character to protect from being hidden (or skip).`,
          descriptionKey: 'game.effect.desc.gemma049ChooseProtect',
          options: lvTargetIds,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        return { state: newState };
      }
    }
  }

  // --- Normal batch hide processing (single or no LV target, or no Gemma) ---
  let currentState = state;
  let hiddenCount = 0;

  for (let ti = 0; ti < orderedTargets.length; ti++) {
    const target = orderedTargets[ti];
    const pendingCountBefore = currentState.pendingEffects.length;
    currentState = EffectEngine.hideCharacterWithLog(currentState, target.instanceId, sourcePlayer);

    // Check if a Gemma 049 sacrifice pending was created - if so, store remaining targets and break
    const gemmaHidePending = currentState.pendingEffects.find(
      (pe) => pe.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE' && !pe.resolved
        && currentState.pendingEffects.length > pendingCountBefore,
    );
    if (gemmaHidePending) {
      // Store remaining targets (after current) in the pending effect so they can be processed after the choice
      const remainingIds = orderedTargets.slice(ti + 1).map(t => t.instanceId);
      const existingDesc = JSON.parse(gemmaHidePending.effectDescription);
      existingDesc.batchRemainingTargets = remainingIds;
      existingDesc.batchSourcePlayer = sourcePlayer;
      existingDesc.batchHiddenCount = hiddenCount;
      gemmaHidePending.effectDescription = JSON.stringify(existingDesc);
      break; // Stop - remaining targets will be processed after the Gemma choice resolves
    }

    // Check if the character was actually hidden
    const charAfter = EffectEngine.findCharByInstanceId(currentState, target.instanceId);
    if (charAfter && charAfter.character.isHidden) {
      hiddenCount++;
    }
  }

  if (hiddenCount > 0) {
    currentState = {
      ...currentState,
      log: logAction(
        currentState.log,
        currentState.turn,
        currentState.phase,
        sourcePlayer,
        'EFFECT_HIDE',
        `Kabuto Yakushi (054): Hid ${hiddenCount} character(s) with less than ${selfPower} power in this mission.`,
        'game.log.effect.hide',
        { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', count: String(hiddenCount) },
      ),
    };
  }

  return { state: currentState };
}

export function registerKabuto054Handlers(): void {
  registerEffect('KS-054-UC', 'UPGRADE', handleKabuto054Upgrade);
  registerEffect('KS-054-UC', 'MAIN', handleKabuto054Main);
}
