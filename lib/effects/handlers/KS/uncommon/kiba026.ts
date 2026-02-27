import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 026/130 - KIBA INUZUKA "Ninpo ! La Danse du Chien !" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 8, Jutsu
 *
 * MAIN: Hide the non-hidden enemy character with the lowest cost in this mission.
 *   - If multiple enemies are tied for the lowest cost, the OPPONENT chooses which to hide.
 *
 * UPGRADE: Look at the 3 top cards of your deck, reveal and draw any Akamaru characters,
 *   then put back the other cards on top of the deck.
 */
function handleKiba026Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;

  const newState = { ...state };

  const mission = newState.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies
  const nonHiddenEnemies = enemyChars.filter(c => !c.isHidden);

  if (nonHiddenEnemies.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kiba Inuzuka (026): No non-hidden enemy character in this mission to hide.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

  // Find the lowest cost
  let lowestCost = Infinity;
  for (const char of nonHiddenEnemies) {
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.chakra < lowestCost) {
      lowestCost = topCard.chakra;
    }
  }

  // Find all enemies with that lowest cost
  const tiedChars = nonHiddenEnemies.filter(c => {
    const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return topCard.chakra === lowestCost;
  });

  // If exactly one: auto-hide
  if (tiedChars.length === 1) {
    const target = tiedChars[0];
    const missions = [...newState.activeMissions];
    const m = { ...missions[sourceMissionIndex] };
    const chars = [...m[enemySide]];
    const idx = chars.findIndex(c => c.instanceId === target.instanceId);
    if (idx !== -1) {
      const targetName = chars[idx].card.name_fr;
      chars[idx] = { ...chars[idx], isHidden: true };
      m[enemySide] = chars;
      missions[sourceMissionIndex] = m;
      return {
        state: {
          ...newState,
          activeMissions: missions,
          log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
            'EFFECT_HIDE',
            `Kiba Inuzuka (026): Hid ${targetName} (lowest cost enemy in this mission).`,
            'game.log.effect.hide',
            { card: 'KIBA INUZUKA', id: 'KS-026-UC', target: targetName },
          ),
        },
      };
    }
    return { state: newState };
  }

  // Multiple enemies tied for lowest cost: the OPPONENT chooses which to hide
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const validTargets = tiedChars.map(c => c.instanceId);
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA026_OPPONENT_CHOOSE_HIDE',
    validTargets,
    selectingPlayer: opponentPlayer,
    description: `Kiba Inuzuka (026): Choose which of your characters (cost ${lowestCost}) to hide.`,
    descriptionKey: 'game.effect.desc.kiba026OpponentChoose',
    descriptionParams: { cost: String(lowestCost) },
    isMandatory: true,
  };
}

function handleKiba026Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  let newState = { ...state };
  const ps = { ...newState[sourcePlayer] };

  if (ps.deck.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT', 'Kiba Inuzuka (026): Deck is empty, upgrade effect fizzles.',
      'game.log.effect.noTarget', { card: 'KIBA INUZUKA', id: 'KS-026-UC' }) } };
  }

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
      { card: 'KIBA INUZUKA', id: 'KS-026-UC', count: akamaruCards.length },
    ) };
  } else {
    newState = { ...newState, log: logAction(
      newState.log, newState.turn, newState.phase, sourcePlayer,
      'EFFECT',
      'Kiba Inuzuka (026): Looked at top 3 of deck, no Akamaru found (upgrade effect).',
      'game.log.effect.lookAtDeck',
      { card: 'KIBA INUZUKA', id: 'KS-026-UC' },
    ) };
  }

  return { state: newState };
}

export function registerKiba026Handlers(): void {
  registerEffect('KS-026-UC', 'MAIN', handleKiba026Main);
  registerEffect('KS-026-UC', 'UPGRADE', handleKiba026Upgrade);
}
