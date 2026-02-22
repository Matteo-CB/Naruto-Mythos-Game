import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 137/130 - KAKASHI HATAKE "L'Eclair Pourfendeur" (S)
 * Chakra: 7, Power: 7
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * UPGRADE: Move this character (to another mission).
 * MAIN: Hide an upgraded character in this mission.
 *   - Target: any non-hidden character (friend or foe) with stack.length >= 2 (upgraded).
 *   - The target is set to hidden (isHidden = true).
 */

function kakashi137MainHandler(ctx: EffectContext): EffectResult {
  // MAIN: Hide an upgraded character in this mission (friend or foe, stack >= 2).
  let state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  // Search both sides for an upgraded, non-hidden character (not self)
  let targetSide: 'player1Characters' | 'player2Characters' | null = null;
  let targetIndex = -1;
  let target: CharacterInPlay | null = null;

  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const chars = mission[side];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (
        !c.isHidden &&
        c.stack.length >= 2 &&
        c.instanceId !== ctx.sourceCard.instanceId
      ) {
        targetSide = side;
        targetIndex = i;
        target = c;
        break;
      }
    }
    if (target) break;
  }

  if (!target || !targetSide || targetIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (137): No upgraded character in this mission to hide.',
      'game.log.effect.noTarget',
      { card: 'KAKASHI HATAKE', id: 'KS-137-S' },
    );
    return { state: { ...state, log } };
  }

  const chars = [...mission[targetSide]];
  chars[targetIndex] = { ...target, isHidden: true };
  mission[targetSide] = chars;
  missions[ctx.sourceMissionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_HIDE',
    `Kakashi Hatake (137): Hid upgraded ${target.card.name_fr} in this mission.`,
    'game.log.effect.hide',
    { card: 'KAKASHI HATAKE', id: 'KS-137-S', target: target.card.name_fr, mission: `mission ${ctx.sourceMissionIndex}` },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

function kakashi137UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE: Move this character to another mission (respecting name uniqueness).
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find valid destination missions (not current, no same-name conflict)
  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      if (c.instanceId === sourceCard.instanceId) return false;
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === charName;
    });
    if (!hasSameName) {
      validMissions.push(String(i));
    }
  }

  if (validMissions.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (137): No valid mission to move to (upgrade).',
      'game.log.effect.noTarget',
      { card: 'KAKASHI HATAKE', id: 'KS-137-S' },
    );
    return { state: { ...state, log } };
  }

  // Auto-move if only one valid destination
  if (validMissions.length === 1) {
    const destIdx = parseInt(validMissions[0], 10);
    const newState = moveKakashi137(state, sourceCard, sourceMissionIndex, destIdx, sourcePlayer, friendlySide);
    return { state: newState };
  }

  // Multiple destinations: require target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI137_MOVE_SELF',
    validTargets: validMissions,
    description: 'Kakashi Hatake (137) UPGRADE: Select a mission to move this character to.',
  };
}

function moveKakashi137(
  state: EffectContext['state'],
  sourceCard: EffectContext['sourceCard'],
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectContext['state'] {
  const missions = [...state.activeMissions];
  const fromMission = { ...missions[fromMissionIdx] };
  const toMission = { ...missions[toMissionIdx] };

  const fromChars = [...fromMission[friendlySide]];
  const charIdx = fromChars.findIndex((c) => c.instanceId === sourceCard.instanceId);
  if (charIdx === -1) return state;

  const movedChar = { ...fromChars[charIdx], missionIndex: toMissionIdx };
  fromChars.splice(charIdx, 1);
  fromMission[friendlySide] = fromChars;
  toMission[friendlySide] = [...toMission[friendlySide], movedChar];
  missions[fromMissionIdx] = fromMission;
  missions[toMissionIdx] = toMission;

  const log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_MOVE',
    `Kakashi Hatake (137): Moved self from mission ${fromMissionIdx + 1} to mission ${toMissionIdx + 1} (upgrade).`,
    'game.log.effect.moveSelf',
    { card: 'KAKASHI HATAKE', id: 'KS-137-S', from: String(fromMissionIdx + 1), to: String(toMissionIdx + 1) },
  );

  return { ...state, activeMissions: missions, log };
}

export function registerKakashi137Handlers(): void {
  registerEffect('KS-137-S', 'MAIN', kakashi137MainHandler);
  registerEffect('KS-137-S', 'UPGRADE', kakashi137UpgradeHandler);
}
