import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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
    { card: 'TSUNADE', id: '004/130' },
  );
  return { state: { ...state, log } };
}

function handleTsunade004Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find character cards in the discard pile
  const discardPile = playerState.discardPile;
  if (discardPile.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tsunade (004): No characters in discard pile to recover.',
      'game.log.effect.noTarget', { card: 'TSUNADE', id: '004/130' }) } };
  }

  // Build valid targets as indices (using card ids as identifiers)
  // We'll use discard pile card IDs for target selection
  const validTargets: string[] = discardPile.map((_, idx) => `discard_${idx}`);

  if (validTargets.length === 1) {
    // Only one card in discard - auto-apply
    const card = discardPile[0];
    const newState = { ...state };
    const ps = { ...newState[sourcePlayer] };
    ps.hand = [...ps.hand, card];
    ps.discardPile = ps.discardPile.slice(1);
    newState[sourcePlayer] = ps;

    newState.log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_RECOVER',
      `Tsunade (004): Recovered ${card.name_fr} from discard pile to hand.`,
      'game.log.effect.recoverFromDiscard',
      { card: 'TSUNADE', id: '004/130', target: card.name_fr },
    );

    return { state: newState };
  }

  // Multiple cards in discard - requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'RECOVER_FROM_DISCARD',
    validTargets,
    description: 'Choose a character from your discard pile to put into your hand.',
  };
}

export function registerTsunade004Handlers(): void {
  registerEffect('004/130', 'MAIN', handleTsunade004Main);
  registerEffect('004/130', 'UPGRADE', handleTsunade004Upgrade);
}
