import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 053/130 - KABUTO YAKUSHI (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: Draw a card.
 *   (French: "Piochez une carte.")
 *
 * MAIN: Play the top character from your discard pile anywhere, paying 3 less.
 *   (French: "Jouez le personnage en haut de votre pile de defausse en payant 3 de moins.")
 *   - Always the top card (last added) — no browsing/choosing.
 *   - If the top card is not a character or not affordable, fizzles.
 *   - Player chooses which mission to play it on.
 */

function handleKabuto053Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = { ...state[sourcePlayer] };

  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053) UPGRADE: Deck is empty, cannot draw.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Draw 1 card
  const deck = [...playerState.deck];
  const drawnCard = deck.shift()!;
  playerState.deck = deck;
  playerState.hand = [...playerState.hand, drawnCard];

  return {
    state: {
      ...state,
      [sourcePlayer]: playerState,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_DRAW',
        'Kabuto Yakushi (053) UPGRADE: Drew 1 card.',
        'game.log.effect.draw',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', count: '1' },
      ),
    },
  };
}

function handleKabuto053Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
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
  const topCardIndex = playerState.discardPile.length - 1;
  const topCard = playerState.discardPile[topCardIndex];

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
  if (playerState.chakra < reducedCost) {
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

  // Find valid missions (fresh play or upgrade over same-name with lower cost)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validMissions: string[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    const sameNameChar = mission[friendlySide].find((c) => {
      if (c.isHidden) return false;
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr.toUpperCase() === topCard.name_fr.toUpperCase();
    });
    if (!sameNameChar) {
      validMissions.push(String(mi));
    } else {
      const existingTopCard = sameNameChar.stack.length > 0
        ? sameNameChar.stack[sameNameChar.stack.length - 1] : sameNameChar.card;
      if ((topCard.chakra ?? 0) > (existingTopCard.chakra ?? 0)) {
        validMissions.push(String(mi));
      }
    }
  }

  if (validMissions.length === 0) {
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

  // Always go through target selection so EffectEngine handles upgrade + MAIN effects
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CHOOSE_MISSION',
    validTargets: validMissions,
    description: JSON.stringify({
      discardIndex: topCardIndex,
      reducedCost,
      text: `Kabuto Yakushi (053): Choose a mission to play ${topCard.name_fr} on (cost ${reducedCost}).`,
    }),
    descriptionKey: 'game.effect.desc.kabuto053ChooseMission',
    descriptionParams: { cardName: topCard.name_fr, cost: String(reducedCost) },
  };
}

export function registerKabuto053Handlers(): void {
  registerEffect('KS-053-UC', 'UPGRADE', handleKabuto053Upgrade);
  registerEffect('KS-053-UC', 'MAIN', handleKabuto053Main);
}
