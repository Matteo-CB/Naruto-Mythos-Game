import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { charactersMovableFromMission } from './sandMove';
import { confirmFirst } from './confirmFirst';

const CARD_ID = 'SS-049-C';

function temari049FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;

  if (state.activeMissions.length < 2) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Temari (049) FIRST STRIKE: Only 1 mission in play, nothing can move.',
          'game.log.effect.noTarget', { card: 'TEMARI', id: CARD_ID }),
      },
    };
  }

  const validTargets = charactersMovableFromMission(state, sourceMissionIndex, 'any', sourcePlayer);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Temari (049) FIRST STRIKE: No character can be moved from this mission.',
          'game.log.effect.noTarget', { card: 'TEMARI', id: CARD_ID }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS049_FS_CHAR',
    validTargets,
    isOptional: true,
    description: 'Temari (049) FIRST STRIKE: Choose a character to move from this mission.',
    descriptionKey: 'game.effect.desc.ss049FirstStrikeChar',
  }, ctx.sourceCard.instanceId, 'SS049_CONFIRM_FIRST_STRIKE');
}

export function registerTemari049Handlers(): void {
  registerEffect(CARD_ID, 'FIRST_STRIKE', temari049FirstStrike);
}
