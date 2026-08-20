import { prisma } from '@/lib/db/prisma';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { parisDateParts, parisWallToUtc } from '@/lib/tournament/dailyTournament';
import { findTournamentOwner } from '@/lib/tournament/tournamentOwner';
import {
  NWL_CHUNIN_ROLE_ID,
  NWL_KAGE_ROLE_ID,
  NWL_ANNOUNCE_CHANNEL_ID,
  NWL_LEADERBOARD_CHANNEL_ID,
  NWL_MOD_CHANNEL_ID,
  NWL_INVITE_URL,
  listNwlChuninHolders,
  listNwlRoleHolders,
  nwlPostMessage,
  nwlEditMessage,
  nwlSendDirectMessage,
  checkNwlRole,
  grantNwlRole,
  revokeNwlRole,
  NWL_NARUTO_MYTHOS_ROLE_ID,
  NWL_TOURNAMENT_NAME,
  NWL_START_HOUR,
  type NwlMessageRef,
  type NwlPodiumEntry,
} from '@/lib/tournament/nwlPartner';
import { buildEliminationPrizeUserIds } from '@/lib/tournament/resultsView';
import type { TournamentData } from '@/stores/tournamentStore';
import {
  NWL_FIRST_PLACE_STORE_CREDIT_GBP,
  NWL_CHUNIN_PODIUM_PLACES,
} from '@/lib/tournament/weeklySchedule';

export const NWL_CHUNIN_PARTNER_KEY = 'nwl-chunin';
export const NWL_KAGE_PARTNER_KEY = 'nwl-kage';

export const NWL_CHUNIN_TOURNAMENT_NAME = 'Saturday Chunin Tag Tournament';
export const NWL_KAGE_TOURNAMENT_NAME = 'Monthly Kage Only Tournament';

export const NWL_CHUNIN_WEEKDAY = 6;
export const NWL_KAGE_WEEKDAY = 0;

export const NWL_CHUNIN_START_HOUR = 22;
export const NWL_KAGE_START_HOUR = 21;
export const NWL_TIER_CODE_LEAD_HOURS = 12;

export const NWL_CHUNIN_MAX_PLAYERS = 32;
export const NWL_KAGE_MAX_PLAYERS = 8;

export const NWL_POINTS_PER_WIN = 3;
export const NWL_POINTS_PER_LOSS = 1;

export const NWL_CHUNIN_STORE_CREDIT_GBP = 50;

export const NWL_HEURE_SYNCHRO_KAGE = 12;

export function estPremierDimancheDuMois(annee: number, mois: number, jour: number): boolean {
  if (jour > 7) return false;
  return new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() === NWL_KAGE_WEEKDAY;
}

export interface NwlTierCreation {
  created: boolean;
  reason?: 'wrong_day' | 'outside_window' | 'already_exists' | 'no_admin' | 'no_eligible';
  tournamentId?: string;
  joinCode?: string;
  scheduledStartAt?: string;
}

interface SpecPalier {
  partnerKey: string;
  name: string;
  maxPlayers: number;
  startHour: number;
  note: string;
}

const SPEC_CHUNIN: SpecPalier = {
  partnerKey: NWL_CHUNIN_PARTNER_KEY,
  name: NWL_CHUNIN_TOURNAMENT_NAME,
  maxPlayers: NWL_CHUNIN_MAX_PLAYERS,
  startHour: NWL_CHUNIN_START_HOUR,
  note: [
    'New World Loot weekly Saturday tournament, reserved to players holding the Chunin role.',
    `Rewards. First place wins £${NWL_CHUNIN_STORE_CREDIT_GBP} of store credit, offered by New World Loot.`,
    `Every match played counts towards the monthly Chunin standings: ${NWL_POINTS_PER_WIN} points for a win, ${NWL_POINTS_PER_LOSS} point for a loss.`,
    'The eight best players of the month are invited to the Kage tournament, held the first Sunday of the next month.',
    `Entry is private: the join code is sent to Chunin role holders on the New World Loot Discord server: ${NWL_INVITE_URL}`,
  ].join(' '),
};

