import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';

/**
 * Card 136/130 - SASUKE UCHIWA "Marque maudite du Ciel" (S)
 * Chakra: 7, Power: 8
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN [hourglass]: When a character is defeated, gain 1 Chakra.
 *   - Continuous/passive. Triggered via defeatUtils.triggerOnDefeatEffects().
 *
 * UPGRADE: Must defeat a friendly non-hidden character AND an enemy character
 *          in this mission, if able.
 */

function sasuke136MainHandler(ctx: EffectContext): EffectResult {
  // Continuous on-defeat trigger - handled by defeatUtils.triggerOnDefeatEffects()
  const state = ctx.state;
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (136): Gain 1 Chakra when any character is defeated (continuous).',
  );
  return { state: { ...state, log } };
}

function sasuke136UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const friendlyTarget = mission[friendlySide].find(
    (c) => !c.isHidden && c.instanceId !== ctx.sourceCard.instanceId,
  );
  const enemyTarget = mission[enemySide].find(() => true);

  if (!friendlyTarget || !enemyTarget) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (136): No valid targets for mutual destruction (upgrade).',
    );
    return { state: { ...state, log } };
  }

  state = defeatFriendlyCharacter(state, ctx.sourceMissionIndex, friendlyTarget.instanceId, ctx.sourcePlayer);
  state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_DEFEAT',
    `Sasuke Uchiwa (136): Defeated friendly ${friendlyTarget.card.name_fr} (mutual destruction).`) };

  state = defeatEnemyCharacter(state, ctx.sourceMissionIndex, enemyTarget.instanceId, ctx.sourcePlayer);
  state = { ...state, log: logAction(state.log, state.turn, state.phase, ctx.sourcePlayer, 'EFFECT_DEFEAT',
    `Sasuke Uchiwa (136): Defeated enemy ${enemyTarget.card.name_fr} (mutual destruction).`) };

  return { state };
}

export function registerSasuke136Handlers(): void {
  registerEffect('136/130', 'MAIN', sasuke136MainHandler);
  registerEffect('136/130', 'UPGRADE', sasuke136UpgradeHandler);
}
