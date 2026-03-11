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
  const { state, sourceCard } = ctx;

  // Confirmation popup before POWERUP
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO054_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kabuto054ConfirmUpgrade',
  };
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

  // Pre-check: at least 1 valid target
  let hasTarget = false;
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const sidePlayer = (side === 'player1Characters' ? 'player1' : 'player2') as PlayerID;
    for (const char of mission[side]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const charPower = getEffectivePower(state, char, sidePlayer);
      if (charPower < selfPower) { hasTarget = true; break; }
    }
    if (hasTarget) break;
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (054): No characters with less than ${selfPower} power in this mission.`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' }) } };
  }

  // Confirmation popup before batch hide
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO054_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kabuto054ConfirmMain',
  };
}

export function registerKabuto054Handlers(): void {
  registerEffect('KS-054-UC', 'UPGRADE', handleKabuto054Upgrade);
  registerEffect('KS-054-UC', 'MAIN', handleKabuto054Main);
}
