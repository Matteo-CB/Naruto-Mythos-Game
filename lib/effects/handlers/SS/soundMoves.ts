import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { moveWouldViolateNameUniqueness } from '@/lib/effects/moveNameUniqueness';
import { sideKey } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const KIDOMARU_034_ID = 'SS-034-C';
export const KIDOMARU_034_NAME = 'KIDÔMARU';
export const KIDOMARU_034_LOG = 'Kidomaru';

export const DOSU_125_ID = 'SS-125-R';
export const DOSU_125_NAME = 'DOSU KINUTA';
export const DOSU_125_LOG = 'Dosu Kinuta';

function hasLegalDestination(state: GameState, char: CharacterInPlay, player: PlayerID): boolean {
  const side = sideKey(player);
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === char.missionIndex) continue;
    if (!moveWouldViolateNameUniqueness(state, char, i, side)) return true;
  }
  return false;
}

export function movableFriendlies(
  state: GameState,
  player: PlayerID,
  hiddenOnly: boolean,
): string[] {
  const side = sideKey(player);
  const cibles: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (hiddenOnly && !char.isHidden) continue;
      if (!hasLegalDestination(state, char, player)) continue;
      cibles.push(char.instanceId);
    }
  }
  return cibles;
}

function refuse(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

function moveEffect(
  ctx: EffectContext,
  hiddenOnly: boolean,
  nom: string,
  id: string,
  logName: string,
  confirmType: string,
  descriptionKey: string,
  refusText: string,
): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const validTargets = movableFriendlies(state, sourcePlayer, hiddenOnly);
  if (validTargets.length === 0) return refuse(state, sourcePlayer, refusText, nom, id);

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS_MOVE_PICK',
    validTargets,
    isOptional: true,
    description: JSON.stringify({ srcName: logName, srcId: id, srcLabel: nom }),
    descriptionKey,
  }, sourceCard.instanceId, confirmType);
}

function kidomaru034FirstStrike(ctx: EffectContext): EffectResult {
  return moveEffect(
    ctx, false, KIDOMARU_034_NAME, KIDOMARU_034_ID, KIDOMARU_034_LOG,
    'SS034_CONFIRM_FIRST_STRIKE', 'game.effect.desc.ss034MoveFriendly',
    'Kidomaru (034) FIRST STRIKE: no friendly character can be moved to another mission.',
  );
}

function dosu125Upgrade(ctx: EffectContext): EffectResult {
  return moveEffect(
    ctx, true, DOSU_125_NAME, DOSU_125_ID, DOSU_125_LOG,
    'SS125_CONFIRM_UPGRADE', 'game.effect.desc.ss125MoveHidden',
    'Dosu Kinuta (125) UPGRADE: no friendly hidden character can be moved to another mission.',
  );
}

export function registerSoundMoveHandlers(): void {
  registerEffect(KIDOMARU_034_ID, 'FIRST_STRIKE', kidomaru034FirstStrike);
  registerEffect(DOSU_125_ID, 'UPGRADE', dosu125Upgrade);
}
