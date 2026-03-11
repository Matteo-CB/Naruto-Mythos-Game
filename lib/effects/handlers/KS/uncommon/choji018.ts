import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import type { PlayerID } from '@/lib/engine/types';
import { canBeHiddenByEnemy, isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';

/**
 * Card 018/130 - CHOJI AKIMICHI "Le Boulet Humain" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * MAIN [continuous]: After you move this character, hide an enemy character in this
 * mission with less Power than this character.
 *
 * UPGRADE: Move this character.
 *   - After moving, the continuous MAIN triggers: hide an enemy with less Power
 *     in the destination mission. Player chooses if multiple targets.
 */
function handleChoji018Main(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Choji Akimichi (018): After moving, will hide an enemy character with less Power in the destination mission (continuous).',
    'game.log.effect.continuous',
    { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' },
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

  // Check if Kurenai 035 blocks movement from this mission
  if (isMovementBlockedByKurenai(state, sourceMissionIndex, sourcePlayer)) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Choji Akimichi (018): Cannot move — Kurenai blocks movement from this mission.',
      'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' }) } };
  }

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
      validTargets.push(String(mIdx));
    }
  }

  // If no valid destination, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Choji Akimichi (018): No valid mission to move to (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' }) } };
  }

  // Confirmation popup before move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI018_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.choji018ConfirmUpgrade',
  };
}

/**
 * After Choji moves, find non-hidden enemy characters at his destination with less Power.
 * If 0: log no target. If 1: auto-hide. If multiple: return target selection.
 */
export function postMoveHide(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  chojiInstanceId: string,
  destMissionIdx: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): EffectResult {
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[destMissionIdx];
  const chojiChar = mission[friendlySide].find(c => c.instanceId === chojiInstanceId);
  if (!chojiChar) return { state };

  const enemyPlayer: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';
  // Use effective power (includes continuous effects like MSS02 +1, Sasuke -1/ally, etc.)
  const chojiPower = calculateCharacterPower(state, chojiChar, sourcePlayer);

  // Find non-hidden enemies with less effective power that can be hidden
  const hideTargets: string[] = [];
  for (const enemy of mission[enemySide]) {
    if (enemy.isHidden) continue;
    if (!canBeHiddenByEnemy(state, enemy, enemyPlayer)) continue;
    const enemyPower = calculateCharacterPower(state, enemy, enemyPlayer);
    if (enemyPower < chojiPower) {
      hideTargets.push(enemy.instanceId);
    }
  }

  if (hideTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Choji Akimichi (018): No enemy character with less Power to hide after moving.',
      'game.log.effect.noTarget',
      { card: 'CHOJI AKIMICHI', id: 'KS-018-UC' },
    );
    return { state: { ...state, log } };
  }

  if (hideTargets.length === 1) {
    // Auto-hide single target via hideCharacterWithLog (respects Gemma 049, Kimimaro 056, etc.)
    const targetId = hideTargets[0];
    let newState = EffectEngine.hideCharacterWithLog(state, targetId, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: player chooses (mandatory — continuous effect)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI018_HIDE_ENEMY',
    validTargets: hideTargets,
    isMandatory: true,
    description: 'Choji Akimichi (018): Choose an enemy character with less Power to hide.',
    descriptionKey: 'game.effect.desc.choji018HideEnemy',
  };
}

function moveCharacterToMission(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  charInstanceId: string,
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): import('@/lib/effects/EffectTypes').EffectContext['state'] {
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
    { card: 'CHOJI AKIMICHI', id: 'KS-018-UC', from: String(fromMissionIdx + 1), to: String(toMissionIdx + 1) },
  );

  return newState;
}

export function registerChoji018Handlers(): void {
  registerEffect('KS-018-UC', 'MAIN', handleChoji018Main);
  registerEffect('KS-018-UC', 'UPGRADE', handleChoji018Upgrade);
}
