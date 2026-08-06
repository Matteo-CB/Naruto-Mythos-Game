import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { shuffle } from '@/lib/engine/utils/shuffle';

export const TSUNADE_GOLD_ID = 'SS-999-L';
export const TSUNADE_GOLD_NAME = 'TSUNADE';
export const JIRAIYA_GOLD_ID = 'SS-998-L';
export const JIRAIYA_GOLD_NAME = 'JIRAIYA';
export const GAARA_GOLD_ID = 'SS-078-L';

export const TSUNADE_GOLD_MAX_SHUFFLE = 5;
export const JIRAIYA_GOLD_REDUCTION = 3;
export const JIRAIYA_GOLD_POWERUP = 2;
export const SUMMON_KEYWORD = 'Summon';

function topCardOf(char: CharacterInPlay): CardData {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function tsunadeGoldShuffleableCount(state: GameState, player: PlayerID): number {
  return Math.min(TSUNADE_GOLD_MAX_SHUFFLE, state[player].discardPile.length);
}

export function tsunadeGoldShuffleTopOfDiscard(
  state: GameState,
  player: PlayerID,
  count: number,
): GameState {
  const owner = { ...state[player] };
  const kept = Math.max(0, owner.discardPile.length - count);
  const taken = owner.discardPile.slice(kept);
  owner.discardPile = owner.discardPile.slice(0, kept);
  owner.deck = shuffle([...owner.deck, ...taken]);
  return { ...state, [player]: owner };
}

export function friendlyCharacterIds(state: GameState, player: PlayerID): string[] {
  const ids: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[sideOf(player)]) ids.push(char.instanceId);
  }
  return ids;
}

export function friendlySummonIds(state: GameState, player: PlayerID): string[] {
  const ids: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[sideOf(player)]) {
      if (char.isHidden) continue;
      if ((topCardOf(char).keywords ?? []).includes(SUMMON_KEYWORD)) ids.push(char.instanceId);
    }
  }
  return ids;
}

export function isSummonPlay(state: GameState, player: PlayerID, playedInstanceId: string): boolean {
  for (const mission of state.activeMissions) {
    const played = mission[sideOf(player)].find((c) => c.instanceId === playedInstanceId);
    if (!played) continue;
    if (played.isHidden) return false;
    return (topCardOf(played).keywords ?? []).includes(SUMMON_KEYWORD);
  }
  return false;
}

export function jiraiyaGoldSources(state: GameState, player: PlayerID): CharacterInPlay[] {
  const sources: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[sideOf(player)]) {
      if (char.isHidden) continue;
      const top = topCardOf(char);
      if ((top.cardId ?? top.id) === JIRAIYA_GOLD_ID) sources.push(char);
    }
  }
  return sources;
}
