import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 137/130 - KAKASHI HATAKE "L'Eclair Pourfendeur" (S)
 * Chakra: 7, Power: 7
 * Group: Leaf Village, Keywords: Team 7
 *
 * Note: The JSON data for this card has a parsing artifact where the MAIN effect
 * is split across entries. The intended effects are:
 *
 * UPGRADE: Move this character (to another mission).
 * MAIN: Hide an enemy character in this mission.
 *   (The JSON shows: UPGRADE "Move this character.", MAIN "Hide an",
 *    UPGRADE "d character in this mission." -- the MAIN "Hide an" + UPGRADE
 *    "d character in this mission." should be read as "Hide an[enemy]d character
 *    in this mission." = "Hide an enemy character in this mission.")
 */

function kakashi137MainHandler(ctx: EffectContext): EffectResult {
  // MAIN: Hide an enemy character in this mission (no power restriction).
  let state = { ...ctx.state };
  const missions = [...state.activeMissions];
  const mission = { ...missions[ctx.sourceMissionIndex] };

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const enemyChars = [...mission[enemySide]];

  // Find first valid target: any non-hidden enemy character in this mission
  const targetIndex = enemyChars.findIndex((c) => !c.isHidden);

  if (targetIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (137): No visible enemy character in this mission to hide.',
    );
    return { state: { ...state, log } };
  }

  const target = enemyChars[targetIndex];
  enemyChars[targetIndex] = { ...target, isHidden: true };
  mission[enemySide] = enemyChars;
  missions[ctx.sourceMissionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_HIDE',
    `Kakashi Hatake (137): Hid enemy ${target.card.name_fr} in this mission.`,
  );

  return { state: { ...state, activeMissions: missions, log } };
}

function kakashi137UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE: Move this character to another mission.
  let state = { ...ctx.state };
  const missions = [...state.activeMissions];

  // Find a different mission to move to (pick first available that is not current)
  let targetMissionIndex = -1;
  for (let i = 0; i < missions.length; i++) {
    if (i !== ctx.sourceMissionIndex) {
      targetMissionIndex = i;
      break;
    }
  }

  if (targetMissionIndex === -1) {
    // Only one mission exists, cannot move
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (137): No other mission to move to (upgrade).',
    );
    return { state: { ...state, log } };
  }

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Remove from current mission
  const sourceMission = { ...missions[ctx.sourceMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  const charIndex = sourceChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

  if (charIndex === -1) {
    return { state };
  }

  const movedChar = {
    ...sourceChars[charIndex],
    missionIndex: targetMissionIndex,
  };
  sourceChars.splice(charIndex, 1);
  sourceMission[friendlySide] = sourceChars;
  missions[ctx.sourceMissionIndex] = sourceMission;

  // Add to target mission
  const targetMission = { ...missions[targetMissionIndex] };
  targetMission[friendlySide] = [...targetMission[friendlySide], movedChar];
  missions[targetMissionIndex] = targetMission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_MOVE',
    `Kakashi Hatake (137): Moved self from mission ${ctx.sourceMissionIndex} to mission ${targetMissionIndex} (upgrade).`,
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerKakashi137Handlers(): void {
  registerEffect('137/130', 'MAIN', kakashi137MainHandler);
  registerEffect('137/130', 'UPGRADE', kakashi137UpgradeHandler);
}