const SPEC_KAGE: SpecPalier = {
  partnerKey: NWL_KAGE_PARTNER_KEY,
  name: NWL_KAGE_TOURNAMENT_NAME,
  maxPlayers: NWL_KAGE_MAX_PLAYERS,
  startHour: NWL_KAGE_START_HOUR,
  note: [
    'New World Loot monthly tournament, reserved to the eight best players of last month Chunin standings.',
    'Rewards. First place wins a sealed box of Naruto Mythos, offered by New World Loot.',
    `Entry is private: the join code is sent to the eight qualified players on the New World Loot Discord server: ${NWL_INVITE_URL}`,
  ].join(' '),
};

async function creerTournoiPrive(
  spec: SpecPalier,
  now: Date,
  jourValide: (p: ReturnType<typeof parisDateParts>) => boolean,
): Promise<NwlTierCreation> {
  const p = parisDateParts(now);
  if (!jourValide(p)) return { created: false, reason: 'wrong_day' };

  const ouverture = spec.startHour - NWL_TIER_CODE_LEAD_HOURS;
  if (p.hour < Math.max(0, ouverture) || p.hour >= spec.startHour) {
    return { created: false, reason: 'outside_window' };
  }

  const debutJour = parisWallToUtc(p.year, p.month, p.day, 0, 0);
  const finJour = new Date(debutJour.getTime() + 24 * 60 * 60 * 1000);
  const existant = await prisma.tournament.findFirst({
    where: { partner: spec.partnerKey, scheduledStartAt: { gte: debutJour, lt: finJour } },
    select: { id: true, joinCode: true },
  });
  if (existant) {
    return { created: false, reason: 'already_exists', tournamentId: existant.id, joinCode: existant.joinCode ?? undefined };
  }

  const admin = await findTournamentOwner();
  if (!admin) return { created: false, reason: 'no_admin' };

  const scheduledStartAt = parisWallToUtc(p.year, p.month, p.day, spec.startHour, 0);
  const joinCode = generateJoinCode();

  const tournoi = await prisma.tournament.create({
    data: {
      name: spec.name,
      type: 'simulator',
      format: 'elimination',
      status: 'registration',
      gameMode: 'classic',
      maxPlayers: spec.maxPlayers,
      isPublic: false,
      joinCode,
      creatorId: admin.id,
      creatorUsername: admin.username,
      requiresDiscord: true,
      useBanList: true,
      restrictionNote: spec.note,
      partner: spec.partnerKey,
      scheduledStartAt,
    },
  });

  return {
    created: true,
    tournamentId: tournoi.id,
    joinCode,
    scheduledStartAt: scheduledStartAt.toISOString(),
  };
}

export async function createNwlChuninTournamentIfNeeded(now: Date = new Date()): Promise<NwlTierCreation> {
  return creerTournoiPrive(SPEC_CHUNIN, now, (p) => {
    const jour = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return jour === NWL_CHUNIN_WEEKDAY;
  });
}

export async function createNwlKageTournamentIfNeeded(now: Date = new Date()): Promise<NwlTierCreation> {
  return creerTournoiPrive(SPEC_KAGE, now, (p) => estPremierDimancheDuMois(p.year, p.month, p.day));
}

export interface NwlStandingEntry {
  userId: string;
  username: string;
  discordId: string | null;
  wins: number;
  losses: number;
  points: number;
}

export function pointsDe(wins: number, losses: number): number {
  return wins * NWL_POINTS_PER_WIN + losses * NWL_POINTS_PER_LOSS;
}

export function bornesDuMois(now: Date): { debut: Date; fin: Date } {
  const p = parisDateParts(now);
  const debut = parisWallToUtc(p.year, p.month, 1, 0, 0);
  const moisSuivant = p.month === 12 ? 1 : p.month + 1;
  const anneeSuivante = p.month === 12 ? p.year + 1 : p.year;
  const fin = parisWallToUtc(anneeSuivante, moisSuivant, 1, 0, 0);
  return { debut, fin };
}

