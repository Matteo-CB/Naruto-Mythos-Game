import type { GameState, GameAction } from '@/lib/engine/types';
import type { AIPlayer } from './AIPlayer';

const WORKER_TIMEOUT_MS = 6000;

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;

interface PendingEntry {
  resolve: (action: GameAction | null | undefined) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<number, PendingEntry>();

function failAllPending(): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve(undefined);
  }
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; action: GameAction | null; error?: string }>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      clearTimeout(entry.timer);
      entry.resolve(e.data.error ? undefined : e.data.action);
    };
    worker.onerror = () => {
      workerBroken = true;
      failAllPending();
      worker?.terminate();
      worker = null;
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function requestFromWorker(ai: AIPlayer, state: GameState): Promise<GameAction | null | undefined> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(undefined);
    }, WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      w.postMessage({ id, difficulty: ai.difficulty, player: ai.player, state });
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

export async function getAIActionOffThread(ai: AIPlayer, state: GameState): Promise<GameAction | null> {
  const fromWorker = await requestFromWorker(ai, state);
  if (fromWorker !== undefined) return fromWorker;
  return ai.getActionAsync(state);
}
