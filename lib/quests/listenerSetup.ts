import { onQuestEvent } from './hooks';
import { persistQuestProgress } from './persistProgress';

let registered = false;

export function ensureQuestPersistenceListener(): void {
  if (registered) return;
  if (typeof window !== 'undefined') return;
  onQuestEvent(async (hook, userId, payload) => {
    try {
      await persistQuestProgress(hook, userId, payload);
    } catch (err) {
      console.error('[quests] persistence error for hook', hook, err instanceof Error ? err.message : err);
    }
  });
  registered = true;
}
