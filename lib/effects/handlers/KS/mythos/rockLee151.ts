import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';



function rockLee151MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Rock Lee (117 MV): Must move to another mission at end of round (continuous).',
      'game.log.effect.continuous',
      { card: 'ROCK LEE', id: 'KS-117-MV' },
    ),
  };

  
  if (ctx.isUpgrade) {
    const ps = { ...state[ctx.sourcePlayer] };
    const deck = [...ps.deck];

    if (deck.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Rock Lee (117 MV): Deck is empty, cannot reveal top card (upgrade fizzle).',
          'game.log.effect.noTarget',
          { card: 'ROCK LEE', id: 'KS-117-MV' },
        ),
      };
      return { state };
    }

    
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
        `Rock Lee (117 MV): Revealed and discarded ${topCard.name_fr} (cost ${topCard.chakra}) from top of deck (upgrade).`,
        'game.log.effect.revealDiscard',
        { card: 'ROCK LEE', id: 'KS-117-MV', target: topCard.name_fr, cost: topCard.chakra },
      ),
    };

    
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
          powerTokens: friendlyChars[selfIdx].powerTokens + amplifiedPowerup(state, friendlyChars[selfIdx].instanceId, powerupAmount),
        };
        mission[friendlySide] = friendlyChars;
        missions[ctx.sourceMissionIndex] = mission;

        state = {
          ...state,
          activeMissions: missions,
          log: logAction(
            state.log, state.turn, state.phase, ctx.sourcePlayer,
            'EFFECT_POWERUP',
            `Rock Lee (117 MV): POWERUP ${powerupAmount} (cost of discarded ${topCard.name_fr}).`,
            'game.log.effect.powerupSelf',
            { card: 'ROCK LEE', id: 'KS-117-MV', amount: powerupAmount },
          ),
        };
      }
    } else {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Rock Lee (117 MV): Discarded card had cost 0, no power tokens added (upgrade).`,
          'game.log.effect.powerupSelf',
          { card: 'ROCK LEE', id: 'KS-117-MV', amount: 0 },
        ),
      };
    }
  }

  return { state };
}

function rockLee151UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerRockLee151Handlers(): void {
  registerEffect('KS-117-MV', 'MAIN', rockLee151MainHandler);
  registerEffect('KS-117-MV', 'UPGRADE', rockLee151UpgradeHandler);
}
