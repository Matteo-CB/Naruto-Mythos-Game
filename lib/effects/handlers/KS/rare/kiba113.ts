import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 113/130 - KIBA INUZUKA (R) "Fang over Fang"
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide another character in this mission.
 *   "Another character" = ANY character (friendly or enemy), not just enemy.
 *   Confirmation popup first (like Sasuke 146), then target selection.
 *
 * UPGRADE: MAIN effect changes: instead of hiding, defeat both targets.
 *   Separate confirmation popup after MAIN confirmation.
 *
 * Flow (upgrade path):
 *   1. KIBA113_CONFIRM_MAIN → optional confirm popup (self target)
 *   2. KIBA113_CONFIRM_UPGRADE → optional confirm popup (self target)
 *   3. KIBA113_CHOOSE_AKAMARU / KIBA113_CHOOSE_AKAMARU_DEFEAT → pick Akamaru
 *   4. KIBA113_HIDE_TARGET / KIBA113_DEFEAT_TARGET → pick character (any side)
 *
 * Flow (non-upgrade path):
 *   1. KIBA113_CONFIRM_MAIN → optional confirm popup (self target)
 *   2. KIBA113_CHOOSE_AKAMARU → pick Akamaru
 *   3. KIBA113_HIDE_TARGET → pick character (any side)
 */

function kiba113MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-condition 1: Collect ALL non-hidden friendly Akamarous in any mission
  const akamaruTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.name_fr.toLowerCase().includes('akamaru')) {
          akamaruTargets.push(char.instanceId);
        }
      }
    }
  }

  if (akamaruTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No friendly non-hidden Akamaru in play.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: 'KS-113-R' },
        ),
      },
    };
  }

  // Pre-condition 2: There must be at least one non-hidden character in Kiba's mission
  // that can be targeted (any side, but not Kiba himself)
  const kibaMission = state.activeMissions[sourceMissionIndex];
  const hasTarget = kibaMission && [
    ...kibaMission[friendlySide].filter(c => c.instanceId !== sourceCard.instanceId),
    ...kibaMission[enemySide],
  ].some(c => !c.isHidden);
  if (!hasTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No non-hidden character in this mission to target.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: 'KS-113-R' },
        ),
      },
    };
  }

  // Return a confirmation popup (like Sasuke 146): self as target, optional
  const extraData = JSON.stringify({
    sourceMissionIndex,
    sourceCardInstanceId: sourceCard.instanceId,
    isUpgrade: isUpgrade ? 'true' : 'false',
  });

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA113_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: extraData,
    descriptionKey: 'game.effect.desc.kiba113ConfirmMain',
  };
}

function kiba113UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKiba113Handlers(): void {
  registerEffect('KS-113-R', 'MAIN', kiba113MainHandler);
  registerEffect('KS-113-R', 'UPGRADE', kiba113UpgradeHandler);
}
