import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';
import { enemyOf, sideKey, topOf } from './sandMove';

export const ZAKU_042_ID = 'SS-042-UC';
export const ZAKU_042_NAME = 'ZAKU ABUMI';
export const ZAKU_042_MAX_COST = 3;
const TEAM_DOSU_KEYWORD = 'Team Dosu';

function targetedCost(char: CharacterInPlay): number {
  return char.isHidden ? 0 : (topOf(char).chakra ?? 0);
}

export function hasOtherFriendlyTeamDosu(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  return (mission[sideKey(player)] as CharacterInPlay[]).some((char) => {
    if (char.instanceId === sourceInstanceId) return false;
    if (char.isHidden) return false;
    if (char.controlledBy !== player) return false;
    return (topOf(char).keywords ?? []).includes(TEAM_DOSU_KEYWORD);
  });
}

export function zaku042DefeatTargets(state: GameState, player: PlayerID): string[] {
  const sides: ('player1Characters' | 'player2Characters')[] = [sideKey(enemyOf(player)), sideKey(player)];
  const targets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const side of sides) {
      for (const char of mission[side] as CharacterInPlay[]) {
        if (targetedCost(char) <= ZAKU_042_MAX_COST) targets.push(char.instanceId);
      }
    }
  }
  return targets;
}

function noTarget(state: GameState, player: PlayerID, message: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card: ZAKU_042_NAME, id: ZAKU_042_ID }),
    },
  };
}

function zaku042Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  if (!hasOtherFriendlyTeamDosu(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId)) {
    return noTarget(state, sourcePlayer,
      'Zaku Abumi (SS-042) UPGRADE: no other friendly Team Dosu character in this mission.');
  }

  const validTargets = zaku042DefeatTargets(state, sourcePlayer);
  if (validTargets.length === 0) {
    return noTarget(state, sourcePlayer,
      'Zaku Abumi (SS-042) UPGRADE: no character with cost 3 or less in play.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS042_DEFEAT',
    validTargets,
    isOptional: true,
    description: 'Zaku Abumi (SS-042) UPGRADE: Defeat a character, friendly or enemy, with cost 3 or less.',
    descriptionKey: 'game.effect.desc.ss042UpgradeDefeat',
  }, sourceCard.instanceId, 'SS042_CONFIRM_UPGRADE');
}

export function registerZaku042Handlers(): void {
  registerEffect(ZAKU_042_ID, 'UPGRADE', zaku042Upgrade);
}
