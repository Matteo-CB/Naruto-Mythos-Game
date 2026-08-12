import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideKey } from './sandMove';

export const JIROBO_032_ID = 'SS-032-C';
export const JIROBO_032_NAME = 'JIRÔBÔ';
export const JIROBO_032_POWERUP = 2;

function jirobo032FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const side = sideKey(sourcePlayer);

  const missionIndex = state.activeMissions.findIndex((mission) =>
    mission[side].some((char) => char.instanceId === sourceCard.instanceId),
  );

  if (missionIndex === -1) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Jirobo (SS-032) FIRST STRIKE: this character is no longer in play, no POWERUP.',
          'game.log.effect.noTarget', { card: JIROBO_032_NAME, id: JIROBO_032_ID }),
      },
    };
  }

  const amount = amplifiedPowerup(state, sourceCard.instanceId, JIROBO_032_POWERUP);

  const missions = state.activeMissions.map((mission, index) => {
    if (index !== missionIndex) return mission;
    return {
      ...mission,
      [side]: mission[side].map((char) =>
        char.instanceId === sourceCard.instanceId
          ? { ...char, powerTokens: char.powerTokens + amount }
          : char,
      ),
    };
  });

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_POWERUP',
        `Jirobo (SS-032) FIRST STRIKE: POWERUP ${amount}.`,
        'game.log.effect.powerupSelf',
        { card: JIROBO_032_NAME, id: JIROBO_032_ID, amount }),
    },
  };
}

export function registerJirobo032Handlers(): void {
  registerEffect(JIROBO_032_ID, 'FIRST_STRIKE', jirobo032FirstStrike);
}
