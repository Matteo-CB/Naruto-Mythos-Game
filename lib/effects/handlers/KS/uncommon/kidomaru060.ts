import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 060/130 - KIDÔMARU "Spider Web Deploy" (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Sound Four, Jutsu
 *
 * MAIN: Move a character from this mission (to another mission).
 *   - Any character (friendly or enemy), non-hidden, in this mission.
 *   - Two-stage: pick character, then pick destination mission.
 *   - Uses targetSelectionType 'KIDOMARU060_CHOOSE_CHARACTER' → 'KIDOMARU060_MOVE_DESTINATION'
 *
 * AMBUSH: [↯] Defeat an enemy character with Power 1 or less in play.
 *   - Any enemy character across all missions with effective Power ≤ 1.
 *   - Uses targetSelectionType 'KIDOMARU060_DEFEAT_LOW_POWER'
 */

function handleKidomaru060Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all non-hidden characters in this mission (any player) except self
  const mission = state.activeMissions[sourceCard.missionIndex];
  if (!mission) {
    return { state };
  }

  const validTargets: string[] = [];
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue;
    validTargets.push(char.instanceId);
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kidômaru (060): No character in this mission to move.',
      'game.log.effect.noTarget',
      { card: 'KIDÔMARU', id: 'KS-060-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_CHOOSE_CHARACTER',
    validTargets,
    description: 'Kidômaru (060) MAIN: Select a character in this mission to move to another mission.',
    descriptionKey: 'game.effect.desc.kidomaru060MoveCharacter',
    isOptional: true,
  };
}

function handleKidomaru060Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all enemy characters across all missions with effective power <= 1
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      if (getEffectivePower(state, char, enemyPlayer) <= 1) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kidômaru (060) AMBUSH: No enemy character with Power 1 or less in play.',
      'game.log.effect.noTarget',
      { card: 'KIDÔMARU', id: 'KS-060-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU060_DEFEAT_LOW_POWER',
    validTargets,
    description: 'Kidômaru (060) AMBUSH: Select an enemy character with Power 1 or less in play to defeat.',
    descriptionKey: 'game.effect.desc.kidomaru060DefeatLowPower',
    isOptional: true,
  };
}

export function registerKidomaru060Handlers(): void {
  registerEffect('KS-060-UC', 'MAIN', handleKidomaru060Main);
  registerEffect('KS-060-UC', 'AMBUSH', handleKidomaru060Ambush);
}