export function bornesDuMoisPrecedent(now: Date): { debut: Date; fin: Date } {
  const p = parisDateParts(now);
  const moisPrecedent = p.month === 1 ? 12 : p.month - 1;
  const anneePrecedente = p.month === 1 ? p.year - 1 : p.year;
  const debut = parisWallToUtc(anneePrecedente, moisPrecedent, 1, 0, 0);
  const fin = parisWallToUtc(p.year, p.month, 1, 0, 0);
  return { debut, fin };
}

export async function chuninStandings(debut: Date, fin: Date): Promise<NwlStandingEntry[]> {
  const tournois = await prisma.tournament.findMany({
    where: { partner: NWL_CHUNIN_PARTNER_KEY, scheduledStartAt: { gte: debut, lt: fin } },
    select: { id: true },
  });
  if (tournois.length === 0) return [];
  const ids = tournois.map((t) => t.id);

  const matchs = await prisma.tournamentMatch.findMany({
    where: { tournamentId: { in: ids }, status: 'completed' },
    select: { player1Id: true, player2Id: true, winnerId: true },
  });

  const compte = new Map<string, { wins: number; losses: number }>();
  const ajoute = (userId: string | null | undefined, gagne: boolean) => {
    if (!userId) return;
    const c = compte.get(userId) ?? { wins: 0, losses: 0 };
    if (gagne) c.wins += 1; else c.losses += 1;
    compte.set(userId, c);
  };
  for (const m of matchs) {
    if (!m.winnerId) continue;
    ajoute(m.player1Id, m.player1Id === m.winnerId);
    ajoute(m.player2Id, m.player2Id === m.winnerId);
  }
  if (compte.size === 0) return [];

  const joueurs = await prisma.user.findMany({
    where: { id: { in: [...compte.keys()] } },
    select: { id: true, username: true, discordId: true },
  });

  const entrees: NwlStandingEntry[] = joueurs.map((u) => {
    const c = compte.get(u.id) ?? { wins: 0, losses: 0 };
    return {
      userId: u.id,
      username: u.username,
      discordId: u.discordId ?? null,
      wins: c.wins,
      losses: c.losses,
      points: pointsDe(c.wins, c.losses),
    };
  });

  entrees.sort((a, b) => b.points - a.points || b.wins - a.wins || a.username.localeCompare(b.username));
  return entrees;
}

export async function kageQualifiers(now: Date = new Date()): Promise<NwlStandingEntry[]> {
  const { debut, fin } = bornesDuMoisPrecedent(now);
  const classement = await chuninStandings(debut, fin);
  return classement.slice(0, NWL_KAGE_MAX_PLAYERS);
}

export function texteCodeAcces(nom: string, code: string, heureParis: number): string {
  return [
    `**${nom}**`,
    `Your join code: \`${code}\``,
    `Start: ${heureParis - 1}:00 BST. Open the Naruto Mythos simulator, go to Tournaments, and join with this code.`,
    'Keep it private: it is reserved to eligible players.',
  ].join('\n');
}

export async function diffuserCodeChunin(code: string): Promise<{ mp: number; salon: boolean }> {
  const porteurs = (await listNwlChuninHolders()) ?? [];
  let mp = 0;
  for (const discordId of porteurs) {
    const ok = await nwlSendDirectMessage(discordId, texteCodeAcces(NWL_CHUNIN_TOURNAMENT_NAME, code, NWL_CHUNIN_START_HOUR));
    if (ok) mp += 1;
  }
  const salon = await nwlPostMessage(
    NWL_ANNOUNCE_CHANNEL_ID,
    `<@&${NWL_CHUNIN_ROLE_ID}>\n${texteCodeAcces(NWL_CHUNIN_TOURNAMENT_NAME, code, NWL_CHUNIN_START_HOUR)}`,
    NWL_CHUNIN_ROLE_ID,
  );
  return { mp, salon: salon !== null };
}

