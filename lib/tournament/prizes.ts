import { prisma } from '@/lib/db/prisma';
import { grantBoosters } from '@/lib/boosters/openBooster';
import { awardXp } from '@/lib/battlepass/awardXp';
import { QUEST_XP_BY_LEVEL, BATTLEPASS_SEASON_SET_ID } from '@/lib/battlepass/constants';
import { SEASON_COMPANION_SET_ID } from '@/lib/battlepass/season';
import { estUnPrixDeTournoiValide, tirerUnPrixDeTournoi } from './prizePool';
import { withUserLock } from '@/lib/quests/userLock';
import { incrementVariant, isVariantOwned } from '@/lib/variants/inventory';

export const WINNER_BOOSTER_COUNT = 3;
export const PARTICIPANT_BOOSTER_COUNT = 1;
export const FALLBACK_XP_IF_OWNED = QUEST_XP_BY_LEVEL[4];

export const SETS_RECOMPENSES: readonly string[] = [BATTLEPASS_SEASON_SET_ID, SEASON_COMPANION_SET_ID];

export interface WinnerPrizeResult {
  boostersGranted: number;
  cardUnlocked: string | null;
  xpGrantedFallback: number;
}

export function isValidPrizeCardId(id: unknown): id is string {
  return estUnPrixDeTournoiValide(id);
}

async function offrirLesBoosters(userId: string, parSet: number): Promise<number> {
  let total = 0;
  for (const setId of SETS_RECOMPENSES) {
    await grantBoosters(userId, setId, parSet);
    total += parSet;
  }
  return total;
}

export async function acquirePrizeAwardLock(tournamentId: string): Promise<boolean> {
  try {
    const result = await prisma.$runCommandRaw({
      findAndModify: 'Tournament',
      query: { _id: { $oid: tournamentId }, prizeAwarded: { $ne: true }, awardsPrizes: { $ne: false } },
      update: { $set: { prizeAwarded: true, prizeAwardedAt: { $date: new Date().toISOString() } } },
      new: false,
    }) as { value?: { _id?: unknown } | null };
    return result.value != null;
  } catch (err) {
    console.error('[Tournament] acquirePrizeAwardLock failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function readTournamentPrizeCardId(tournamentId: string): Promise<string | null> {
  try {
    const raw = await prisma.$runCommandRaw({
      find: 'Tournament',
      filter: { _id: { $oid: tournamentId } },
      projection: { prizeCardId: 1 },
      limit: 1,
    }) as { cursor?: { firstBatch?: Array<{ prizeCardId?: string }> } };
    const doc = raw.cursor?.firstBatch?.[0];
    return doc?.prizeCardId ?? null;
  } catch (err) {
    console.error('[Tournament] readTournamentPrizeCardId failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function grantWinnerPrize(
  userId: string,
  prizeCardId: string | null,
): Promise<WinnerPrizeResult> {
  return withUserLock(userId, async () => {
    const result: WinnerPrizeResult = {
      boostersGranted: 0,
      cardUnlocked: null,
      xpGrantedFallback: 0,
    };

    result.boostersGranted = await offrirLesBoosters(userId, WINNER_BOOSTER_COUNT);

    const carte = isValidPrizeCardId(prizeCardId) ? prizeCardId : tirerUnPrixDeTournoi();
    if (!carte) {
      return result;
    }

    const owned = await isVariantOwned(userId, carte);
    if (owned) {
      await awardXp(userId, FALLBACK_XP_IF_OWNED);
      result.xpGrantedFallback = FALLBACK_XP_IF_OWNED;
    } else {
      await incrementVariant(userId, carte);
      result.cardUnlocked = carte;
    }

    return result;
  });
}

export async function grantParticipantReward(userId: string): Promise<{ boostersGranted: number }> {
  return withUserLock(userId, async () => {
    const boostersGranted = await offrirLesBoosters(userId, PARTICIPANT_BOOSTER_COUNT);
    return { boostersGranted };
  });
}

export interface ParticipantSummary {
  userId: string;
  username: string;
  stayedUntilEnd: boolean;
}

interface ParticipantRaw {
  userId: string;
  username: string;
  absenceForfeited?: boolean;
}

export async function listEligibleParticipantsForReward(
  tournamentId: string,
  excludeUserId: string | null,
): Promise<ParticipantSummary[]> {
  const rows = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    select: { userId: true, username: true },
  });

  const ids = rows.map((r) => r.userId);
  if (ids.length === 0) return [];

  const docsRaw = await prisma.$runCommandRaw({
    find: 'TournamentParticipant',
    filter: { tournamentId: { $oid: tournamentId }, userId: { $in: ids.map((id) => ({ $oid: id })) } },
    projection: { userId: 1, absenceForfeited: 1 },
  }) as { cursor?: { firstBatch?: Array<{ userId?: { $oid?: string }; absenceForfeited?: boolean }> } };

  const absenceByUserId = new Map<string, boolean>();
  for (const doc of docsRaw.cursor?.firstBatch ?? []) {
    const uid = doc.userId?.$oid;
    if (uid) absenceByUserId.set(uid, doc.absenceForfeited === true);
  }

  return (rows as ParticipantRaw[])
    .filter((r) => r.userId !== excludeUserId)
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      stayedUntilEnd: absenceByUserId.get(r.userId) !== true,
    }));
}

export async function markParticipantAbsence(tournamentId: string, userId: string): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      update: 'TournamentParticipant',
      updates: [
        {
          q: { tournamentId: { $oid: tournamentId }, userId: { $oid: userId } },
          u: { $set: { absenceForfeited: true } },
        },
      ],
    });
  } catch (err) {
    console.error('[Tournament] markParticipantAbsence failed:', err instanceof Error ? err.message : err);
  }
}

export async function clearParticipantAbsence(tournamentId: string, userId: string): Promise<void> {
  try {
    await prisma.$runCommandRaw({
      update: 'TournamentParticipant',
      updates: [
        {
          q: { tournamentId: { $oid: tournamentId }, userId: { $oid: userId } },
          u: { $set: { absenceForfeited: false } },
        },
      ],
    });
  } catch (err) {
    console.error('[Tournament] clearParticipantAbsence failed:', err instanceof Error ? err.message : err);
  }
}
