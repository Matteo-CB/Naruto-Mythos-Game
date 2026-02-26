import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { CharacterInPlay, PlayerID } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 134/130 - KYUBI (S)
 * Chakra: 8, Power: 9
 * Group: Independent, Keywords: Summon
 *
 * MAIN [continuous]: Can't be hidden or defeated by enemy effects.
 *   - Continuous no-op. The engine handles defeat replacement and hide immunity
 *     via ContinuousEffects / EffectEngine.checkDefeatReplacement.
 *
 * UPGRADE: Hide any number of non-hidden characters (from any player, not self)
 *          with total Power 6 or less.
 *   - For auto-resolution: greedily pick enemy characters starting from weakest
 *     until the total power reaches 6 or no more valid targets.
 *   - All selected characters are hidden simultaneously.
 */

function kyubi134MainHandler(ctx: EffectContext): EffectResult {
  // Continuous immunity - handled by ContinuousEffects engine
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

  // Collect all non-hidden characters across all missions (any player, not self)
  // that have Power > 0 and Power <= 6
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const sidePlayer = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.isHidden) continue;
        if (char.instanceId === ctx.sourceCard.instanceId) continue;
        const power = getEffectivePower(state, char, sidePlayer as PlayerID);
        if (power > 0 && power <= 6) {
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

  // Player chooses targets iteratively (one at a time, checking power budget)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KYUBI134_CHOOSE_HIDE_TARGETS',
    validTargets,
    description: JSON.stringify({
      remainingPower: 6,
      hiddenIds: [],
      text: 'Kyubi (134) UPGRADE: Choose a character to hide (total power budget: 6).',
    }),
    descriptionKey: 'game.effect.desc.kyubi134ChooseHide',
    descriptionParams: { remaining: '6' },
  };
}

export function registerKyubi134Handlers(): void {
  registerEffect('KS-134-S', 'MAIN', kyubi134MainHandler);
  registerEffect('KS-134-S', 'UPGRADE', kyubi134UpgradeHandler);
}
