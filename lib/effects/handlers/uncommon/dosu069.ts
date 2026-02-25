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
      { card: 'DOSU KINUTA', id: 'KS-069-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'LOOK_AT_HIDDEN_CHARACTER',
    validTargets,
    description: 'Dosu Kinuta (069) UPGRADE: Select a hidden character in play to look at.',
    descriptionKey: 'game.effect.desc.dosu069LookAtHidden',
  };
}

function handleDosu069Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find hidden enemy characters in Dosu's mission only
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  const validTargets: string[] = [];
  for (const char of mission[enemySide]) {
    if (char.isHidden) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Dosu Kinuta (069): No hidden enemy characters in this mission.',
      'game.log.effect.noTarget',
      { card: 'DOSU KINUTA', id: 'KS-069-UC' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'FORCE_REVEAL_OR_DEFEAT',
    validTargets,
    description: 'Dosu Kinuta (069): Choose a hidden enemy character in this mission. Opponent must play them paying 2 more, or defeat them.',
    descriptionKey: 'game.effect.desc.dosu069ForceRevealOrDefeat',
  };
}

export function registerDosu069Handlers(): void {
  registerEffect('KS-069-UC', 'UPGRADE', handleDosu069Upgrade);
  registerEffect('KS-069-UC', 'MAIN', handleDosu069Main);
}
