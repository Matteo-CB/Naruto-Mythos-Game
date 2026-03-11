import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 087/130 - ZABUZA MOMOCHI "Water Prison Jutsu" (UC)
 * Chakra: 5 | Power: 5
 * Group: Independent | Keywords: Rogue Ninja, Jutsu
 *
 * MAIN: If only one non-hidden enemy character in this mission, hide them.
 * UPGRADE: MAIN effect: Instead, defeat that character.
 *
 * Modifier pattern: CONFIRM MAIN → if upgrade, CONFIRM UPGRADE MODIFIER (defeat vs hide).
 * The UPGRADE "effect:" is a Type A modifier — the engine skips it in orderedTypes.
 */

function handleZabuza087Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-check: exactly 1 non-hidden enemy in this mission
  const nonHiddenEnemies = mission[enemySide].filter((c) => !c.isHidden);

  if (nonHiddenEnemies.length !== 1) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      `Zabuza Momochi (087): ${nonHiddenEnemies.length === 0 ? 'No' : nonHiddenEnemies.length} non-hidden enemy character(s) in this mission (need exactly 1).`,
      'game.log.effect.noTarget', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC' });
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ZABUZA087_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.zabuza087ConfirmMain',
  };
}

function handleZabuza087UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: Type A modifier — handled by engine's ZABUZA087_CONFIRM_MAIN + UPGRADE_MODIFIER cases.
  return { state: ctx.state };
}

export function registerZabuza087Handlers(): void {
  registerEffect('KS-087-UC', 'MAIN', handleZabuza087Main);
  registerEffect('KS-087-UC', 'UPGRADE', handleZabuza087UpgradeNoop);
}
