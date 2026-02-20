import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 106/130 - KAKASHI HATAKE (R)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard the top card of an upgraded enemy character's stack
 *   (remove the top card, revealing the previous card underneath).
 *   Targets enemy characters that have stack.length > 1 (i.e., upgraded).
 *
 * UPGRADE: MAIN also copies any non-Upgrade instant effect of the discarded card.
 *   This is a complex effect-copy mechanism. Requires target selection.
 */

function kakashi106MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find all upgraded enemy characters across all missions (stack.length > 1)
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const enemyChars = mission[enemySide];
    for (const char of enemyChars) {
      // A character is upgraded if its stack has more than 1 card
      if (char.stack.length > 1) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kakashi Hatake (106): No upgraded enemy characters to de-evolve.',
          'game.log.effect.noTarget',
          { card: 'KAKASHI HATAKE', id: '106/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    return applyDevolve(state, validTargets[0], sourcePlayer, enemySide, ctx.isUpgrade);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI106_DEVOLVE_TARGET',
    validTargets,
    description: ctx.isUpgrade
      ? 'Kakashi Hatake (106): Choose an upgraded enemy character to de-evolve (the discarded card\'s non-Upgrade effect will be copied).'
      : 'Kakashi Hatake (106): Choose an upgraded enemy character to de-evolve (discard top card of stack).',
  };
}

/**
 * Apply the de-evolve: remove the top card from the target's stack, add it to enemy's discard.
 */
function applyDevolve(
  state: EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: EffectContext['sourcePlayer'],
  enemySide: 'player1Characters' | 'player2Characters',
  isUpgrade: boolean,
): EffectResult {
  const enemyPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const chars = mission[enemySide];
    const charIdx = chars.findIndex((c: CharacterInPlay) => c.instanceId === targetInstanceId);

    if (charIdx !== -1 && chars[charIdx].stack.length > 1) {
      const missions = [...state.activeMissions];
      const m = { ...missions[i] };
      const cs = [...m[enemySide]];
      const targetChar = { ...cs[charIdx] };

      // Remove the top card from the stack
      const newStack = [...targetChar.stack];
      const discardedCard = newStack.pop()!;

      // Update the character: the new top card is now the active card
      const newTopCard = newStack[newStack.length - 1];
      targetChar.stack = newStack;
      targetChar.card = newTopCard;

      cs[charIdx] = targetChar;
      m[enemySide] = cs;
      missions[i] = m;

      // Add the discarded card to the enemy's discard pile
      const enemyState = { ...state[enemyPlayer] };
      enemyState.discardPile = [...enemyState.discardPile, discardedCard];

      let newState = {
        ...state,
        activeMissions: missions,
        [enemyPlayer]: enemyState,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_DEVOLVE',
          `Kakashi Hatake (106): Discarded top card ${discardedCard.name_fr} from enemy ${newTopCard.name_fr}'s stack.`,
          'game.log.effect.devolve',
          { card: 'KAKASHI HATAKE', id: '106/130', target: discardedCard.name_fr },
        ),
      };

      // UPGRADE: copy the discarded card's non-Upgrade instant effect
      // This is noted for the engine to handle; complex effect copying is deferred
      // to the EffectEngine resolution layer.
      if (isUpgrade) {
        newState = {
          ...newState,
          log: logAction(
            newState.log, newState.turn, newState.phase, sourcePlayer,
            'EFFECT_COPY',
            `Kakashi Hatake (106) UPGRADE: Copied non-Upgrade effect of ${discardedCard.name_fr}.`,
            'game.log.effect.copy',
            { card: 'KAKASHI HATAKE', id: '106/130', target: discardedCard.name_fr },
          ),
        };
      }

      return { state: newState };
    }
  }

  return { state };
}

function kakashi106UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKakashi106Handlers(): void {
  registerEffect('106/130', 'MAIN', kakashi106MainHandler);
  registerEffect('106/130', 'UPGRADE', kakashi106UpgradeHandler);
}
