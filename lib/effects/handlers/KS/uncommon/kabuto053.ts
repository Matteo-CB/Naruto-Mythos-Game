import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';



export const KABUTO_053_REDUCTION = 3;

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

  
  const topCard = playerState.discardPile[playerState.discardPile.length - 1];

  
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

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  let reducedCost = Math.max(0, (topCard.chakra ?? 0) - KABUTO_053_REDUCTION);
  const validMissions: string[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const chars = state.activeMissions[mi][friendlySide];
    const prixEffectif = calculateEffectiveCost(state, sourcePlayer, topCard as never, mi, false);
    const prixFrais = Math.max(0, prixEffectif - KABUTO_053_REDUCTION);

    const hasNameConflict = chars.some((c) => {
      if (c.isHidden) return false;
      const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return tc.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
    });

    const hasUpgradeTarget = chars.some((c) => {
      if (c.isHidden) return false;
      if (c.controlledBy !== c.originalOwner) return false;
      const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      const isSameName = tc.name_fr.toUpperCase() === topCard.name_fr.toUpperCase()
        && (topCard.chakra ?? 0) > (tc.chakra ?? 0);
      const isFlex = checkFlexibleUpgrade(topCard as any, tc, state, mi)
        && (topCard.chakra ?? 0) > (tc.chakra ?? 0);
      if (!isSameName && !isFlex) return false;
      const upgradeCost = Math.max(0, (prixEffectif - (tc.chakra ?? 0)) - KABUTO_053_REDUCTION);
      return playerState.chakra >= upgradeCost;
    });

    if (hasUpgradeTarget || (!hasNameConflict && playerState.chakra >= prixFrais)) {
      validMissions.push(String(mi));
      reducedCost = Math.min(reducedCost, prixFrais);
    }
  }

  if (validMissions.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kabuto Yakushi (053): No valid mission to play ${topCard.name_fr} from discard.`,
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }


  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, reducedCost }),
    descriptionKey: 'game.effect.desc.kabuto053ConfirmMain',
  };
}

export function registerKabuto053Handlers(): void {
  registerEffect('KS-053-UC', 'UPGRADE', handleKabuto053Upgrade);
  registerEffect('KS-053-UC', 'MAIN', handleKabuto053Main);
}
