import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 033/130 - SHINO ABURAME (UC)
 * Chakra: 5 | Power: 3
 * Group: Leaf Village | Keywords: Team 8
 *
 * AMBUSH: Play this character paying 4 less if there is an enemy character
 * with keyword "Jutsu" in this mission.
 *   - The cost reduction is handled by the engine at play time.
 *   - The AMBUSH handler logs whether the condition was met.
 *   - No additional state changes needed; the cost was already paid.
 *
 * UPGRADE: Move this character to another mission.
 *   - Find other missions where this character can legally move (no same-name conflict).
 *   - If multiple valid destinations, require target selection.
 *   - Move self to the chosen mission.
 */

function handleShino033Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemyChars = mission[enemySide];

  // Check if any enemy character in this mission has the "Jutsu" keyword
  const hasJutsuEnemy = enemyChars.some((char) => {
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Jutsu');
  });

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT',
    hasJutsuEnemy
      ? 'Shino Aburame (033): Ambush triggered with Jutsu enemy present - cost reduced by 4.'
      : 'Shino Aburame (033): Ambush triggered - no Jutsu enemy in this mission.',
    'game.log.effect.ambush',
    { card: 'SHINO ABURAME', id: '033/130' },
  );

  return { state: { ...state, log } };
}

function handleShino033Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Get the name of this character (top of stack)
  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (no same-name conflict, not current mission)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];

    // Check name uniqueness constraint
    const hasSameName = friendlyChars.some((c) => {
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === charName;
    });
    if (!hasSameName) {
      validTargets.push(String(i));
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shino Aburame (033): No valid mission to move to.',
      'game.log.effect.noTarget', { card: 'SHINO ABURAME', id: '033/130' }) } };
  }

  // If only one valid destination, auto-apply
  if (validTargets.length === 1) {
    const destIdx = parseInt(validTargets[0], 10);
    const newState = moveCharacter(state, sourceCard.instanceId, sourceMissionIndex, destIdx, sourcePlayer, friendlySide);
    return { state: newState };
  }

  // Multiple destinations: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO_MOVE_SELF',
    validTargets,
    description: 'Select a mission to move Shino Aburame to.',
  };
}

function moveCharacter(
  state: import('../../EffectTypes').EffectContext['state'],
  charInstanceId: string,
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  side: 'player1Characters' | 'player2Characters',
): import('../../EffectTypes').EffectContext['state'] {
  const missions = [...state.activeMissions];
  const fromMission = { ...missions[fromMissionIdx] };
  const toMission = { ...missions[toMissionIdx] };

  const fromChars = [...fromMission[side]];
  const charIdx = fromChars.findIndex((c) => c.instanceId === charInstanceId);
  if (charIdx === -1) return state;

  const movedChar = { ...fromChars[charIdx], missionIndex: toMissionIdx };
  fromChars.splice(charIdx, 1);
  fromMission[side] = fromChars;

  const toChars = [...toMission[side], movedChar];
  toMission[side] = toChars;

  missions[fromMissionIdx] = fromMission;
  missions[toMissionIdx] = toMission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_MOVE',
    `Shino Aburame (033): Moved self from mission ${fromMissionIdx + 1} to mission ${toMissionIdx + 1} (upgrade).`,
    'game.log.effect.move',
    { card: 'SHINO ABURAME', id: '033/130', from: String(fromMissionIdx + 1), to: String(toMissionIdx + 1) },
  );

  return { ...state, activeMissions: missions, log };
}

export function registerShino033Handlers(): void {
  registerEffect('033/130', 'AMBUSH', handleShino033Ambush);
  registerEffect('033/130', 'UPGRADE', handleShino033Upgrade);
}
