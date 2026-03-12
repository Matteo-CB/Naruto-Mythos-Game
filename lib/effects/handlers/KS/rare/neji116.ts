import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 116/130 - NEJI HYUGA (R)
 * Chakra: 4, Power: 4
 * Group: Leaf Village, Keywords: Team Guy
 *
 * MAIN: Defeat a character in this mission with exactly Power 4.
 *   Find all non-hidden characters (any player, not self) in this mission with
 *   effective power == 4. Target selection if multiple. Defeat the selected target.
 *
 * UPGRADE: Defeat a character with exactly Power 6 in this mission.
 *   This is a STANDALONE additional effect (no "MAIN effect:" prefix in JSON).
 *   When upgrading, BOTH MAIN and UPGRADE fire independently:
 *   - MAIN defeats a character with exactly Power 4
 *   - UPGRADE defeats a character with exactly Power 6
 */

/**
 * Helper: find characters with exactly the given power in the source mission.
 * Always prompts for target selection (effect is optional).
 */
function defeatCharacterWithExactPower(
  ctx: EffectContext,
  targetPower: number,
  selectionType: string,
  label: string,
): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const mission = state.activeMissions[sourceMissionIndex];

  // Find all characters with exactly the target power (any player, not self, not hidden)
  const validTargets: Array<{ instanceId: string; isEnemy: boolean }> = [];

  for (const char of mission[friendlySide]) {
    if (char.instanceId !== sourceCard.instanceId && !char.isHidden && getEffectivePower(state, char, sourcePlayer) === targetPower) {
      validTargets.push({ instanceId: char.instanceId, isEnemy: false });
    }
  }
  for (const char of mission[enemySide]) {
    if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) === targetPower) {
      validTargets.push({ instanceId: char.instanceId, isEnemy: true });
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Neji Hyuga (116) ${label}: No character with exactly Power ${targetPower} in this mission.`,
          'game.log.effect.noTarget',
          { card: 'NEJI HYUGA', id: 'KS-116-R' },
        ),
      },
    };
  }

  // Always prompt for target selection (effect is optional — no "you must")
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: selectionType,
    validTargets: validTargets.map((t) => t.instanceId),
    description: `Neji Hyuga (116) ${label}: Choose a character with exactly Power ${targetPower} to defeat.`,
    descriptionKey: label === 'MAIN' ? 'game.effect.desc.neji116DefeatPower4' : 'game.effect.desc.neji116DefeatPower6',
    descriptionParams: { power: targetPower },
  };
}

function hasCharacterWithExactPower(ctx: EffectContext, targetPower: number): boolean {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];

  for (const char of mission[friendlySide]) {
    if (char.instanceId !== sourceCard.instanceId && !char.isHidden && getEffectivePower(state, char, sourcePlayer) === targetPower) {
      return true;
    }
  }
  for (const char of mission[enemySide]) {
    if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) === targetPower) {
      return true;
    }
  }
  return false;
}

function neji116MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: any character with exactly Power 4 in this mission?
  if (!hasCharacterWithExactPower(ctx, 4)) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Neji Hyuga (116) MAIN: No character with exactly Power 4 in this mission.',
          'game.log.effect.noTarget',
          { card: 'NEJI HYUGA', id: 'KS-116-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NEJI116_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Neji Hyuga (116) MAIN: Defeat a character with exactly Power 4 in this mission.',
    descriptionKey: 'game.effect.desc.neji116ConfirmMain',
  };
}

function neji116UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: any character with exactly Power 6 in this mission?
  if (!hasCharacterWithExactPower(ctx, 6)) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Neji Hyuga (116) UPGRADE: No character with exactly Power 6 in this mission.',
          'game.log.effect.noTarget',
          { card: 'NEJI HYUGA', id: 'KS-116-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NEJI116_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Neji Hyuga (116) UPGRADE: Defeat a character with exactly Power 6 in this mission.',
    descriptionKey: 'game.effect.desc.neji116ConfirmUpgrade',
  };
}

export function registerNeji116Handlers(): void {
  registerEffect('KS-116-R', 'MAIN', neji116MainHandler);
  registerEffect('KS-116-R', 'UPGRADE', neji116UpgradeHandler);
}
