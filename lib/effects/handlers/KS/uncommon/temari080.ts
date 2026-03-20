import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 080/130 - TEMARI "Wind Scythe" (UC)
 * Chakra: 4 | Power: 3
 * Group: Sand Village | Keywords: Team Baki
 *
 * MAIN: Move another friendly Sand Village character to another mission.
 *
 * UPGRADE: Move this character to another mission.
 */

function handleTemari080Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Need at least 2 missions
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Temari (080): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' }) } };
  }

  // Find all friendly Sand Village characters across all missions (not self)
  // Filter by Kurenai blocking and valid destination
  const validTargets: string[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    const friendlyChars = mission[friendlySide];
    if (isMovementBlockedByKurenai(state, mi, sourcePlayer)) continue;
    for (const char of friendlyChars) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue; // Hidden characters can't be identified by group
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.group !== 'Sand Village') continue;

      // Check valid destination (name uniqueness)
      const charName = topCard.name_fr;
      const hasValidDest = state.activeMissions.some((m, i) => {
        if (i === mi) return false;
        return !m[friendlySide].some((c) => {
          if (c.instanceId === char.instanceId) return false;
          if (c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr === charName;
        });
      });
      if (hasValidDest) validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Temari (080): No other friendly Sand Village character can be moved.',
      'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI080_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.temari080ConfirmMain',
  };
}

function handleTemari080Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Kurenai 035: if enemy Kurenai blocks movement from this mission, fizzle
  if (isMovementBlockedByKurenai(state, sourceMissionIndex, sourcePlayer)) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_BLOCKED', 'Temari (080): Movement blocked by Yuhi Kurenai (035).',
      'game.log.effect.moveBlockedKurenai', { card: 'TEMARI', id: 'KS-080-UC' }) } };
  }

  // Find valid destination missions for self (must not have same-name conflict)
  const topCard = sourceCard.stack?.length > 0
    ? sourceCard.stack[sourceCard.stack?.length - 1]
    : sourceCard.card;
  const selfName = topCard.name_fr;

  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasConflict = friendlyChars.some((c) => {
      const cTopCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return !c.isHidden && cTopCard.name_fr === selfName;
    });
    if (!hasConflict) validMissions.push(String(i));
  }

  if (validMissions.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Temari (080): No valid mission to move this character to (upgrade).',
      'game.log.effect.noTarget', { card: 'TEMARI', id: 'KS-080-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI080_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.temari080ConfirmUpgrade',
  };
}

export function registerTemari080Handlers(): void {
  registerEffect('KS-080-UC', 'MAIN', handleTemari080Main);
  registerEffect('KS-080-UC', 'UPGRADE', handleTemari080Upgrade);
}
