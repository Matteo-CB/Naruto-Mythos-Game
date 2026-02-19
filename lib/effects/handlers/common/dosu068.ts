import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 068/130 - DOSU KINUTA (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Team Dosu
 * MAIN: Look at a hidden character in play.
 * AMBUSH: Defeat a hidden character in play.
 *
 * MAIN effect: The player selects any hidden character in play (friendly or enemy) and
 * looks at it (reveals it to themselves without flipping it face-up).
 * AMBUSH effect: When revealed from hidden, select a hidden character in play and defeat it.
 */
function handleDosu068Main(ctx: EffectContext): EffectResult {
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

  // If no hidden characters, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Dosu Kinuta (068): No hidden characters in play to look at.',
      'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: '068/130' }) } };
  }

  // Requires target selection: which hidden character to look at
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'LOOK_AT_HIDDEN_CHARACTER',
    validTargets,
    description: 'Select a hidden character in play to look at.',
  };
}

function handleDosu068Ambush(ctx: EffectContext): EffectResult {
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

  // If no hidden characters, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Dosu Kinuta (068): No hidden characters in play to defeat.',
      'game.log.effect.noTarget', { card: 'DOSU KINUTA', id: '068/130' }) } };
  }

  // Requires target selection: which hidden character to defeat
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER',
    validTargets,
    description: 'Select a hidden character in play to defeat.',
  };
}

export function registerHandler(): void {
  registerEffect('068/130', 'MAIN', handleDosu068Main);
  registerEffect('068/130', 'AMBUSH', handleDosu068Ambush);
}
