import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const KABUTO_030_ID = 'SS-030-C';
export const KABUTO_030_NAME = 'KABUTO YAKUSHI';

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: KABUTO_030_NAME, id: KABUTO_030_ID }),
    },
  };
}

function kabuto030FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  if (state[sourcePlayer].deck.length === 0) {
    return refuse(state, sourcePlayer, 'Kabuto Yakushi (030) FIRST STRIKE: the deck is empty.');
  }
  if (state.activeMissions.length === 0) {
    return refuse(state, sourcePlayer, 'Kabuto Yakushi (030) FIRST STRIKE: no mission in play.');
  }

  const destinations = state.activeMissions.map((_, i) => String(i));
  const carte = state[sourcePlayer].deck[0];

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS030_PLACE_HIDDEN',
    validTargets: destinations,
    isOptional: true,
    description: JSON.stringify({
      revealedCardId: carte.id,
      cardName_fr: carte.name_fr,
      cardName_en: carte.name_en ?? carte.name_fr,
      cardCost: carte.chakra ?? 0,
      cardPower: carte.power ?? 0,
      cardImageFile: carte.image_file,
    }),
    descriptionKey: 'game.effect.desc.ss030PlaceHidden',
  }, ctx.sourceCard.instanceId, 'SS030_CONFIRM_FIRST_STRIKE');
}

export function registerKabuto030Handlers(): void {
  registerEffect(KABUTO_030_ID, 'FIRST_STRIKE', kabuto030FirstStrike);
}
