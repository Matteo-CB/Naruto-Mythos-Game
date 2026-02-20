import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 026/130 - KIBA INUZUKA "Ninpo ! La Danse du Chien !" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN: Hide the non-hidden enemy character with the lowest cost in this mission.
 *   - Find non-hidden enemy characters in this mission. Pick the one with the lowest
 *     printed chakra cost. If tied, the active player chooses (or we pick the first one).
 *   - Hide the selected character (set isHidden to true).
 *
 * UPGRADE: Look at the 3 top cards of your deck, reveal and draw any Akamaru characters,
 *   then put back the other cards.
 *   - When triggered as upgrade, also look at top 3 cards of deck. Any cards with
 *     name "AKAMARU" are added to hand. Remaining cards are put back on top of deck.
 */
function handleKiba026Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;

  let newState = { ...state };

  // UPGRADE bonus: Look at top 3 of deck, draw any Akamaru, put back rest
  if (isUpgrade) {
    const ps = { ...newState[sourcePlayer] };
    if (ps.deck.length > 0) {
      const topCards = ps.deck.slice(0, 3);
      const remainingDeck = ps.deck.slice(3);

      const akamaruCards = topCards.filter(c => c.name_fr === 'AKAMARU');
      const otherCards = topCards.filter(c => c.name_fr !== 'AKAMARU');

      // Draw Akamaru cards into hand
      ps.hand = [...ps.hand, ...akamaruCards];
      // Put other cards back on top of deck
      ps.deck = [...otherCards, ...remainingDeck];

      newState[sourcePlayer] = ps;

      if (akamaruCards.length > 0) {
        newState = { ...newState, log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_DRAW',
          `Kiba Inuzuka (026): Drew ${akamaruCards.length} Akamaru card(s) from top 3 of deck (upgrade effect).`,
          'game.log.effect.draw',
          { card: 'KIBA INUZUKA', id: '026/130', count: akamaruCards.length },
        ) };
      } else {
        newState = { ...newState, log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT',
          'Kiba Inuzuka (026): Looked at top 3 of deck, no Akamaru found (upgrade effect).',
          'game.log.effect.lookAtDeck',
          { card: 'KIBA INUZUKA', id: '026/130' },
        ) };
      }
    }
  }

  // MAIN: Hide the non-hidden enemy with lowest cost in this mission
  const mission = newState.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies
  const nonHiddenEnemies = enemyChars.filter(c => !c.isHidden);

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kiba Inuzuka (026): No non-hidden enemy character in this mission to hide.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: '026/130' }) } };
  }

  // Find the one with lowest cost
  let lowestCost = Infinity;
  let lowestCostChar = nonHiddenEnemies[0];
  for (const char of nonHiddenEnemies) {
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.chakra < lowestCost) {
      lowestCost = topCard.chakra;
      lowestCostChar = char;
    }
  }

  // Hide the selected character
  const missions = [...newState.activeMissions];
  const m = { ...missions[sourceMissionIndex] };
  const chars = [...m[enemySide]];
  const idx = chars.findIndex(c => c.instanceId === lowestCostChar.instanceId);
  if (idx !== -1) {
    const targetName = chars[idx].card.name_fr;
    chars[idx] = { ...chars[idx], isHidden: true };
    m[enemySide] = chars;
    missions[sourceMissionIndex] = m;
    newState = { ...newState, activeMissions: missions };

    newState = { ...newState, log: logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT_HIDE',
      `Kiba Inuzuka (026): Hid ${targetName} (lowest cost enemy in this mission).`,
      'game.log.effect.hide',
      { card: 'KIBA INUZUKA', id: '026/130', target: targetName },
    ) };
  }

  return { state: newState };
}

export function registerKiba026Handlers(): void {
  registerEffect('026/130', 'MAIN', handleKiba026Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to apply the Akamaru search
}
