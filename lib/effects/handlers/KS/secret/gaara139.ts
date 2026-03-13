import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 139/130 - GAARA "Le Tombeau du Desert" (S)
 * Chakra: 5, Power: 4
 * Group: Sand Village, Keywords: Team Baki, Jutsu
 *
 * MAIN: Defeat an enemy character with a cost less than the number of
 *       friendly hidden characters in play.
 *   - Count ALL friendly hidden characters across ALL missions.
 *   - Find visible enemy characters with cost STRICTLY LESS than that count.
 *   - If multiple valid targets, return requiresTargetSelection.
 *   - If exactly 1, auto-apply defeat.
 *   - If zero hidden chars or no valid targets, fizzle.
 *
 * UPGRADE: In addition, hide one other enemy character with the same name
 *          as the defeated character AND cost strictly less than the defeated
 *          character's cost.
 *   - Only triggers when ctx.isUpgrade is true AND a character was defeated.
 */

function gaara139MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Count all friendly hidden characters across all missions
  let hiddenCount = 0;
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) {
        hiddenCount++;
      }
    }
  }

  if (hiddenCount === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Gaara (139): No friendly hidden characters in play, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'GAARA', id: 'KS-139-S' },
    );
    return { state: { ...state, log } };
  }

  // Find all visible enemy characters with cost strictly less than hiddenCount
  const validTargets: { char: import('@/lib/engine/types').CharacterInPlay; missionIndex: number }[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySide]) {
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      // Hidden characters have cost 0 per rules
      const effectiveCost = char.isHidden ? 0 : topCard.chakra;
      if (effectiveCost < hiddenCount) {
        validTargets.push({ char, missionIndex: i });
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      `Gaara (139): No enemy character with cost less than ${hiddenCount} (hidden count).`,
      'game.log.effect.noTarget',
      { card: 'GAARA', id: 'KS-139-S' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup instead of direct target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAARA139_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: ctx.sourceMissionIndex, hiddenCount }),
    descriptionKey: 'game.effect.desc.gaara139ConfirmMain',
    descriptionParams: { hiddenCount: String(hiddenCount) },
  };
}

function gaara139UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerGaara139Handlers(): void {
  registerEffect('KS-139-S', 'MAIN', gaara139MainHandler);
  registerEffect('KS-139-S', 'UPGRADE', gaara139UpgradeHandler);
}
