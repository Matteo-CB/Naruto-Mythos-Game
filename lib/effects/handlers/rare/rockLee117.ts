import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
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
          { card: 'ROCK LEE', id: '117/130' },
        ),
      },
    };
  }

  // Reveal and discard the top card of own deck
  const newPlayerState = { ...playerState };
  const newDeck = [...newPlayerState.deck];
  const discardedCard = newDeck.shift()!;
  const discardedCost = discardedCard.chakra || 0;
  newPlayerState.deck = newDeck;
  newPlayerState.discardPile = [...newPlayerState.discardPile, discardedCard];

  let newState = {
    ...state,
    [sourcePlayer]: newPlayerState,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_DISCARD',
      `Rock Lee (117) UPGRADE: Revealed and discarded ${discardedCard.name_fr} (cost ${discardedCost}) from top of deck.`,
      'game.log.effect.discard',
      { card: 'ROCK LEE', id: '117/130', target: discardedCard.name_fr },
    ),
  };

  // POWERUP X where X = discarded card's chakra cost
  if (discardedCost > 0) {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const missions = [...newState.activeMissions];
    const mission = { ...missions[sourceMissionIndex] };
    const chars = [...mission[friendlySide]];
    const selfIdx = chars.findIndex((c) => c.instanceId === sourceCard.instanceId);

    if (selfIdx !== -1) {
      chars[selfIdx] = {
        ...chars[selfIdx],
        powerTokens: chars[selfIdx].powerTokens + discardedCost,
      };
      mission[friendlySide] = chars;
      missions[sourceMissionIndex] = mission;

      newState = {
        ...newState,
        activeMissions: missions,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_POWERUP',
          `Rock Lee (117) UPGRADE: POWERUP ${discardedCost} (cost of discarded ${discardedCard.name_fr}).`,
          'game.log.effect.powerupSelf',
          { card: 'ROCK LEE', id: '117/130', amount: discardedCost },
        ),
      };
    }
  } else {
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Rock Lee (117) UPGRADE: Discarded card had cost 0, no POWERUP.`,
        'game.log.effect.powerupSelf',
        { card: 'ROCK LEE', id: '117/130', amount: 0 },
      ),
    };
  }

  return { state: newState };
}

export function registerRockLee117Handlers(): void {
  registerEffect('117/130', 'MAIN', rockLee117MainHandler);
  registerEffect('117/130', 'UPGRADE', rockLee117UpgradeHandler);
}
