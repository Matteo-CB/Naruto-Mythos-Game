import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 124b/130 - UKON (R)
 * Chakra: 4, Power: 3
 * Group: Sound Village, Keywords: Sound Four
 *
 * MAIN [continuous]: Can be played as upgrade over any Sound Village character.
 *   This is a continuous upgrade-eligibility expansion handled by the engine's
 *   upgrade validation logic. The handler here is a no-op.
 *
 * AMBUSH: Hide an enemy in this mission with Power 5 or less.
 *   Find non-hidden enemies in this mission with effective power <= 5. Target selection. Hide.
 */

function ukon124bMainHandler(ctx: EffectContext): EffectResult {
  // Continuous effect: can be played as upgrade over any Sound Village character.
  // Handled by the engine's upgrade validation logic.
  return { state: ctx.state };
}

function ukon124bAmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 5 that can be hidden
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => canBeHiddenByEnemy(state, c, opponentPlayer) && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Ukon (124b) AMBUSH: No enemy with Power 5 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'UKON', id: 'KS-124b-R' },
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
    targetSelectionType: 'UKON124B_HIDE_TARGET',
    validTargets,
    description: 'Ukon (124b) AMBUSH: Choose an enemy character with Power 5 or less to hide.',
    descriptionKey: 'game.effect.desc.ukon124bHide',
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
        `Ukon (124b) AMBUSH: Hid enemy ${targetName} in this mission.`,
        'game.log.effect.hide',
        { card: 'UKON', id: 'KS-124b-R', target: targetName },
      ),
    },
  };
}

export function registerUkon124bHandlers(): void {
  registerEffect('KS-124b-R', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-124b-R', 'AMBUSH', ukon124bAmbushHandler);
}
