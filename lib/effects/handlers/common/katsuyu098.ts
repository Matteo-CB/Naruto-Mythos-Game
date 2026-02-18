import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 098/130 - KATSUYU (Common)
 * Chakra: 3 | Power: 5
 * Group: Independent | Keywords: Summon
 * MAIN (1): If there is a friendly Tsunade in play, POWERUP 2.
 * MAIN (2) [continuous]: At the end of the round, you must return this character to your hand.
 *
 * The first MAIN triggers on play: check if the player controls a non-hidden Tsunade
 * anywhere in play. If so, add 2 power tokens to this character (self).
 * The second MAIN is continuous and handled in EndPhase.ts.
 */
function handleKatsuyu098Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Check for a friendly Tsunade anywhere in play (across all missions)
  let hasTsunade = false;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceCard.instanceId) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr === 'TSUNADE') {
        hasTsunade = true;
        break;
      }
    }
    if (hasTsunade) break;
  }

  if (!hasTsunade) {
    return { state };
  }

  // POWERUP 2 on self
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m) => ({
    ...m,
    player1Characters: m.player1Characters.map((char) =>
      char.instanceId === sourceCard.instanceId
        ? { ...char, powerTokens: char.powerTokens + 2 }
        : char,
    ),
    player2Characters: m.player2Characters.map((char) =>
      char.instanceId === sourceCard.instanceId
        ? { ...char, powerTokens: char.powerTokens + 2 }
        : char,
    ),
  }));

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('098/130', 'MAIN', handleKatsuyu098Main);
}
