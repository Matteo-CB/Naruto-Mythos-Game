import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { buildPlayLessTargets, type PlayLessCategory } from '@/lib/effects/handlers/shared/playLess';

export const KAKASHI_008_ID = 'SS-008-C';
export const KAKASHI_008_NAME = 'KAKASHI HATAKE';
export const KAKASHI_008_REDUCTION = 2;
export const KAKASHI_008_CATEGORY: PlayLessCategory = { kind: 'keyword', value: 'Team 7' };

function kakashi008FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const { targets } = buildPlayLessTargets(
    state, sourcePlayer, KAKASHI_008_CATEGORY, KAKASHI_008_REDUCTION, true,
  );

  if (targets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Kakashi Hatake (SS-008) FIRST STRIKE: no Team 7 character can be played fresh.',
          'game.log.effect.noTarget', { card: KAKASHI_008_NAME, id: KAKASHI_008_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS008_CONFIRM_FIRST_STRIKE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss008ConfirmFirstStrike',
  };
}

export function registerKakashi008Handlers(): void {
  registerEffect(KAKASHI_008_ID, 'FIRST_STRIKE', kakashi008FirstStrike);
}
