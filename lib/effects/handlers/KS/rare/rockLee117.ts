import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 117/130 - ROCK LEE (R)
 * Chakra: 4, Power: 5
 * Group: Leaf Village, Keywords: Team Guy
 *
 * MAIN [continuous]: At end of round, must move to another mission.
 *   This is a continuous end-of-round effect handled by the engine's EndPhase logic.
 *   The handler here is a no-op that registers the card.
 *
 * UPGRADE: Reveal and discard the top card of your deck. POWERUP X where X = the
 *   chakra cost of the discarded card.
 *   When isUpgrade: discard own deck[0], POWERUP its chakra cost on self.
 */

function rockLee117MainHandler(ctx: EffectContext): EffectResult {
  // Continuous end-of-round effect - handled by the engine's EndPhase.
  // Rock Lee must move to another mission at the end of each turn.
  return { state: ctx.state };
}

function rockLee117UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Rock Lee (117) UPGRADE: Deck is empty, cannot reveal and discard.',
          'game.log.effect.noTarget',
          { card: 'ROCK LEE', id: 'KS-117-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ROCKLEE117_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Rock Lee (117) UPGRADE: Reveal and discard the top card of your deck. POWERUP X where X = its chakra cost.',
    descriptionKey: 'game.effect.desc.rockLee117ConfirmUpgrade',
  };
}

export function registerRockLee117Handlers(): void {
  registerEffect('KS-117-R', 'MAIN', rockLee117MainHandler);
  registerEffect('KS-117-R', 'UPGRADE', rockLee117UpgradeHandler);
  registerEffect('KS-117-MV', 'MAIN', rockLee117MainHandler);
  registerEffect('KS-117-MV', 'UPGRADE', rockLee117UpgradeHandler);
}
