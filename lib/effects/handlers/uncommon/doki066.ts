import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 066/130 - DOKI (UC)
 * Chakra: 2 | Power: 3
 * Group: Sound Village | Keywords: Summon
 *
 * MAIN: If a friendly character with keyword "Sound Four" is in this mission,
 *   steal 1 Chakra from opponent (opponent loses 1, you gain 1).
 *
 * MAIN [hourglass]: At end of round, return this character to hand.
 *   - Continuous effect handled by the engine in EndPhase.
 *   - The handler registers a no-op for the continuous portion.
 *
 * The steal effect only fires once on play. The return-to-hand is passive.
 */

function handleDoki066Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Check if any friendly character in this mission has keyword "Sound Four"
  const hasSoundFour = friendlyChars.some((char) => {
    if (char.instanceId === ctx.sourceCard.instanceId) return false; // Don't count self
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Sound Four');
  });

  if (!hasSoundFour) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Doki (066): No friendly Sound Four character in this mission. Cannot steal chakra.',
      'game.log.effect.noTarget',
      { card: 'DOKI', id: '066/130' },
    );
    return { state: { ...state, log } };
  }

  // Steal 1 chakra from opponent
  const newState = { ...state };
  const playerState = { ...newState[sourcePlayer] };
  const opponentState = { ...newState[opponentPlayer] };

  const stealAmount = Math.min(1, opponentState.chakra); // Can't steal more than opponent has
  opponentState.chakra = opponentState.chakra - stealAmount;
  playerState.chakra = playerState.chakra + stealAmount;

  newState[sourcePlayer] = playerState;
  newState[opponentPlayer] = opponentState;

  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_STEAL_CHAKRA',
    `Doki (066): Sound Four ally present - stole ${stealAmount} Chakra from opponent.`,
    'game.log.effect.stealChakra',
    { card: 'DOKI', id: '066/130', amount: String(stealAmount) },
  );

  return { state: { ...newState, log } };
}

export function registerDoki066Handlers(): void {
  registerEffect('066/130', 'MAIN', handleDoki066Main);
  // The continuous [hourglass] return-to-hand effect is handled by EndPhase.ts
}
