import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 067/130 - REMPART (UC)
 * Chakra: 3 | Power: 0
 * Group: Sound Village | Keywords: Summon
 *
 * MAIN [hourglass]: The strongest (highest effective power) non-hidden enemy character
 *   in this mission loses all Power tokens and has effective Power = 0.
 *   - This is a continuous effect handled by the engine during scoring
 *     (PowerCalculation.ts / MissionPhase.ts). The strongest enemy's power
 *     is treated as 0 while Rempart is face-visible in the same mission.
 *   - The handler registers as a no-op since the continuous logic lives in the engine.
 *
 * MAIN [hourglass]: At end of round, must return this character to hand.
 *   - Also a continuous effect handled by EndPhase.ts.
 */

function handleRempart067Main(ctx: EffectContext): EffectResult {
  // Both MAIN effects are continuous [hourglass]:
  // 1. Strongest enemy power = 0 in this mission (engine handles during scoring)
  // 2. Return to hand at end of round (EndPhase handles)
  //
  // Per FAQ: Rashomon LOCKS to the strongest enemy when it enters play.
  // Target only changes if: Rashomon moves, locked target moves, or locked target leaves play.
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_CONTINUOUS', 'Rempart (067): Continuous effects active. Must return to hand at end of round.',
      'game.log.effect.continuous', { card: 'REMPART', id: 'KS-067-UC' });
    return { state: { ...state, log } };
  }

  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Find strongest non-hidden enemy to lock onto
  let maxPower = -1;
  let strongestId = '';
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const top = enemy.stack?.length > 0 ? enemy.stack[enemy.stack?.length - 1] : enemy.card;
    const power = (top.power ?? 0) + enemy.powerTokens;
    if (power > maxPower) {
      maxPower = power;
      strongestId = enemy.instanceId;
    }
  }

  // Lock the target on the Rashomon character
  let newState = { ...state };
  if (strongestId) {
    const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const missions = [...newState.activeMissions];
    const m = { ...missions[sourceMissionIndex] };
    m[friendlySide] = m[friendlySide].map((c) =>
      c.instanceId === sourceCard.instanceId
        ? { ...c, rempartLockedTargetId: strongestId }
        : c
    );
    missions[sourceMissionIndex] = m;
    newState = { ...newState, activeMissions: missions };
  }

  const targetName = strongestId
    ? enemyChars.find(c => c.instanceId === strongestId)?.card.name_fr ?? '???'
    : '(none)';
  const log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_CONTINUOUS',
    `Rempart (067): Locked onto ${targetName} (Power ${maxPower}). Must return to hand at end of round.`,
    'game.log.effect.continuous', { card: 'REMPART', id: 'KS-067-UC' });
  return { state: { ...newState, log } };
}

export function registerHandler(): void {
  registerEffect('KS-067-UC', 'MAIN', handleRempart067Main);
}
