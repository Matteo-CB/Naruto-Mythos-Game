import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 136/130 - SASUKE UCHIWA "Marque maudite du Ciel" (S)
 * Chakra: 7, Power: 8
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN [hourglass]: When a character is defeated, gain 1 Chakra.
 *   - Continuous/passive. Triggered via onDefeatTriggers.triggerOnDefeatEffects().
 *
 * UPGRADE: You must choose a friendly non-hidden character AND any enemy character
 *          in this mission and defeat them, if able.
 *   Stage 1: Player chooses which friendly to sacrifice
 *   Stage 2: Player chooses which enemy to destroy
 */

function sasuke136MainHandler(ctx: EffectContext): EffectResult {
  // Continuous on-defeat trigger - handled by onDefeatTriggers.triggerOnDefeatEffects()
  const state = ctx.state;
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (136): Gain 1 Chakra when any character is defeated (continuous).',
    'game.log.effect.gainChakra',
    { card: 'SASUKE UCHIWA', id: 'KS-136-S', amount: 1 },
  );
  return { state: { ...state, log } };
}

function sasuke136UpgradeHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find eligible friendly targets (non-hidden, not Sasuke himself)
  const friendlyTargets = mission[friendlySide].filter(
    (c) => !c.isHidden && c.instanceId !== ctx.sourceCard.instanceId,
  );
  const enemyTargets = mission[enemySide];

  if (friendlyTargets.length === 0 || enemyTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (136): No valid targets for mutual destruction (upgrade).',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-136-S' },
    );
    return { state: { ...state, log } };
  }

  // Stage 1: Player chooses which friendly to sacrifice
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE136_CHOOSE_FRIENDLY',
    validTargets: friendlyTargets.map((c) => c.instanceId),
    isMandatory: true,
    description: JSON.stringify({
      missionIndex: ctx.sourceMissionIndex,
      text: 'Sasuke Uchiwa (136) UPGRADE: Choose a friendly character to defeat.',
    }),
    descriptionKey: 'game.effect.desc.sasuke136ChooseFriendly',
  };
}

export function registerSasuke136Handlers(): void {
  registerEffect('KS-136-S', 'MAIN', sasuke136MainHandler);
  registerEffect('KS-136-S', 'UPGRADE', sasuke136UpgradeHandler);
  registerEffect('KS-136-MV', 'MAIN', sasuke136MainHandler);
  registerEffect('KS-136-MV', 'UPGRADE', sasuke136UpgradeHandler);
}
