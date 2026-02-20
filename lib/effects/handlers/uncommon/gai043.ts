import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 043/130 - GAI MAITO (UC)
 * Chakra: 5 | Power: 5
 * Group: Leaf Village | Keywords: Team Guy
 *
 * MAIN [continuous]: This character doesn't lose Power tokens at end of round.
 *   - This is a continuous/passive effect. The actual retention logic is handled
 *     in EndPhase.ts (removeAllPowerTokens checks for card number 43).
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: POWERUP 3 (self).
 *   - Add 3 power tokens to this character when played as an upgrade.
 */

function handleGai043Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - doesn't lose Power tokens at end of round.
  // This is passively checked in EndPhase removeAllPowerTokens.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Gai Maito (043): Power tokens will be retained at end of round (continuous).',
    'game.log.effect.continuous',
    { card: 'GAI MAITO', id: '043/130' },
  );
  return { state: { ...ctx.state, log } };
}

function handleGai043Upgrade(ctx: EffectContext): EffectResult {
  // UPGRADE: POWERUP 3 - add 3 power tokens to self
  const state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const side: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (charIndex !== -1) {
    chars[charIndex] = {
      ...chars[charIndex],
      powerTokens: chars[charIndex].powerTokens + 3,
    };
    mission[side] = chars;
    missions[ctx.sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_POWERUP',
      'Gai Maito (043): POWERUP 3 (upgrade effect). Power tokens added: 3.',
      'game.log.effect.powerupSelf',
      { card: 'GAI MAITO', id: '043/130', amount: 3 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

export function registerGai043Handlers(): void {
  registerEffect('043/130', 'MAIN', handleGai043Main);
  registerEffect('043/130', 'UPGRADE', handleGai043Upgrade);
}
