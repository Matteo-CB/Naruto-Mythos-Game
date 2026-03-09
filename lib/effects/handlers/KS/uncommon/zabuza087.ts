import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';

/**
 * Card 087/130 - ZABUZA MOMOCHI "Water Prison Jutsu" (UC)
 * Chakra: 5 | Power: 5
 * Group: Independent | Keywords: Rogue Ninja, Jutsu
 *
 * MAIN: If only one non-hidden enemy character in this mission, hide them.
 *   - Check the number of non-hidden enemy characters in this mission.
 *   - If there is exactly 1 non-hidden enemy, hide that character (flip face-down).
 *   - If 0 or 2+ non-hidden enemies, effect fizzles.
 *
 * UPGRADE: MAIN: Instead of hiding, defeat that character.
 *   - When played as upgrade, the same condition applies (exactly 1 non-hidden enemy),
 *     but instead of hiding them, defeat them.
 */

function handleZabuza087Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find non-hidden enemy characters in this mission
  const nonHiddenEnemies = enemyChars.filter((c) => !c.isHidden);

  if (nonHiddenEnemies.length !== 1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      `Zabuza Momochi (087): ${nonHiddenEnemies.length === 0 ? 'No' : nonHiddenEnemies.length} non-hidden enemy character(s) in this mission (need exactly 1).`,
      'game.log.effect.noTarget',
      { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC' },
    );
    return { state: { ...state, log } };
  }

  const target = nonHiddenEnemies[0];

  if (isUpgrade) {
    // UPGRADE: Defeat instead of hide
    let newState = defeatEnemyCharacter(state, sourceMissionIndex, target.instanceId, sourcePlayer);
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_DEFEAT',
      `Zabuza Momochi (087): Defeated ${target.card.name_fr} (upgrade - defeat instead of hide).`,
      'game.log.effect.defeat',
      { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC', target: target.card.name_fr },
    );
    return { state: { ...newState, log } };
  }

  // MAIN: Hide the only non-hidden enemy (check hide immunity first)
  if (!canBeHiddenByEnemy(state, target, opponentPlayer)) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      `Zabuza Momochi (087): ${target.card.name_fr} is immune to being hidden by enemy effects.`,
      'game.log.effect.immune', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC', target: target.card.name_fr },
    );
    return { state: { ...state, log } };
  }

  // Use centralized hide to respect Kimimaro 056 protection, Gemma 049 sacrifice, and immunities
  const hiddenState = EffectEngine.hideCharacterWithLog(state, target.instanceId, sourcePlayer);
  return { state: hiddenState };
}

function handleZabuza087UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: MAIN handler already checks isUpgrade to defeat instead of hide.
  return { state: ctx.state };
}

export function registerZabuza087Handlers(): void {
  registerEffect('KS-087-UC', 'MAIN', handleZabuza087Main);
  registerEffect('KS-087-UC', 'UPGRADE', handleZabuza087UpgradeNoop);
}
