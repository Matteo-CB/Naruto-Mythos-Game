import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const TSUNADE_002_ID = 'SS-002-UC';
export const TSUNADE_002_NAME = 'TSUNADE';
export const DECLARE_NUMBER_MIN = 0;
export const DECLARE_NUMBER_MAX = 999;

export function clampDeclaredNumber(raw: string): number {
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DECLARE_NUMBER_MIN;
  return Math.min(DECLARE_NUMBER_MAX, Math.max(DECLARE_NUMBER_MIN, parsed));
}

export function declarationBeats(topCard: CardData | undefined, declared: number): boolean {
  if (!topCard) return false;
  return (topCard.chakra ?? 0) >= declared;
}

function tsunade002Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  if (state[sourcePlayer].deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Tsunade (SS-002): the deck is empty, no card to reveal.',
          'game.log.effect.noTarget', { card: TSUNADE_002_NAME, id: TSUNADE_002_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS002_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss002ConfirmMain',
  };
}

export function registerTsunade002Handlers(): void {
  registerEffect(TSUNADE_002_ID, 'MAIN', tsunade002Main);
}
