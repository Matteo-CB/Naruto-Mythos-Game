const userLockQueue = new Map<string, Promise<unknown>>();

export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = userLockQueue.get(userId) ?? Promise.resolve();
  let resolveOuter: () => void;
  const next = new Promise<void>((r) => { resolveOuter = r; });
  userLockQueue.set(userId, next);
  try {
    await prev;
    return await fn();
  } finally {
    resolveOuter!();
    if (userLockQueue.get(userId) === next) userLockQueue.delete(userId);
  }
}
