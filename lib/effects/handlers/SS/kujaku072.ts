import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const KUJAKU_072 = 'SS-072-C';
export const KUJAKU_072_NOM = 'KUJAKU';

export function dernierEquipementDefausse(state: GameState, player: PlayerID): number {
  const defausse = state[player].discardPile as unknown as CardData[];
  for (let i = defausse.length - 1; i >= 0; i--) {
    if (defausse[i]?.card_type === 'attachment') return i;
  }
  return -1;
}

function kujaku072(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const index = dernierEquipementDefausse(state, sourcePlayer);
  if (index === -1) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Kujaku (072): no attachment in the discard pile.',
          'game.log.effect.noTarget', { card: KUJAKU_072_NOM, id: KUJAKU_072 }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS072_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss072ConfirmMain',
  };
}

export function recupererEquipementDefausse(state: GameState, player: PlayerID): GameState {
  const index = dernierEquipementDefausse(state, player);
  if (index === -1) return state;
  const defausse = [...state[player].discardPile];
  const [recuperee] = defausse.splice(index, 1);
  return {
    ...state,
    [player]: {
      ...state[player],
      discardPile: defausse,
      hand: [...state[player].hand, recuperee],
    },
    log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_DRAW',
      `Kujaku (072): ${recuperee.name_fr} returns from the discard pile to hand.`,
      'game.log.effect.ss072Recovered',
      { card: KUJAKU_072_NOM, id: KUJAKU_072, target: recuperee.name_fr, target_en: recuperee.name_en || recuperee.name_fr }),
  };
}

export function registerKujaku072Handler(): void {
  registerEffect(KUJAKU_072, 'MAIN', kujaku072);
}
