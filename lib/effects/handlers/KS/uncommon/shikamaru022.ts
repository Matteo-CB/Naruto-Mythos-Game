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
 * This means: only characters played during the opponent's MOST RECENT action
 * (the action immediately before the current one) are valid targets.
 * This includes characters played via effects (e.g. Jiraiya playing a Summon).
 * If the opponent's last action was PASS or PLAY_HIDDEN, there are no valid targets.
 */

// Log action types that indicate a character was played/entered play
const PLAY_ACTIONS = new Set([
  'PLAY_CHARACTER', 'REVEAL_CHARACTER', 'REVEAL_UPGRADE', 'UPGRADE_CHARACTER',
]);
// Effect log actions that also place a character on the board
const EFFECT_PLAY_ACTIONS = new Set([
  'EFFECT', 'EFFECT_UPGRADE', 'EFFECT_PLAY',
]);

function handleShikamaru022Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const currentTurn = state.turn;

  // Collect all characters played during the opponent's last action (including effect-triggered plays).
  // Strategy: scan backwards to find the opponent's primary action, then collect all opponent entries
  // from that point forward (effects triggered by that action) until the next non-opponent entry.
  const playedChars: { name: string; mission: number }[] = [];

  // Step 1: Find the index of the opponent's last primary action
  let primaryActionIdx = -1;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry.turn !== currentTurn || entry.phase !== 'action') continue;
    if (entry.player !== opponent) continue;

    // If opponent's last action was PASS or PLAY_HIDDEN → no valid targets
    if (entry.action === 'PASS' || entry.action === 'PLAY_HIDDEN') {
      break;
    }

    if (PLAY_ACTIONS.has(entry.action)) {
      primaryActionIdx = i;
      break;
    }
  }

  // Step 2: If we found a primary action, scan forward from it to collect all characters
  // that entered play (including via effects) during that same action sequence.
  if (primaryActionIdx >= 0) {
    for (let i = primaryActionIdx; i < state.log.length; i++) {
      const entry = state.log[i];
      if (entry.turn !== currentTurn || entry.phase !== 'action') break;
      if (entry.player !== opponent) break;

      const missionNum = entry.messageParams?.mission != null
        ? Number(entry.messageParams.mission) - 1
        : null;

      if (PLAY_ACTIONS.has(entry.action)) {
        const charName = (entry.messageParams?.card as string) ?? null;
        if (charName && missionNum !== null) {
          playedChars.push({ name: charName, mission: missionNum });
        }
      } else if (EFFECT_PLAY_ACTIONS.has(entry.action)) {
        // Effect-triggered plays store the placed character name in 'target'
        const charName = (entry.messageParams?.target as string) ?? null;
        if (charName && missionNum !== null) {
          playedChars.push({ name: charName, mission: missionNum });
        }
      }
    }
  }

  if (playedChars.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent did not play a visible character on their last turn.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  // Find matching enemy characters on the board
  const validTargets: string[] = [];
  for (const played of playedChars) {
    const mission = state.activeMissions[played.mission];
    if (!mission) continue;
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      // Avoid duplicates (same instanceId already added)
      if (validTargets.includes(char.instanceId)) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr.toUpperCase() === played.name.toUpperCase()) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent\'s last played characters are no longer valid targets.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  // If exactly one target, auto-select for the move destination prompt
  if (validTargets.length === 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SHIKAMARU_MOVE_ENEMY',
      validTargets,
      description: 'Move an enemy character to another mission.',
      descriptionKey: 'game.effect.desc.shikamaru022MoveEnemy',
    };
  }

  // Multiple targets — let the player choose which one to move
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
