import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const SAKURA_123_MV_ID = 'SS-123-MV';
export const ITACHI_137_MV_ID = 'SS-137-MV';

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

function enemyOf(player: PlayerID): PlayerID {
  return player === 'player1' ? 'player2' : 'player1';
}

function noTarget(state: GameState, player: PlayerID, message: string, card: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card, id }),
    },
  };
}

export function reclaimableCharacters(state: GameState, player: PlayerID): string[] {
  const owned: string[] = [];
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        if (char.originalOwner === player && char.controlledBy !== player) owned.push(char.instanceId);
      }
    }
  }
  return owned;
}

function sakura123MvDuel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const validTargets = reclaimableCharacters(state, sourcePlayer);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer,
      'Sakura Haruno (SS-123): No character of yours is under enemy control.', 'SAKURA HARUNO', SAKURA_123_MV_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS123MV_TAKE_BACK',
    validTargets,
    isOptional: true,
    description: 'Sakura Haruno (SS-123) DUEL: Take back control of a character you own.',
    descriptionKey: 'game.effect.desc.ss123MvTakeBack',
  }, sourceCard.instanceId, 'SS123MV_CONFIRM_DUEL');
}

export function friendlyHiddenInMission(state: GameState, player: PlayerID, missionIndex: number, exclude?: string): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideOf(player)]
    .filter((c: CharacterInPlay) => c.isHidden && c.instanceId !== exclude)
    .map((c: CharacterInPlay) => c.instanceId);
}

function itachi137MvUpgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const validTargets = friendlyHiddenInMission(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer,
      'Itachi Uchiha (SS-137): No friendly hidden character in this mission.', 'ITACHI UCHIHA', ITACHI_137_MV_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS137MV_RETURN_HIDDEN',
    validTargets,
    isOptional: true,
    description: 'Itachi Uchiha (SS-137) UPGRADE: Return a friendly hidden character from this mission to your hand.',
    descriptionKey: 'game.effect.desc.ss137MvReturnHidden',
  }, sourceCard.instanceId, 'SS137MV_CONFIRM_UPGRADE');
}

export function itachi137MvSurplus(state: GameState, player: PlayerID, missionIndex: number): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  const mine = mission[sideOf(player)].length;
  const theirs = mission[sideOf(enemyOf(player))].length;
  return theirs - mine;
}

function itachi137MvDuel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  if (itachi137MvSurplus(state, sourcePlayer, sourceMissionIndex) <= 0) {
    return noTarget(state, sourcePlayer,
      'Itachi Uchiha (SS-137): The opponent does not outnumber you in this mission.', 'ITACHI UCHIHA', ITACHI_137_MV_ID);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS137MV_CONFIRM_DUEL',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.ss137MvConfirmDuel',
  };
}

export function registerRegionalChampionshipHandlers(): void {
  registerEffect(SAKURA_123_MV_ID, 'DUEL', sakura123MvDuel);
  registerEffect('SS-123-CHIBIV', 'DUEL', sakura123MvDuel);
  registerEffect('SS-123-R', 'DUEL', sakura123MvDuel);
  registerEffect('SS-123-SPV', 'DUEL', sakura123MvDuel);
  registerEffect('SS-123-SHINOBIV', 'DUEL', sakura123MvDuel);
  registerEffect(ITACHI_137_MV_ID, 'UPGRADE', itachi137MvUpgrade);
  registerEffect(ITACHI_137_MV_ID, 'DUEL', itachi137MvDuel);
}
