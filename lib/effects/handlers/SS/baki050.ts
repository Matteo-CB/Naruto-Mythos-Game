import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { sideKey } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const BAKI_050_ID = 'SS-050-C';
export const BAKI_050_NAME = 'BAKI';
export const BAKI_050_POWERUP = 2;

export function baki050Targets(state: GameState, player: PlayerID, sourceInstanceId: string): string[] {
  const cibles: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[sideKey(player)]) {
      if (char.instanceId === sourceInstanceId) continue;
      if (char.isHidden) continue;
      if (!characterHasGroup(char, 'Sand Village')) continue;
      cibles.push(char.instanceId);
    }
  }
  return cibles;
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'SCORE_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: BAKI_050_NAME, id: BAKI_050_ID }),
    },
  };
}

function baki050Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  const cibles = baki050Targets(state, sourcePlayer, sourceCard.instanceId);
  if (cibles.length === 0) {
    return refuse(state, sourcePlayer, 'Baki (050) SCORE: no other friendly Sand Village character in play.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS050_POWERUP',
    validTargets: cibles,
    isOptional: true,
    description: JSON.stringify({ amount: BAKI_050_POWERUP }),
    descriptionKey: 'game.effect.desc.ss050Powerup',
  }, sourceCard.instanceId, 'SS050_CONFIRM_SCORE');
}

export function registerBaki050Handlers(): void {
  registerEffect(BAKI_050_ID, 'SCORE', baki050Score);
}
