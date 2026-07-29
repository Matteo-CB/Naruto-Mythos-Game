import type { GameState, PlayerID, CharacterInPlay, FirstStrikeStatus, VisibleGameState } from '../types';

export interface FirstStrikeCandidate {
  instanceId: string;
  missionIndex: number;
  cardId: string;
  description: string;
}

export function getFirstStrikeStatus(state: GameState, player: PlayerID): FirstStrikeStatus {
  return state.firstStrike?.[player] ?? 'available';
}

export function withFirstStrikeStatus(state: GameState, player: PlayerID, status: FirstStrikeStatus): GameState {
  const current = state.firstStrike ?? { player1: 'available' as FirstStrikeStatus, player2: 'available' as FirstStrikeStatus };
  return { ...state, firstStrike: { ...current, [player]: status } };
}

export function resetFirstStrikeForRound(state: GameState): GameState {
  return { ...state, firstStrike: { player1: 'available', player2: 'available' } };
}

export function isFirstCardPlayedThisRound(state: GameState, player: PlayerID): boolean {
  return getFirstStrikeStatus(state, player) === 'available';
}

export function expireFirstStrike(state: GameState, player: PlayerID): GameState {
  if (getFirstStrikeStatus(state, player) !== 'available') return state;
  return withFirstStrikeStatus(state, player, 'expired');
}

function firstStrikeEffectOf(char: CharacterInPlay): string | null {
  const top = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const eff = (top?.effects ?? []).find((e) => e.type === 'FIRST_STRIKE');
  return eff ? eff.description : null;
}

export function getFirstStrikeCandidates(state: GameState, player: PlayerID): FirstStrikeCandidate[] {
  const out: FirstStrikeCandidate[] = [];
  state.activeMissions.forEach((mission, missionIndex) => {
    const side = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of side) {
      if (char.isHidden) continue;
      if (char.controlledBy !== player) continue;
      const description = firstStrikeEffectOf(char);
      if (!description) continue;
      const top = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      out.push({ instanceId: char.instanceId, missionIndex, cardId: top.id, description });
    }
  });
  return out;
}

export function getVisibleFirstStrikeCandidates(view: VisibleGameState): FirstStrikeCandidate[] {
  const me = view.myPlayer;
  const out: FirstStrikeCandidate[] = [];
  view.activeMissions.forEach((mission, missionIndex) => {
    const side = me === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of side) {
      if (char.isHidden) continue;
      if (char.controlledBy !== me) continue;
      const top = char.topCard ?? char.card;
      if (!top) continue;
      const eff = (top.effects ?? []).find((e) => e.type === 'FIRST_STRIKE');
      if (!eff) continue;
      out.push({ instanceId: char.instanceId, missionIndex, cardId: top.id, description: eff.description });
    }
  });
  return out;
}

export function canUseVisibleFirstStrike(view: VisibleGameState): boolean {
  if (view.phase !== 'action') return false;
  if (view.myState.hasPassed) return false;
  if (view.pendingEffects.length > 0 || view.pendingActions.length > 0) return false;
  if (!view.opponentState.hasPassed && view.activePlayer !== view.myPlayer) return false;
  if ((view.firstStrike?.[view.myPlayer] ?? 'available') !== 'available') return false;
  return getVisibleFirstStrikeCandidates(view).length > 0;
}

export function canUseFirstStrike(state: GameState, player: PlayerID): boolean {
  if (state.phase !== 'action') return false;
  if (state[player].hasPassed) return false;
  if (state.pendingEffects.length > 0 || state.pendingActions.length > 0) return false;
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  if (!state[otherPlayer].hasPassed && state.activePlayer !== player) return false;
  if (getFirstStrikeStatus(state, player) !== 'available') return false;
  return getFirstStrikeCandidates(state, player).length > 0;
}
