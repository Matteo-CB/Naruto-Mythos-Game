import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 146/130 - SASUKE UCHIWA (M)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Give the Edge token to opponent. If you do, POWERUP 3 (self).
 *   - The player must currently HOLD the Edge token to "give" it.
 *   - If the player does not hold the Edge, the effect fizzles entirely.
 *   - If the player holds the Edge: transfer it to opponent, then POWERUP 3 on self.
 */

function sasuke146MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  // "Give the Edge to the opponent. If you do so, POWERUP 3."
  // You can only give the Edge if you hold it.
  if (state.edgeHolder !== ctx.sourcePlayer) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (146): Does not hold the Edge token — cannot give it. Effect fizzles.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
        ),
      },
    };
  }

  // Give Edge token to opponent
  state = { ...state, edgeHolder: opponentId };

  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_EDGE',
      `Sasuke Uchiwa (146): Gave the Edge token to opponent.`,
      'game.log.effect.giveEdge',
      { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
    ),
  };

  // POWERUP 3 on self
  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };
  const friendlyChars = [...mission[friendlySide]];
  const selfIdx = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (selfIdx !== -1) {
    friendlyChars[selfIdx] = {
      ...friendlyChars[selfIdx],
      powerTokens: friendlyChars[selfIdx].powerTokens + 3,
    };
    mission[friendlySide] = friendlyChars;
    missions[ctx.sourceMissionIndex] = mission;

    state = {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_POWERUP',
        `Sasuke Uchiwa (146): POWERUP 3 on self.`,
        'game.log.effect.powerupSelf',
        { card: 'SASUKE UCHIWA', id: 'KS-146-M', amount: 3 },
      ),
    };
  }

  return { state };
}

export function registerHandler(): void {
  registerEffect('KS-146-M', 'MAIN', sasuke146MainHandler);
}
