import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 069/130 - DOSU KINUTA "Resonance" (UC)
 * Chakra: 5 | Power: 4
 * Group: Sound Village | Keywords: Team Dosu
 *
 * UPGRADE: Look at a hidden character in play (any player, any mission).
 *   - Select a hidden character anywhere in play, and the source player gets
 *     to see it (informational). Requires target selection.
 *
 * MAIN: Choose a hidden enemy character; opponent must play them (reveal them
 *   paying their printed chakra cost + 2 extra), or defeat them.
 *   - Finds hidden enemy characters in play. Requires target selection.
 *   - The resolution (force reveal at cost+2 or defeat) is handled by the
 *     engine after target selection. This is a forced choice for the opponent.
 */

function handleDosu069Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all hidden characters in play across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) {
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
      'Dosu Kinuta (069): No hidden characters in play to look at.',
      'game.log.effect.noTarget',
      { card: 'DOSU KINUTA', id: '069/130' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'LOOK_AT_HIDDEN_CHARACTER',
    validTargets,
    description: 'Dosu Kinuta (069) UPGRADE: Select a hidden character in play to look at.',
  };
}

function handleDosu069Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find hidden enemy characters across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of enemyChars) {
      if (char.isHidden) {
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
      'Dosu Kinuta (069): No hidden enemy characters in play.',
      'game.log.effect.noTarget',
      { card: 'DOSU KINUTA', id: '069/130' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'FORCE_REVEAL_OR_DEFEAT',
    validTargets,
    description: 'Dosu Kinuta (069): Select a hidden enemy character. Opponent must reveal them (paying cost + 2 chakra) or defeat them.',
  };
}

export function registerDosu069Handlers(): void {
  registerEffect('069/130', 'UPGRADE', handleDosu069Upgrade);
  registerEffect('069/130', 'MAIN', handleDosu069Main);
}
