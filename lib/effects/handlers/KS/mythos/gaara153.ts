import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 153/130 - GAARA "Cercueil de Sable" (M)
 * Chakra: 5, Power: 4
 * Group: Sand Village, Keywords: Team Baki, Jutsu
 *
 * MAIN: Defeat an enemy character with a cost less than the number of
 *       friendly hidden characters in play.
 *   - Count ALL friendly hidden characters across ALL missions.
 *   - Find non-hidden enemy characters with cost STRICTLY LESS than that count.
 *   - If multiple valid targets, return requiresTargetSelection.
 *   - If exactly 1, auto-apply defeat.
 *   - If zero hidden chars or no valid targets, fizzle.
 *
 * UPGRADE: In addition, hide one other enemy character with the same name
 *          as the defeated character AND cost strictly less than the defeated
 *          character's cost.
 *   - Only triggers when ctx.isUpgrade is true AND a character was defeated.
 *   - Handled by EffectEngine after target selection.
 */

function gaara153MainHandler(ctx: EffectContext): EffectResult {
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
      'Gaara (153): No friendly hidden characters in play, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'GAARA', id: 'KS-153-MV' },
    );
    return { state: { ...state, log } };
  }

  // Find all non-hidden enemy characters with cost strictly less than hiddenCount
  const validTargets: { char: import('@/lib/engine/types').CharacterInPlay; missionIndex: number }[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.chakra < hiddenCount) {
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
      `Gaara (153): No enemy character with cost less than ${hiddenCount} (hidden count).`,
      'game.log.effect.noTarget',
      { card: 'GAARA', id: 'KS-153-MV' },
    );
    return { state: { ...state, log } };
  }

  // Always let player choose (optional effect)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAARA153_DEFEAT_BY_COST',
    validTargets: validTargets.map((t) => t.char.instanceId),
    description: `Gaara (153): Select an enemy character with cost less than ${hiddenCount} to defeat.`,
    descriptionKey: 'game.effect.desc.gaara153Defeat',
    descriptionParams: { hiddenCount },
  };
}

function gaara153UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is handled by EffectEngine after MAIN target selection
  // (chains a hide effect for same-name enemy with lower cost).
  return { state: ctx.state };
}

export function registerGaara153Handlers(): void {
  registerEffect('KS-153-MV', 'MAIN', gaara153MainHandler);
  registerEffect('KS-153-MV', 'UPGRADE', gaara153UpgradeHandler);
}
