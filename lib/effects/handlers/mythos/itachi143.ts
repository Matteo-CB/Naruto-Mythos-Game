import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { checkNinjaHoundsTrigger } from '../../moveTriggers';

/**
 * Card 143/130 - ITACHI UCHIWA "Traquant Naruto" (M)
 * Chakra: 5, Power: 5
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * MAIN: Move a friendly character to this mission.
 *   - Select a friendly character from any other mission and move it here.
 *
 * AMBUSH: Move an enemy character to this mission.
 *   - Select an enemy character from any other mission and move it here.
 *   - Only triggers when Itachi is revealed from hidden.
 */

function itachi143MainHandler(ctx: EffectContext): EffectResult {
  // MAIN: Move a friendly character to this mission.
  let state = { ...ctx.state };
  const missions = [...state.activeMissions];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find first friendly character in another mission (not this one, not self)
  let foundChar: CharacterInPlay | undefined;
  let fromMissionIndex = -1;

  for (let i = 0; i < missions.length; i++) {
    if (i === ctx.sourceMissionIndex) continue;
    const mission = missions[i];
    const chars = mission[friendlySide];
    for (const char of chars) {
      if (char.instanceId !== ctx.sourceCard.instanceId) {
        foundChar = char;
        fromMissionIndex = i;
        break;
      }
    }
    if (foundChar) break;
  }

  if (!foundChar || fromMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No friendly character in another mission to move here.',
    );
    return { state: { ...state, log } };
  }

  // Remove from source mission
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  const charIndex = sourceChars.findIndex((c) => c.instanceId === foundChar!.instanceId);
  sourceChars.splice(charIndex, 1);
  sourceMission[friendlySide] = sourceChars;
  missions[fromMissionIndex] = sourceMission;

  // Add to this mission
  const targetMission = { ...missions[ctx.sourceMissionIndex] };
  const movedChar = { ...foundChar, missionIndex: ctx.sourceMissionIndex };
  targetMission[friendlySide] = [...targetMission[friendlySide], movedChar];
  missions[ctx.sourceMissionIndex] = targetMission;

  let log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_MOVE',
    `Itachi Uchiwa (143): Moved friendly ${foundChar.card.name_fr} from mission ${fromMissionIndex} to this mission (${ctx.sourceMissionIndex}).`,
  );

  let newState = { ...state, activeMissions: missions, log };
  // Check Ninja Hounds 100 trigger if the moved character is Ninja Hounds
  newState = checkNinjaHoundsTrigger(newState, movedChar, ctx.sourceMissionIndex, ctx.sourcePlayer);
  return { state: newState };
}

function itachi143AmbushHandler(ctx: EffectContext): EffectResult {
  // AMBUSH: Move an enemy character to this mission.
  let state = { ...ctx.state };
  const missions = [...state.activeMissions];

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find first enemy character in another mission
  let foundChar: CharacterInPlay | undefined;
  let fromMissionIndex = -1;

  for (let i = 0; i < missions.length; i++) {
    if (i === ctx.sourceMissionIndex) continue;
    const mission = missions[i];
    const chars = mission[enemySide];
    if (chars.length > 0) {
      foundChar = chars[0];
      fromMissionIndex = i;
      break;
    }
  }

  if (!foundChar || fromMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (143): No enemy character in another mission to move here (ambush).',
    );
    return { state: { ...state, log } };
  }

  // Remove from source mission
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[enemySide]];
  const charIndex = sourceChars.findIndex((c) => c.instanceId === foundChar!.instanceId);
  sourceChars.splice(charIndex, 1);
  sourceMission[enemySide] = sourceChars;
  missions[fromMissionIndex] = sourceMission;

  // Add to this mission
  const targetMission = { ...missions[ctx.sourceMissionIndex] };
  const movedChar = { ...foundChar, missionIndex: ctx.sourceMissionIndex };
  targetMission[enemySide] = [...targetMission[enemySide], movedChar];
  missions[ctx.sourceMissionIndex] = targetMission;

  let log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_MOVE',
    `Itachi Uchiwa (143): Moved enemy ${foundChar.card.name_fr} from mission ${fromMissionIndex} to this mission (${ctx.sourceMissionIndex}) (ambush).`,
  );

  const opponent = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  let newState = { ...state, activeMissions: missions, log };
  // Check Ninja Hounds 100 trigger if the moved character is Ninja Hounds
  newState = checkNinjaHoundsTrigger(newState, movedChar, ctx.sourceMissionIndex, opponent);
  return { state: newState };
}

export function registerItachi143Handlers(): void {
  registerEffect('143/130', 'MAIN', itachi143MainHandler);
  registerEffect('143/130', 'AMBUSH', itachi143AmbushHandler);
}
