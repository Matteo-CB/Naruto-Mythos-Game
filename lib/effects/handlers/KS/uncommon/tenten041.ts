import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatCharacterInPlay } from '@/lib/effects/defeatUtils';

/**
 * Card 041/130 - TENTEN (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team Guy, Weapon
 *
 * MAIN: Defeat a hidden character in this mission.
 *   - Find ALL hidden characters (both friendly and enemy) in this mission, excluding self.
 *   - If exactly one valid target, auto-apply.
 *   - If multiple targets, require target selection.
 *   - Defeat the target (using defeatCharacterInPlay to respect replacements).
 *
 * UPGRADE: POWERUP 1 another Leaf Village character in play (any mission).
 *   - Find all non-hidden Leaf Village characters across all missions, excluding self.
 *   - If exactly one valid target, auto-apply POWERUP 1.
 *   - If multiple targets, require target selection.
 */

function handleTenten041Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Find all hidden characters in this mission (both sides), excluding self
  const validTargets: string[] = [];

  for (const char of mission.player1Characters) {
    if (char.isHidden && char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }
  for (const char of mission.player2Characters) {
    if (char.isHidden && char.instanceId !== sourceCard.instanceId) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (041): No hidden character in this mission to defeat.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-041-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN041_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.tenten041ConfirmMain',
  };
}

function handleTenten041Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  // Find all non-hidden Leaf Village characters across all missions, excluding self
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.group === 'Leaf Village') {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (041): No other Leaf Village character in play to power up.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-041-UC' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN041_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.tenten041ConfirmUpgrade',
  };
}

function powerUpTarget(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  amount: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): import('@/lib/effects/EffectTypes').EffectContext['state'] {
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
    `Tenten (041): POWERUP ${amount} on ${targetName} (upgrade).`,
    'game.log.effect.powerup',
    { card: 'TENTEN', id: 'KS-041-UC', amount: String(amount), target: targetName },
  );

  return newState;
}

export function registerTenten041Handlers(): void {
  registerEffect('KS-041-UC', 'MAIN', handleTenten041Main);
  registerEffect('KS-041-UC', 'UPGRADE', handleTenten041Upgrade);
}
