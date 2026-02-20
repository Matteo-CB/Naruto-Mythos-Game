import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 131/130 - TSUNADE (S)
 * Chakra: 6, Power: 5
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: POWERUP 1 every friendly Leaf Village character in play.
 *   - Iterates all missions, finds all friendly Leaf Village characters (not self).
 *   - Adds 1 power token to each.
 *   - If no valid targets, logs and fizzles gracefully.
 */

function tsunade131MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const missions = [...state.activeMissions];
  let poweredUpCount = 0;

  for (let i = 0; i < missions.length; i++) {
    const mission = { ...missions[i] };
    const friendlyChars = [...mission[friendlySide]];
    let changed = false;

    for (let j = 0; j < friendlyChars.length; j++) {
      const char = friendlyChars[j];
      // Skip self
      if (char.instanceId === ctx.sourceCard.instanceId) continue;

      // Check if this character is Leaf Village
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Leaf Village') {
        friendlyChars[j] = {
          ...char,
          powerTokens: char.powerTokens + 1,
        };
        poweredUpCount++;
        changed = true;
      }
    }

    if (changed) {
      mission[friendlySide] = friendlyChars;
      missions[i] = mission;
    }
  }

  if (poweredUpCount === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Tsunade (131): No friendly Leaf Village characters in play to power up.',
      'game.log.effect.noTarget',
      { card: 'TSUNADE', id: '131/130' },
    );
    return { state: { ...state, log } };
  }

  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_POWERUP',
    `Tsunade (131): POWERUP 1 on ${poweredUpCount} friendly Leaf Village character(s).`,
    'game.log.effect.powerupMultiple',
    { card: 'TSUNADE', id: '131/130', amount: 1, count: poweredUpCount },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerTsunade131Handlers(): void {
  registerEffect('131/130', 'MAIN', tsunade131MainHandler);
}
