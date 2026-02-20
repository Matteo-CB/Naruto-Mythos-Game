import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 141/130 - NARUTO UZUMAKI (M)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard a card from hand. If you do, hide an enemy with Power 4 or less
 *       in this mission.
 *   - Stage 1: Player must choose which card to discard from hand.
 *   - Stage 2: Then choose a non-hidden enemy in this mission with effective power <= 4.
 *   - If no cards in hand, the effect fizzles (cannot pay the cost).
 *   - If no valid enemy targets, the discard still happens but the hide fizzles.
 *   - For auto-resolution: discard the lowest-power card from hand, then hide
 *     the highest-power valid enemy target.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function naruto141MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = state[ctx.sourcePlayer];

  // Check if player has cards in hand to discard
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (141): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: '141/130' },
    );
    return { state: { ...state, log } };
  }

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Check if there are valid enemy targets in this mission
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const validEnemies = thisMission[enemySide].filter(
    (c) => !c.isHidden && getEffectivePower(c) <= 4,
  );

  // If multiple cards in hand, let player choose which to discard
  if (playerState.hand.length > 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'NARUTO141_CHOOSE_DISCARD',
      validTargets: playerState.hand.map((_, i) => String(i)),
      description: 'Naruto Uzumaki (141): Choose a card from your hand to discard.',
    };
  }

  // Auto-resolve: only 1 card in hand, discard it
  const ps = { ...state[ctx.sourcePlayer] };
  const hand = [...ps.hand];
  const discarded = hand.splice(0, 1)[0];
  ps.hand = hand;
  ps.discardPile = [...ps.discardPile, discarded];

  state = {
    ...state,
    [ctx.sourcePlayer]: ps,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_DISCARD',
      `Naruto Uzumaki (141): Discarded ${discarded.name_fr} from hand.`,
      'game.log.effect.discardSelf',
      { card: 'NARUTO UZUMAKI', id: '141/130', target: discarded.name_fr },
    ),
  };

  // Now hide an enemy with Power 4 or less in this mission
  if (validEnemies.length === 0) {
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Naruto Uzumaki (141): No enemy with Power 4 or less in this mission to hide.',
        'game.log.effect.noTarget',
        { card: 'NARUTO UZUMAKI', id: '141/130' },
      ),
    };
    return { state };
  }

  if (validEnemies.length > 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'NARUTO141_CHOOSE_HIDE_TARGET',
      validTargets: validEnemies.map((c) => c.instanceId),
      description: 'Naruto Uzumaki (141): Choose an enemy with Power 4 or less to hide.',
    };
  }

  // Auto-resolve: single target
  const target = validEnemies[0];
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };
  const enemyChars = [...mission[enemySide]];
  const idx = enemyChars.findIndex((c) => c.instanceId === target.instanceId);

  if (idx !== -1) {
    enemyChars[idx] = { ...enemyChars[idx], isHidden: true };
    mission[enemySide] = enemyChars;
    missions[ctx.sourceMissionIndex] = mission;

    state = {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_HIDE',
        `Naruto Uzumaki (141): Hid enemy ${target.card.name_fr} in this mission.`,
        'game.log.effect.hide',
        { card: 'NARUTO UZUMAKI', id: '141/130', target: target.card.name_fr, mission: `mission ${ctx.sourceMissionIndex}` },
      ),
    };
  }

  return { state };
}

export function registerNaruto141Handlers(): void {
  registerEffect('141/130', 'MAIN', naruto141MainHandler);
}
