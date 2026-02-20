import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 054/130 - KABUTO YAKUSHI (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: POWERUP 1 (self).
 *   - Add 1 power token to this character when played as an upgrade.
 *
 * MAIN: Hide all other characters in this mission with less Power than this character.
 *   - Get effective power of self (printed power + power tokens; if hidden, 0).
 *   - Find ALL other characters (friendly and enemy) in this mission whose effective
 *     power is strictly less than self's effective power.
 *   - Hide them all (set isHidden = true).
 *   - Note: When isUpgrade, the UPGRADE POWERUP 1 is applied first, so self's power
 *     is already incremented before the MAIN effect evaluates.
 */

function getEffectivePower(char: import('../../../engine/types').CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

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
      { card: 'KABUTO YAKUSHI', id: '054/130', amount: 1 },
    );

    return { state: { ...state, activeMissions: missions, log } };
  }

  return { state };
}

function handleKabuto054Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Get effective power of self
  const selfPower = getEffectivePower(sourceCard);

  if (selfPower <= 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kabuto Yakushi (054): Self has 0 power, cannot hide characters with less.',
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '054/130' }) } };
  }

  // Find all other characters in this mission with effective power < self power
  let hiddenCount = 0;
  const missions = [...state.activeMissions];
  const missionCopy = { ...missions[sourceMissionIndex] };

  // Process player1Characters
  const p1Chars = [...missionCopy.player1Characters];
  for (let i = 0; i < p1Chars.length; i++) {
    const char = p1Chars[i];
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue; // Already hidden; also their effective power is 0 which is < selfPower but they're already hidden
    const charPower = getEffectivePower(char);
    if (charPower < selfPower) {
      p1Chars[i] = { ...char, isHidden: true };
      hiddenCount++;
    }
  }
  missionCopy.player1Characters = p1Chars;

  // Process player2Characters
  const p2Chars = [...missionCopy.player2Characters];
  for (let i = 0; i < p2Chars.length; i++) {
    const char = p2Chars[i];
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue;
    const charPower = getEffectivePower(char);
    if (charPower < selfPower) {
      p2Chars[i] = { ...char, isHidden: true };
      hiddenCount++;
    }
  }
  missionCopy.player2Characters = p2Chars;

  missions[sourceMissionIndex] = missionCopy;

  if (hiddenCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kabuto Yakushi (054): No characters with less than ${selfPower} power in this mission.`,
      'game.log.effect.noTarget', { card: 'KABUTO YAKUSHI', id: '054/130' }) } };
  }

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_HIDE',
    `Kabuto Yakushi (054): Hid ${hiddenCount} character(s) with less than ${selfPower} power in this mission.`,
    'game.log.effect.hide',
    { card: 'KABUTO YAKUSHI', id: '054/130', count: String(hiddenCount) },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerKabuto054Handlers(): void {
  registerEffect('054/130', 'UPGRADE', handleKabuto054Upgrade);
  registerEffect('054/130', 'MAIN', handleKabuto054Main);
}
