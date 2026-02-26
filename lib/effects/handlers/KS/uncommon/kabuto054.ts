import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 054/130 - KABUTO YAKUSHI (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: POWERUP 1 (self).
 *   - Add 1 power token to this character when played as an upgrade.
 *
 * MAIN: Hide all non-hidden characters in this mission with less Power than this character.
 *   - Get effective power of self (printed power + power tokens; if hidden, 0).
 *   - Find ALL characters (friend + foe, excluding self) in this mission whose
 *     effective power is strictly less than self's effective power.
 *   - Hide them all (set isHidden = true).
 *   - Note: When isUpgrade, the UPGRADE POWERUP 1 is applied first, so self's power
 *     is already incremented before the MAIN effect evaluates.
 */

function handleKabuto054Upgrade(ctx: EffectContext): EffectResult {
  // UPGRADE: POWERUP 1 on self
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
      powerTokens: chars[charIndex].powerTokens + 1,
    };
    mission[side] = chars;
    missions[ctx.sourceMissionIndex] = mission;

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_POWERUP',
      'Kabuto Yakushi (054): POWERUP 1 (upgrade effect).',
      'game.log.effect.powerupSelf',
      { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', amount: 1 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

function handleKabuto054Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Get effective power of self
  const selfPower = getEffectivePower(state, sourceCard, sourcePlayer);

  if (selfPower <= 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (054): Self has 0 power, cannot hide characters with less.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' }) } };
  }

  // Find ALL characters (friend + foe, excluding self) in this mission with power < self power
  let hiddenCount = 0;
  const missions = [...state.activeMissions];
  const missionCopy = { ...missions[sourceMissionIndex] };

  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const sidePlayer = side === 'player1Characters' ? 'player1' : 'player2';
    const chars = [...missionCopy[side]];
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char.instanceId === sourceCard.instanceId) continue; // skip self
      if (char.isHidden) continue;
      const charPower = getEffectivePower(state, char, sidePlayer as import('@/lib/engine/types').PlayerID);
      if (charPower < selfPower) {
        chars[i] = { ...char, isHidden: true };
        hiddenCount++;
      }
    }
    missionCopy[side] = chars;
  }

  missions[sourceMissionIndex] = missionCopy;

  if (hiddenCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (054): No characters with less than ${selfPower} power in this mission.`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: 'KS-054-UC' }) } };
  }

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_HIDE',
    `Kabuto Yakushi (054): Hid ${hiddenCount} character(s) with less than ${selfPower} power in this mission.`,
    'game.log.effect.hide',
    { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', count: String(hiddenCount) },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerKabuto054Handlers(): void {
  registerEffect('KS-054-UC', 'UPGRADE', handleKabuto054Upgrade);
  registerEffect('KS-054-UC', 'MAIN', handleKabuto054Main);
}