export async function diffuserCodeKage(code: string, now: Date = new Date()): Promise<{ mp: number; salon: boolean }> {
  const qualifies = await kageQualifiers(now);
  let mp = 0;
  for (const q of qualifies) {
    if (!q.discordId) continue;
    const ok = await nwlSendDirectMessage(q.discordId, texteCodeAcces(NWL_KAGE_TOURNAMENT_NAME, code, NWL_KAGE_START_HOUR));
    if (ok) mp += 1;
  }
  const porteursKage = (await listNwlRoleHolders(NWL_KAGE_ROLE_ID)) ?? [];
  void porteursKage;
  const salon = await nwlPostMessage(
    NWL_ANNOUNCE_CHANNEL_ID,
    `<@&${NWL_KAGE_ROLE_ID}>\n${texteCodeAcces(NWL_KAGE_TOURNAMENT_NAME, code, NWL_KAGE_START_HOUR)}`,
    NWL_KAGE_ROLE_ID,
  );
  return { mp, salon: salon !== null };
}

const CLE_REGLAGES = 'global';

export function formaterClassement(entrees: NwlStandingEntry[], titre: string): string {
  if (entrees.length === 0) {
    return `**${titre}**\nNo match played yet this month.`;
  }
  const lignes = entrees.map((e, i) => {
    const rang = `${i + 1}`.padStart(2, ' ');
    return `\`${rang}.\` **${e.username}** : ${e.points} pts (${e.wins}W / ${e.losses}L)`;
  });
  const haut = entrees.slice(0, NWL_KAGE_MAX_PLAYERS).length;
  return [
    `**${titre}**`,
    ...lignes,
    '',
    `The top ${haut} qualify for the ${NWL_KAGE_TOURNAMENT_NAME} on the first Sunday of next month.`,
    `${NWL_POINTS_PER_WIN} points per win, ${NWL_POINTS_PER_LOSS} point per loss.`,
  ].join('\n');
}

async function refLue(): Promise<NwlMessageRef | null> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlLeaderboard: true },
  });
  const brut = reglages?.nwlLeaderboard as { channelId?: string; messageId?: string } | null | undefined;
  if (!brut?.channelId || !brut?.messageId) return null;
  return { channelId: brut.channelId, messageId: brut.messageId };
}

async function refEcrite(ref: NwlMessageRef): Promise<void> {
  const valeur = { channelId: ref.channelId, messageId: ref.messageId };
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlLeaderboard: valeur },
    create: { key: CLE_REGLAGES, nwlLeaderboard: valeur },
  });
}

export async function publierClassementChunin(now: Date = new Date()): Promise<{ publie: boolean; joueurs: number }> {
  const { debut, fin } = bornesDuMois(now);
  const entrees = await chuninStandings(debut, fin);
  const p = parisDateParts(now);
  const texte = formaterClassement(entrees, `Chunin standings ${p.year}-${String(p.month).padStart(2, '0')}`);

  const existante = await refLue();
  if (existante) {
    const modifie = await nwlEditMessage(existante, texte);
    if (modifie) return { publie: true, joueurs: entrees.length };
  }

  const nouvelle = await nwlPostMessage(NWL_LEADERBOARD_CHANNEL_ID, texte);
  if (!nouvelle) return { publie: false, joueurs: entrees.length };
  await refEcrite(nouvelle);
  return { publie: true, joueurs: entrees.length };
}

