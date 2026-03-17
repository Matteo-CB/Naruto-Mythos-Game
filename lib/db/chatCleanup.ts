import { prisma } from './prisma';

let lastCleanup = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Delete chat messages older than 30 days.
 * Rate-limited to once per hour.
 */
export async function cleanupOldChatMessages(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  try {
    const threshold = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: threshold } },
    });
    if (result.count > 0) {
      console.log(`[ChatCleanup] Deleted ${result.count} messages older than 30 days`);
    }
  } catch (err) {
    console.error('[ChatCleanup] Error:', err);
  }
}
