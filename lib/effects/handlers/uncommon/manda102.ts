import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { defeatEnemyCharacter } from '../../defeatUtils';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 102/130 - MANDA (UC)
 * Chakra: 4 | Power: 6
 * Group: Independent | Keywords: Summon
 *
 * AMBUSH: Defeat an enemy character with keyword "Summon" in this mission.
 *   - Triggered only when Manda is revealed from hidden (AMBUSH).
 *   - Find non-hidden enemy characters in this mission with keyword "Summon".
 *   - If exactly 1 valid target, auto-defeat.
 *   - If multiple valid targets, requires target selection.
 *
 * MAIN [hourglass]: At end of round, must return this character to hand.
 *   - Continuous effect handled by the engine in EndPhase.
 *   - The handler registers a no-op for the continuous return-to-hand.
 */

function handleManda102Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = mission[enemySide];

  // Find non-hidden enemy characters with keyword "Summon" in this mission
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Summon')) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Manda (102): No enemy character with keyword "Summon" in this mission.',
      'game.log.effect.noTarget',
      { card: 'MANDA', id: '102/130' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one target, auto-defeat
  if (validTargets.length === 1) {
    let newState = defeatEnemyCharacter(state, sourceMissionIndex, validTargets[0], sourcePlayer);
    // Find the target name for logging
    const targetChar = enemyChars.find((c) => c.instanceId === validTargets[0]);
    const targetName = targetChar ? targetChar.card.name_fr : 'unknown';
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_DEFEAT',
      `Manda (102): [AMBUSH] Defeated enemy Summon ${targetName} in this mission.`,
      'game.log.effect.defeat',
      { card: 'MANDA', id: '102/130', target: targetName },
    );
    return { state: { ...newState, log } };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_ENEMY_SUMMON_THIS_MISSION',
    validTargets,
    description: 'Manda (102) AMBUSH: Select an enemy character with keyword "Summon" in this mission to defeat.',
  };
}

function handleManda102Main(ctx: EffectContext): EffectResult {
  // Continuous [hourglass]: return to hand at end of round.
  // This is handled passively by EndPhase.ts.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Manda (102): Must return to hand at end of round (continuous).',
    'game.log.effect.continuous',
    { card: 'MANDA', id: '102/130' },
  );
  return { state: { ...state, log } };
}

export function registerManda102Handlers(): void {
  registerEffect('102/130', 'AMBUSH', handleManda102Ambush);
  registerEffect('102/130', 'MAIN', handleManda102Main);
}
