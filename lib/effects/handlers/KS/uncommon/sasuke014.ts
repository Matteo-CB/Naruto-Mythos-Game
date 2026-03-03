import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 014/130 - SASUKE UCHIWA "Sharingan" (UC)
 * Chakra: 3 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * AMBUSH: Look at the opponent's hand. (Mandatory)
 *
 * UPGRADE: AMBUSH effect: In addition, discard 1 card.
 *   If you do so, choose 1 card in the opponent's hand and discard it.
 *   (The UPGRADE includes the AMBUSH effect — shows opponent's hand first,
 *    then offers the discard chain.)
 */

function handleSasuke014Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (014): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    );
    return { state: { ...state, log } };
  }

  // Show ALL opponent hand cards
  const allCards = opponentHand.map((c, i) => ({
    name_fr: c.name_fr,
    chakra: c.chakra ?? 0,
    power: c.power ?? 0,
    image_file: c.image_file,
    originalIndex: i,
  }));

  const newState = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_LOOK_HAND',
      'Sasuke Uchiwa (014): Revealed all cards in opponent\'s hand.',
      'game.log.effect.sasuke014Reveal',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    ),
  };

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_HAND_REVEAL',
    validTargets: ['confirm'],
    description: JSON.stringify({
      text: 'Sasuke (014): Opponent\'s hand revealed.',
      cards: allCards,
    }),
    descriptionKey: 'game.effect.desc.sasuke014Reveal',
    isMandatory: true,
  };
}

function handleSasuke014Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  // Must have cards in own hand AND opponent must have cards
  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (014) UPGRADE: No cards in own hand to discard.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
        ),
      },
    };
  }

  if (opponentHand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (014) UPGRADE: Opponent has no cards in hand.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
        ),
      },
    };
  }

  // UPGRADE includes the AMBUSH effect ("AMBUSH effect: In addition...")
  // First show opponent's hand (the AMBUSH part), then chain to discard flow
  const allCards = opponentHand.map((c, i) => ({
    name_fr: c.name_fr,
    chakra: c.chakra ?? 0,
    power: c.power ?? 0,
    image_file: c.image_file,
    originalIndex: i,
  }));

  const newState = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_LOOK_HAND',
      'Sasuke Uchiwa (014) UPGRADE: Revealed all cards in opponent\'s hand.',
      'game.log.effect.sasuke014Reveal',
      { card: 'SASUKE UCHIWA', id: 'KS-014-UC' },
    ),
  };

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE014_UPGRADE_HAND_REVEAL',
    validTargets: ['confirm'],
    description: JSON.stringify({
      text: 'Sasuke (014) UPGRADE: Opponent\'s hand revealed.',
      cards: allCards,
      isUpgrade: true,
    }),
    descriptionKey: 'game.effect.desc.sasuke014UpgradeReveal',
    isMandatory: true,
  };
}

export function registerSasuke014Handlers(): void {
  registerEffect('KS-014-UC', 'AMBUSH', handleSasuke014Ambush);
  registerEffect('KS-014-UC', 'UPGRADE', handleSasuke014Upgrade);
}
