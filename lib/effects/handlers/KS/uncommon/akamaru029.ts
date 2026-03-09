import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';

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

  // Find the lowest cost
  let lowestCost = Infinity;
  for (const char of nonHiddenEnemies) {
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.chakra < lowestCost) {
      lowestCost = topCard.chakra;
    }
  }

  // Find all enemies with that lowest cost
  const tiedChars = nonHiddenEnemies.filter(c => {
    const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return topCard.chakra === lowestCost;
  });

  // If exactly one: auto-hide (use centralized hide to respect protections)
  if (tiedChars.length === 1) {
    const target = tiedChars[0];
    const hiddenState = EffectEngine.hideCharacterWithLog(state, target.instanceId, sourcePlayer);
    return { state: hiddenState };
  }

  // Multiple enemies tied for lowest cost: the player chooses which to hide
  const validTargets = tiedChars.map(c => c.instanceId);
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'AKAMARU029_CHOOSE_HIDE',
    validTargets,
    selectingPlayer: sourcePlayer,
    description: `Akamaru (029): Choose which enemy character (cost ${lowestCost}) to hide.`,
    descriptionKey: 'game.effect.desc.akamaru029ChooseHide',
    descriptionParams: { cost: String(lowestCost) },
    isMandatory: true,
  };
}

export function registerAkamaru029Handlers(): void {
  registerEffect('KS-029-UC', 'MAIN', handleAkamaru029Main);
  registerEffect('KS-029-UC', 'UPGRADE', handleAkamaru029Upgrade);
}
