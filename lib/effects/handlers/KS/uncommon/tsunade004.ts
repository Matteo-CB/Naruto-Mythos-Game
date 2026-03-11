import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 004/130 - TSUNADE "La Creation et le Renouveau" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Sannin, Jutsu
 *
 * MAIN [continuous]: Defeated friendly characters go into your hand instead of
 * your discard pile.
 *   - This is a continuous effect. The actual defeat-to-hand redirect logic is
 *     handled in the defeat resolution code of the game engine (onDefeatTriggers.ts).
 *   - The MAIN handler here is a no-op since the effect is passive/continuous.
 *
 * UPGRADE: Choose one character in your discard pile and put them into your hand.
 *   - When triggered as an upgrade, find all character cards in the source player's
 *     discard pile. If multiple choices, require target selection.
 *   - Move the chosen card from discard pile to hand.
 */
function handleTsunade004Main(ctx: EffectContext): EffectResult {
  // Continuous defeat-to-hand redirect - actual logic handled in the game engine
  // when defeat resolution occurs and checks for Tsunade 004 being face-visible in play.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Tsunade (004): Defeated friendly characters will go to hand instead of discard pile (continuous).',
    'game.log.effect.continuous',
    { card: 'TSUNADE', id: 'KS-004-UC' },
  );
  return { state: { ...state, log } };
}

function handleTsunade004Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  // Pre-check: any characters in discard pile?
  const discardPile = playerState.discardPile;
  let hasCharacter = false;
  for (let idx = 0; idx < discardPile.length; idx++) {
    if (discardPile[idx].card_type === 'character') {
      hasCharacter = true;
      break;
    }
  }
  if (!hasCharacter) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tsunade (004): No characters in discard pile to recover.',
      'game.log.effect.noTarget', { card: 'TSUNADE', id: 'KS-004-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE004_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.tsunade004ConfirmUpgrade',
  };
}

export function registerTsunade004Handlers(): void {
  registerEffect('KS-004-UC', 'MAIN', handleTsunade004Main);
  registerEffect('KS-004-UC', 'UPGRADE', handleTsunade004Upgrade);
}
