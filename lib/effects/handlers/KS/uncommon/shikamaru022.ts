import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 022/130 - SHIKAMARU NARA "Manipulation des Ombres" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * AMBUSH: Move an enemy character played during the opponent's previous turn.
 *
 * FAQ clarification: "You count only the last opponent's turn, so if you take
 * multiple turns, you can't move anybody with Shikamaru - Shadow Possession Jutsu."
 *
 * This means: only the character played in the opponent's MOST RECENT action
 * (the action immediately before the current one) is a valid target.
 * If the opponent's last action was PASS or PLAY_HIDDEN, there are no valid targets.
 */
function handleShikamaru022Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const currentTurn = state.turn;

  // Scan log backwards to find the opponent's LAST action in this turn's action phase
  let lastPlayedCharName: string | null = null;
  let lastPlayedMission: number | null = null;

  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    // Only look at current turn, action phase
    if (entry.turn !== currentTurn || entry.phase !== 'action') continue;
    // Only look at opponent's actions
    if (entry.player !== opponent) continue;

    // Check if this was a character-play action (visible)
    if (
      entry.action === 'PLAY_CHARACTER' ||
      entry.action === 'REVEAL_CHARACTER' ||
      entry.action === 'REVEAL_UPGRADE' ||
      entry.action === 'UPGRADE_CHARACTER'
    ) {
      lastPlayedCharName = (entry.messageParams?.card as string) ?? null;
      lastPlayedMission = entry.messageParams?.mission != null
        ? Number(entry.messageParams.mission) - 1 // log stores 1-indexed
        : null;
      break;
    }

    // If opponent's last action was PASS, PLAY_HIDDEN, or something else → no valid target
    if (entry.action === 'PASS' || entry.action === 'PLAY_HIDDEN') {
      break; // No visible character was played last
    }
  }

  if (!lastPlayedCharName || lastPlayedMission === null) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent did not play a visible character on their last turn.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  // Find the matching character on the enemy side at the identified mission
  const mission = state.activeMissions[lastPlayedMission];
  if (!mission) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Target mission not found.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  const validTargets: string[] = [];
  for (const char of mission[enemySide]) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.name_fr.toUpperCase() === lastPlayedCharName.toUpperCase()) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent\'s last played character is no longer a valid target.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  // If exactly one target, auto-select for the move destination prompt
  if (validTargets.length === 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SHIKAMARU_MOVE_ENEMY',
      validTargets,
      description: `Move ${lastPlayedCharName} to another mission.`,
      descriptionKey: 'game.effect.desc.shikamaru022MoveEnemy',
    };
  }

  // Multiple matches (rare edge case - e.g., upgrade placed same name), offer choice
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU_MOVE_ENEMY',
    validTargets,
    description: 'Select an enemy character to move to another mission.',
    descriptionKey: 'game.effect.desc.shikamaru022MoveEnemy',
  };
}

export function registerHandler(): void {
  registerEffect('KS-022-UC', 'AMBUSH', handleShikamaru022Ambush);
}
