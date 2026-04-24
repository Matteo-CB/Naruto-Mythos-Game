import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';



function kakashi137MainHandler(ctx: EffectContext): EffectResult {
  
  let state = { ...ctx.state };
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  
  
  const validTargets: string[] = [];
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const sidePlayer = side === 'player1Characters' ? 'player1' : 'player2';
    const isEnemy = sidePlayer !== ctx.sourcePlayer;
    for (const c of mission[side]) {
      if (!c.isHidden && c.stack?.length >= 2) {
        
        if (isEnemy && !canBeHiddenByEnemy(state, c, sidePlayer)) continue;
        validTargets.push(c.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kakashi Hatake (137): No upgraded character in this mission to hide.',
      'game.log.effect.noTarget',
      { card: 'KAKASHI HATAKE', id: 'KS-137-S' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI137_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kakashi137ConfirmMain',
  };
}

function hideUpgradedCharacter(
  state: EffectContext['state'],
  ctx: EffectContext,
  targetInstanceId: string,
): EffectContext['state'] {
  
  return EffectEngine.hideCharacterWithLog(state, targetInstanceId, ctx.sourcePlayer);
}

function kakashi137UpgradeHandler(ctx: EffectContext): EffectResult {
  
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack?.length > 0
    ? sourceCard.stack[sourceCard.stack?.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  
  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      if (c.instanceId === sourceCard.instanceId) return false;
      if (c.isHidden) return false; // Hidden chars are anonymous - name not revealed
      const tc = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
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

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI137_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: ctx.sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kakashi137ConfirmUpgrade',
  };
}

function moveKakashi137(
  state: EffectContext['state'],
  sourceCard: EffectContext['sourceCard'],
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
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
  registerEffect('KS-137-MV', 'MAIN', kakashi137MainHandler);
  registerEffect('KS-137-MV', 'UPGRADE', kakashi137UpgradeHandler);
}
