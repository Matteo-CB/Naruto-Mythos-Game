import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { PlayerID } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';



function kyubi134MainHandler(ctx: EffectContext): EffectResult {
  
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Kyubi (134): Cannot be hidden or defeated by enemy effects (continuous).',
    'game.log.effect.continuous',
    { card: 'KYUBI', id: 'KS-134-S' },
  );
  return { state: { ...ctx.state, log } };
}

function kyubi134UpgradeHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  
  
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const sidePlayer = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.isHidden) continue;
        if (char.instanceId === ctx.sourceCard.instanceId) continue;
        const power = getEffectivePower(state, char, sidePlayer as PlayerID);
        if (power <= 6) {
          validTargets.push(char.instanceId);
        }
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kyubi (134): No non-hidden characters to hide (upgrade).',
      'game.log.effect.noTarget',
      { card: 'KYUBI', id: 'KS-134-S' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KYUBI134_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kyubi134ConfirmUpgrade',
  };
}

export function registerKyubi134Handlers(): void {
  registerEffect('KS-134-S', 'MAIN', kyubi134MainHandler);
  registerEffect('KS-134-S', 'UPGRADE', kyubi134UpgradeHandler);
}
