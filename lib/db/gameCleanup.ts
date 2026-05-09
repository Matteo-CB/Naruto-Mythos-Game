import { prisma } from './prisma';




export const GAME_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours




export const ELO_HISTORY_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const TOURNAMENT_ADMIN_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const TOURNAMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
      console.log(`[GameCleanup] Deleted ${result.count} games older than 72 hours`);
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

    const inviteCutoff = new Date(now - 24 * 60 * 60 * 1000);
    const invitePurge = await prisma.matchInvite.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(now) } },
          { status: { in: ['accepted', 'declined', 'cancelled'] }, createdAt: { lt: inviteCutoff } },
        ],
      },
    });
    if (invitePurge.count > 0) {
      console.log(`[GameCleanup] Deleted ${invitePurge.count} expired/resolved match invites`);
    }

    const deckStatsCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const deckStatsPurge = await prisma.deckStats.deleteMany({
      where: { lastPlayedAt: { lt: deckStatsCutoff } },
    });
    if (deckStatsPurge.count > 0) {
      console.log(`[GameCleanup] Deleted ${deckStatsPurge.count} DeckStats rows with no activity for 90+ days`);
    }


    const adminLogCutoff = new Date(now - TOURNAMENT_ADMIN_LOG_TTL_MS);
    const adminLogPurge = await prisma.tournamentAdminLog.deleteMany({
      where: { createdAt: { lt: adminLogCutoff } },
    });
    if (adminLogPurge.count > 0) {
      console.log(`[GameCleanup] Deleted ${adminLogPurge.count} TournamentAdminLog rows older than 30 days`);
    }


    const tournamentCutoff = new Date(now - TOURNAMENT_TTL_MS);
    const nowDate = new Date(now);
    const oldTournaments = await prisma.tournament.findMany({
      where: {
        OR: [
          { status: 'completed', completedAt: { lt: tournamentCutoff } },
          { status: 'cancelled', completedAt: { lt: tournamentCutoff } },
          { status: 'cancelled', completedAt: null, createdAt: { lt: tournamentCutoff } },
          {
            status: 'registration',
            createdAt: { lt: tournamentCutoff },
            OR: [
              { scheduledStartAt: null },
              { scheduledStartAt: { lt: nowDate } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (oldTournaments.length > 0) {
      const ids = oldTournaments.map(t => t.id);
      const [matches, participants, adminLogs, tournaments] = await prisma.$transaction([
        prisma.tournamentMatch.deleteMany({ where: { tournamentId: { in: ids } } }),
        prisma.tournamentParticipant.deleteMany({ where: { tournamentId: { in: ids } } }),
        prisma.tournamentAdminLog.deleteMany({ where: { tournamentId: { in: ids } } }),
        prisma.tournament.deleteMany({ where: { id: { in: ids } } }),
      ]);
      console.log(`[GameCleanup] Purged ${tournaments.count} tournaments older than 30 days (${matches.count} matches, ${participants.count} participants, ${adminLogs.count} admin logs)`);
    }
  } catch (err) {
    console.error('[GameCleanup] Error during cleanup:', err);
  }
}
