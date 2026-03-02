import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 113/130 - KIBA INUZUKA (R)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide an enemy character in this mission.
 *   Step 1 (optional): Choose WHICH Akamaru to hide → KIBA113_CHOOSE_AKAMARU
 *     - Player sees all non-hidden friendly Akamarous as selectable targets
 *     - Player may decline (isOptional: true)
 *   Step 2 (mandatory once step 1 chosen): Choose enemy in Kiba's mission to hide → KIBA113_HIDE_TARGET
 *
 * UPGRADE: Defeat both targets instead of hiding.
 *   Step 1: KIBA113_CHOOSE_AKAMARU_DEFEAT (optional) → KIBA113_DEFEAT_TARGET (mandatory)
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

  // Pre-condition 2: There must be at least one non-hidden enemy in Kiba's mission that can be hidden
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const kibaMission = state.activeMissions[sourceMissionIndex];
  const hasEnemy = kibaMission && kibaMission[enemySide].some(c => canBeHiddenByEnemy(state, c, opponentPlayer));
  if (!hasEnemy) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No non-hidden enemy in this mission to target.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: 'KS-113-R' },
        ),
      },
    };
  }

  // Encode source context into effectDescription
  const extraData = JSON.stringify({
    sourceMissionIndex,
    sourceCardInstanceId: sourceCard.instanceId,
    isUpgrade: isUpgrade ? 'true' : 'false',
  });

  const selectionType = isUpgrade ? 'KIBA113_CHOOSE_AKAMARU_DEFEAT' : 'KIBA113_CHOOSE_AKAMARU';
  const descKey = isUpgrade
    ? 'game.effect.desc.kiba113ChooseAkamaruDefeat'
    : 'game.effect.desc.kiba113ChooseAkamaru';

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: selectionType,
    validTargets: akamaruTargets,
    isOptional: true,
    description: extraData,
    descriptionKey: descKey,
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