export async function publierDecksDuTournoi(tournamentId: string): Promise<boolean> {
  const tournoi = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { name: true, partner: true },
  });
  if (!tournoi) return false;

  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId },
    select: { username: true, deckId: true },
  });
  if (participants.length === 0) return false;

  const decks = await prisma.deck.findMany({
    where: { id: { in: participants.map((p) => p.deckId).filter((d): d is string => !!d) } },
    select: { id: true, name: true, cardIds: true, missionIds: true },
  });
  const parId = new Map(decks.map((d) => [d.id, d]));

  const lignes = participants.map((p) => {
    const d = p.deckId ? parId.get(p.deckId) : null;
    if (!d) return `**${p.username}** : no deck recorded`;
    return `**${p.username}** : ${d.name} (${d.cardIds.length} cards, ${d.missionIds.length} missions)\n\`${d.cardIds.join(' ')}\``;
  });

  const entete = `**Decks played : ${tournoi.name}**`;
  let bloc = entete;
  for (const ligne of lignes) {
    if (bloc.length + ligne.length + 2 > 1900) {
      await nwlPostMessage(NWL_MOD_CHANNEL_ID, bloc);
      bloc = '';
    }
    bloc += (bloc ? '\n\n' : '') + ligne;
  }
  if (bloc) await nwlPostMessage(NWL_MOD_CHANNEL_ID, bloc);
  return true;
}

export async function annoncerOuvertureGenin(): Promise<boolean> {
  const texte = [
    `**${NWL_TOURNAMENT_NAME}**`,
    'Registration is open on the Naruto Mythos simulator, in the Tournaments page.',
    `Start: ${NWL_START_HOUR - 1}:00 BST. Single elimination, standard ban list, free entry.`,
    `First place wins £${NWL_FIRST_PLACE_STORE_CREDIT_GBP} of store credit, offered by New World Loot.`,
    `The first ${NWL_CHUNIN_PODIUM_PLACES} players earn the Chunin role, which opens the Chunin tournament the next day.`,
    'Link your Discord account on the simulator before you register, otherwise the role cannot be given to you.',
  ].join('\n');
  const ref = await nwlPostMessage(
    NWL_ANNOUNCE_CHANNEL_ID,
    `<@&${NWL_NARUTO_MYTHOS_ROLE_ID}>\n${texte}`,
    NWL_NARUTO_MYTHOS_ROLE_ID,
  );
  return ref !== null;
}

export async function synchroniserRoleKage(now: Date = new Date()): Promise<{ ajoutes: number; retires: number } | null> {
  const qualifies = await kageQualifiers(now);
  const attendus = new Set(qualifies.map((q) => q.discordId).filter((d): d is string => !!d));
  const porteurs = await listNwlRoleHolders(NWL_KAGE_ROLE_ID);
  if (porteurs === null) return null;

  let ajoutes = 0;
  let retires = 0;
  for (const discordId of attendus) {
    if (porteurs.includes(discordId)) continue;
    if ((await grantNwlRole(discordId, NWL_KAGE_ROLE_ID)) === 'granted') ajoutes += 1;
  }
  for (const discordId of porteurs) {
    if (attendus.has(discordId)) continue;
    if ((await revokeNwlRole(discordId, NWL_KAGE_ROLE_ID)) === 'granted') retires += 1;
  }
  return { ajoutes, retires };
}

export function estPalierNwl(partner: string | null | undefined): boolean {
  return partner === NWL_CHUNIN_PARTNER_KEY || partner === NWL_KAGE_PARTNER_KEY;
}

function texteVictoirePalier(nom: string, podium: NwlPodiumEntry[], recompense: string): string {
  const presente = (e: NwlPodiumEntry) => (e.discordId ? `**${e.username}** (<@${e.discordId}>)` : `**${e.username}**`);
  const lignes: string[] = [`The **${nom}** is over.`, ''];
  for (const place of [1, 2, 3] as const) {
    const gens = podium.filter((e) => e.place === place);
    if (gens.length === 0) continue;
    const rang = place === 1 ? '1st place' : place === 2 ? '2nd place' : '3rd place';
    lignes.push(`${rang}: ${gens.map(presente).join(', ')}`);
  }
  lignes.push('');
  lignes.push(recompense);
  return lignes.join('\n');
}

