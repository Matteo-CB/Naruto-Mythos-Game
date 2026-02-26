import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 033/130 - SHINO ABURAME (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN: All characters played by the opponent cost 1 more this turn.
 *
 * UPGRADE: Move this character to another mission.
 */

function handleShino033Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Apply turn-wide cost increase to the opponent
  const current = state.playCostIncrease ?? { player1: 0, player2: 0 };
  const newCostIncrease = {
    ...current,
    [opponent]: (current[opponent] ?? 0) + 1,
  };

  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT',
    'Shino Aburame (033): All characters played by the opponent cost 1 more this turn.',
    'game.log.effect.shino033CostIncrease',
    { card: 'SHINO ABURAME', id: 'KS-033-UC' },
  );

  return {
    state: {
      ...state,
      playCostIncrease: newCostIncrease,
      log,
    },
  };
}

function handleShino033Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (not current mission, no same-name conflict)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      if (c.instanceId === sourceCard.instanceId) return false;
      const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr === charName;
    });
    if (!hasSameName) {
      validTargets.push(String(i));
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shino Aburame (033): No valid mission to move to.',
          'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: 'KS-033-UC' }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO_MOVE_SELF',
    validTargets,
    description: 'Select a mission to move Shino Aburame to.',
    descriptionKey: 'game.effect.desc.shino033MoveSelf',
  };
}

export function registerShino033Handlers(): void {
  registerEffect('KS-033-UC', 'MAIN', handleShino033Main);
  registerEffect('KS-033-UC', 'UPGRADE', handleShino033Upgrade);
}
