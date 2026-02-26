import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 132/130 - JIRAYA (S)
 * Chakra: 7, Power: 6
 * Group: Leaf Village, Keywords: Sannin
 *
 * MAIN: Play a Summon character from your hand anywhere, paying 5 less.
 *   - Find all character cards in hand with the "Summon" keyword.
 *   - The player can afford the card at (cost - 5, minimum 0).
 *   - If no Summon characters in hand or none affordable, fizzles.
 *
 * UPGRADE: The opponent must choose characters to be defeated until they
 *   only have up to 2 assigned per mission.
 *   - The OPPONENT selects which of their characters to defeat.
 *   - Processed one mission at a time, one defeat at a time.
 */

function jiraiya132MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };

  // Find Summon characters in hand that are affordable at cost - 5
  const affordableSummons: { handIndex: number; reducedCost: number }[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.card_type === 'character' && card.keywords && card.keywords.includes('Summon')) {
      const reducedCost = Math.max(0, card.chakra - 5);
      if (playerState.chakra >= reducedCost) {
        affordableSummons.push({ handIndex: i, reducedCost });
      }
    }
  }

  if (affordableSummons.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Jiraya (132): No affordable Summon character in hand to play.',
      'game.log.effect.noTarget',
      { card: 'JIRAYA', id: 'KS-132-S' },
    );
    return { state: { ...state, log } };
  }

  // Player chooses which Summon to play (stage 1)
  // Stage 2 (mission choice) is handled by playSummonFromHandWithReduction in EffectEngine
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA132_CHOOSE_SUMMON',
    validTargets: affordableSummons.map((s) => String(s.handIndex)),
    description: 'Jiraya (132): Choose a Summon character from your hand to play (paying 5 less).',
    descriptionKey: 'game.effect.desc.jiraiya132ChooseSummon',
  };
}

function jiraiya132UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const opponent = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Check each mission for > 2 enemy characters
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];

    if (enemyChars.length > 2) {
      // Opponent must choose which to defeat (one at a time)
      const validTargets = enemyChars.map((c) => c.instanceId);
      return {
        state,
        requiresTargetSelection: true,
        targetSelectionType: 'JIRAIYA132_OPPONENT_CHOOSE_DEFEAT',
        validTargets,
        selectingPlayer: opponent,
        description: JSON.stringify({
          missionIndex: i,
          sourcePlayer: ctx.sourcePlayer,
          text: `Jiraya (132) UPGRADE: Choose one of your characters to defeat in mission ${i + 1} (${enemyChars.length} > 2).`,
        }),
        descriptionKey: 'game.effect.desc.jiraiya132OpponentChooseDefeat',
        descriptionParams: { mission: String(i + 1), count: String(enemyChars.length) },
      };
    }
  }

  // All missions already have <= 2 enemy characters
  return { state };
}

export function registerJiraiya132Handlers(): void {
  registerEffect('KS-132-S', 'MAIN', jiraiya132MainHandler);
  registerEffect('KS-132-S', 'UPGRADE', jiraiya132UpgradeHandler);
}
