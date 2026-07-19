import { prisma } from '@/lib/db/prisma';
import type { CountryStanding } from './fairScore';
import { incrementVariant, isVariantOwned } from '@/lib/variants/inventory';
import { grantBoosters } from '@/lib/boosters/openBooster';
import { awardXp } from '@/lib/battlepass/awardXp';
import { TOURNAMENT_PRIZE_CARD_IDS } from '@/lib/variants/constants';
import { BATTLEPASS_SEASON_SET_ID } from '@/lib/battlepass/constants';
import { withUserLock } from '@/lib/quests/userLock';

export const CHAMPION_XP = 400;
export const PODIUM2_XP = 200;
export const PODIUM3_XP = 100;
export const TEAM_XP = 50;
export const CHAMPION_BOOSTERS = 3;
export const PODIUM2_BOOSTERS = 2;
export const PODIUM3_BOOSTERS = 1;

export interface PodiumPlayer {
  userId: string;
  username: string;
}

export interface PodiumCountry {
  rank: number;
  countryCode: string;
  score: number;
  players: PodiumPlayer[];
}

export function planPodium(standings: CountryStanding[]): PodiumCountry[] {
  return standings
    .filter((s) => s.ranked)
    .slice(0, 3)
    .map((s, i) => ({
      rank: i + 1,
      countryCode: s.countryCode,
      score: Math.round(s.score * 10) / 10,
      players: s.topPlayers.map((p) => ({ userId: p.userId, username: p.username })),
    }));
}

function boostersForRank(rank: number): number {
  return rank === 1 ? CHAMPION_BOOSTERS : rank === 2 ? PODIUM2_BOOSTERS : PODIUM3_BOOSTERS;
}

function xpForRank(rank: number): number {
  return rank === 1 ? CHAMPION_XP : rank === 2 ? PODIUM2_XP : PODIUM3_XP;
}

async function grantPodiumPlayerReward(userId: string, rank: number, seasonKey: string, endMonth: string, countryCode: string): Promise<void> {
  await withUserLock(userId, async () => {
    await grantBoosters(userId, BATTLEPASS_SEASON_SET_ID, boostersForRank(rank)).catch(() => {});
    await awardXp(userId, xpForRank(rank)).catch(() => {});
    if (rank === 1) {
      for (const cardId of TOURNAMENT_PRIZE_CARD_IDS) {
        const owned = await isVariantOwned(userId, cardId).catch(() => false);
        if (!owned) await incrementVariant(userId, cardId).catch(() => {});
      }
      await prisma.worldcupTitle.upsert({
        where: { userId_seasonKey: { userId, seasonKey } },
        create: { userId, seasonKey, seasonLabel: endMonth, countryCode, rank: 1 },
        update: { seasonLabel: endMonth, countryCode, rank: 1 },
      }).catch(() => {});
    }
  });
}

export interface FinalizeResult {
  finalized: boolean;
  podium: PodiumCountry[];
  championCode: string | null;
  rewardedPlayers: number;
}

export async function finalizeSeason(
  seasonKey: string,
  endMonth: string,
  standings: CountryStanding[],
): Promise<FinalizeResult> {
  const podium = planPodium(standings);
  const championCode = podium[0]?.countryCode ?? null;

  const claimed = await prisma.worldcupSeason.updateMany({
    where: { seasonKey, status: 'open' },
    data: { status: 'finalized', finalizedAt: new Date(), championCode, podium: podium as unknown as object },
  });

  if (claimed.count !== 1) {
    return { finalized: false, podium, championCode, rewardedPlayers: 0 };
  }

  let rewarded = 0;
  for (const country of podium) {
    for (const player of country.players) {
      await grantPodiumPlayerReward(player.userId, country.rank, seasonKey, endMonth, country.countryCode).catch(() => {});
      rewarded += 1;
    }
  }

  const podiumUserIds = new Set(podium.flatMap((c) => c.players.map((p) => p.userId)));
  for (const s of standings) {
    if (!s.ranked) continue;
    for (const p of s.topPlayers) {
      if (podiumUserIds.has(p.userId)) continue;
      await awardXp(p.userId, TEAM_XP).catch(() => {});
    }
  }

  return { finalized: true, podium, championCode, rewardedPlayers: rewarded };
}
