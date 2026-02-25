import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';
import { getEffectivePower } from '../../powerUtils';

/**
 * Card 116b/130 - KURENAI YUHI (R)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 8
 *
 * AMBUSH: Defeat an enemy character with Power 4 or less in this mission.
 *   Find non-hidden enemies in this mission with effective power <= 4. Target selection. Defeat.
 *
 * UPGRADE: Move this character to another mission.
 *   When isUpgrade: find valid missions (other than current). Target selection. Move self.
 */

function kurenai116bAmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 4
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 4)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kurenai Yuhi (116b) AMBUSH: No enemy with Power 4 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'KURENAI YUHI', id: 'KS-116b-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI116B_DEFEAT_TARGET',
    validTargets,
    description: 'Kurenai Yuhi (116b) AMBUSH: Choose an enemy character with Power 4 or less to defeat.',
    descriptionKey: 'game.effect.desc.kurenai116bDefeat',
  };
}

function kurenai116bUpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find other missions to move to (no same-name conflict at destination)
  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === charName;
    });
    if (!hasSameName) {
      validMissions.push(String(i));
    }
  }

  if (validMissions.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kurenai Yuhi (116b) UPGRADE: No other mission to move to.',
          'game.log.effect.noTarget',
          { card: 'KURENAI YUHI', id: 'KS-116b-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI116B_MOVE_SELF',
    validTargets: validMissions,
    description: 'Kurenai Yuhi (116b) UPGRADE: Choose a mission to move this character to.',
    descriptionKey: 'game.effect.desc.kurenai116bMoveSelf',
  };
}

export function registerKurenai116bHandlers(): void {
  registerEffect('KS-116b-R', 'AMBUSH', kurenai116bAmbushHandler);
  registerEffect('KS-116b-R', 'UPGRADE', kurenai116bUpgradeHandler);
}
