import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 078/130 - KANKURO "Puppet Master" (UC)
 * Chakra: 5 | Power: 4
 * Group: Sand Village | Keywords: Team Baki
 *
 * AMBUSH: Move any character with Power 4 or less in play (any mission, any player)
 *   to another mission.
 *
 * UPGRADE: Reveal a friendly hidden character paying 1 less than its reveal cost.
 */

function handleKankuro078Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Need at least 2 missions to move
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kankuro (078): Only 1 mission in play, cannot move.',
      'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' }) } };
  }

  // Find all characters with effective power <= 4, filtering by Kurenai + valid destination
  const validTargets: string[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (getEffectivePower(state, char, char.controlledBy) > 4) continue;

      // Kurenai check: is movement blocked from this mission for this char's owner?
      if (isMovementBlockedByKurenai(state, mi, char.controlledBy)) continue;

      // Valid destination check (name uniqueness)
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      const charName = topCard.name_fr;
      const charSide = char.controlledBy === 'player1' ? 'player1Characters' : 'player2Characters';
      const hasValidDest = char.isHidden || state.activeMissions.some((m, i) => {
        if (i === mi) return false;
        return !m[charSide].some((c) => {
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
      'EFFECT_NO_TARGET', 'Kankuro (078): No character with Power 4 or less can be moved.',
      'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' }) } };
  }

  // Confirmation popup (mandatory — no skip)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO078_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kankuro078ConfirmAmbush',
  };
}

function handleKankuro078Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all hidden friendly characters that can be revealed (no name conflict, or has upgrade target)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      const charName = topCard.name_fr.toUpperCase();
      // Check if revealing would create a name conflict
      const hasNameConflict = mission[friendlySide].some((c) => {
        if (c.instanceId === char.instanceId || c.isHidden) return false;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return cTop.name_fr.toUpperCase() === charName;
      });
      if (hasNameConflict) {
        // Check if there's a valid upgrade target (same name, lower cost)
        const hasUpgradeTarget = mission[friendlySide].some((c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === charName && (topCard.chakra ?? 0) > (cTop.chakra ?? 0);
        });
        if (!hasUpgradeTarget) continue; // Can't reveal: name conflict + no upgrade target
      }
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Kankuro (078) UPGRADE: No hidden friendly characters in play to reveal.',
      'game.log.effect.noTarget', { card: 'KANKURO', id: 'KS-078-UC' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KANKURO078_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kankuro078ConfirmUpgrade',
  };
}

export function registerKankuro078Handlers(): void {
  registerEffect('KS-078-UC', 'AMBUSH', handleKankuro078Ambush);
  registerEffect('KS-078-UC', 'UPGRADE', handleKankuro078Upgrade);
}
