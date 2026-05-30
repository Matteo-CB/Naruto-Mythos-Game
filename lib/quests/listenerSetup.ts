import { onQuestEvent } from './hooks';
import { persistQuestProgress } from './persistProgress';
import { emitToUser } from '@/lib/socket/io';
import { getQuestById } from './questData';

let registered = false;

export function ensureQuestPersistenceListener(): void {
  if (registered) return;
  if (typeof window !== 'undefined') return;
  onQuestEvent(async (hook, userId, payload) => {
    try {
      const persisted = await persistQuestProgress(hook, userId, payload);
      for (const row of persisted) {
        const cleanId = row.questId.startsWith('daily:') ? row.questId.slice('daily:'.length) : row.questId;
        const quest = getQuestById(cleanId);
        if (!quest) continue;
        emitToUser(userId, 'quest:progress', {
          questId: cleanId,
          isDaily: row.questId.startsWith('daily:'),
          progress: row.newProgress,
          target: quest.target,
          completedNow: row.completedNow,
          text_fr: quest.text_fr,
          text_en: quest.text_en,
        });
      }
    } catch (err) {
      console.error('[quests] persistence error for hook', hook, err instanceof Error ? err.message : err);
    }
  });
  registered = true;
}
