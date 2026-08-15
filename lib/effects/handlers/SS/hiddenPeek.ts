import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const SHIKAMARU_011 = 'SS-011-C';
export const NINJA_HOUNDS_059 = 'SS-059-C';

export function peekedBy(state: GameState, player: PlayerID): string[] {
  return state.peekedHiddenIds?.[player] ?? [];
}

export function rememberPeek(state: GameState, player: PlayerID, instanceId: string): GameState {
  const actuel = state.peekedHiddenIds ?? { player1: [], player2: [] };
  if (actuel[player].includes(instanceId)) return state;
  return {
    ...state,
    peekedHiddenIds: { ...actuel, [player]: [...actuel[player], instanceId] },
  };
}

function refus(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

export function hiddenIn(
  state: GameState,
  missionIndex: number,
  player: PlayerID,
  camp: 'any' | 'enemy',
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const cotes: PlayerID[] = camp === 'enemy' ? [adversaire] : [player, adversaire];
  const trouves: CharacterInPlay[] = [];
  for (const cote of cotes) {
    const side = cote === 'player1' ? 'player1Characters' : 'player2Characters';
    for (const c of mission[side]) if (c.isHidden) trouves.push(c);
  }
  return trouves;
}

function shikamaru011(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const caches = hiddenIn(state, sourceMissionIndex, sourcePlayer, 'any');
  if (caches.length === 0) {
    return refus(state, sourcePlayer, 'Shikamaru Nara (011): no hidden character in this mission.', 'SHIKAMARU NARA', SHIKAMARU_011);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS_PEEK_HIDDEN',
    validTargets: caches.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({ sourceName: 'SHIKAMARU NARA', sourceId: SHIKAMARU_011, powerup: false }),
    descriptionKey: 'game.effect.desc.ssPeekHidden',
  }, sourceCard.instanceId, 'SS_PEEK_CONFIRM');
}

function ninjaHounds059(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const caches = hiddenIn(state, sourceMissionIndex, sourcePlayer, 'enemy');
  if (caches.length === 0) {
    return refus(state, sourcePlayer, 'Ninja Hound Corps (059): no enemy hidden character in this mission.', 'CORPS DE CHIENS NINJA', NINJA_HOUNDS_059);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS_PEEK_HIDDEN',
    validTargets: caches.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({
      sourceName: 'CORPS DE CHIENS NINJA',
      sourceId: NINJA_HOUNDS_059,
      powerup: true,
      hostInstanceId: sourceCard.instanceId,
    }),
    descriptionKey: 'game.effect.desc.ssPeekHiddenPowerup',
  }, sourceCard.instanceId, 'SS_PEEK_CONFIRM');
}

export function registerHiddenPeekHandlers(): void {
  registerEffect(SHIKAMARU_011, 'MAIN', shikamaru011);
  registerEffect(NINJA_HOUNDS_059, 'MAIN', ninjaHounds059);
}
