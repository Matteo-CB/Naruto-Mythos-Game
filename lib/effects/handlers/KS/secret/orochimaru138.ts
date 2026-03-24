import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { calculateContinuousPowerModifier } from '@/lib/effects/ContinuousEffects';

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
    { card: 'OROCHIMARU', id: 'KS-138-S' },
  );
  return { state: { ...ctx.state, log } };
}

function orochimaru138UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Find the previous card in the stack (the one being upgraded over)
  const stack = ctx.sourceCard.stack;
  if (stack.length < 2) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Orochimaru (138): No previous card in evolution stack (upgrade fizzle).',
      'game.log.effect.noTarget',
      { card: 'OROCHIMARU', id: 'KS-138-S' },
    );
    return { state: { ...state, log } };
  }

  const previousCard = stack[stack.length - 2];

  // Effective power = base power + power tokens + continuous modifiers (e.g. mission power bonus)
  // Build a fake CharacterInPlay with previousCard as top to calculate what its power was
  const fakeChar = {
    ...ctx.sourceCard,
    card: previousCard,
    stack: stack.slice(0, -1), // stack without Orochimaru on top
  };
  const continuousBonus = calculateContinuousPowerModifier(
    state, ctx.sourcePlayer, ctx.sourceMissionIndex, fakeChar,
  );
  const effectivePower = (previousCard.power ?? 0) + (ctx.sourceCard.powerTokens ?? 0) + continuousBonus;

  if (effectivePower < 6) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      `Orochimaru (138): Upgraded character ${previousCard.name_fr} had Power ${effectivePower} (less than 6), no bonus points.`,
      'game.log.effect.noTarget',
      { card: 'OROCHIMARU', id: 'KS-138-S' },
    );
    return { state: { ...state, log } };
  }

  // Previous card has effective Power >= 6, return CONFIRM popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU138_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ previousCardName: previousCard.name_fr, previousCardPower: effectivePower }),
    descriptionKey: 'game.effect.desc.orochimaru138ConfirmUpgrade',
  };
}

export function registerOrochimaru138Handlers(): void {
  registerEffect('KS-138-S', 'MAIN', orochimaru138MainHandler);
  registerEffect('KS-138-S', 'UPGRADE', orochimaru138UpgradeHandler);
}
