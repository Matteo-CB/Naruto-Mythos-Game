import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 143/130 - ITACHI UCHIWA "Traquant Naruto" (M)
 * Chakra: 5, Power: 5
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN: Move a friendly character to this mission.
 *   - Player chooses which friendly character from another mission to move here.
 *
 * AMBUSH: Move an enemy character to this mission.
 *   - Player chooses which enemy character from another mission to move here.
 *   - Only triggers when Itachi is revealed from hidden.
 */

function itachi143MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly characters in OTHER missions (not this one, not self)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.instanceId !== ctx.sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No friendly character in another mission to move here.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-143-M' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI143_CHOOSE_FRIENDLY',
    validTargets,
    description: 'Itachi Uchiwa (143): Choose a friendly character to move to this mission.',
    descriptionKey: 'game.effect.desc.itachi143MoveFriendly',
  };
}

function itachi143AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find all enemy characters in OTHER missions
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    for (const char of state.activeMissions[i][enemySide]) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No enemy character in another mission to move here (ambush).',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-143-M' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI143_CHOOSE_ENEMY',
    validTargets,
    description: 'Itachi Uchiwa (143): Choose an enemy character to move to this mission.',
    descriptionKey: 'game.effect.desc.itachi143MoveEnemy',
  };
}

export function registerItachi143Handlers(): void {
  registerEffect('KS-143-M', 'MAIN', itachi143MainHandler);
  registerEffect('KS-143-M', 'AMBUSH', itachi143AmbushHandler);
}
