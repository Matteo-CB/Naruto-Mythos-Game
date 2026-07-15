import { prisma } from './prisma';
import { CHAT_MESSAGE_TTL_MS, DM_TTL_MS, SEEN_NOTIFICATION_TTL_MS } from '@/lib/chat/constants';

let lastCleanup = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000;

export async function cleanupOldChatMessages(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  try {
    const gameChatThreshold = new Date(now - CHAT_MESSAGE_TTL_MS);
    const result = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: gameChatThreshold } },
    });
    if (result.count > 0) {
      console.log(`[ChatCleanup] Deleted ${result.count} game chat messages older than 72h`);
    }

    const dmThreshold = new Date(now - DM_TTL_MS);
    const dmResult = await prisma.privateMessage.deleteMany({
      where: { createdAt: { lt: dmThreshold } },
    });
    if (dmResult.count > 0) {
      console.log(`[ChatCleanup] Deleted ${dmResult.count} private messages older than 30 days`);
    }

    const notifThreshold = new Date(now - SEEN_NOTIFICATION_TTL_MS);
    const notifResult = await prisma.playerNotification.deleteMany({
      where: { seenAt: { not: null, lt: notifThreshold } },
    });
    if (notifResult.count > 0) {
      console.log(`[ChatCleanup] Deleted ${notifResult.count} seen notifications older than 30 days`);
    }

    const { cleanupOldScans } = await import('@/lib/moderation/autoScan');
    await cleanupOldScans();
  } catch (err) {
    console.error('[ChatCleanup] Error:', err);
  }
}
