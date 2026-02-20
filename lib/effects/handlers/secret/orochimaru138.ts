import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 138/130 - OROCHIMARU (S)
 * Chakra: 7, Power: 6
 * Group: Independent, Keywords: Sannin, Rogue Ninja
 *
 * MAIN [continuous]: Can upgrade over any character that is not a Summon
 *                    nor named "Orochimaru".
 *   - Continuous no-op. The upgrade legality logic is handled by the engine's
 *     action validation (ActionPhase / GameEngine.validateUpgrade).
 *
 * UPGRADE: Gain 2 Mission points if the upgraded character had Power 6 or more.
 *   - When isUpgrade: look at the card being upgraded over (the previous top card
 *     in the stack). If that card's base power >= 6, add 2 to the player's
 *     missionPoints.
 */

function orochimaru138MainHandler(ctx: EffectContext): EffectResult {
  // Continuous upgrade flexibility - handled by engine's upgrade validation
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Orochimaru (138): Can upgrade over any non-Summon, non-Orochimaru character (continuous).',
    'game.log.effect.continuous',
    { card: 'OROCHIMARU', id: '138/130' },
  );
  return { state: { ...ctx.state, log } };
}

function orochimaru138UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Find the previous card in the stack (the one being upgraded over)
  // The sourceCard's stack contains all cards; the second-to-last is the previous top
  const stack = ctx.sourceCard.stack;
  if (stack.length < 2) {
    // No previous card in stack (shouldn't happen during upgrade, but guard)
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Orochimaru (138): No previous card in evolution stack (upgrade fizzle).',
      'game.log.effect.noTarget',
      { card: 'OROCHIMARU', id: '138/130' },
    );
    return { state: { ...state, log } };
  }

  // The previous top card is at index stack.length - 2
  const previousCard = stack[stack.length - 2];

  if (previousCard.power >= 6) {
    // Gain 2 mission points
    const playerState = { ...state[ctx.sourcePlayer] };
    playerState.missionPoints += 2;

    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_SCORE',
      `Orochimaru (138): Gained 2 Mission points (upgraded over ${previousCard.name_fr} with Power ${previousCard.power}).`,
      'game.log.effect.gainPoints',
      { card: 'OROCHIMARU', id: '138/130', points: 2, target: previousCard.name_fr },
    );

    return {
      state: {
        ...state,
        [ctx.sourcePlayer]: playerState,
        log,
      },
    };
  }

  // Previous card had Power < 6, no bonus
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_NO_TARGET',
    `Orochimaru (138): Upgraded character ${previousCard.name_fr} had Power ${previousCard.power} (less than 6), no bonus points.`,
    'game.log.effect.noTarget',
    { card: 'OROCHIMARU', id: '138/130' },
  );

  return { state: { ...state, log } };
}

export function registerOrochimaru138Handlers(): void {
  registerEffect('138/130', 'MAIN', orochimaru138MainHandler);
  registerEffect('138/130', 'UPGRADE', orochimaru138UpgradeHandler);
}
