import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 028/130 - AKAMARU "Les Hommes-Betes Enrages" (UC)
 * Chakra: 2 | Power: 3
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN [continuous]: At the end of the round, you may return this card to your hand.
 *   - This is a continuous effect. The actual end-of-round return-to-hand logic is
 *     handled in EndPhase.ts (similar to Akamaru 027).
 *   - The MAIN handler here is a no-op.
 *
 * AMBUSH: POWERUP 2 a friendly Kiba Inuzuka in this mission.
 *   - When revealed from hidden, find a friendly character named "KIBA INUZUKA"
 *     in the same mission and add 2 power tokens to them.
 *   - If no friendly Kiba Inuzuka is in this mission, the effect fizzles.
 *   - If multiple friendly Kiba Inuzuka (shouldn't normally happen due to name uniqueness),
 *     require target selection.
 */
function handleAkamaru028Main(ctx: EffectContext): EffectResult {
  // Continuous end-of-round return to hand - actual logic handled in EndPhase.ts
  return { state: ctx.state };
}

function handleAkamaru028Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  // Find friendly Kiba Inuzuka in this mission
  const kibaTargets: string[] = [];
  for (const char of friendlyChars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.name_fr === 'KIBA INUZUKA') {
      kibaTargets.push(char.instanceId);
    }
  }

  // If no friendly Kiba Inuzuka, effect fizzles
  if (kibaTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Akamaru (028): No friendly Kiba Inuzuka in this mission for POWERUP 2.',
      'game.log.effect.noTarget', { card: 'AKAMARU', id: '028/130' }) } };
  }

  // If exactly one target, auto-apply
  if (kibaTargets.length === 1) {
    const targetId = kibaTargets[0];
    const newState = applyPowerupToTarget(state, targetId, 2, sourceMissionIndex, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets (unlikely but handle it): requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'AKAMARU_028_POWERUP_KIBA',
    validTargets: kibaTargets,
    description: 'Select a friendly Kiba Inuzuka in this mission to give POWERUP 2.',
  };
}

function applyPowerupToTarget(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  amount: number,
  missionIndex: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  let targetName = '';
  const newState = { ...state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[friendlySide]];
  const idx = chars.findIndex(c => c.instanceId === targetInstanceId);

  if (idx !== -1) {
    targetName = chars[idx].card.name_fr;
    chars[idx] = { ...chars[idx], powerTokens: chars[idx].powerTokens + amount };
    mission[friendlySide] = chars;
    missions[missionIndex] = mission;
    newState.activeMissions = missions;
  }

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_POWERUP',
    `Akamaru (028): POWERUP ${amount} on ${targetName} (ambush).`,
    'game.log.effect.powerup',
    { card: 'AKAMARU', id: '028/130', amount, target: targetName },
  );

  return newState;
}

export function registerAkamaru028Handlers(): void {
  registerEffect('028/130', 'MAIN', handleAkamaru028Main);
  registerEffect('028/130', 'AMBUSH', handleAkamaru028Ambush);
}
