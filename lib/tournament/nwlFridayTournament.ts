import { prisma } from '@/lib/db/prisma';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { ADMIN_USERNAMES, ADMIN_EMAILS } from '@/lib/auth/admins';
import { parisDateParts, parisWallToUtc } from '@/lib/tournament/dailyTournament';
import { NWL_PARTNER_KEY, NWL_TOURNAMENT_NAME, NWL_MAX_PLAYERS, NWL_START_HOUR, NWL_TOURNAMENT_RULES_NOTE, NWL_CHUNIN_RESET_WEEKDAY, revokeAllNwlChuninRoles } from '@/lib/tournament/nwlPartner';

export const NWL_REG_OPEN_HOUR = 17;
export const NWL_FRIDAY_WEEKDAY = 5;

export interface NwlFridayResult {
  created: boolean;
  reason?: 'not_friday' | 'outside_window' | 'already_exists' | 'no_admin';
  tournamentId?: string;
  scheduledStartAt?: string;
}

export async function resetNwlChuninIfMonday(now: Date = new Date()): Promise<{ ran: boolean; revoked?: number }> {
  const p = parisDateParts(now);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  if (weekday !== NWL_CHUNIN_RESET_WEEKDAY) return { ran: false };

  const dayStart = parisWallToUtc(p.year, p.month, p.day, 0, 0);
  const already = await prisma.tournament.findFirst({
    where: { partner: NWL_PARTNER_KEY, chuninResetAt: { gte: dayStart } },
    select: { id: true },
  });
  if (already) return { ran: false };

  const result = await revokeAllNwlChuninRoles();
  if (!result) return { ran: false };

  const latest = await prisma.tournament.findFirst({
    where: { partner: NWL_PARTNER_KEY },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (latest) {
    await prisma.tournament.update({ where: { id: latest.id }, data: { chuninResetAt: now } });
  }
  return { ran: true, revoked: result.revoked };
}

export async function createNwlFridayTournamentIfNeeded(now: Date = new Date()): Promise<NwlFridayResult> {
  const p = parisDateParts(now);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  if (weekday !== NWL_FRIDAY_WEEKDAY) return { created: false, reason: 'not_friday' };
  if (p.hour < NWL_REG_OPEN_HOUR || p.hour >= NWL_START_HOUR) return { created: false, reason: 'outside_window' };

  const scheduledStartAt = parisWallToUtc(p.year, p.month, p.day, NWL_START_HOUR, 0);
  const dayStart = parisWallToUtc(p.year, p.month, p.day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const existing = await prisma.tournament.findFirst({
    where: { partner: NWL_PARTNER_KEY, scheduledStartAt: { gte: dayStart, lt: dayEnd } },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists', tournamentId: existing.id };

  const admin = await prisma.user.findFirst({
    where: { OR: [{ username: { in: [...ADMIN_USERNAMES] } }, { email: { in: [...ADMIN_EMAILS] } }] },
    select: { id: true, username: true },
  });
  if (!admin) return { created: false, reason: 'no_admin' };

  const tournament = await prisma.tournament.create({
    data: {
      name: NWL_TOURNAMENT_NAME,
      type: 'simulator',
      format: 'elimination',
      status: 'registration',
      gameMode: 'classic',
      maxPlayers: NWL_MAX_PLAYERS,
      isPublic: true,
      joinCode: generateJoinCode(),
      creatorId: admin.id,
      creatorUsername: admin.username,
      requiresDiscord: true,
      useBanList: true,
      restrictionNote: NWL_TOURNAMENT_RULES_NOTE,
      partner: NWL_PARTNER_KEY,
      scheduledStartAt,
    },
  });

  return { created: true, tournamentId: tournament.id, scheduledStartAt: scheduledStartAt.toISOString() };
}
