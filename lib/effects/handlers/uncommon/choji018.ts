import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 018/130 - CHOJI AKIMICHI "Le Boulet Humain" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * MAIN [continuous]: After you move this character, hide an enemy character in this
 * mission with less Power than this character.
 *   - This is a continuous/passive effect. The actual trigger logic is handled in
 *     ContinuousEffects.ts (checked when a character is moved).
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: Move this character.
 *   - When triggered as upgrade, find other missions where this character can move
 *     (no same-name conflict). If multiple valid destinations, require target selection.
 *   - Move self to the chosen mission.
 *   - After moving, the continuous MAIN effect should trigger (hiding an enemy with less Power).
 */
function handleChoji018Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - after moving, hide an enemy with less Power.
  // This is passively checked in ContinuousEffects.ts.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Choji Akimichi (018): After moving, will hide an enemy character with less Power in the destination mission (continuous).',
    'game.log.effect.continuous',
    { card: 'CHOJI AKIMICHI', id: '018/130' },
  );
  return { state: { ...state, log } };
}

function handleChoji018Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (not current mission, no same-name conflict)
  const validTargets: string[] = [];
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    if (mIdx === sourceMissionIndex) continue;

    const mission = state.activeMissions[mIdx];
    const friendlyChars = mission[friendlySide];

    const hasSameName = friendlyChars.some(c => {
      if (c.instanceId === sourceCard.instanceId) return false;
      const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.name_fr === charName;
    });

    if (!hasSameName) {
      validTargets.push(`mission_${mIdx}`);
    }
  }

  // If no valid destination, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Choji Akimichi (018): No valid mission to move to (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: '018/130' }) } };
  }

  // If exactly one valid destination, auto-move
  if (validTargets.length === 1) {
    const destMissionIdx = parseInt(validTargets[0].replace('mission_', ''), 10);
    const newState = moveCharacterToMission(state, sourceCard.instanceId, sourceMissionIndex, destMissionIdx, sourcePlayer);
    return { state: newState };
  }

  // Multiple valid destinations: requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI_018_MOVE_SELF',
    validTargets,
    description: 'Select a mission to move Choji Akimichi to (upgrade effect).',
  };
}

function moveCharacterToMission(
  state: import('../../EffectTypes').EffectContext['state'],
  charInstanceId: string,
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const newState = { ...state };
  const missions = [...state.activeMissions];
  const fromMission = { ...missions[fromMissionIdx] };
  const toMission = { ...missions[toMissionIdx] };

  const fromChars = [...fromMission[friendlySide]];
  const toChars = [...toMission[friendlySide]];

  // Find and remove character from source mission
  const charIdx = fromChars.findIndex(c => c.instanceId === charInstanceId);
  if (charIdx === -1) return state;

  const movedChar = { ...fromChars[charIdx], missionIndex: toMissionIdx };
  fromChars.splice(charIdx, 1);
  toChars.push(movedChar);

  fromMission[friendlySide] = fromChars;
  toMission[friendlySide] = toChars;
  missions[fromMissionIdx] = fromMission;
  missions[toMissionIdx] = toMission;

  newState.activeMissions = missions;
  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_MOVE',
    `Choji Akimichi (018): Moved self from mission ${fromMissionIdx + 1} to mission ${toMissionIdx + 1} (upgrade effect).`,
    'game.log.effect.moveSelf',
    { card: 'CHOJI AKIMICHI', id: '018/130', from: String(fromMissionIdx + 1), to: String(toMissionIdx + 1) },
  );

  return newState;
}

export function registerChoji018Handlers(): void {
  registerEffect('018/130', 'MAIN', handleChoji018Main);
  registerEffect('018/130', 'UPGRADE', handleChoji018Upgrade);
}
