import { prisma } from './prisma';

const GAME_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run at most once per hour

/**
 * Delete completed games older than 7 days.
 * Runs at most once per hour (debounced) to avoid excessive DB queries.
 * Designed to be called fire-and-forget from API routes.
 */
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
      console.log(`[GameCleanup] Deleted ${result.count} games older than 7 days`);
    }

    // Also clean up orphaned in_progress games older than 1 day (abandoned)
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
  } catch (err) {
    console.error('[GameCleanup] Error during cleanup:', err);
  }
}
