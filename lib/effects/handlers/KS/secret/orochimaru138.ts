import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { calculateContinuousPowerModifier } from '@/lib/effects/ContinuousEffects';



function orochimaru138MainHandler(ctx: EffectContext): EffectResult {
  
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

  
  
  const fakeChar = {
    ...ctx.sourceCard,
    card: previousCard,
    stack: stack.slice(0, -1), // stack without Orochimaru on top
  };
  const continuousBonus = calculateContinuousPowerModifier(
    state, ctx.sourcePlayer, ctx.sourceMissionIndex, fakeChar,
  );
  const tokensBeforeThisPlay = ctx.tokensBeforePlay ?? ctx.sourceCard.powerTokens ?? 0;
  const effectivePower = (previousCard.power ?? 0) + tokensBeforeThisPlay + continuousBonus;

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
