import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { EffectEngine } from '@/lib/effects/EffectEngine';

export const SAKURA_007_ID = 'SS-007-C';

function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function hasTeam7Keyword(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  return (topCardOf(char).keywords ?? []).includes('Team 7');
}

function friendlyTeam7Targets(state: GameState, player: PlayerID, sourceInstanceId: string): string[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const targets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.instanceId === sourceInstanceId) continue;
      if (hasTeam7Keyword(char)) targets.push(char.instanceId);
    }
  }
  return targets;
}

function queueForPlayer(state: GameState, player: PlayerID): GameState {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  let newState = state;

  for (let missionIndex = 0; missionIndex < newState.activeMissions.length; missionIndex++) {
    const sources = newState.activeMissions[missionIndex][side].filter(
      (char) => !char.isHidden && topCardOf(char).id === SAKURA_007_ID,
    );

    for (const source of sources) {
      const validTargets = friendlyTeam7Targets(newState, player, source.instanceId);
      if (validTargets.length === 0) continue;

      newState = EffectEngine.createPendingTargetSelection(
        newState,
        player,
        source,
        missionIndex,
        'MAIN',
        false,
        {
          state: newState,
          requiresTargetSelection: true,
          targetSelectionType: 'SS007_START_POWERUP',
          validTargets,
          isMandatory: true,
          description: JSON.stringify({ sourceCardInstanceId: source.instanceId }),
          descriptionKey: 'game.effect.desc.ss007StartPowerup',
        },
        [],
      );
    }
  }

  return newState;
}

export function queueStartOfRoundTriggers(state: GameState): GameState {
  const first: PlayerID = state.edgeHolder === 'player2' ? 'player2' : 'player1';
  const second: PlayerID = first === 'player1' ? 'player2' : 'player1';

  let newState = queueForPlayer(state, first);
  newState = queueForPlayer(newState, second);
  return newState;
}
