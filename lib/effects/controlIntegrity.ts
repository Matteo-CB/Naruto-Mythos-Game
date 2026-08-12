import type { GameState, CharacterInPlay } from '@/lib/engine/types';
import { EffectEngine } from './EffectEngine';

function instanceIdsInPlay(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) ids.add(char.instanceId);
    }
  }
  return ids;
}

function danglingControlled(state: GameState): CharacterInPlay[] {
  const enJeu = instanceIdsInPlay(state);
  const orphelins: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        if (char.controlledBy === char.originalOwner) continue;
        if (!char.controllerInstanceId) continue;
        if (enJeu.has(char.controllerInstanceId)) continue;
        orphelins.push(char);
      }
    }
  }
  return orphelins;
}

export function releaseDanglingControl(state: GameState): GameState {
  const orphelins = danglingControlled(state);
  if (orphelins.length === 0) return state;

  let newState = state;
  for (const char of orphelins) {
    newState = EffectEngine.returnControlToOwner(newState, char.instanceId);
  }
  return newState;
}
