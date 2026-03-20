import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';

/**
 * Card 053/130 - KABUTO YAKUSHI (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: Discard a card from your hand.
 *   (French: "Défaussez une carte de votre main.")
 *
 * MAIN: Play the top character from your discard pile anywhere, paying 3 less.
 *   (French: "Jouez le personnage en haut de votre pile de defausse en payant 3 de moins.")
 *   - Always the top card (last added) - no browsing/choosing.
 *   - If the top card is not a character or not affordable, fizzles.
 *   - Player chooses which mission to play it on.
 */

function handleKabuto053Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053) UPGRADE: No cards in hand to discard.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Confirmation popup (no SKIP per Andy)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kabuto053ConfirmUpgrade',
  };
}

function handleKabuto053Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.discardPile.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053): Discard pile is empty.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Top of discard pile = last element in the array
  const topCard = playerState.discardPile[playerState.discardPile.length - 1];

  // Must be a character card
  if (topCard.card_type !== 'character') {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kabuto Yakushi (053): Top card of discard (${topCard.name_fr}) is not a character.`,
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  const reducedCost = Math.max(0, (topCard.chakra ?? 0) - 3);
  const canAffordFresh = playerState.chakra >= reducedCost;
  const canUpgradeCheck = canAffordAsUpgrade(state, sourcePlayer, topCard as { name_fr: string; chakra: number }, 3);
  if (!canAffordFresh && !canUpgradeCheck) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kabuto Yakushi (053): Cannot afford ${topCard.name_fr} (cost ${reducedCost}).`,
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Find valid missions (fresh play or upgrade)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  let hasValidMission = false;
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    const chars = mission[friendlySide];

    let hasUpgradeTarget = false;
    for (const c of chars) {
      if (c.isHidden) continue;
      const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      const isSameName = tc.name_fr.toUpperCase() === topCard.name_fr.toUpperCase()
        && (topCard.chakra ?? 0) > (tc.chakra ?? 0);
      const isFlex = checkFlexibleUpgrade(topCard as any, tc)
        && (topCard.chakra ?? 0) > (tc.chakra ?? 0);
      if (isSameName || isFlex) {
        const upgradeCost = Math.max(0, ((topCard.chakra ?? 0) - (tc.chakra ?? 0)) - 3);
        if (playerState.chakra >= upgradeCost) {
          hasUpgradeTarget = true;
          break;
        }
      }
    }

    const hasNameConflict = chars.some((c) => {
      if (c.isHidden) return false;
      const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return tc.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
    });

    if (hasUpgradeTarget || (!hasNameConflict && canAffordFresh)) {
      hasValidMission = true;
      break;
    }
  }

  if (!hasValidMission) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kabuto Yakushi (053): No valid mission for ${topCard.name_fr}.`,
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Confirmation popup (no SKIP per Andy)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kabuto053ConfirmMain',
  };
}

export function registerKabuto053Handlers(): void {
  registerEffect('KS-053-UC', 'UPGRADE', handleKabuto053Upgrade);
  registerEffect('KS-053-UC', 'MAIN', handleKabuto053Main);
}
