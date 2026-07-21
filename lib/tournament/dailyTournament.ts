import { prisma } from '@/lib/db/prisma';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { sendTournamentCreated } from '@/lib/discord/tournamentCreatedWebhook';
import { TOURNAMENT_PRIZE_CARD_IDS } from '@/lib/variants/constants';
import { ADMIN_USERNAMES, ADMIN_EMAILS } from '@/lib/auth/admins';

export const DAILY_TOURNAMENT_TZ = 'Europe/Paris';
export const DAILY_TOURNAMENT_REG_HOUR = 17;
export const DAILY_TOURNAMENT_START_HOUR = 21;
export const DAILY_TOURNAMENT_MAX_PLAYERS = 16;
export const DAILY_TOURNAMENT_NAME = 'Tournoi du soir';

export function parisDateParts(base: Date = new Date()): { year: number; month: number; day: number; hour: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TOURNAMENT_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(base)) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return { year: +map.year, month: +map.month, day: +map.day, hour };
}

export function parisWallToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TOURNAMENT_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(guess))) map[p.type] = p.value;
  let h = parseInt(map.hour, 10);
  if (h === 24) h = 0;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, h, +map.minute, +map.second);
  const offset = asUtc - guess;
  return new Date(guess - offset);
}

export function pickDailyPrizeCardId(rng: () => number = Math.random): string {
  const list = TOURNAMENT_PRIZE_CARD_IDS as readonly string[];
  return list[Math.floor(rng() * list.length)];
}

export interface DailyTournamentResult {
  created: boolean;
  reason?: 'outside_window' | 'already_exists' | 'no_admin';
  tournamentId?: string;
  prizeCardId?: string;
  scheduledStartAt?: string;
}

export async function createDailyTournamentIfNeeded(now: Date = new Date()): Promise<DailyTournamentResult> {
  const p = parisDateParts(now);

  if (p.hour < DAILY_TOURNAMENT_REG_HOUR || p.hour >= DAILY_TOURNAMENT_START_HOUR) {
    return { created: false, reason: 'outside_window' };
  }

  const scheduledStartAt = parisWallToUtc(p.year, p.month, p.day, DAILY_TOURNAMENT_START_HOUR, 0);
  const dayStart = parisWallToUtc(p.year, p.month, p.day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const existing = await prisma.tournament.findFirst({
    where: { name: DAILY_TOURNAMENT_NAME, scheduledStartAt: { gte: dayStart, lt: dayEnd } },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists', tournamentId: existing.id };

  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { in: [...ADMIN_USERNAMES] } },
        { email: { in: [...ADMIN_EMAILS] } },
      ],
    },
    select: { id: true, username: true },
  });
  if (!admin) return { created: false, reason: 'no_admin' };

  const prizeCardId = pickDailyPrizeCardId();

  const tournament = await prisma.tournament.create({
    data: {
      name: DAILY_TOURNAMENT_NAME,
      type: 'simulator',
      format: 'elimination',
      status: 'registration',
      gameMode: 'classic',
      maxPlayers: DAILY_TOURNAMENT_MAX_PLAYERS,
      isPublic: true,
      joinCode: generateJoinCode(),
      creatorId: admin.id,
      creatorUsername: admin.username,
      requiresDiscord: true,
      useBanList: true,
      scheduledStartAt,
    },
  });

  try {
    await prisma.$runCommandRaw({
      update: 'Tournament',
      updates: [{ q: { _id: { $oid: tournament.id } }, u: { $set: { prizeCardId } } }],
    });
  } catch (err) {
    console.error('[DailyTournament] Failed to persist prizeCardId:', err instanceof Error ? err.message : err);
  }

  sendTournamentCreated(tournament).catch((err) =>
    console.error('[DailyTournament] announce failed:', err instanceof Error ? err.message : err),
  );

  return { created: true, tournamentId: tournament.id, prizeCardId, scheduledStartAt: scheduledStartAt.toISOString() };
}
