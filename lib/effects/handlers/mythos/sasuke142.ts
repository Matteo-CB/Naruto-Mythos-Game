import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 142/130 - SASUKE UCHIWA (M)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard a card from hand. If you do, POWERUP X+1 where X = number
 *       of enemy characters in this mission.
 *   - Player must discard a card from hand first (cost).
 *   - If no cards in hand, the effect fizzles.
 *   - Count ALL enemy characters in this mission (including hidden ones).
 *   - Then apply POWERUP (X+1) on self.
 *   - For auto-resolution: discard the lowest-power card from hand.
 */

function sasuke142MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = state[ctx.sourcePlayer];

  // Check if player has cards in hand to discard
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (142): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'SASUKE UCHIWA', id: '142/130' },
    );
    return { state: { ...state, log } };
  }

  // If multiple cards in hand, let player choose which to discard
  if (playerState.hand.length > 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SASUKE142_CHOOSE_DISCARD',
      validTargets: playerState.hand.map((_, i) => String(i)),
      description: 'Sasuke Uchiwa (142): Choose a card from your hand to discard.',
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
      `Sasuke Uchiwa (142): Discarded ${discarded.name_fr} from hand.`,
      'game.log.effect.discardSelf',
      { card: 'SASUKE UCHIWA', id: '142/130', target: discarded.name_fr },
    ),
  };

  // Count enemy characters in this mission
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const enemyCount = thisMission[enemySide].length;
  const powerupAmount = enemyCount + 1;

  // POWERUP on self
  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };
  const friendlyChars = [...mission[friendlySide]];
  const selfIdx = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (selfIdx !== -1) {
    friendlyChars[selfIdx] = {
      ...friendlyChars[selfIdx],
      powerTokens: friendlyChars[selfIdx].powerTokens + powerupAmount,
    };
    mission[friendlySide] = friendlyChars;
    missions[ctx.sourceMissionIndex] = mission;

    state = {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_POWERUP',
        `Sasuke Uchiwa (142): POWERUP ${powerupAmount} (X+1, X=${enemyCount} enemy characters in this mission).`,
        'game.log.effect.powerupSelf',
        { card: 'SASUKE UCHIWA', id: '142/130', amount: powerupAmount },
      ),
    };
  }

  return { state };
}

export function registerSasuke142Handlers(): void {
  registerEffect('142/130', 'MAIN', sasuke142MainHandler);
}
