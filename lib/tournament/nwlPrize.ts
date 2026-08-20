import { prisma } from '@/lib/db/prisma';
import { NWL_PARTNER_KEY, grantNwlPodiumRoles, announceNwlPodium, type NwlPodiumEntry } from '@/lib/tournament/nwlPartner';
import { cloturerPalierNwl, estPalierNwl, NWL_CHUNIN_PARTNER_KEY, NWL_KAGE_PARTNER_KEY } from '@/lib/tournament/nwlTiers';
import { buildEliminationPrizeUserIds } from '@/lib/tournament/resultsView';
import { MAIN_BRACKET, THIRD_PLACE_BRACKET } from '@/lib/tournament/tournamentEngine';
import type { TournamentData } from '@/stores/tournamentStore';

export async function awardNwlPrizeIfNeeded(tournamentId: string): Promise<void> {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { matches: true },
    });
    if (!tournament) return;
    if (estPalierNwl(tournament.partner)) {
      await cloturerPalierNwl(tournamentId);
      return;
    }
    if (tournament.partner !== NWL_PARTNER_KEY) return;
    if (tournament.status !== 'completed' || !tournament.winnerId) return;
    if (tournament.partnerPrizeAwarded) return;

    const thirdPlaceMatch = tournament.matches.find((m) => (m.bracket ?? MAIN_BRACKET) === THIRD_PLACE_BRACKET);
    const thirdPlacePending = !!thirdPlaceMatch
      && thirdPlaceMatch.status !== 'completed'
      && thirdPlaceMatch.status !== 'forfeit'
      && !!thirdPlaceMatch.player1Id
      && !!thirdPlaceMatch.player2Id;
    if (thirdPlacePending) {
      console.log(`[NWL] third place match still open for ${tournamentId}, prize award deferred until it is resolved`);
      return;
    }

    const prizeIds = buildEliminationPrizeUserIds(tournament as unknown as TournamentData);
    if (prizeIds.length === 0) return;

    const users = await prisma.user.findMany({
      where: { id: { in: prizeIds.map((p) => p.userId) } },
      select: { id: true, username: true, discordId: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const podium: NwlPodiumEntry[] = prizeIds.map((p) => {
      const u = userMap.get(p.userId);
      return { place: p.place, userId: p.userId, username: u?.username ?? '?', discordId: u?.discordId ?? null };
    });

    const { grantedEntries, allEligibleHandled } = await grantNwlPodiumRoles(podium);

    let announced = tournament.partnerAnnounced ?? false;
    if (allEligibleHandled && !announced) {
      if (grantedEntries.length === 0) {
        announced = true;
      } else {
        const claim = await prisma.tournament.updateMany({
          where: { id: tournamentId, partnerAnnounced: false },
          data: { partnerAnnounced: true },
        });
        if (claim.count === 1) {
          const ok = await announceNwlPodium(grantedEntries);
          if (ok) {
            announced = true;
          } else {
            await prisma.tournament.updateMany({ where: { id: tournamentId }, data: { partnerAnnounced: false } });
          }
        } else {
          const fresh = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { partnerAnnounced: true } });
          announced = fresh?.partnerAnnounced ?? false;
        }
      }
    }

    if (allEligibleHandled && announced) {
      await prisma.tournament.updateMany({ where: { id: tournamentId }, data: { partnerPrizeAwarded: true } });
    } else {
      console.warn(
        `[NWL] prize not fully awarded for ${tournamentId} (allEligibleHandled=${allEligibleHandled}, announced=${announced}); leaving partnerPrizeAwarded=false for retry.`,
      );
    }
  } catch (err) {
    console.error('[NWL] awardNwlPrizeIfNeeded failed:', err instanceof Error ? err.message : err);
  }
}

export async function retryPendingNwlPrizes(now: Date): Promise<{ retried: number }> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pending = await prisma.tournament.findMany({
    where: {
      partner: { in: [NWL_PARTNER_KEY, NWL_CHUNIN_PARTNER_KEY, NWL_KAGE_PARTNER_KEY] },
      status: 'completed',
      partnerPrizeAwarded: false,
      completedAt: { gte: cutoff },
    },
    select: { id: true },
  });
  for (const t of pending) {
    await awardNwlPrizeIfNeeded(t.id);
  }
  return { retried: pending.length };
}
