import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { ukon124bMainHandler } from './ukon124b';

/**
 * Card 127/130 - SAKON (R/RA)
 * Chakra: 5 | Power: 5
 * Group: Sound Village | Keywords: Sound Four, Jutsu
 *
 * MAIN [⧗]: You can play this character as an upgrade over any Sound Village character.
 *   → Continuous upgrade-eligibility expansion. No-op handler; logic in PlayValidation.ts.
 *
 * AMBUSH: Hide an enemy character in this mission with Power 5 or less.
 *   → Dedicated handler with CONFIRM popup (decoupled from Ukon 124b).
 */

function sakon127AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 5 that can be hidden
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => canBeHiddenByEnemy(state, c, opponentPlayer) && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sakon (127) AMBUSH: No enemy with Power 5 or less in this mission that can be hidden.',
          'game.log.effect.noTarget',
          { card: 'SAKON', id: 'KS-127-R' },
        ),
      },
    };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON127_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    description: JSON.stringify({ sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.sakon127ConfirmAmbush',
    isOptional: true,
  };
}

export function registerSakon127Handlers(): void {
  registerEffect('KS-127-R', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-127-R', 'AMBUSH', sakon127AmbushHandler);
  registerEffect('KS-127-RA', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-127-RA', 'AMBUSH', sakon127AmbushHandler);
}
