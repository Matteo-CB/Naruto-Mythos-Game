import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 007/130 - JIRAYA (Common)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Sannin
 * MAIN: Play a Summon character anywhere, paying 1 less.
 *
 * Two-stage target selection:
 *   Stage 1: JIRAIYA_CHOOSE_SUMMON — choose which Summon card from hand
 *   Stage 2: JIRAIYA_CHOOSE_MISSION — choose which mission to play it on
 */
function handleJiraiya007Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find all Summon cards in hand that the player could afford (cost - 1)
  const affordableSummonIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      const cost = Math.max(0, card.chakra - 1);
      if (playerState.chakra >= cost) {
        affordableSummonIndices.push(String(i));
      }
    }
  }

  if (affordableSummonIndices.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (007): No affordable Summon characters in hand.',
      'game.log.effect.noTarget', { card: 'JIRAIYA', id: '007/130' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA_CHOOSE_SUMMON',
    validTargets: affordableSummonIndices,
    description: 'Jiraiya (007): Choose a Summon character from your hand to play (paying 1 less).',
  };
}

export function registerHandler(): void {
  registerEffect('007/130', 'MAIN', handleJiraiya007Main);
}
