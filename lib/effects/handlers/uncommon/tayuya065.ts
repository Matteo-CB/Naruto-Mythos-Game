import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 065/130 - TAYUYA (UC)
 * Chakra: 4 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 *
 * AMBUSH: POWERUP 2 a friendly Sound Village character in play.
 *   - Find all friendly non-hidden Sound Village characters across all missions.
 *   - If exactly one valid target, auto-apply POWERUP 2.
 *   - If multiple targets, require target selection.
 *
 * UPGRADE: Look at the top 3 cards of your deck, draw any with keyword "Summon",
 * put the rest back on top in any order.
 *   - Look at up to 3 cards from the top of the deck.
 *   - Add any with keyword "Summon" to hand.
 *   - Put the rest back on top of the deck (order doesn't matter for auto-resolve).
 */

function handleTayuya065Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly non-hidden Sound Village characters across all missions
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Sound Village') {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tayuya (065): No friendly Sound Village character in play to power up.',
      'game.log.effect.noTarget', { card: 'TAYUYA', id: '065/130' }) } };
  }

  // Auto-apply if exactly one target
  if (validTargets.length === 1) {
    const newState = powerUpTarget(state, validTargets[0], 2, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TAYUYA065_POWERUP_SOUND',
    validTargets,
    description: 'Select a friendly Sound Village character in play to give POWERUP 2.',
  };
}

function handleTayuya065Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const ps = { ...state[sourcePlayer] };

  if (ps.deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tayuya (065): Deck is empty, nothing to look at.',
      'game.log.effect.noTarget', { card: 'TAYUYA', id: '065/130' }) } };
  }

  // Look at top 3 cards
  const lookCount = Math.min(3, ps.deck.length);
  const topCards = ps.deck.slice(0, lookCount);
  const newDeck = ps.deck.slice(lookCount);
  const newHand = [...ps.hand];

  const summonCards: string[] = [];
  const putBackCards: typeof topCards = [];

  for (const card of topCards) {
    if (card.keywords && card.keywords.includes('Summon')) {
      newHand.push(card);
      summonCards.push(card.name_fr);
    } else {
      putBackCards.push(card);
    }
  }

  // Put non-Summon cards back on top of deck
  ps.deck = [...putBackCards, ...newDeck];
  ps.hand = newHand;

  const newState = { ...state, [sourcePlayer]: ps };

  if (summonCards.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT',
      `Tayuya (065): Looked at top ${lookCount} card(s) of deck. No Summon cards found. Cards put back on top.`,
      'game.log.effect.lookAtDeck',
      { card: 'TAYUYA', id: '065/130', count: String(lookCount) },
    );
    return { state: { ...newState, log } };
  }

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_DRAW',
    `Tayuya (065): Looked at top ${lookCount} card(s), drew ${summonCards.length} Summon card(s): ${summonCards.join(', ')}. Rest put back on top.`,
    'game.log.effect.draw',
    { card: 'TAYUYA', id: '065/130', count: String(summonCards.length) },
  );

  return { state: { ...newState, log } };
}

function powerUpTarget(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  amount: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  let targetName = '';

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
  }));

  newState.log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_POWERUP',
    `Tayuya (065): POWERUP ${amount} on ${targetName} (ambush).`,
    'game.log.effect.powerup',
    { card: 'TAYUYA', id: '065/130', amount: String(amount), target: targetName },
  );

  return newState;
}

export function registerTayuya065Handlers(): void {
  registerEffect('065/130', 'AMBUSH', handleTayuya065Ambush);
  registerEffect('065/130', 'UPGRADE', handleTayuya065Upgrade);
}
