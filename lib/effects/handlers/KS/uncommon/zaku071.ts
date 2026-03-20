import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 071/130 - ZAKU ABUMI "Air Slice" (UC)
 * Chakra: 4 | Power: 5
 * Group: Sound Village | Keywords: Team Dosu
 *
 * MAIN: If you have fewer non-hidden characters than the enemy in this mission,
 *   move an enemy character from this mission to another mission.
 *
 * UPGRADE: POWERUP 2 (self).
 */

function handleZaku071Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Count non-hidden characters for each side in this mission
  const friendlyNonHiddenCount = mission[friendlySide].filter((c) => !c.isHidden).length;
  const enemyNonHiddenCount = mission[enemySide].filter((c) => !c.isHidden).length;

  if (friendlyNonHiddenCount >= enemyNonHiddenCount) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      `Zaku Abumi (071): You do not have fewer non-hidden characters than the enemy in this mission (${friendlyNonHiddenCount} vs ${enemyNonHiddenCount}).`,
      'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' }) } };
  }

  // Need at least 2 missions to move
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Zaku Abumi (071): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' }) } };
  }

  // Kurenai 035: if movement is blocked from this mission for enemy chars, fizzle
  if (isMovementBlockedByKurenai(state, sourceMissionIndex, opponentPlayer)) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_BLOCKED', 'Zaku Abumi (071): Enemy character movement blocked by Yuhi Kurenai (035).',
      'game.log.effect.moveBlockedKurenai', { card: 'ZAKU ABUMI', id: 'KS-071-UC' }) } };
  }

  // Find enemy characters with at least 1 valid destination (name uniqueness)
  const enemyControlSide = opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const validTargets: string[] = [];
  for (const char of mission[enemySide]) {
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    const charName = topCard.name_fr;
    const hasValidDest = char.isHidden || state.activeMissions.some((m, i) => {
      if (i === sourceMissionIndex) return false;
      return !m[enemyControlSide].some((c) => {
        if (c.instanceId === char.instanceId) return false;
        if (c.isHidden) return false;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return cTop.name_fr === charName;
      });
    });
    if (hasValidDest) validTargets.push(char.instanceId);
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Zaku Abumi (071): No enemy characters can be moved (no valid destination).',
      'game.log.effect.noTarget', { card: 'ZAKU ABUMI', id: 'KS-071-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ZAKU071_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.zaku071ConfirmMain',
  };
}

function handleZaku071Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  // Confirmation popup for POWERUP 2 self
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ZAKU071_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.zaku071ConfirmUpgrade',
  };
}

export function registerZaku071Handlers(): void {
  registerEffect('KS-071-UC', 'MAIN', handleZaku071Main);
  registerEffect('KS-071-UC', 'UPGRADE', handleZaku071Upgrade);
}
