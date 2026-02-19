import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';

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
 */

function sasuke136MainHandler(ctx: EffectContext): EffectResult {
  // Continuous on-defeat trigger - handled by onDefeatTriggers.triggerOnDefeatEffects()
  const state = ctx.state;
  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (136): Gain 1 Chakra when any character is defeated (continuous).',
  );
  return { state: { ...state, log } };
}

/** Get the effective power of a character for auto-resolution targeting. */
function getCharPower(char: CharacterInPlay): number {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return (char.isHidden ? 0 : topCard.power) + char.powerTokens;
}

function sasuke136UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pick weakest friendly (least power loss) for sacrifice
  const friendlyTargets = mission[friendlySide].filter(
    (c) => !c.isHidden && c.instanceId !== ctx.sourceCard.instanceId,
  );
  const friendlyTarget = friendlyTargets.length > 0
    ? friendlyTargets.reduce((a, b) => getCharPower(a) <= getCharPower(b) ? a : b)
    : undefined;

  // Pick strongest enemy (best strategic value) for destruction
  const enemyTargets = mission[enemySide];
  const enemyTarget = enemyTargets.length > 0
    ? enemyTargets.reduce((a, b) => getCharPower(a) >= getCharPower(b) ? a : b)
    : undefined;

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
