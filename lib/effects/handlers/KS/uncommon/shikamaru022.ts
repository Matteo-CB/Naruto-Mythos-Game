import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';




const PLAY_ACTIONS = new Set([
  'PLAY_CHARACTER', 'REVEAL_CHARACTER', 'REVEAL_UPGRADE', 'UPGRADE_CHARACTER',
]);

const EFFECT_PLAY_ACTIONS = new Set([
  'EFFECT', 'EFFECT_UPGRADE', 'EFFECT_PLAY',
]);


interface PlayedChar {
  name?: string;        // character name (for visible plays)
  instanceId?: string;  // instanceId (for hidden plays)
  mission: number;      // mission index (0-based)
}

function handleShikamaru022Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const currentTurn = state.turn;

  const playedChars: PlayedChar[] = [];

  let lastOwnActionIdx = -1;
  let skippedSourceReveal = false;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry.turn !== currentTurn || entry.phase !== 'action') break;
    if (entry.player !== sourcePlayer) continue;
    if (
      entry.action === 'PASS' ||
      entry.action === 'PLAY_HIDDEN' ||
      PLAY_ACTIONS.has(entry.action)
    ) {
      if (!skippedSourceReveal) {
        skippedSourceReveal = true;
        continue;
      }
      lastOwnActionIdx = i;
      break;
    }
  }

  for (let i = lastOwnActionIdx + 1; i < state.log.length; i++) {
    const entry = state.log[i];
    if (entry.turn !== currentTurn || entry.phase !== 'action') break;
    if (entry.player !== opponent) continue;
    if (entry.action === 'PASS') continue;

    const missionNum = entry.messageParams?.mission != null
      ? Number(entry.messageParams.mission) - 1
      : null;

    if (entry.action === 'PLAY_HIDDEN') {
      const instId = entry.messageParams?.instanceId as string | undefined;
      if (missionNum !== null) {
        playedChars.push({ instanceId: instId, mission: missionNum });
      }
    } else if (PLAY_ACTIONS.has(entry.action)) {
      const charName = (entry.messageParams?.card as string) ?? null;
      if (charName && missionNum !== null) {
        playedChars.push({ name: charName, mission: missionNum });
      }
    } else if (EFFECT_PLAY_ACTIONS.has(entry.action)) {
      const charName = (entry.messageParams?.target as string) ?? null;
      if (charName && missionNum !== null) {
        playedChars.push({ name: charName, mission: missionNum });
      }
    }
  }

  if (playedChars.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent did not play a character on their last turn.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  
  if (state.activeMissions.length < 2) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Only 1 mission in play — cannot move.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  
  const validTargets: string[] = [];
  for (const played of playedChars) {
    const mission = state.activeMissions[played.mission];
    if (!mission) continue;
    
    if (isMovementBlockedByKurenai(state, played.mission, opponent)) continue;
    for (const char of mission[enemySide]) {
      
      if (validTargets.includes(char.instanceId)) continue;

      if (played.instanceId) {
        
        if (char.instanceId === played.instanceId) {
          validTargets.push(char.instanceId);
        }
      } else if (played.name) {
        
        if (!char.isHidden) {
          const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
          if (topCard.name_fr.toUpperCase() === played.name.toUpperCase()) {
            validTargets.push(char.instanceId);
          }
        }
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): Opponent\'s last played characters are no longer valid targets.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-022-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU022_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shikamaru022ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-022-UC', 'AMBUSH', handleShikamaru022Ambush);
}
