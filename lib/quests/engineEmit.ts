import type { GameState, PlayerID } from '@/lib/engine/types';
import { CARDS_DRAWN_PER_TURN } from '@/lib/engine/types';
import { emitQuestEvent, type QuestEventPayload, type GameMode } from './hooks';

function resolveUserId(state: GameState, player: PlayerID): string | undefined {
  return player === 'player1' ? state.player1UserId : state.player2UserId;
}

function inferMode(state: GameState): GameMode | undefined {
  if (state.gameMode === 'ranked') return 'ranked';
  if (state.gameMode === 'evolving') return 'evolving';
  if (state.gameMode === 'sealed') return 'sealed';
  if (state.gameMode === 'casual') return 'casual';
  return undefined;
}

export function emitEngineQuestEvent(
  state: GameState,
  player: PlayerID,
  hook: string,
  payload?: QuestEventPayload,
): void {
  const userId = resolveUserId(state, player);
  if (!userId) return;
  const mode = inferMode(state);
  const matchKey = state.gameId;
  emitQuestEvent(hook, userId, { gameMode: mode, matchKey, ...(payload ?? {}) });
}

export function emitDrawDiffEvents(oldState: GameState, newState: GameState): void {
  if (!oldState || !newState) return;
  if (oldState.phase === 'start') return;
  if (oldState.phase === 'mulligan') return;

  const turnAdvanced = newState.turn > oldState.turn;
  const passiveDrawPerPlayer = turnAdvanced ? CARDS_DRAWN_PER_TURN : 0;

  const oldP1 = oldState.player1?.hand?.length ?? 0;
  const oldP2 = oldState.player2?.hand?.length ?? 0;
  const newP1 = newState.player1?.hand?.length ?? 0;
  const newP2 = newState.player2?.hand?.length ?? 0;
  const dP1 = newP1 - oldP1 - passiveDrawPerPlayer;
  const dP2 = newP2 - oldP2 - passiveDrawPerPlayer;
  if (dP1 > 0) {
    emitEngineQuestEvent(newState, 'player1', 'card.drawn.via_effect', { delta: dP1 });
  }
  if (dP2 > 0) {
    emitEngineQuestEvent(newState, 'player2', 'card.drawn.via_effect', { delta: dP2 });
  }
}

function sumPowerTokens(state: GameState, player: PlayerID): number {
  if (!state.activeMissions) return 0;
  const key = player === 'player1' ? 'player1Characters' : 'player2Characters';
  let total = 0;
  for (const m of state.activeMissions) {
    for (const c of m[key] ?? []) total += c.powerTokens ?? 0;
  }
  return total;
}

export function emitTokenDiffEvents(oldState: GameState, newState: GameState): void {
  if (!oldState || !newState) return;
  if (oldState.phase === 'end' || newState.phase === 'end') return;
  for (const p of ['player1', 'player2'] as const) {
    const oldT = sumPowerTokens(oldState, p);
    const newT = sumPowerTokens(newState, p);
    const delta = newT - oldT;
    if (delta > 0) {
      emitEngineQuestEvent(newState, p, 'power_token.added', { delta });
    }
  }

  if (!newState.activeMissions) return;
  for (const p of ['player1', 'player2'] as const) {
    const sideKey = p === 'player1' ? 'player1Characters' : 'player2Characters';
    for (const mission of newState.activeMissions) {
      for (const ch of mission[sideKey] ?? []) {
        const top = ch.stack?.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
        if (ch.powerTokens >= 10) {
          emitEngineQuestEvent(newState, p, 'character.power_tokens.threshold', {
            name: top.name_fr,
            threshold: 10,
          });
        }
        const totalPower = (top.power ?? 0) + (ch.powerTokens ?? 0);
        if (totalPower >= 10) {
          emitEngineQuestEvent(newState, p, 'character.power.threshold', {
            name: top.name_fr,
            threshold: 10,
          });
        }
      }
    }
  }
}
