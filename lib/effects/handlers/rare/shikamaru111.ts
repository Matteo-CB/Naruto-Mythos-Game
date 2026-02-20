import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 111/130 - SHIKAMARU NARA (R)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 10
 *
 * MAIN [continuous]: Opponent cannot play characters hidden in this mission.
 *   This is a continuous play restriction effect. The handler is a no-op;
 *   the engine handles the play restriction in the action validation layer.
 *
 * UPGRADE: Hide an enemy character with Power 3 or less in this mission.
 *   When isUpgrade: find non-hidden enemies in this mission with effective power <= 3.
 *   Target selection if multiple valid targets. Hide the selected target.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function shikamaru111MainHandler(ctx: EffectContext): EffectResult {
  // Continuous play restriction - handled by the engine's action validation.
  // No-op handler to register the card.
  return { state: ctx.state };
}

function shikamaru111UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 3
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(c) <= 3)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shikamaru Nara (111) UPGRADE: No enemy character with Power 3 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'SHIKAMARU NARA', id: '111/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    return applyHide(state, validTargets[0], sourcePlayer, enemySide, sourceMissionIndex);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU111_HIDE_ENEMY',
    validTargets,
    description: 'Shikamaru Nara (111) UPGRADE: Choose an enemy character with Power 3 or less to hide.',
  };
}

function applyHide(
  state: EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: EffectContext['sourcePlayer'],
  enemySide: 'player1Characters' | 'player2Characters',
  missionIndex: number,
): EffectResult {
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = [...mission[enemySide]];
  const idx = chars.findIndex((c) => c.instanceId === targetInstanceId);

  if (idx === -1) return { state };

  const targetName = chars[idx].card.name_fr;
  chars[idx] = { ...chars[idx], isHidden: true };
  mission[enemySide] = chars;
  missions[missionIndex] = mission;

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_HIDE',
        `Shikamaru Nara (111) UPGRADE: Hid enemy ${targetName} in this mission.`,
        'game.log.effect.hide',
        { card: 'SHIKAMARU NARA', id: '111/130', target: targetName },
      ),
    },
  };
}

export function registerShikamaru111Handlers(): void {
  registerEffect('111/130', 'MAIN', shikamaru111MainHandler);
  registerEffect('111/130', 'UPGRADE', shikamaru111UpgradeHandler);
}
