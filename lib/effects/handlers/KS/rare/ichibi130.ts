import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter, sortTargetsGemmaLast } from '@/lib/effects/defeatUtils';
import type { CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 130/130 - ICHIBI (R)
 * Chakra: 6, Power: 8
 * Group: Independent, Keywords: Summon
 *
 * MAIN [continuous]: Can't be hidden or defeated by enemy effects.
 *   This is a continuous protection effect handled by the engine's
 *   defeat replacement and hide prevention logic. The handler here is a no-op.
 *
 * UPGRADE: Choose a mission and defeat all hidden enemy characters there.
 *   When isUpgrade: require target selection for which mission.
 *   Then defeat all hidden enemies in the chosen mission.
 */

function ichibi130MainHandler(ctx: EffectContext): EffectResult {
  // Continuous protection: can't be hidden or defeated by enemy effects.
  // Handled by the engine's protection layer.
  return { state: ctx.state };
}

function ichibi130UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find missions that have hidden enemy characters
  const missionsWithHiddenEnemies: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const hasHiddenEnemy = mission[enemySide].some((c: CharacterInPlay) => c.isHidden);
    if (hasHiddenEnemy) {
      missionsWithHiddenEnemies.push(String(i));
    }
  }

  if (missionsWithHiddenEnemies.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Ichibi (130) UPGRADE: No hidden enemy characters in any mission.',
          'game.log.effect.noTarget',
          { card: 'ICHIBI', id: 'KS-130-R' },
        ),
      },
    };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ICHIBI130_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: 'Ichibi (130) UPGRADE: Choose a mission and defeat all hidden enemies there.',
    descriptionKey: 'game.effect.desc.ichibi130ConfirmUpgrade',
    isOptional: true,
  };
}

function defeatAllHiddenEnemies(
  state: EffectContext['state'],
  missionIndex: number,
  sourcePlayer: EffectContext['sourcePlayer'],
  enemySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  const mission = state.activeMissions[missionIndex];
  const hiddenEnemies = mission[enemySide].filter((c: CharacterInPlay) => c.isHidden);

  if (hiddenEnemies.length === 0) {
    return { state };
  }

  // Sort targets so Gemma 049 is processed last (AoE ordering fix)
  const sortedTargets = sortTargetsGemmaLast(hiddenEnemies);

  let newState = state;
  let defeatedCount = 0;

  for (const hidden of sortedTargets) {
    newState = defeatEnemyCharacter(newState, missionIndex, hidden.instanceId, sourcePlayer);
    defeatedCount++;
  }

  newState = {
    ...newState,
    log: logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_DEFEAT',
      `Ichibi (130) UPGRADE: Defeated ${defeatedCount} hidden enemy character(s) in mission ${missionIndex}.`,
      'game.log.effect.defeat',
      { card: 'ICHIBI', id: 'KS-130-R', target: `${defeatedCount} hidden enemies` },
    ),
  };

  return { state: newState };
}

export function registerIchibi130Handlers(): void {
  registerEffect('KS-130-R', 'MAIN', ichibi130MainHandler);
  registerEffect('KS-130-R', 'UPGRADE', ichibi130UpgradeHandler);
}
