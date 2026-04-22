import { prisma } from './prisma';

// Completed games are kept this long before purge. Any consumer that needs
// to reason about "recent games" (anti-cheat heuristics, admin review, etc.)
// must not exceed this window or it will miss records.
export const GAME_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

// EloHistory snapshots survive longer than Games: they keep per-player ELO
// deltas so an admin can audit a player's trajectory even after the source
// Game has been purged. Kept two weeks.
export const ELO_HISTORY_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let lastCleanup = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run at most once per hour

/**
 * Delete completed games older than GAME_TTL_MS, plus EloHistory rows older
 * than ELO_HISTORY_TTL_MS and orphaned in-progress games.
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
      console.log(`[GameCleanup] Deleted ${result.count} games older than 72 hours`);
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

    // Purge EloHistory rows older than 14 days.
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
