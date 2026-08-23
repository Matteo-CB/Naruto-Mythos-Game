import { prisma } from '@/lib/db/prisma';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { parisDateParts, parisWallToUtc } from '@/lib/tournament/dailyTournament';
import { NWL_PARTNER_KEY, NWL_TOURNAMENT_NAME, NWL_MAX_PLAYERS, NWL_START_HOUR, NWL_TOURNAMENT_RULES_NOTE, revokeNwlChuninRolesFor } from '@/lib/tournament/nwlPartner';
import { lireTagsChunin, ecrireTagsChunin, separerTagsExpires } from '@/lib/tournament/nwlChuninEarned';
import { findNwlTournamentOwner } from '@/lib/tournament/tournamentOwner';

export const NWL_REG_OPEN_HOUR = 14;
export const NWL_FRIDAY_WEEKDAY = 5;
export const NWL_GENIN_LEAD_HOURS = 24;

export function prochainVendredi(now: Date, heureDepart: number): Date {
  const p = parisDateParts(now);
  const jour = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const dansCombien = jour === NWL_FRIDAY_WEEKDAY && p.hour < heureDepart
    ? 0
    : (NWL_FRIDAY_WEEKDAY - jour + 7) % 7 || 7;
  const cible = new Date(Date.UTC(p.year, p.month - 1, p.day + dansCombien));
  return parisWallToUtc(cible.getUTCFullYear(), cible.getUTCMonth() + 1, cible.getUTCDate(), heureDepart, 0);
}

export interface NwlFridayResult {
  created: boolean;
  reason?: 'not_friday' | 'outside_window' | 'already_exists' | 'no_admin';
  tournamentId?: string;
  scheduledStartAt?: string;
}

export async function retirerChuninExpires(now: Date = new Date()): Promise<{ ran: boolean; revoked?: number }> {
  const tags = await lireTagsChunin();
  if (tags.length === 0) return { ran: false };

  const { expires, valides } = separerTagsExpires(tags, now.getTime());
  if (expires.length === 0) return { ran: false };

  const resultat = await revokeNwlChuninRolesFor(expires.map((t) => t.discordId));
  const gardes = [
    ...valides,
    ...expires.filter((t) => resultat.restants.includes(t.discordId)),
  ];
  await ecrireTagsChunin(gardes);
  return { ran: true, revoked: resultat.revoked };
}

export async function createNwlFridayTournamentIfNeeded(now: Date = new Date()): Promise<NwlFridayResult> {
  const scheduledStartAt = prochainVendredi(now, NWL_START_HOUR);
  const avance = scheduledStartAt.getTime() - now.getTime();
  if (avance > NWL_GENIN_LEAD_HOURS * 60 * 60 * 1000) return { created: false, reason: 'outside_window' };

  const dayStart = new Date(scheduledStartAt.getTime() - 22 * 60 * 60 * 1000);
  const existing = await prisma.tournament.findFirst({
    where: { partner: NWL_PARTNER_KEY, scheduledStartAt: { gte: dayStart, lte: scheduledStartAt } },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists', tournamentId: existing.id };

  const admin = await findNwlTournamentOwner();
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
