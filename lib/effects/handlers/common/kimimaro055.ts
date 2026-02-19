import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 055/130 - KIMIMARO (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Weapon
 * AMBUSH: Discard a card to hide a character in play with cost 3 or less.
 *
 * Auto-resolves:
 *   1. Discards the last card from hand.
 *   2. Hides the first valid non-hidden character with cost <= 3.
 *      Prefers enemy characters over friendly ones.
 * Optional effect — fizzles if no cards in hand or no valid target.
 */
function handleKimimaro055Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Must have at least 1 card in hand to discard
  if (playerState.hand.length === 0) {
    return { state };
  }

  // Find all non-hidden characters in play with cost <= 3
  // Prefer enemy characters over friendly ones
  let target: CharacterInPlay | undefined;
  let targetMissionIndex = -1;
  let targetSide: 'player1Characters' | 'player2Characters' | undefined;

  // First pass: look for enemy characters
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponent === 'player1' ? 'player1Characters' : 'player2Characters';

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 3) {
        target = char;
        targetMissionIndex = i;
        targetSide = enemySide;
        break;
      }
    }
    if (target) break;
  }

  // Second pass: if no enemy found, look for friendly characters
  if (!target) {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      for (const char of mission[friendlySide]) {
        if (char.isHidden) continue;
        // Don't hide Kimimaro himself
        if (char.instanceId === ctx.sourceCard.instanceId) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((topCard.chakra ?? 0) <= 3) {
          target = char;
          targetMissionIndex = i;
          targetSide = friendlySide;
          break;
        }
      }
      if (target) break;
    }
  }

  // No valid target to hide — effect fizzles (don't discard)
  if (!target || targetMissionIndex === -1 || !targetSide) {
    return { state };
  }

  // Step 1: Discard the last card from hand
  const newHand = [...playerState.hand];
  const discardedCard = newHand.pop()!;
  const newDiscard = [...playerState.discardPile, discardedCard];

  const newPlayerState = {
    ...playerState,
    hand: newHand,
    discardPile: newDiscard,
  };

  // Step 2: Hide the target character
  const newMissions = state.activeMissions.map((m, idx) => {
    if (idx !== targetMissionIndex) return m;
    return {
      ...m,
      [targetSide!]: m[targetSide!].map((c) => {
        if (c.instanceId !== target!.instanceId) return c;
        return { ...c, isHidden: true };
      }),
    };
  });

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_HIDE',
    `Kimimaro (055): Discarded ${discardedCard.name_fr} and hid ${target.card.name_fr} in mission ${targetMissionIndex}.`,
  );

  return {
    state: {
      ...state,
      [sourcePlayer]: newPlayerState,
      activeMissions: newMissions,
      log,
    },
  };
}

export function registerHandler(): void {
  registerEffect('055/130', 'AMBUSH', handleKimimaro055Ambush);
}
