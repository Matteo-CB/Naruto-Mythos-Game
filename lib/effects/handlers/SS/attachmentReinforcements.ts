import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { generateInstanceId } from '@/lib/engine/utils/id';

export const REINFORCEMENTS_ID = 'SS-109-UC';
export const REINFORCEMENTS_NAME = 'RENFORTS PLANIFIES';

export function putTopCardAsHidden(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceName: string,
  sourceId: string,
): GameState {
  const deck = state[player].deck;
  if (deck.length === 0) {
    return {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET',
        `${sourceName}: the deck is empty, no reinforcement arrives.`,
        'game.log.effect.noTarget', { card: sourceName, id: sourceId }),
    };
  }

  const carte = deck[0];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const nouveau: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card: carte as never,
    isHidden: true,
    wasRevealedAtLeastOnce: false,
    powerTokens: 0,
    stack: [],
    controlledBy: player,
    originalOwner: player,
    missionIndex,
  } as CharacterInPlay;

  const missions = [...state.activeMissions];
  missions[missionIndex] = {
    ...missions[missionIndex],
    [side]: [...missions[missionIndex][side], nouveau],
  };

  return {
    ...state,
    activeMissions: missions,
    [player]: { ...state[player], deck: deck.slice(1) },
    log: logAction(state.log, state.turn, state.phase, player, 'PLAY_HIDDEN',
      `${sourceName}: the top card of the deck arrives face down in mission ${missionIndex + 1}.`,
      'game.log.effect.ss109Reinforcement',
      { card: sourceName, id: sourceId, mission: missionIndex + 1 }),
  };
}

function reinforcementsAmbush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  return {
    state: putTopCardAsHidden(state, sourcePlayer, sourceMissionIndex, REINFORCEMENTS_NAME, REINFORCEMENTS_ID),
  };
}

export function registerReinforcementsHandlers(): void {
  registerEffect(REINFORCEMENTS_ID, 'AMBUSH', reinforcementsAmbush);
}
