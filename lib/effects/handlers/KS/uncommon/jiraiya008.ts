import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 008/130 - JIRAYA "Doton, Les Marecages des Limbes" (UC)
 * Chakra: 5 | Power: 5
 * Group: Leaf Village | Keywords: Sannin, Jutsu
 *
 * MAIN: Play a Summon character anywhere, paying 2 less.
 *   - Player chooses which Summon card from hand, then which mission to place it on.
 *   - Two-stage target selection via playSummonFromHandWithReduction.
 *
 * UPGRADE: Hide an enemy character with cost 3 or less in this mission.
 */
function handleJiraiya008Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find all Summon cards in hand that the player can afford at cost-2
  const affordableSummonIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      const reducedCost = Math.max(0, card.chakra - 2);
      if (playerState.chakra >= reducedCost) {
        affordableSummonIndices.push(String(i));
      }
    }
  }

  if (affordableSummonIndices.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No affordable Summon character in hand.',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-008-UC' }) } };
  }

  // Player chooses which Summon to play (stage 1)
  // Stage 2 (mission choice) is handled by playSummonFromHandWithReduction in EffectEngine
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA008_CHOOSE_SUMMON',
    validTargets: affordableSummonIndices,
    description: 'Jiraiya (008): Choose a Summon character from your hand to play (paying 2 less).',
    descriptionKey: 'game.effect.desc.jiraiya008ChooseSummon',
  };
}

function handleJiraiya008Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const upgradeMission = state.activeMissions[sourceMissionIndex];
  if (!upgradeMission) return { state };

  const hideTargets: string[] = [];
  for (const char of upgradeMission[enemySide]) {
    if (char.isHidden) continue;
    const tc = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (tc.chakra <= 3) {
      hideTargets.push(char.instanceId);
    }
  }

  if (hideTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (008): No enemy character with cost 3 or less to hide (upgrade).',
      'game.log.effect.noTarget', { card: 'JIRAYA', id: 'KS-008-UC' }) } };
  }

  // Always let player choose (optional effect)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA_HIDE_ENEMY_COST_3',
    validTargets: hideTargets,
    description: 'Jiraiya (008): Select an enemy character with cost 3 or less in this mission to hide (upgrade effect).',
    descriptionKey: 'game.effect.desc.jiraiya008HideEnemy',
  };
}

export function registerJiraiya008Handlers(): void {
  registerEffect('KS-008-UC', 'MAIN', handleJiraiya008Main);
  registerEffect('KS-008-UC', 'UPGRADE', handleJiraiya008Upgrade);
}
