import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 104/130 - TSUNADE (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Spend extra Chakra to POWERUP X where X = extra amount spent.
 *   The player can voluntarily spend additional chakra beyond the card's cost.
 *   For auto-resolve: spend all remaining chakra as POWERUP on self.
 *
 * UPGRADE: POWERUP X (same logic — spend remaining chakra as POWERUP on self).
 */

function tsunade104MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const playerState = state[sourcePlayer];

  // Auto-resolve: spend all remaining chakra as POWERUP on self
  const extraChakra = playerState.chakra;

  if (extraChakra <= 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Tsunade (104): No extra chakra to spend for POWERUP.',
          'game.log.effect.noTarget',
          { card: 'TSUNADE', id: '104/130' },
        ),
      },
    };
  }

  // Deduct the extra chakra from the player's pool
  const newPlayerState = { ...playerState, chakra: 0 };

  // POWERUP X on self
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = [...mission[friendlySide]];
  const selfIndex = friendlyChars.findIndex((c) => c.instanceId === sourceCard.instanceId);

  if (selfIndex !== -1) {
    friendlyChars[selfIndex] = {
      ...friendlyChars[selfIndex],
      powerTokens: friendlyChars[selfIndex].powerTokens + extraChakra,
    };
    mission[friendlySide] = friendlyChars;
    missions[sourceMissionIndex] = mission;
  }

  return {
    state: {
      ...state,
      [sourcePlayer]: newPlayerState,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Tsunade (104): Spent ${extraChakra} extra chakra for POWERUP ${extraChakra}.`,
        'game.log.effect.powerupSelf',
        { card: 'TSUNADE', id: '104/130', amount: extraChakra },
      ),
    },
  };
}

function tsunade104UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler (same behavior when isUpgrade is true).
  return { state: ctx.state };
}

export function registerTsunade104Handlers(): void {
  registerEffect('104/130', 'MAIN', tsunade104MainHandler);
  registerEffect('104/130', 'UPGRADE', tsunade104UpgradeHandler);
}
