import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 058/130 - JIROBO (UC)
 * Chakra: 4 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * MAIN: POWERUP 1 to all other friendly characters with keyword "Sound Four" in this mission.
 *   - Find all friendly non-hidden characters in this mission (not self) that have
 *     the "Sound Four" keyword. Add 1 power token to each.
 *
 * UPGRADE: [↯] Apply the MAIN effect to Sound Four characters in the OTHER missions.
 *   - This is a SEPARATE effect (not a modifier of MAIN).
 *   - POWERUP 1 to all friendly non-hidden Sound Four characters in missions OTHER than
 *     the source mission.
 */

function handleJirobo058Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Pre-check: any valid Sound Four targets in THIS mission?
  const mission = state.activeMissions[sourceMissionIndex];
  let hasTarget = false;
  for (const char of mission[friendlySide]) {
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
      hasTarget = true;
      break;
    }
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jirobo (058): No other friendly Sound Four characters in this mission.',
      'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-058-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO058_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jirobo058ConfirmMain',
  };
}

function handleJirobo058Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Pre-check: any valid Sound Four targets in OTHER missions?
  let hasTarget = false;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Skip source mission
    const m = state.activeMissions[i];
    for (const char of m[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
        hasTarget = true;
        break;
      }
    }
    if (hasTarget) break;
  }

  if (!hasTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jirobo (058) UPGRADE: No friendly Sound Four characters in other missions.',
      'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-058-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO058_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jirobo058ConfirmUpgrade',
  };
}

export function registerJirobo058Handlers(): void {
  registerEffect('KS-058-UC', 'MAIN', handleJirobo058Main);
  registerEffect('KS-058-UC', 'UPGRADE', handleJirobo058Upgrade);
}
