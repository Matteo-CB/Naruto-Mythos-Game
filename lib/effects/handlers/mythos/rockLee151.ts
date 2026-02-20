import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 151/130 - ROCK LEE (M)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team Gai
 *
 * MAIN [continuous]: At end of round, must move to another mission.
 *   - Continuous no-op. The forced move is handled by the engine's EndPhase
 *     or MissionPhase post-scoring logic.
 *
 * UPGRADE: Reveal and discard the top card of your deck.
 *          POWERUP X where X = the chakra cost of the discarded card.
 *   - When isUpgrade: check if deck has cards. If yes, take deck[0],
 *     add it to discard pile (it's revealed publicly), then POWERUP its
 *     chakra cost on self.
 *   - If deck is empty, fizzles.
 */

function rockLee151MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Log the continuous effect
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Rock Lee (151): Must move to another mission at end of round (continuous).',
      'game.log.effect.continuous',
      { card: 'ROCK LEE', id: '151/130' },
    ),
  };

  // UPGRADE: Reveal top card, discard, POWERUP X
  if (ctx.isUpgrade) {
    const ps = { ...state[ctx.sourcePlayer] };
    const deck = [...ps.deck];

    if (deck.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Rock Lee (151): Deck is empty, cannot reveal top card (upgrade fizzle).',
          'game.log.effect.noTarget',
          { card: 'ROCK LEE', id: '151/130' },
        ),
      };
      return { state };
    }

    // Reveal and discard top card
    const topCard = deck.shift()!;
    ps.deck = deck;
    ps.discardPile = [...ps.discardPile, topCard];
    state = { ...state, [ctx.sourcePlayer]: ps };

    const powerupAmount = topCard.chakra || 0;

    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_DISCARD',
        `Rock Lee (151): Revealed and discarded ${topCard.name_fr} (cost ${topCard.chakra}) from top of deck (upgrade).`,
        'game.log.effect.revealDiscard',
        { card: 'ROCK LEE', id: '151/130', target: topCard.name_fr, cost: topCard.chakra },
      ),
    };

    // POWERUP X on self
    if (powerupAmount > 0) {
      const friendlySide: 'player1Characters' | 'player2Characters' =
        ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

      const missions = [...state.activeMissions];
      const mission = { ...missions[ctx.sourceMissionIndex] };
      const friendlyChars = [...mission[friendlySide]];
      const selfIdx = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

      if (selfIdx !== -1) {
        friendlyChars[selfIdx] = {
          ...friendlyChars[selfIdx],
          powerTokens: friendlyChars[selfIdx].powerTokens + powerupAmount,
        };
        mission[friendlySide] = friendlyChars;
        missions[ctx.sourceMissionIndex] = mission;

        state = {
          ...state,
          activeMissions: missions,
          log: logAction(
            state.log, state.turn, state.phase, ctx.sourcePlayer,
            'EFFECT_POWERUP',
            `Rock Lee (151): POWERUP ${powerupAmount} (cost of discarded ${topCard.name_fr}).`,
            'game.log.effect.powerupSelf',
            { card: 'ROCK LEE', id: '151/130', amount: powerupAmount },
          ),
        };
      }
    } else {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Rock Lee (151): Discarded card had cost 0, no power tokens added (upgrade).`,
          'game.log.effect.powerupSelf',
          { card: 'ROCK LEE', id: '151/130', amount: 0 },
        ),
      };
    }
  }

  return { state };
}

function rockLee151UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerRockLee151Handlers(): void {
  registerEffect('151/130', 'MAIN', rockLee151MainHandler);
  registerEffect('151/130', 'UPGRADE', rockLee151UpgradeHandler);
}
