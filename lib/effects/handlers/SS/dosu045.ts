import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideKey } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const DOSU_045_ID = 'SS-045-C';
export const DOSU_045_NAME = 'DOSU KINUTA';

export function friendlyHiddenAnywhere(state: GameState, player: PlayerID): string[] {
  const side = sideKey(player);
  const cibles: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.isHidden) cibles.push(char.instanceId);
    }
  }
  return cibles;
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: DOSU_045_NAME, id: DOSU_045_ID }),
    },
  };
}

function dosu045Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  const validTargets = friendlyHiddenAnywhere(state, sourcePlayer);
  if (validTargets.length === 0) {
    return refuse(state, sourcePlayer, 'Dosu Kinuta (045) AMBUSH: no friendly hidden character in play.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS045_BOUNCE_HIDDEN',
    validTargets,
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss045BounceHidden',
  }, ctx.sourceCard.instanceId, 'SS045_CONFIRM_AMBUSH');
}

export function registerDosu045Handlers(): void {
  registerEffect(DOSU_045_ID, 'AMBUSH', dosu045Ambush);
}
