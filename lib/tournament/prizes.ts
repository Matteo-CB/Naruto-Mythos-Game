import { prisma } from '@/lib/db/prisma';
import { grantBoosters } from '@/lib/boosters/openBooster';
import { awardXp } from '@/lib/battlepass/awardXp';
import {
  TOURNAMENT_PRIZE_CARD_IDS,
  type TournamentPrizeCardId,
} from '@/lib/variants/constants';
import { QUEST_XP_BY_LEVEL, BATTLEPASS_SEASON_SET_ID } from '@/lib/battlepass/constants';
import { withUserLock } from '@/lib/quests/userLock';
import { incrementVariant, isVariantOwned } from '@/lib/variants/inventory';

export const WINNER_BOOSTER_COUNT = 3;
export const PARTICIPANT_BOOSTER_COUNT = 1;
export const FALLBACK_XP_IF_OWNED = QUEST_XP_BY_LEVEL[4];

export interface WinnerPrizeResult {
  boostersGranted: number;
  cardUnlocked: TournamentPrizeCardId | null;
  xpGrantedFallback: number;
}

export function isValidPrizeCardId(id: unknown): id is TournamentPrizeCardId {
  return typeof id === 'string' && (TOURNAMENT_PRIZE_CARD_IDS as readonly string[]).includes(id);
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

    await grantBoosters(userId, BATTLEPASS_SEASON_SET_ID, WINNER_BOOSTER_COUNT);
    result.boostersGranted = WINNER_BOOSTER_COUNT;

    if (!isValidPrizeCardId(prizeCardId)) {
      return result;
    }

    const owned = await isVariantOwned(userId, prizeCardId);
    if (owned) {
      await awardXp(userId, FALLBACK_XP_IF_OWNED);
      result.xpGrantedFallback = FALLBACK_XP_IF_OWNED;
    } else {
      await incrementVariant(userId, prizeCardId);
      result.cardUnlocked = prizeCardId;
    }

    return result;
  });
}

export async function grantParticipantReward(userId: string): Promise<{ boostersGranted: number }> {
  return withUserLock(userId, async () => {
    await grantBoosters(userId, BATTLEPASS_SEASON_SET_ID, PARTICIPANT_BOOSTER_COUNT);
    return { boostersGranted: PARTICIPANT_BOOSTER_COUNT };
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
