import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 146/130 - SASUKE UCHIWA (M)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Give the Edge token to opponent. If you do, POWERUP 3 (self).
 *   - Transfer the Edge token to the opponent (mandatory "give" action).
 *   - Then apply POWERUP 3 on this character.
 *   - The "if you do" condition is always satisfied because giving the Edge token
 *     is the action itself (even if you don't currently hold it, you "give" it
 *     to the opponent, which means setting them as the holder).
 */

function sasuke146MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Give Edge token to opponent
  state = { ...state, edgeHolder: opponentId };

  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_EDGE',
      `Sasuke Uchiwa (146): Gave the Edge token to opponent.`,
      'game.log.effect.giveEdge',
      { card: 'SASUKE UCHIWA', id: '146/130' },
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
        { card: 'SASUKE UCHIWA', id: '146/130', amount: 3 },
      ),
    };
  }

  return { state };
}

export function registerHandler(): void {
  registerEffect('146/130', 'MAIN', sasuke146MainHandler);
}