export async function cloturerPalierNwl(tournamentId: string): Promise<boolean> {
  const tournoi = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { partner: true, name: true, status: true, winnerId: true, partnerPrizeAwarded: true },
  });
  if (!tournoi || !estPalierNwl(tournoi.partner)) return false;
  if (tournoi.status !== 'completed' || !tournoi.winnerId) return false;
  if (tournoi.partnerPrizeAwarded) return false;

  const reserve = await prisma.tournament.updateMany({
    where: { id: tournamentId, partnerPrizeAwarded: false },
    data: { partnerPrizeAwarded: true },
  });
  if (reserve.count !== 1) return false;

  const complet = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { matches: true } });
  const places = complet ? buildEliminationPrizeUserIds(complet as unknown as TournamentData) : [];
  const joueurs = await prisma.user.findMany({
    where: { id: { in: places.map((p) => p.userId) } },
    select: { id: true, username: true, discordId: true },
  });
  const parId = new Map(joueurs.map((u) => [u.id, u]));
  const podium: NwlPodiumEntry[] = places.map((p) => {
    const u = parId.get(p.userId);
    return { place: p.place, userId: p.userId, username: u?.username ?? '?', discordId: u?.discordId ?? null };
  });

  const estChunin = tournoi.partner === NWL_CHUNIN_PARTNER_KEY;
  const recompense = estChunin
    ? `First place wins £${NWL_CHUNIN_STORE_CREDIT_GBP} of store credit, offered by New World Loot. Every match played counts towards the monthly Chunin standings.`
    : 'First place wins a sealed box of Naruto Mythos, offered by New World Loot.';
  const role = estChunin ? NWL_CHUNIN_ROLE_ID : NWL_KAGE_ROLE_ID;

  await nwlPostMessage(
    NWL_ANNOUNCE_CHANNEL_ID,
    `<@&${role}>\n${texteVictoirePalier(tournoi.name, podium, recompense)}`,
    role,
  );

  await publierDecksDuTournoi(tournamentId);
  if (estChunin) await publierClassementChunin();
  return true;
}

export function roleRequisPourPalier(partner: string | null | undefined): string | null {
  if (partner === NWL_CHUNIN_PARTNER_KEY) return NWL_CHUNIN_ROLE_ID;
  if (partner === NWL_KAGE_PARTNER_KEY) return NWL_KAGE_ROLE_ID;
  return null;
}

export interface RefusPalierNwl {
  errorKey: string;
  error: string;
  status: number;
  inviteUrl?: string;
}

export async function refuserSiPalierNwlInterdit(
  partner: string | null | undefined,
  discordId: string | null | undefined,
): Promise<RefusPalierNwl | null> {
  const role = roleRequisPourPalier(partner);
  if (!role) return null;
  if (!discordId) {
    return { errorKey: 'tournament.error.linkDiscord', error: 'Link your Discord account first', status: 403 };
  }
  const verdict = await checkNwlRole(discordId, role);
  if (verdict === 'not_member') {
    return {
      errorKey: 'tournament.error.nwlNotMember',
      error: 'Join the New World Loot Discord server first',
      status: 403,
      inviteUrl: NWL_INVITE_URL,
    };
  }
  if (verdict === 'unavailable') {
    return {
      errorKey: 'tournament.error.nwlCheckUnavailable',
      error: 'Membership check temporarily unavailable, please try again in a moment',
      status: 503,
    };
  }
  if (verdict === 'no_role') {
    return partner === NWL_CHUNIN_PARTNER_KEY
      ? {
          errorKey: 'tournament.error.nwlNoChuninRole',
          error: 'This tournament is reserved to players holding the Chunin role',
          status: 403,
          inviteUrl: NWL_INVITE_URL,
        }
      : {
          errorKey: 'tournament.error.nwlNoKageRole',
          error: 'This tournament is reserved to the eight qualified players holding the Kage role',
          status: 403,
          inviteUrl: NWL_INVITE_URL,
        };
  }
  return null;
}
