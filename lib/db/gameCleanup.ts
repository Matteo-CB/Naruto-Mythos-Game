import { prisma } from './prisma';




export const GAME_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours




export const ELO_HISTORY_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run at most once per hour


export async function cleanupOldGames(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  try {
    const cutoff = new Date(now - GAME_TTL_MS);
    const result = await prisma.game.deleteMany({
      where: {
        completedAt: { lt: cutoff },
        status: 'completed',
      },
    });
    if (result.count > 0) {
      console.log(`[GameCleanup] Deleted ${result.count} games older than 24 hours`);
    }

    
    const abandonedCutoff = new Date(now - 24 * 60 * 60 * 1000);
    const abandoned = await prisma.game.deleteMany({
      where: {
        status: 'in_progress',
        createdAt: { lt: abandonedCutoff },
      },
    });
    if (abandoned.count > 0) {
      console.log(`[GameCleanup] Deleted ${abandoned.count} abandoned in_progress games`);
    }

    
    const eloCutoff = new Date(now - ELO_HISTORY_TTL_MS);
    const eloPurge = await prisma.eloHistory.deleteMany({
      where: { createdAt: { lt: eloCutoff } },
    });
    if (eloPurge.count > 0) {
      console.log(`[GameCleanup] Deleted ${eloPurge.count} EloHistory rows older than 14 days`);
    }
  } catch (err) {
    console.error('[GameCleanup] Error during cleanup:', err);
  }
}
