import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

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

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

/**
 * Helper: find characters with exactly the given power in the source mission,
 * defeat one (auto if single target, prompt selection if multiple).
 */
function defeatCharacterWithExactPower(
  ctx: EffectContext,
  targetPower: number,
  selectionType: string,
  label: string,
): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const mission = state.activeMissions[sourceMissionIndex];

  // Find all characters with exactly the target power (any player, not self, not hidden)
  const validTargets: Array<{ instanceId: string; isEnemy: boolean }> = [];

  for (const char of mission[friendlySide]) {
    if (char.instanceId !== sourceCard.instanceId && !char.isHidden && getEffectivePower(char) === targetPower) {
      validTargets.push({ instanceId: char.instanceId, isEnemy: false });
    }
  }
  for (const char of mission[enemySide]) {
    if (!char.isHidden && getEffectivePower(char) === targetPower) {
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
          { card: 'NEJI HYUGA', id: '116/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    const target = validTargets[0];
    let newState: EffectContext['state'];
    if (target.isEnemy) {
      newState = defeatEnemyCharacter(state, sourceMissionIndex, target.instanceId, sourcePlayer);
    } else {
      newState = defeatFriendlyCharacter(state, sourceMissionIndex, target.instanceId, sourcePlayer);
    }
    // Find the target name for logging
    const allChars = [...mission[friendlySide], ...mission[enemySide]];
    const targetChar = allChars.find((c) => c.instanceId === target.instanceId);
    const targetName = targetChar ? targetChar.card.name_fr : 'Unknown';

    return {
      state: {
        ...newState,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_DEFEAT',
          `Neji Hyuga (116) ${label}: Defeated ${targetName} (exactly Power ${targetPower}).`,
          'game.log.effect.defeat',
          { card: 'NEJI HYUGA', id: '116/130', target: targetName },
        ),
      },
    };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: selectionType,
    validTargets: validTargets.map((t) => t.instanceId),
    description: `Neji Hyuga (116) ${label}: Choose a character with exactly Power ${targetPower} to defeat.`,
  };
}

function neji116MainHandler(ctx: EffectContext): EffectResult {
  // MAIN always targets Power 4, regardless of whether this is an upgrade
  return defeatCharacterWithExactPower(ctx, 4, 'NEJI116_DEFEAT_POWER4', 'MAIN');
}

function neji116UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE is a standalone additional effect: defeat a character with exactly Power 6
  return defeatCharacterWithExactPower(ctx, 6, 'NEJI116_DEFEAT_POWER6', 'UPGRADE');
}

export function registerNeji116Handlers(): void {
  registerEffect('116/130', 'MAIN', neji116MainHandler);
  registerEffect('116/130', 'UPGRADE', neji116UpgradeHandler);
}
