import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 047/130 - IRUKA (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Academy
 * MAIN: Move a Naruto Uzumaki character in play.
 *
 * Auto-resolves: finds the first friendly Naruto Uzumaki character across all
 * missions and moves it to the first available different mission. Optional
 * effect — fizzles if no Naruto found or no other mission to move to.
 */
function handleIruka047Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find the first friendly Naruto Uzumaki in play across all missions
  let target: CharacterInPlay | undefined;
  let fromMissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];

    for (const char of friendlyChars) {
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr === 'NARUTO UZUMAKI') {
        target = char;
        fromMissionIndex = i;
        break;
      }
    }
    if (target) break;
  }

  if (!target || fromMissionIndex === -1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No Naruto Uzumaki character found in play.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: '047/130' }) } };
  }

  // Find the first different mission to move to
  let destMissionIndex = -1;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== fromMissionIndex) {
      destMissionIndex = i;
      break;
    }
  }

  if (destMissionIndex === -1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No other mission available to move Naruto Uzumaki to.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: '047/130' }) } };
  }

  // Build new state immutably
  const newMissions = state.activeMissions.map((m, idx) => {
    if (idx === fromMissionIndex) {
      return {
        ...m,
        [friendlySide]: m[friendlySide].filter(
          (c) => c.instanceId !== target!.instanceId
        ),
      };
    }
    if (idx === destMissionIndex) {
      const movedChar = { ...target!, missionIndex: destMissionIndex };
      return {
        ...m,
        [friendlySide]: [...m[friendlySide], movedChar],
      };
    }
    return m;
  });

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_MOVE',
    `Iruka (047): Moved Naruto Uzumaki from mission ${fromMissionIndex} to mission ${destMissionIndex}.`,
    'game.log.effect.move',
    { card: 'Iruka', id: '047/130', target: 'Naruto Uzumaki', mission: String(destMissionIndex) },
  );

  return { state: { ...state, activeMissions: newMissions, log } };
}

export function registerHandler(): void {
  registerEffect('047/130', 'MAIN', handleIruka047Main);
}
