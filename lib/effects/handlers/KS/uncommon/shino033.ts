import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 033/130 - SHINO ABURAME (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * AMBUSH: Play this character paying 4 less if there's an enemy Jutsu character
 *   in this mission. (Cost reduction is handled in ChakraValidation.ts)
 *
 * UPGRADE: Move this character to another mission.
 */

function handleShino033Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  if (sourceMissionIndex === undefined || sourceMissionIndex < 0) {
    return { state };
  }

  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  const hasEnemyJutsu = mission[enemySide].some((c) => {
    if (c.isHidden) return false;
    const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return top.keywords?.includes('Jutsu');
  });

  if (hasEnemyJutsu) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT',
      'Shino Aburame (033): Played paying 4 less (enemy Jutsu character present).',
      'game.log.effect.shino033CostReduction',
      { card: 'SHINO ABURAME', id: 'KS-033-UC' },
    );
    return { state: { ...state, log } };
  }

  return { state };
}

function handleShino033Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  // R8: Need at least 2 missions to move
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shino Aburame (033): Only 1 mission in play — cannot move.',
      'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-033-UC' }) } };
  }

  // R8: Check Kurenai block — Shino moves himself
  if (isMovementBlockedByKurenai(state, sourceMissionIndex, sourcePlayer)) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_BLOCKED',
      'Shino Aburame (033): Cannot move from this mission (Kurenai 035 block).',
      'game.log.effect.moveBlockedKurenai', { card: 'SHINO ABURAME', id: 'KS-033-UC' }) } };
  }

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (not current mission, no same-name conflict)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      if (c.instanceId === sourceCard.instanceId) return false;
      if (c.isHidden) return false;
      const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr === charName;
    });
    if (!hasSameName) {
      validTargets.push(String(i));
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shino Aburame (033): No valid mission to move to.',
      'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-033-UC' }) } };
  }

  // Confirmation popup before move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO033_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shino033ConfirmUpgrade',
  };
}

export function registerShino033Handlers(): void {
  registerEffect('KS-033-UC', 'AMBUSH', handleShino033Ambush);
  registerEffect('KS-033-UC', 'UPGRADE', handleShino033Upgrade);
}
