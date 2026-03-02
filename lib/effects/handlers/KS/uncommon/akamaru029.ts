import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 029/130 - AKAMARU "Le Loup Bicephale" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN [continuous]: You can play this character as an upgrade over Kiba Inuzuka.
 *   - This is a continuous/passive effect. The actual upgrade-over-different-name logic
 *     is handled in the game engine's action validation (allows Akamaru 029 to upgrade
 *     over a Kiba Inuzuka character despite having a different name).
 *   - The MAIN handler here is a no-op.
 *
 * UPGRADE: Hide the non-hidden enemy character with the lowest cost in this mission.
 *   - When triggered as an upgrade, find non-hidden enemies in this mission.
 *   - Pick the one with lowest printed chakra cost. If tied, pick the first one.
 *   - Hide the selected character.
 */
function handleAkamaru029Main(ctx: EffectContext): EffectResult {
  // Continuous effect - can upgrade over Kiba Inuzuka.
  // Actual logic handled in the game engine's action validation.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Akamaru (029): Can be played as an upgrade over Kiba Inuzuka (continuous).',
    'game.log.effect.continuous',
    { card: 'AKAMARU', id: 'KS-029-UC' },
  );
  return { state: { ...state, log } };
}

function handleAkamaru029Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find non-hidden enemies that can be hidden by enemy effects
  const nonHiddenEnemies = enemyChars.filter(c => canBeHiddenByEnemy(state, c, opponentPlayer));

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Akamaru (029): No non-hidden enemy character in this mission to hide (upgrade effect).',
      'game.log.effect.noTarget', { card: 'AKAMARU', id: 'KS-029-UC' }) } };
  }

  // Find the one with lowest cost
  let lowestCost = Infinity;
  let lowestCostChar = nonHiddenEnemies[0];
  for (const char of nonHiddenEnemies) {
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.chakra < lowestCost) {
      lowestCost = topCard.chakra;
      lowestCostChar = char;
    }
  }

  // Hide the selected character
  const missions = [...state.activeMissions];
  const m = { ...missions[sourceMissionIndex] };
  const chars = [...m[enemySide]];
  const idx = chars.findIndex(c => c.instanceId === lowestCostChar.instanceId);
  if (idx !== -1) {
    const targetName = chars[idx].card.name_fr;
    chars[idx] = { ...chars[idx], isHidden: true };
    m[enemySide] = chars;
    missions[sourceMissionIndex] = m;

    const newState = { ...state, activeMissions: missions };
    const log = logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_HIDE',
      `Akamaru (029): Hid ${targetName} (lowest cost enemy in this mission, upgrade effect).`,
      'game.log.effect.hide',
      { card: 'AKAMARU', id: 'KS-029-UC', target: targetName },
    );

    return { state: { ...newState, log } };
  }

  return { state };
}

export function registerAkamaru029Handlers(): void {
  registerEffect('KS-029-UC', 'MAIN', handleAkamaru029Main);
  registerEffect('KS-029-UC', 'UPGRADE', handleAkamaru029Upgrade);
}
