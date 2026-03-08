import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 113/130 V - KIBA INUZUKA (M) "Fang Over Fang"
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide another character
 *       in this mission (not self, not the Akamaru just hidden).
 *
 * UPGRADE: MAIN effect changes: instead of hiding, defeat both targets.
 *
 * Same confirmation flow as KS-113-R:
 *   1. KIBA149_CONFIRM_MAIN → optional confirm popup
 *   2. KIBA149_CONFIRM_UPGRADE → optional confirm popup (if upgrade)
 *   3. Target selection for Akamaru + enemy
 */

function kiba149MainHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-condition: Find a friendly non-hidden Akamaru in play
  let hasAkamaru = false;
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr.toUpperCase().includes('AKAMARU')) {
        hasAkamaru = true;
        break;
      }
    }
    if (hasAkamaru) break;
  }

  if (!hasAkamaru) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kiba Inuzuka (113 MV): No friendly non-hidden Akamaru in play, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'KIBA INUZUKA', id: 'KS-113-MV' },
    );
    return { state: { ...state, log } };
  }

  // Pre-condition 2: Check there's at least one valid second target in this mission
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  let hasSecondTarget = false;
  for (const char of thisMission[friendlySide]) {
    if (char.isHidden) continue;
    if (char.instanceId === ctx.sourceCard.instanceId) continue;
    hasSecondTarget = true;
    break;
  }
  if (!hasSecondTarget) {
    for (const char of thisMission[enemySide]) {
      if (char.isHidden) continue;
      if (!ctx.isUpgrade && !canBeHiddenByEnemy(state, char, opponentPlayer)) continue;
      hasSecondTarget = true;
      break;
    }
  }

  if (!hasSecondTarget) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kiba Inuzuka (113 MV): No other non-hidden character in this mission to target.',
      'game.log.effect.noTarget',
      { card: 'KIBA INUZUKA', id: 'KS-113-MV' },
    );
    return { state: { ...state, log } };
  }

  // Return confirmation popup (like Sasuke 146)
  const extraData = JSON.stringify({
    sourceMissionIndex: ctx.sourceMissionIndex,
    sourceCardInstanceId: ctx.sourceCard.instanceId,
    isUpgrade: ctx.isUpgrade ? 'true' : 'false',
  });

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA149_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: extraData,
    descriptionKey: 'game.effect.desc.kiba149ConfirmMain',
  };
}

function kiba149UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerKiba149Handlers(): void {
  registerEffect('KS-113-MV', 'MAIN', kiba149MainHandler);
  registerEffect('KS-113-MV', 'UPGRADE', kiba149UpgradeHandler);
}
