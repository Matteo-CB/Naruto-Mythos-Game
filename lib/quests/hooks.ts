export type QuestEventPayload = Record<string, unknown> & {
  delta?: number;
  gameMode?: GameMode;
  matchKey?: string;
};

export type GameMode =
  | 'ranked'
  | 'casual'
  | 'evolving'
  | 'highlander'
  | 'sealed'
  | 'tournament'
  | 'ai'
  | 'hotseat'
  | 'solo_v_self';

export type QuestListener = (
  hook: string,
  userId: string,
  payload?: QuestEventPayload,
) => void | Promise<void>;

const listeners: QuestListener[] = [];

export function onQuestEvent(listener: QuestListener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function emitQuestEvent(
  hook: string,
  userId: string | null | undefined,
  payload?: QuestEventPayload,
): void {
  if (!userId) return;
  for (const l of listeners) {
    try {
      void l(hook, userId, payload);
    } catch (err) {
      console.error('[quests] listener error for hook', hook, err);
    }
  }
}

export function clearQuestListeners(): void {
  listeners.length = 0;
}
