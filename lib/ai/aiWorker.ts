import { AIPlayer, type AIDifficulty } from './AIPlayer';
import type { GameState, GameAction, PlayerID } from '@/lib/engine/types';

interface AiWorkRequest {
  id: number;
  difficulty: AIDifficulty;
  player: PlayerID;
  state: GameState;
}

interface AiWorkResponse {
  id: number;
  action: GameAction | null;
  error?: string;
}

const players = new Map<string, AIPlayer>();

function getPlayer(difficulty: AIDifficulty, player: PlayerID): AIPlayer {
  const key = `${difficulty}:${player}`;
  let ai = players.get(key);
  if (!ai) {
    ai = new AIPlayer(difficulty, player);
    players.set(key, ai);
  }
  return ai;
}

self.onmessage = (e: MessageEvent<AiWorkRequest>) => {
  const { id, difficulty, player, state } = e.data;
  try {
    const ai = getPlayer(difficulty, player);
    const action = ai.getAction(state);
    const response: AiWorkResponse = { id, action };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: AiWorkResponse = {
      id,
      action: null,
      error: err instanceof Error ? err.message : 'ai worker error',
    };
    (self as unknown as Worker).postMessage(response);
  }
};
