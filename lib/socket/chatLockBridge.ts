import { invalidatePairChatCache } from '@/lib/chat/pairState';

type Refresher = (userIdA: string, userIdB?: string) => void;

let refresher: Refresher | null = null;

export function setChatLockRefresher(fn: Refresher): void {
  refresher = fn;
}

export function refreshChatLock(userIdA: string, userIdB?: string): void {
  invalidatePairChatCache(userIdA);
  if (userIdB) invalidatePairChatCache(userIdB);
  try {
    refresher?.(userIdA, userIdB);
  } catch {
    return;
  }
}
