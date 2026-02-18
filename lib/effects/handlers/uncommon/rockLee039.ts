import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 039/130 - ROCK LEE - "La Fleur du Lotus Recto" (UC)
 * Chakra: 4, Power: 4
 * Group: Leaf Village, Keywords: Team Guy
 *
 * MAIN [hourglass]: This character doesn't lose Power tokens at the end of the round.
 *   - This is a continuous/passive effect. The actual retention logic is handled
 *     in EndPhase.ts (removeAllPowerTokens checks for card number 39).
 *     The MAIN handler here is a no-op since the effect is passive.
 *
 * UPGRADE: POWERUP 2.
 *   - Add 2 power tokens to this character when played as an upgrade.
 */

function rockLeeMainHandler(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - doesn't lose Power tokens at end of round.
  // This is passively checked in EndPhase removeAllPowerTokens.
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Rock Lee: Power tokens will be retained at end of round (continuous).',
  );
  return { state: { ...state, log } };
}

function rockLeeUpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE: POWERUP 2 - add 2 power tokens to self
  const state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const side = ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (charIndex !== -1) {
    chars[charIndex] = {
      ...chars[charIndex],
      powerTokens: chars[charIndex].powerTokens + 2,
    };
    mission[side] = chars;
    missions[ctx.sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_POWERUP',
      'Rock Lee: POWERUP 2 (upgrade effect). Power tokens added: 2.',
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

export function registerRockLee039Handlers(): void {
  registerEffect('039/130', 'MAIN', rockLeeMainHandler);
  registerEffect('039/130', 'UPGRADE', rockLeeUpgradeHandler);
}
