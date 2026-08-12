import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterCard, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { seededShuffle } from '@/lib/engine/utils/shuffle';
import { formatCardLabelShort } from '@/lib/variants/cardLabel';
import { emitEngineQuestEvent } from '@/lib/quests/engineEmit';
import { enemyOf } from './sandMove';

export const KIN_044_ID = 'SS-044-UC';
export const KIN_044_NAME = 'KIN TSUCHI';

export function kin044DiscardSeed(state: GameState, opponent: PlayerID, source: PlayerID): number {
  const opp = state[opponent];
  const own = state[source];
  const raw =
    state.turn * 1000003 +
    opp.hand.length * 10007 +
    opp.deck.length * 1009 +
    opp.discardPile.length * 101 +
    own.hand.length * 31 +
    own.deck.length * 7 +
    own.discardPile.length;
  return raw >>> 0;
}

export function kin044PickHandIndex(state: GameState, opponent: PlayerID, source: PlayerID): number {
  const size = state[opponent].hand.length;
  if (size <= 1) return 0;
  const order = seededShuffle(
    Array.from({ length: size }, (_, i) => i),
    kin044DiscardSeed(state, opponent, source),
  );
  const picked = order[0];
  if (!Number.isInteger(picked) || picked < 0 || picked >= size) return 0;
  return picked;
}

function kin044Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent = enemyOf(sourcePlayer);
  const hand = state[opponent].hand;

  if (hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Kin Tsuchi (SS-044) UPGRADE: the opponent hand is empty, no card is discarded.',
          'game.log.effect.ss044EmptyHand', { card: KIN_044_NAME, id: KIN_044_ID }),
      },
    };
  }

  const index = kin044PickHandIndex(state, opponent, sourcePlayer);
  const discarded: CharacterCard = hand[index];
  const label = formatCardLabelShort(discarded, 'fr');

  const opponentState = {
    ...state[opponent],
    hand: hand.filter((_, i) => i !== index),
    discardPile: [...state[opponent].discardPile, discarded],
  };

  const newState: GameState = {
    ...state,
    [opponent]: opponentState,
    log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DISCARD_FROM_HAND',
      `Kin Tsuchi (SS-044) UPGRADE: the opponent discarded ${label} at random.`,
      'game.log.effect.ss044Discard',
      { card: KIN_044_NAME, id: KIN_044_ID, target: label, targetId: discarded.id }),
  };

  emitEngineQuestEvent(newState, opponent, 'card.discarded', { cardName: discarded.name_fr });

  return { state: newState };
}

export function registerKin044Handlers(): void {
  registerEffect(KIN_044_ID, 'UPGRADE', kin044Upgrade);
}
