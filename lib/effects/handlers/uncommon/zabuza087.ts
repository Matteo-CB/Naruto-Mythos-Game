import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { defeatEnemyCharacter } from '../../defeatUtils';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 087/130 - ZABUZA MOMOCHI "Demon of the Mist" (UC)
 * Chakra: 5 | Power: 6
 * Group: Independent | Keywords: Rogue Ninja, Weapon
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
      { card: 'ZABUZA MOMOCHI', id: '087/130' },
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
      { card: 'ZABUZA MOMOCHI', id: '087/130', target: target.card.name_fr },
    );
    return { state: { ...newState, log } };
  }

  // MAIN: Hide the only non-hidden enemy
  const newState = { ...state };
  const missions = [...newState.activeMissions];
  const m = { ...missions[sourceMissionIndex] };
  const chars = [...m[enemySide]];
  const charIdx = chars.findIndex((c) => c.instanceId === target.instanceId);

  if (charIdx !== -1) {
    chars[charIdx] = { ...chars[charIdx], isHidden: true };
    m[enemySide] = chars;
    missions[sourceMissionIndex] = m;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_HIDE',
      `Zabuza Momochi (087): Hid ${target.card.name_fr} (only non-hidden enemy in mission).`,
      'game.log.effect.hide',
      { card: 'ZABUZA MOMOCHI', id: '087/130', target: target.card.name_fr },
    );

    return { state: { ...newState, activeMissions: missions, log } };
  }

  return { state: newState };
}

export function registerZabuza087Handlers(): void {
  registerEffect('087/130', 'MAIN', handleZabuza087Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to defeat instead of hide
}
