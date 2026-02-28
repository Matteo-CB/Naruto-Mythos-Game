import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';

/**
 * Card 113/130 - KIBA INUZUKA (R)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide an enemy character in this mission.
 *   The "skip" is only at step 1 — once Akamaru is hidden, step 2 (hide enemy) is mandatory.
 *   Pre-conditions: a non-hidden friendly Akamaru exists AND a non-hidden enemy exists in Kiba's mission.
 *   Step 1: Ask player if they want to hide Akamaru → KIBA113_CONFIRM_HIDE_AKAMARU pending
 *           (uses CONFIRM_HIDE UI with card art + Hide/Skip buttons)
 *   Step 2: If confirmed, hide Akamaru, then must choose an enemy in this mission to hide → KIBA113_HIDE_TARGET
 *           (mandatory — no Skip button)
 *
 * UPGRADE: Defeat both targets instead of hiding.
 *   Step 1: KIBA113_CONFIRM_DEFEAT_AKAMARU → KIBA113_DEFEAT_TARGET (mandatory)
 */

function kiba113MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-condition 1: Find a friendly Akamaru in play (any mission, non-hidden)
  let akamaruChar: CharacterInPlay | null = null;
  let akamaruMissionIdx = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    for (const char of friendlyChars) {
      if (!char.isHidden) {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.name_fr.toLowerCase().includes('akamaru')) {
          akamaruChar = char;
          akamaruMissionIdx = i;
          break;
        }
      }
    }
    if (akamaruChar) break;
  }

  if (!akamaruChar) {
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

  // Pre-condition 2: There must be at least one non-hidden enemy in Kiba's mission (step 2 target)
  const kibaMission = state.activeMissions[sourceMissionIndex];
  const hasEnemy = kibaMission && kibaMission[enemySide].some(c => !c.isHidden);
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

  const akamaruTopCard = akamaruChar.stack.length > 0
    ? akamaruChar.stack[akamaruChar.stack.length - 1]
    : akamaruChar.card;

  // Encode Akamaru data + context into description (stored as effectDescription in PendingEffect)
  // The EffectEngine and gameStore will JSON.parse this.
  const extraData = JSON.stringify({
    akamaruInstanceId: akamaruChar.instanceId,
    akamaruMissionIdx,
    sourceMissionIndex,
    sourceCardInstanceId: sourceCard.instanceId,
    isUpgrade: isUpgrade ? 'true' : 'false',
    name_fr: akamaruTopCard.name_fr,
    image_file: akamaruTopCard.image_file,
    chakra: akamaruTopCard.chakra,
    power: akamaruTopCard.power,
  });

  const confirmSelectionType = isUpgrade ? 'KIBA113_CONFIRM_DEFEAT_AKAMARU' : 'KIBA113_CONFIRM_HIDE_AKAMARU';
  const descKey = isUpgrade ? 'game.effect.desc.kiba113DefeatAkamaru' : 'game.effect.desc.kiba113HideAkamaru';

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: confirmSelectionType,
    validTargets: ['confirm'],
    isOptional: true,
    // description is stored as effectDescription in PendingEffect — encode extra data here
    description: extraData,
    descriptionKey: descKey,
  };
}

function kiba113UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKiba113Handlers(): void {
  registerEffect('KS-113-R', 'MAIN', kiba113MainHandler);
  registerEffect('KS-113-R', 'UPGRADE', kiba113UpgradeHandler);
}
