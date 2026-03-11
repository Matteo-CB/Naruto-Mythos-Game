import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

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

  // Confirmation popup before looking
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU069_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu069ConfirmUpgrade',
  };
}

function handleDosu069Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find hidden enemy characters in play (any mission)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
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
      { card: 'DOSU KINUTA', id: 'KS-069-UC' },
    );
    return { state: { ...state, log } };
  }

  // Confirmation popup before force reveal/defeat
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU069_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu069ConfirmMain',
  };
}

export function registerDosu069Handlers(): void {
  registerEffect('KS-069-UC', 'UPGRADE', handleDosu069Upgrade);
  registerEffect('KS-069-UC', 'MAIN', handleDosu069Main);
}
