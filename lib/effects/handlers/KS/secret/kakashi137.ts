import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { EffectEngine } from '@/lib/effects/EffectEngine';

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
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  // Collect ALL valid targets: upgraded, non-hidden characters (not self)
  // Exclude enemy characters that are immune to hide
  const validTargets: string[] = [];
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const sidePlayer = side === 'player1Characters' ? 'player1' : 'player2';
    const isEnemy = sidePlayer !== ctx.sourcePlayer;
    for (const c of mission[side]) {
      if (!c.isHidden && c.stack?.length >= 2) {
        // Skip immune enemy characters
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

  // Return CONFIRM popup instead of direct target selection
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
  // Use centralized hide to respect Kimimaro 056 protection, Gemma 049 sacrifice, and immunities
  return EffectEngine.hideCharacterWithLog(state, targetInstanceId, ctx.sourcePlayer);
}

function kakashi137UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE: Move this character to another mission (respecting name uniqueness).
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack?.length > 0
    ? sourceCard.stack[sourceCard.stack?.length - 1]
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

  // Return CONFIRM popup instead of direct target selection
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
