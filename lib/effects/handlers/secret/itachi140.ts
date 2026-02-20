import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 140/130 - ITACHI UCHIWA "Tsukuyomi" (S)
 * Chakra: 7, Power: 7
 * Group: Akatsuki, Keywords: Rogue Ninja, Jutsu
 *
 * MAIN: The opponent discards their entire hand, then draws the same number
 *       of cards discarded in this way.
 *   - Get opponent's hand size.
 *   - Move all cards from opponent's hand to their discard pile.
 *   - Draw that many cards from opponent's deck into their hand.
 *   - If deck runs out, draw as many as available (no penalty).
 *
 * UPGRADE: Defeat a character in play with cost X or less, where X is the
 *          number of cards discarded by the MAIN effect.
 *   - Only triggers when ctx.isUpgrade is true.
 *   - X = number of cards that were discarded (original hand size).
 *   - Find enemy characters in play with chakra cost <= X.
 *   - If multiple, return requiresTargetSelection.
 *   - If exactly 1, auto-apply defeat.
 *   - If none, fizzle the upgrade part.
 */

function itachi140MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = { ...state[opponentPlayer] };

  const handSize = opponentState.hand.length;

  if (handSize === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (140): Opponent hand is already empty, nothing to discard.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: '140/130' },
    );

    // Even with 0 discards, the upgrade cannot trigger meaningfully (X=0 means cost <= 0)
    if (ctx.isUpgrade) {
      return { state: { ...state, log } };
    }
    return { state: { ...state, log } };
  }

  // Move all cards from opponent's hand to their discard pile
  const discardedCards = [...opponentState.hand];
  opponentState.discardPile = [...opponentState.discardPile, ...discardedCards];
  opponentState.hand = [];

  state = {
    ...state,
    [opponentPlayer]: opponentState,
    log: logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_DISCARD',
      `Itachi Uchiwa (140): Opponent discarded ${handSize} card(s) from hand.`,
      'game.log.effect.opponentDiscard',
      { card: 'ITACHI UCHIWA', id: '140/130', amount: handSize },
    ),
  };

  // Draw that many cards from opponent's deck
  const updatedOpponent = { ...state[opponentPlayer] };
  const deck = [...updatedOpponent.deck];
  const drawCount = Math.min(handSize, deck.length);
  const drawnCards = deck.splice(0, drawCount);
  updatedOpponent.deck = deck;
  updatedOpponent.hand = [...updatedOpponent.hand, ...drawnCards];

  state = {
    ...state,
    [opponentPlayer]: updatedOpponent,
    log: logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_DRAW',
      `Itachi Uchiwa (140): Opponent drew ${drawCount} card(s) (replaced discarded hand).`,
      'game.log.effect.opponentDraw',
      { card: 'ITACHI UCHIWA', id: '140/130', amount: drawCount },
    ),
  };

  // UPGRADE: Defeat a character in play with cost X or less
  if (ctx.isUpgrade) {
    const enemySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
    const x = handSize; // Number of cards discarded

    // Find enemy characters with cost <= X
    const validTargets: { char: CharacterInPlay; missionIndex: number }[] = [];
    for (let i = 0; i < state.activeMissions.length; i++) {
      for (const char of state.activeMissions[i][enemySide]) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.chakra <= x) {
          validTargets.push({ char, missionIndex: i });
        }
      }
    }

    if (validTargets.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          `Itachi Uchiwa (140): No enemy character with cost ${x} or less to defeat (upgrade).`,
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIWA', id: '140/130' },
        ),
      };
      return { state };
    }

    if (validTargets.length > 1) {
      return {
        state,
        requiresTargetSelection: true,
        targetSelectionType: 'DEFEAT_BY_COST_UPGRADE',
        validTargets: validTargets.map((t) => t.char.instanceId),
        description: `Itachi Uchiwa (140): Select an enemy character with cost ${x} or less to defeat (upgrade).`,
      };
    }

    // Exactly 1 valid target: auto-apply
    const target = validTargets[0];
    state = defeatEnemyCharacter(state, target.missionIndex, target.char.instanceId, ctx.sourcePlayer);

    state = {
      ...state,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_DEFEAT',
        `Itachi Uchiwa (140): Defeated enemy ${target.char.card.name_fr} (cost <= ${x}, upgrade).`,
        'game.log.effect.defeat',
        { card: 'ITACHI UCHIWA', id: '140/130', target: target.char.card.name_fr },
      ),
    };
  }

  return { state };
}

function itachi140UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerItachi140Handlers(): void {
  registerEffect('140/130', 'MAIN', itachi140MainHandler);
  registerEffect('140/130', 'UPGRADE', itachi140UpgradeHandler);
}
