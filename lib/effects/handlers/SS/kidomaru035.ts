import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { moveWouldViolateNameUniqueness } from '@/lib/effects/moveNameUniqueness';
import { sideKey, topOf } from './sandMove';
import { coutsDesSonQuatreDansMission, estSonQuatreReel } from '@/lib/effects/soundFourCount';

export const KIDOMARU_035_ID = 'SS-035-UC';
export const KIDOMARU_035_NAME = 'KIDÔMARU';
export const KIDOMARU_035_LOG = 'Kidomaru';

export function friendlySoundFourIn(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideKey(player)].filter((c) => {
    if (c.isHidden) return false;
    if (c.instanceId === sourceInstanceId) return false;
    return estSonQuatreReel(c);
  });
}

export function targetedCostOf(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  return topOf(char).chakra ?? 0;
}

function hasLegalDestination(state: GameState, char: CharacterInPlay): boolean {
  const side = sideKey(char.controlledBy);
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === char.missionIndex) continue;
    if (!moveWouldViolateNameUniqueness(state, char, i, side)) return true;
  }
  return false;
}

export function movableUnderCost(state: GameState, limite: number): string[] {
  const cibles: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (targetedCostOf(char) > limite) continue;
      if (!hasLegalDestination(state, char)) continue;
      cibles.push(char.instanceId);
    }
  }
  return cibles;
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: KIDOMARU_035_NAME, id: KIDOMARU_035_ID }),
    },
  };
}

function kidomaru035Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const limites = coutsDesSonQuatreDansMission(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  if (limites.length === 0) {
    return refuse(state, sourcePlayer, 'Kidomaru (035) UPGRADE: no other friendly Sound Four character in this mission.');
  }

  const limiteMax = Math.max(...limites);
  if (movableUnderCost(state, limiteMax).length === 0) {
    return refuse(state, sourcePlayer, 'Kidomaru (035) UPGRADE: no character can be moved within the cost limits of the friendly Sound Four characters.');
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS035_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ limites, missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.ss035MovePerAlly',
  };
}

export function registerKidomaru035Handlers(): void {
  registerEffect(KIDOMARU_035_ID, 'UPGRADE', kidomaru035Upgrade);
}
