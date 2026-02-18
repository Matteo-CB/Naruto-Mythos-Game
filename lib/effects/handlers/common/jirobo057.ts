import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 057/130 - JIROBO (Common)
 * Chakra: 2 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: POWERUP X. X is the number of missions where you have at least one friendly
 * Sound Four character.
 *
 * Counts missions containing at least one friendly non-hidden Sound Four character
 * (including this card's mission after it's played). Adds that many power tokens to self.
 */
function handleJirobo057Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Count missions with at least one friendly Sound Four character
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    const hasSoundFour = friendlyChars.some((char) => {
      if (char.isHidden) return false;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });

    if (hasSoundFour) {
      soundFourMissionCount++;
    }
  }

  if (soundFourMissionCount === 0) {
    return { state };
  }

  // POWERUP X on self
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m) => ({
    ...m,
    player1Characters: m.player1Characters.map((char) =>
      char.instanceId === sourceCard.instanceId
        ? { ...char, powerTokens: char.powerTokens + soundFourMissionCount }
        : char,
    ),
    player2Characters: m.player2Characters.map((char) =>
      char.instanceId === sourceCard.instanceId
        ? { ...char, powerTokens: char.powerTokens + soundFourMissionCount }
        : char,
    ),
  }));

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('057/130', 'MAIN', handleJirobo057Main);
}
