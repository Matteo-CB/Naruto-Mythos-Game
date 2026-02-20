import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 058/130 - JIROBO (UC)
 * Chakra: 4 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * MAIN: POWERUP 1 to all other friendly characters with keyword "Sound Four" in this mission.
 *   - Find all friendly non-hidden characters in this mission (not self) that have
 *     the "Sound Four" keyword. Add 1 power token to each.
 *
 * UPGRADE: Apply the MAIN effect to Sound Four characters in ALL missions (not just this one).
 *   - When triggered as upgrade, the scope expands from "this mission" to "all missions".
 *   - Still excludes self.
 */

function handleJirobo058Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const missions = [...state.activeMissions];
  let poweredUpCount = 0;
  const poweredUpNames: string[] = [];

  // Determine which missions to scan
  const missionIndices: number[] = isUpgrade
    ? state.activeMissions.map((_, i) => i) // All missions
    : [sourceMissionIndex]; // Only this mission

  for (const mIdx of missionIndices) {
    const mission = { ...missions[mIdx] };
    const chars = [...mission[friendlySide]];
    let changed = false;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
        chars[i] = { ...char, powerTokens: char.powerTokens + 1 };
        poweredUpCount++;
        poweredUpNames.push(topCard.name_fr);
        changed = true;
      }
    }

    if (changed) {
      mission[friendlySide] = chars;
      missions[mIdx] = mission;
    }
  }

  if (poweredUpCount === 0) {
    const scope = isUpgrade ? 'in play' : 'in this mission';
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Jirobo (058): No other friendly Sound Four characters ${scope}.`,
      'game.log.effect.noTarget', { card: 'JIROBO', id: '058/130' }) } };
  }

  const scope = isUpgrade ? 'across all missions (upgrade)' : 'in this mission';
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_POWERUP',
    `Jirobo (058): POWERUP 1 on ${poweredUpCount} Sound Four character(s) ${scope}: ${poweredUpNames.join(', ')}.`,
    'game.log.effect.powerup',
    { card: 'JIROBO', id: '058/130', amount: String(poweredUpCount), target: poweredUpNames.join(', ') },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerJirobo058Handlers(): void {
  registerEffect('058/130', 'MAIN', handleJirobo058Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to expand scope to all missions
}
