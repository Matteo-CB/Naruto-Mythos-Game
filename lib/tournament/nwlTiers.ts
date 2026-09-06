import { prisma } from '@/lib/db/prisma';
import { podiumDesRecompenses, matchsEncoreOuverts } from '@/lib/tournament/prizePodium';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { parisDateParts, parisWallToUtc } from '@/lib/tournament/dailyTournament';
import { NWL_REG_OPEN_HOUR } from '@/lib/tournament/nwlFridayTournament';
import { NWL_PARTNER_KEY } from '@/lib/tournament/nwlPartner';
import { findNwlTournamentOwner } from '@/lib/tournament/tournamentOwner';
import {
  NWL_CHUNIN_ROLE_ID,
  NWL_CHUNIN_SUBSCRIBER_ROLE_ID,
  NWL_JONIN_ROLE_ID,
  NWL_KAGE_ROLE_ID,
  NWL_KAGE_CHAMPIONS_MAX,
  NWL_ANNOUNCE_CHANNEL_ID,
  NWL_CHUNIN_ANNOUNCE_CHANNEL_ID,
  NWL_LEADERBOARD_CHANNEL_ID,
  NWL_MOD_CHANNEL_ID,
  NWL_DECKS_CHANNEL_ID,
  NWL_INVITE_URL,
  NWL_STORE_URL,
  NWL_TOURNAMENTS_URL,
  listNwlChuninHolders,
  listNwlRoleHolders,
  nwlPostMessage,
  nwlPostForumThread,
  nwlEditMessage,
  nwlSendDirectMessage,
  checkNwlAnyRole,
  checkNwlMembership,
  grantNwlRole,
  revokeNwlRole,
  NWL_NARUTO_MYTHOS_ROLE_ID,
  NWL_TOURNAMENT_NAME,
  NWL_START_HOUR,
  type NwlMessageRef,
  type NwlPodiumEntry,
} from '@/lib/tournament/nwlPartner';
import { lireTagsChunin, lireJoninAccordes, ecrireJoninAccordes } from '@/lib/tournament/nwlChuninEarned';
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
export const NWL_TIER_LEAD_HOURS = NWL_START_HOUR - NWL_REG_OPEN_HOUR;
export const NWL_KAGE_LEAD_HOURS = 20;
export const NWL_RAPPEL_HEURES = 2;

export const NWL_CHUNIN_MAX_PLAYERS = 32;
export const NWL_KAGE_MAX_PLAYERS = 8;
export const NWL_KAGE_STANDINGS_SLOTS = 7;
export const NWL_KAGE_BEST_OF = 3;

export const NWL_POINTS_PER_WIN = 3;
export const NWL_POINTS_PER_LOSS = 1;

export const NWL_CHUNIN_STORE_CREDIT_GBP = 50;

export const NWL_HEURE_SYNCHRO_KAGE = 12;

const CLE_REGLAGES = 'global';

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
  leadHours: number;
  bestOf: number;
  format: 'swiss' | 'elimination';
  note: string;
}

const SPEC_CHUNIN: SpecPalier = {
  partnerKey: NWL_CHUNIN_PARTNER_KEY,
  name: NWL_CHUNIN_TOURNAMENT_NAME,
  maxPlayers: NWL_CHUNIN_MAX_PLAYERS,
  startHour: NWL_CHUNIN_START_HOUR,
  leadHours: NWL_TIER_LEAD_HOURS,
  bestOf: 1,
  format: 'swiss',
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
  leadHours: NWL_KAGE_LEAD_HOURS,
  bestOf: NWL_KAGE_BEST_OF,
  format: 'elimination',
  note: [
    `New World Loot monthly tournament, best of ${NWL_KAGE_BEST_OF}, reserved to the ${NWL_KAGE_STANDINGS_SLOTS} best players of last month Chunin standings, plus the reigning champion who defends the title.`,
    'Rewards. First place wins a sealed box of Naruto Mythos, offered by New World Loot, and keeps the Kage role.',
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

  const ouverture = spec.startHour - spec.leadHours;
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

  const admin = await findNwlTournamentOwner();
  if (!admin) return { created: false, reason: 'no_admin' };

  const scheduledStartAt = parisWallToUtc(p.year, p.month, p.day, spec.startHour, 0);
  const joinCode = generateJoinCode();

  const tournoi = await prisma.tournament.create({
    data: {
      name: spec.name,
      type: 'simulator',
      format: spec.format,
      status: 'registration',
      gameMode: 'classic',
      maxPlayers: spec.maxPlayers,
      isPublic: false,
      joinCode,
      creatorId: admin.id,
      creatorUsername: admin.username,
      requiresDiscord: true,
      useBanList: true,
      bestOf: spec.bestOf,
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
  const jourValide = (p: ReturnType<typeof parisDateParts>) => estPremierDimancheDuMois(p.year, p.month, p.day);
  if (!jourValide(parisDateParts(now))) return { created: false, reason: 'wrong_day' };
  if ((await kageQualifiers(now)).length === 0) {
    console.log('[NWL] aucun qualifie pour le Kage, le tournoi n est pas cree');
    return { created: false, reason: 'no_eligible' };
  }
  return creerTournoiPrive(SPEC_KAGE, now, jourValide);
}

export interface NwlStandingEntry {
  userId: string | null;
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

export interface GraineChunin {
  userId: string | null;
  username: string;
  discordId: string | null;
  wins: number;
  losses: number;
}

export function cleDuMois(instant: Date): string {
  const p = parisDateParts(instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

export async function lireGraineChunin(cle: string): Promise<GraineChunin[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlChuninSeed: true },
  });
  const brut = reglages?.nwlChuninSeed as Record<string, GraineChunin[]> | null | undefined;
  const mois = brut?.[cle];
  return Array.isArray(mois) ? mois : [];
}

export async function ecrireGraineChunin(cle: string, entrees: GraineChunin[]): Promise<void> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlChuninSeed: true },
  });
  const brut = (reglages?.nwlChuninSeed as Record<string, GraineChunin[]> | null | undefined) ?? {};
  const valeur = JSON.parse(JSON.stringify({ ...brut, [cle]: entrees }));
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlChuninSeed: valeur },
    create: { key: CLE_REGLAGES, nwlChuninSeed: valeur },
  });
}

interface CompteChunin {
  userId: string | null;
  username: string;
  discordId: string | null;
  wins: number;
  losses: number;
}

export async function chuninStandings(debut: Date, fin: Date): Promise<NwlStandingEntry[]> {
  const compte = new Map<string, CompteChunin>();
  const cleDe = (userId: string | null, username: string) => userId ?? `nom:${username.toLowerCase()}`;

  for (const graine of await lireGraineChunin(cleDuMois(debut))) {
    const cle = cleDe(graine.userId, graine.username);
    compte.set(cle, {
      userId: graine.userId,
      username: graine.username,
      discordId: graine.discordId,
      wins: Math.max(0, graine.wins),
      losses: Math.max(0, graine.losses),
    });
  }

  const tournois = await prisma.tournament.findMany({
    where: {
      partner: NWL_CHUNIN_PARTNER_KEY,
      scheduledStartAt: { gte: debut, lt: fin },
      NOT: { partnerStandingsRecorded: true },
    },
    select: { id: true },
  });

  if (tournois.length > 0) {
    const ids = tournois.map((t) => t.id);
    const matchs = await prisma.tournamentMatch.findMany({
      where: { tournamentId: { in: ids }, status: 'completed' },
      select: { player1Id: true, player2Id: true, winnerId: true },
    });

    const joues = new Map<string, { wins: number; losses: number }>();
    const ajoute = (userId: string | null | undefined, gagne: boolean) => {
      if (!userId) return;
      const c = joues.get(userId) ?? { wins: 0, losses: 0 };
      if (gagne) c.wins += 1; else c.losses += 1;
      joues.set(userId, c);
    };
    for (const m of matchs) {
      if (!m.winnerId) continue;
      ajoute(m.player1Id, m.player1Id === m.winnerId);
      ajoute(m.player2Id, m.player2Id === m.winnerId);
    }

    if (joues.size > 0) {
      const joueurs = await prisma.user.findMany({
        where: { id: { in: [...joues.keys()] } },
        select: { id: true, username: true, discordId: true },
      });
      for (const u of joueurs) {
        const c = joues.get(u.id)!;
        const existant = compte.get(u.id);
        compte.set(u.id, {
          userId: u.id,
          username: u.username,
          discordId: u.discordId ?? null,
          wins: (existant?.wins ?? 0) + c.wins,
          losses: (existant?.losses ?? 0) + c.losses,
        });
      }
    }
  }

  if (compte.size === 0) return [];

  const entrees: NwlStandingEntry[] = [...compte.values()].map((c) => ({
    userId: c.userId,
    username: c.username,
    discordId: c.discordId,
    wins: c.wins,
    losses: c.losses,
    points: pointsDe(c.wins, c.losses),
  }));

  entrees.sort((a, b) => b.points - a.points || b.wins - a.wins || a.username.localeCompare(b.username));
  return entrees;
}

async function championsKage(): Promise<string[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlKageChampions: true },
  });
  const brut = reglages?.nwlKageChampions as string[] | null | undefined;
  return Array.isArray(brut) ? brut.filter((x) => typeof x === 'string') : [];
}

export async function championKageEnTitre(now: Date = new Date()): Promise<NwlStandingEntry | null> {
  const dernier = await prisma.tournament.findFirst({
    where: {
      partner: NWL_KAGE_PARTNER_KEY,
      status: 'completed',
      winnerId: { not: null },
      scheduledStartAt: { lt: now },
    },
    orderBy: { scheduledStartAt: 'desc' },
    select: { winnerId: true, winnerUsername: true },
  });
  if (dernier?.winnerId) {
    const joueur = await prisma.user.findUnique({
      where: { id: dernier.winnerId },
      select: { id: true, username: true, discordId: true },
    });
    if (joueur) {
      return {
        userId: joueur.id,
        username: joueur.username || dernier.winnerUsername || '?',
        discordId: joueur.discordId ?? null,
        wins: 0,
        losses: 0,
        points: 0,
      };
    }
  }

  const couronnes = await championsKage();
  const dernierCouronne = couronnes[couronnes.length - 1];
  if (!dernierCouronne) return null;

  const tenant = await prisma.user.findFirst({
    where: { discordId: dernierCouronne },
    select: { id: true, username: true, discordId: true },
  });
  if (!tenant) return null;

  return {
    userId: tenant.id,
    username: tenant.username,
    discordId: tenant.discordId ?? null,
    wins: 0,
    losses: 0,
    points: 0,
  };
}

export async function kageQualifiers(now: Date = new Date()): Promise<NwlStandingEntry[]> {
  const { debut, fin } = bornesDuMoisPrecedent(now);
  const complet = await chuninStandings(debut, fin);
  const champion = await championKageEnTitre(now);
  if (!champion) return complet.slice(0, NWL_KAGE_MAX_PLAYERS);
  const sansChampion = complet.filter((e) => e.userId !== champion.userId);
  return [champion, ...sansChampion.slice(0, NWL_KAGE_STANDINGS_SLOTS)];
}

export async function grainePourKage(userId: string, now: Date = new Date()): Promise<number | null> {
  const qualifies = await kageQualifiers(now);
  const rang = qualifies.findIndex((q) => q.userId === userId);
  return rang < 0 ? null : rang + 1;
}

export function texteCodeAcces(nom: string, code: string, heureParis: number, entete?: string): string {
  return [
    entete ?? `**${nom}**`,
    `Your join code: \`${code}\``,
    `Start: ${heureParis - 1}:00 BST. You can join right now with this code.`,
    NWL_TOURNAMENTS_URL,
    'Keep it private: it is reserved to eligible players.',
  ].join('\n');
}

export async function diffuserCodeChunin(code: string): Promise<{ mp: number; salon: boolean }> {
  const hebdomadaires = (await listNwlChuninHolders()) ?? [];
  const abonnes = NWL_CHUNIN_SUBSCRIBER_ROLE_ID
    ? ((await listNwlRoleHolders(NWL_CHUNIN_SUBSCRIBER_ROLE_ID)) ?? [])
    : [];
  const gagnes = (await lireTagsChunin()).map((t) => t.discordId);
  const porteurs = [...new Set([...hebdomadaires, ...abonnes, ...gagnes])];
  let mp = 0;
  for (const discordId of porteurs) {
    const ok = await nwlSendDirectMessage(discordId, texteCodeAcces(NWL_CHUNIN_TOURNAMENT_NAME, code, NWL_CHUNIN_START_HOUR));
    if (ok) mp += 1;
  }
  const salon = await nwlPostMessage(
    NWL_CHUNIN_ANNOUNCE_CHANNEL_ID,
    `<@&${NWL_CHUNIN_ROLE_ID}>\n${texteCodeAcces(NWL_CHUNIN_TOURNAMENT_NAME, code, NWL_CHUNIN_START_HOUR)}`,
    NWL_CHUNIN_ROLE_ID,
  );
  return { mp, salon: salon !== null };
}

export async function diffuserCodeSiNecessaire(
  creation: NwlTierCreation,
  partnerKey: string,
  now: Date = new Date(),
): Promise<{ diffuse: boolean; mp: number; salon: boolean }> {
  const id = creation.tournamentId;
  const code = creation.joinCode;
  const rien = { diffuse: false, mp: 0, salon: false };
  if (!id || !code) return rien;

  const tournoi = await prisma.tournament.findUnique({
    where: { id },
    select: { status: true, partnerCodeSentAt: true },
  });
  if (!tournoi || tournoi.partnerCodeSentAt) return rien;
  if (tournoi.status !== 'registration' && tournoi.status !== 'pending') return rien;

  const reserve = await prisma.tournament.updateMany({
    where: { id, OR: [{ partnerCodeSentAt: null }, { partnerCodeSentAt: { isSet: false } }] },
    data: { partnerCodeSentAt: now },
  });
  if (reserve.count !== 1) return rien;

  const relacher = async () => {
    await prisma.tournament.updateMany({ where: { id }, data: { partnerCodeSentAt: null } });
  };

  try {
    const envoi = partnerKey === NWL_KAGE_PARTNER_KEY
      ? await diffuserCodeKage(code, now)
      : await diffuserCodeChunin(code);
    if (envoi.mp === 0 && !envoi.salon) {
      await relacher();
      console.warn(`[NWL] code du tournoi ${id} non delivre, une nouvelle tentative aura lieu au prochain passage`);
      return rien;
    }
    return { diffuse: true, mp: envoi.mp, salon: envoi.salon };
  } catch (err) {
    await relacher();
    console.error(`[NWL] diffusion du code de ${id} interrompue:`, err instanceof Error ? err.message : err);
    return rien;
  }
}

function salonDuPalier(partner: string | null | undefined): string {
  return partner === NWL_CHUNIN_PARTNER_KEY ? NWL_CHUNIN_ANNOUNCE_CHANNEL_ID : NWL_ANNOUNCE_CHANNEL_ID;
}

export async function diffuserCodeKage(code: string, now: Date = new Date()): Promise<{ mp: number; salon: boolean }> {
  const qualifies = await kageQualifiers(now);
  let mp = 0;
  const injoignables: string[] = [];
  for (const q of qualifies) {
    if (!q.discordId) {
      injoignables.push(`${q.username} (no Discord account linked on the simulator)`);
      continue;
    }
    const ok = await nwlSendDirectMessage(
      q.discordId,
      texteCodeAcces(
        NWL_KAGE_TOURNAMENT_NAME, code, NWL_KAGE_START_HOUR,
        `**${NWL_KAGE_TOURNAMENT_NAME}**
You have made it in the Top ${NWL_KAGE_STANDINGS_SLOTS}.`,
      ),
    );
    if (ok) mp += 1;
    else injoignables.push(`${q.username} (<@${q.discordId}>, direct messages closed)`);
  }
  if (injoignables.length > 0) {
    await nwlPostMessage(
      NWL_MOD_CHANNEL_ID,
      [
        `**${NWL_KAGE_TOURNAMENT_NAME}**: ${injoignables.length} qualified player(s) could not be reached in private.`,
        'The Kage code is never posted publicly, so please pass it to them yourself:',
        ...injoignables.map((l) => `- ${l}`),
      ].join('\n'),
    );
  }
  return { mp, salon: false };
}


export function formaterClassement(entrees: NwlStandingEntry[], titre: string): string {
  if (entrees.length === 0) {
    return `**${titre}**\nNo match played yet this month.`;
  }
  const lignes = entrees.map((e, i) => {
    const rang = `${i + 1}`.padStart(2, ' ');
    return `\`${rang}.\` **${e.username}** : ${e.points} pts (${e.wins}W / ${e.losses}L)`;
  });
  const haut = entrees.slice(0, NWL_KAGE_STANDINGS_SLOTS).length;
  return [
    `**${titre}**`,
    ...lignes,
    '',
    haut === 1
      ? `The top player qualifies for the ${NWL_KAGE_TOURNAMENT_NAME} on the first Sunday of next month.`
      : `The top ${haut} qualify for the ${NWL_KAGE_TOURNAMENT_NAME} on the first Sunday of next month.`,
    `${NWL_POINTS_PER_WIN} points per win, ${NWL_POINTS_PER_LOSS} point per loss.`,
  ].join('\n');
}

type TableauDesRefs = Record<string, { channelId?: string; messageId?: string }>;

async function refsLues(cleCourante: string): Promise<TableauDesRefs> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlLeaderboard: true },
  });
  const brut = reglages?.nwlLeaderboard as Record<string, unknown> | null | undefined;
  if (!brut || typeof brut !== 'object') return {};
  if (typeof brut.channelId === 'string' && typeof brut.messageId === 'string') {
    return { [cleCourante]: { channelId: brut.channelId, messageId: brut.messageId } };
  }
  return brut as TableauDesRefs;
}

async function refLue(cle: string): Promise<NwlMessageRef | null> {
  const entree = (await refsLues(cle))[cle];
  if (!entree?.channelId || !entree?.messageId) return null;
  return { channelId: entree.channelId, messageId: entree.messageId };
}

async function refEcrite(cle: string, ref: NwlMessageRef): Promise<void> {
  const table = await refsLues(cle);
  table[cle] = { channelId: ref.channelId, messageId: ref.messageId };
  const cles = Object.keys(table).sort();
  const valeur: TableauDesRefs = {};
  for (const k of cles.slice(-24)) valeur[k] = table[k];
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlLeaderboard: valeur },
    create: { key: CLE_REGLAGES, nwlLeaderboard: valeur },
  });
}

export async function publierClassementChunin(now: Date = new Date()): Promise<{ publie: boolean; joueurs: number }> {
  const { debut, fin } = bornesDuMois(now);
  const entrees = await chuninStandings(debut, fin);
  const cle = cleDuMois(now);
  const texte = formaterClassement(entrees, `Chunin standings ${cle}`);

  const existante = await refLue(cle);
  if (existante) {
    const modifie = await nwlEditMessage(existante, texte);
    if (modifie) return { publie: true, joueurs: entrees.length };
  }

  const nouvelle = await nwlPostMessage(NWL_LEADERBOARD_CHANNEL_ID, texte);
  if (!nouvelle) return { publie: false, joueurs: entrees.length };
  await refEcrite(cle, nouvelle);
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

  const blocs = decouperEnMessages(`**Decks played : ${tournoi.name}**`, lignes);
  const fil = await nwlPostForumThread(NWL_DECKS_CHANNEL_ID, tournoi.name, blocs[0]);
  const salonSuite = fil?.channelId ?? NWL_MOD_CHANNEL_ID;
  if (!fil) await nwlPostMessage(NWL_MOD_CHANNEL_ID, blocs[0]);
  for (const bloc of blocs.slice(1)) {
    await nwlPostMessage(salonSuite, bloc);
  }
  return true;
}

function decouperEnMessages(entete: string, lignes: string[]): string[] {
  const blocs: string[] = [];
  let courant = entete;
  for (const ligne of lignes) {
    if (courant.length + ligne.length + 2 > 1900) {
      blocs.push(courant);
      courant = '';
    }
    courant += (courant ? '\n\n' : '') + ligne;
  }
  if (courant) blocs.push(courant);
  return blocs.length > 0 ? blocs : [entete];
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

export async function standingsPourJonin(now: Date = new Date()): Promise<NwlStandingEntry[]> {
  const kageDejaJoue = await kageDuMoisJoue(now);
  const bornes = kageDejaJoue ? bornesDuMois(now) : bornesDuMoisPrecedent(now);
  const classement = await chuninStandings(bornes.debut, bornes.fin);
  const champion = kageDejaJoue ? null : await championKageEnTitre(now);
  if (!champion) return classement.slice(0, NWL_KAGE_STANDINGS_SLOTS);
  return classement
    .filter((e) => e.userId !== champion.userId)
    .slice(0, NWL_KAGE_STANDINGS_SLOTS);
}

async function moisDesKagesJoues(): Promise<string[]> {
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlKageJoues: true },
  });
  const brut = reglages?.nwlKageJoues as string[] | null | undefined;
  return Array.isArray(brut) ? brut.filter((x) => typeof x === 'string') : [];
}

async function enregistrerKageJoue(cle: string): Promise<void> {
  const connus = await moisDesKagesJoues();
  if (connus.includes(cle)) return;
  const suite = [...connus, cle].slice(-24);
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlKageJoues: suite },
    create: { key: CLE_REGLAGES, nwlKageJoues: suite },
  });
}

async function kageDuMoisJoue(now: Date): Promise<boolean> {
  if ((await moisDesKagesJoues()).includes(cleDuMois(now))) return true;
  const { debut, fin } = bornesDuMois(now);
  const kage = await prisma.tournament.findFirst({
    where: { partner: NWL_KAGE_PARTNER_KEY, scheduledStartAt: { gte: debut, lt: fin } },
    select: { status: true },
  });
  return kage?.status === 'completed';
}

export async function synchroniserRoleJonin(now: Date = new Date()): Promise<{ ajoutes: number; retires: number } | null> {
  if (!NWL_JONIN_ROLE_ID) return { ajoutes: 0, retires: 0 };
  const qualifies = await standingsPourJonin(now);
  if (qualifies.length === 0) {
    console.log('[NWL] aucun classement exploitable, le role Jonin est laisse tel quel');
    return { ajoutes: 0, retires: 0 };
  }
  const attendus = qualifies.map((q) => q.discordId).filter((d): d is string => !!d);
  if (attendus.length === 0) {
    console.log('[NWL] aucun qualifie avec un Discord lie, le role Jonin est laisse tel quel');
    return { ajoutes: 0, retires: 0 };
  }

  const deja = await lireJoninAccordes();
  const porteursListes = await listNwlRoleHolders(NWL_JONIN_ROLE_ID);
  const connus = [...new Set([...deja, ...(porteursListes ?? [])])];

  let ajoutes = 0;
  let retires = 0;
  const tenus: string[] = [];

  for (const discordId of attendus) {
    if (connus.includes(discordId)) {
      tenus.push(discordId);
      continue;
    }
    if ((await grantNwlRole(discordId, NWL_JONIN_ROLE_ID)) === 'granted') {
      ajoutes += 1;
      tenus.push(discordId);
    }
  }

  for (const discordId of connus) {
    if (attendus.includes(discordId)) continue;
    if ((await revokeNwlRole(discordId, NWL_JONIN_ROLE_ID)) === 'granted') retires += 1;
    else tenus.push(discordId);
  }

  await ecrireJoninAccordes(tenus);
  return { ajoutes, retires };
}

async function ecrireChampionsKage(liste: string[]): Promise<void> {
  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlKageChampions: liste },
    create: { key: CLE_REGLAGES, nwlKageChampions: liste },
  });
}

export function championsApresVictoire(anciens: string[], vainqueur: string, maximum: number): string[] {
  const suite = [...anciens.filter((d) => d !== vainqueur), vainqueur];
  return suite.slice(Math.max(0, suite.length - maximum));
}

export async function couronnerChampionKage(discordIdVainqueur: string | null): Promise<{ couronne: boolean; detrones: string[] }> {
  if (!discordIdVainqueur) return { couronne: false, detrones: [] };
  const anciens = await championsKage();
  const suivants = championsApresVictoire(anciens, discordIdVainqueur, NWL_KAGE_CHAMPIONS_MAX);
  const detrones = anciens.filter((d) => !suivants.includes(d));

  await ecrireChampionsKage(suivants);

  if (!NWL_KAGE_ROLE_ID) return { couronne: false, detrones };

  const couronne = (await grantNwlRole(discordIdVainqueur, NWL_KAGE_ROLE_ID)) === 'granted';
  for (const discordId of detrones) {
    await revokeNwlRole(discordId, NWL_KAGE_ROLE_ID);
  }
  return { couronne, detrones };
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

async function reserverLaGravure(tournamentId: string): Promise<boolean> {
  const reserve = await prisma.tournament.updateMany({
    where: { id: tournamentId, NOT: { partnerStandingsRecorded: true } },
    data: { partnerStandingsRecorded: true },
  });
  return reserve.count === 1;
}

async function relacherLaGravure(tournamentId: string): Promise<void> {
  await prisma.tournament.updateMany({
    where: { id: tournamentId },
    data: { partnerStandingsRecorded: false },
  });
}

export async function graverResultatsChuninDansLaGraine(
  tournamentId: string,
  matchs: ReadonlyArray<{ player1Id: string | null; player2Id: string | null; status: string; winnerId: string | null }>,
): Promise<number> {
  if (!(await reserverLaGravure(tournamentId))) return 0;
  try {
    return await ecrireLesResultatsDansLaGraine(tournamentId, matchs);
  } catch (err) {
    await relacherLaGravure(tournamentId);
    throw err;
  }
}

export async function graverAvantPurge(tournamentIds: readonly string[]): Promise<number> {
  if (tournamentIds.length === 0) return 0;
  const tournois = await prisma.tournament.findMany({
    where: {
      id: { in: [...tournamentIds] },
      partner: NWL_CHUNIN_PARTNER_KEY,
      NOT: { partnerStandingsRecorded: true },
    },
    select: { id: true },
  });

  let graves = 0;
  for (const t of tournois) {
    const matchs = await prisma.tournamentMatch.findMany({
      where: { tournamentId: t.id },
      select: { player1Id: true, player2Id: true, status: true, winnerId: true },
    });
    try {
      if ((await graverResultatsChuninDansLaGraine(t.id, matchs)) > 0) graves += 1;
    } catch (err) {
      console.error(`[NWL] gravure impossible avant la purge de ${t.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return graves;
}

async function ecrireLesResultatsDansLaGraine(
  tournamentId: string,
  matchs: ReadonlyArray<{ player1Id: string | null; player2Id: string | null; status: string; winnerId: string | null }>,
): Promise<number> {
  const tournoi = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { scheduledStartAt: true, createdAt: true },
  });
  const quand = tournoi?.scheduledStartAt ?? tournoi?.createdAt ?? new Date();
  const cle = cleDuMois(quand);

  const joues = new Map<string, { wins: number; losses: number }>();
  const ajoute = (userId: string | null | undefined, gagne: boolean) => {
    if (!userId) return;
    const c = joues.get(userId) ?? { wins: 0, losses: 0 };
    if (gagne) c.wins += 1; else c.losses += 1;
    joues.set(userId, c);
  };
  for (const m of matchs) {
    if (m.status !== 'completed' || !m.winnerId) continue;
    ajoute(m.player1Id, m.player1Id === m.winnerId);
    ajoute(m.player2Id, m.player2Id === m.winnerId);
  }
  if (joues.size === 0) return 0;

  const joueurs = await prisma.user.findMany({
    where: { id: { in: [...joues.keys()] } },
    select: { id: true, username: true, discordId: true },
  });

  const existantes = await lireGraineChunin(cle);
  const parId = new Map(existantes.map((e) => [e.userId ?? `nom:${e.username.toLowerCase()}`, { ...e }]));

  for (const u of joueurs) {
    const c = joues.get(u.id)!;
    const precedent = parId.get(u.id);
    parId.set(u.id, {
      userId: u.id,
      username: u.username,
      discordId: u.discordId ?? null,
      wins: (precedent?.wins ?? 0) + c.wins,
      losses: (precedent?.losses ?? 0) + c.losses,
    });
  }

  await ecrireGraineChunin(cle, [...parId.values()]);
  console.log(`[NWL] classement Chunin ${cle} grave: ${joues.size} joueur(s) du tournoi ${tournamentId}`);
  return joues.size;
}

export async function cloturerPalierNwl(tournamentId: string): Promise<boolean> {
  const tournoi = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      partner: true, name: true, status: true, winnerId: true,
      partnerPrizeAwarded: true, scheduledStartAt: true, createdAt: true,
    },
  });
  if (!tournoi || !estPalierNwl(tournoi.partner)) return false;
  if (tournoi.status !== 'completed' || !tournoi.winnerId) return false;
  if (tournoi.partnerPrizeAwarded) return false;

  const matchs = await prisma.tournamentMatch.findMany({
    where: { tournamentId },
    select: { player1Id: true, player2Id: true, status: true, round: true, winnerId: true, isBye: true },
  });
  const ouverts = matchsEncoreOuverts(matchs);
  if (ouverts > 0) {
    console.log(`[NWL] ${ouverts} match(s) encore ouvert(s) sur ${tournamentId}, rien n est annonce avant la fin reelle`);
    return false;
  }

  const reserve = await prisma.tournament.updateMany({
    where: { id: tournamentId, partnerPrizeAwarded: false },
    data: { partnerPrizeAwarded: true },
  });
  if (reserve.count !== 1) return false;

  if (tournoi.partner === NWL_CHUNIN_PARTNER_KEY) {
    try {
      await graverResultatsChuninDansLaGraine(tournamentId, matchs);
    } catch (err) {
      console.error(`[NWL] classement Chunin non grave pour ${tournamentId}, il sera perdu a la purge:`, err);
    }
  }

  const places = await podiumDesRecompenses(tournamentId);
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
    : `First place wins a sealed box of Naruto Mythos, offered by New World Loot, and the Kage role, held by the last ${NWL_KAGE_CHAMPIONS_MAX} champions.`;
  const role = estChunin ? NWL_CHUNIN_ROLE_ID : NWL_JONIN_ROLE_ID;
  const entete = role ? `<@&${role}>\n` : '';

  await nwlPostMessage(
    salonDuPalier(tournoi.partner),
    `${entete}${texteVictoirePalier(tournoi.name, podium, recompense)}`,
    role || undefined,
  );

  const vainqueur = podium.find((e) => e.place === 1);
  if (vainqueur) {
    await feliciterVainqueur(
      vainqueur.discordId, vainqueur.username,
      estChunin ? texteRecompenseChunin() : texteRecompenseKage(),
      estChunin ? `£${NWL_CHUNIN_STORE_CREDIT_GBP} of store credit` : 'a sealed box of Naruto Mythos',
    );
  }
  if (!estChunin) {
    await enregistrerKageJoue(cleDuMois(tournoi.scheduledStartAt ?? tournoi.createdAt));
    await couronnerChampionKage(vainqueur?.discordId ?? null);
  }

  await publierDecksDuTournoi(tournamentId);
  if (estChunin) await publierClassementChunin();
  return true;
}

export function rolesAcceptesPourPalier(partner: string | null | undefined): string[] {
  if (partner === NWL_CHUNIN_PARTNER_KEY) {
    return [NWL_CHUNIN_ROLE_ID, NWL_CHUNIN_SUBSCRIBER_ROLE_ID].filter(Boolean);
  }
  if (partner === NWL_KAGE_PARTNER_KEY) return [];
  return [];
}

export function roleRequisPourPalier(partner: string | null | undefined): string | null {
  return rolesAcceptesPourPalier(partner)[0] ?? null;
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
  roleLeve: boolean = false,
): Promise<RefusPalierNwl | null> {
  if (!estPalierNwl(partner)) return null;
  if (!discordId) {
    return { errorKey: 'tournament.error.linkDiscord', error: 'Link your Discord account first', status: 403 };
  }

  if (roleLeve) {
    const presence = await checkNwlMembership(discordId);
    if (presence === 'not_member') {
      return {
        errorKey: 'tournament.error.nwlNotMember',
        error: 'Join the New World Loot Discord server first',
        status: 403,
        inviteUrl: NWL_INVITE_URL,
      };
    }
    if (presence === 'unavailable') {
      return {
        errorKey: 'tournament.error.nwlCheckUnavailable',
        error: 'Membership check temporarily unavailable, please try again in a moment',
        status: 503,
      };
    }
    return null;
  }

  if (partner === NWL_KAGE_PARTNER_KEY) {
    const qualifies = await kageQualifiers();
    if (qualifies.some((q) => q.discordId === discordId)) return null;
    return {
      errorKey: 'tournament.error.nwlNoKageRole',
      error: 'This tournament is reserved to the players who qualified last month and to the reigning champion',
      status: 403,
      inviteUrl: NWL_INVITE_URL,
    };
  }

  const roles = rolesAcceptesPourPalier(partner);
  if (roles.length === 0) return null;
  const verdict = await checkNwlAnyRole(discordId, roles);
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

export function texteRecompenseGenin(): string {
  return [
    `Congratulations, you won the **${NWL_TOURNAMENT_NAME}**.`,
    `Your £${NWL_FIRST_PLACE_STORE_CREDIT_GBP} of store credit will be added to the email you used for the simulator.`,
    NWL_STORE_URL,
  ].join('\n');
}

export function texteRecompenseChunin(): string {
  return [
    `Congratulations, you won the **${NWL_CHUNIN_TOURNAMENT_NAME}**.`,
    `Your £${NWL_CHUNIN_STORE_CREDIT_GBP} of store credit will be credited to the email you used for the simulator.`,
    NWL_STORE_URL,
  ].join('\n');
}

export function texteRecompenseKage(): string {
  return [
    `Congratulations, you won the **${NWL_KAGE_TOURNAMENT_NAME}**.`,
    'Your box will be sent out as soon as possible. Send your name, phone number, email, postcode, address and country to the New World Loot organisers on their Discord server so they can ship it.',
    NWL_INVITE_URL,
  ].join('\n');
}

export async function prevenirLesOrganisateurs(nom: string, discordId: string | null, recompense: string): Promise<void> {
  const qui = discordId ? `**${nom}** (<@${discordId}>)` : `**${nom}**`;
  await nwlPostMessage(NWL_MOD_CHANNEL_ID, `Prize to hand out: ${qui} won ${recompense}.`);
}

export async function feliciterVainqueur(
  discordId: string | null,
  username: string,
  texte: string,
  recompense: string,
): Promise<boolean> {
  await prevenirLesOrganisateurs(username, discordId, recompense);
  if (!discordId) return false;
  return nwlSendDirectMessage(discordId, texte);
}

export function texteRappelAvantDepart(nom: string, heuresRestantes: number): string {
  return [
    `**${nom}** starts in ${heuresRestantes} hours.`,
    'Open the Naruto Mythos simulator and make sure you are registered with a legal deck.',
  ].join('\n');
}

export function prochainSamedi(now: Date, heureDepart: number): Date {
  const p = parisDateParts(now);
  const jour = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const dansCombien = jour === NWL_CHUNIN_WEEKDAY && p.hour < heureDepart
    ? 0
    : (NWL_CHUNIN_WEEKDAY - jour + 7) % 7 || 7;
  const cible = new Date(Date.UTC(p.year, p.month - 1, p.day + dansCombien));
  return parisWallToUtc(cible.getUTCFullYear(), cible.getUTCMonth() + 1, cible.getUTCDate(), heureDepart, 0);
}

export async function creerChuninApresGenin(now: Date = new Date()): Promise<NwlTierCreation> {
  const scheduledStartAt = prochainSamedi(now, NWL_CHUNIN_START_HOUR);
  const debutJour = new Date(scheduledStartAt.getTime() - 22 * 60 * 60 * 1000);
  const existant = await prisma.tournament.findFirst({
    where: { partner: NWL_CHUNIN_PARTNER_KEY, scheduledStartAt: { gte: debutJour, lte: scheduledStartAt } },
    select: { id: true, joinCode: true },
  });
  if (existant) {
    return { created: false, reason: 'already_exists', tournamentId: existant.id, joinCode: existant.joinCode ?? undefined };
  }

  const admin = await findNwlTournamentOwner();
  if (!admin) return { created: false, reason: 'no_admin' };

  const joinCode = generateJoinCode();
  const tournoi = await prisma.tournament.create({
    data: {
      name: SPEC_CHUNIN.name,
      type: 'simulator',
      format: SPEC_CHUNIN.format,
      status: 'registration',
      gameMode: 'classic',
      maxPlayers: SPEC_CHUNIN.maxPlayers,
      isPublic: false,
      joinCode,
      creatorId: admin.id,
      creatorUsername: admin.username,
      requiresDiscord: true,
      useBanList: true,
      bestOf: SPEC_CHUNIN.bestOf,
      restrictionNote: SPEC_CHUNIN.note,
      partner: NWL_CHUNIN_PARTNER_KEY,
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

export async function ouvrirChuninEtDiffuser(now: Date = new Date()): Promise<{ cree: boolean; mp: number }> {
  const chunin = await creerChuninApresGenin(now);
  if (!chunin.created || !chunin.joinCode) return { cree: false, mp: 0 };
  const diffusion = await diffuserCodeChunin(chunin.joinCode);
  return { cree: true, mp: diffusion.mp };
}

export function cleDeSemaine(now: Date): string {
  const p = parisDateParts(now);
  const jour = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const recul = (jour.getUTCDay() + 6) % 7;
  const lundi = new Date(Date.UTC(p.year, p.month - 1, p.day - recul));
  return lundi.toISOString().slice(0, 10);
}

export async function rappelerLeTopHuit(now: Date = new Date()): Promise<{ envoye: boolean }> {
  const semaine = cleDeSemaine(now);
  const reglages = await prisma.siteSettings.findUnique({
    where: { key: CLE_REGLAGES },
    select: { nwlTopEightWeek: true },
  });
  if (reglages?.nwlTopEightWeek === semaine) return { envoye: false };

  const huit = await standingsPourJonin(now);
  if (huit.length === 0) return { envoye: false };

  const lignes = huit.map((e, i) => {
    const qui = e.discordId ? `<@${e.discordId}>` : `**${e.username}**`;
    return `\`${String(i + 1).padStart(2, ' ')}.\` ${qui} ${e.points} pts`;
  });
  const texte = [
    `**Top ${NWL_KAGE_STANDINGS_SLOTS} heading to the ${NWL_KAGE_TOURNAMENT_NAME}**`,
    ...lignes,
    '',
    'They hold the Jonin role and join the reigning Kage champion at the next monthly tournament. Win Chunin matches this week to take their place.',
  ].join('\n');

  const poste = await nwlPostMessage(
    NWL_ANNOUNCE_CHANNEL_ID,
    texte,
    undefined,
    huit.map((e) => e.discordId).filter((d): d is string => !!d),
  );
  if (!poste) return { envoye: false };

  await prisma.siteSettings.upsert({
    where: { key: CLE_REGLAGES },
    update: { nwlTopEightWeek: semaine },
    create: { key: CLE_REGLAGES, nwlTopEightWeek: semaine },
  });
  return { envoye: true };
}

export function estDansLaFenetreDeRappel(depart: Date, now: Date, heures: number): boolean {
  const restant = depart.getTime() - now.getTime();
  return restant > 0 && restant <= heures * 60 * 60 * 1000 + 15 * 60 * 1000;
}

export async function rappelerLesTournoisProches(now: Date = new Date()): Promise<{ rappels: number }> {
  const limite = new Date(now.getTime() + (NWL_RAPPEL_HEURES * 60 + 15) * 60 * 1000);
  const tournois = await prisma.tournament.findMany({
    where: {
      partner: { in: [NWL_PARTNER_KEY, NWL_CHUNIN_PARTNER_KEY, NWL_KAGE_PARTNER_KEY] },
      status: 'registration',
      reminderSentAt: null,
      scheduledStartAt: { gt: now, lte: limite },
    },
    select: { id: true, name: true, partner: true },
  });

  let rappels = 0;
  for (const t of tournois) {
    const reserve = await prisma.tournament.updateMany({
      where: { id: t.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (reserve.count !== 1) continue;

    const texte = texteRappelAvantDepart(t.name, NWL_RAPPEL_HEURES);
    let poste: NwlMessageRef | null = null;
    if (t.partner === NWL_KAGE_PARTNER_KEY) {
      const huit = (await kageQualifiers(now)).map((q) => q.discordId).filter((d): d is string => !!d);
      let recus = 0;
      for (const discordId of huit) {
        if (await nwlSendDirectMessage(discordId, texte)) recus += 1;
      }
      if (recus === 0 && huit.length > 0) {
        await prisma.tournament.updateMany({ where: { id: t.id }, data: { reminderSentAt: null } });
        console.warn(`[NWL] rappel Kage non delivre a ${t.id}, nouvelle tentative au prochain passage`);
        continue;
      }
      rappels += 1;
      continue;
    } else {
      const role = t.partner === NWL_CHUNIN_PARTNER_KEY ? NWL_CHUNIN_ROLE_ID : NWL_NARUTO_MYTHOS_ROLE_ID;
      poste = await nwlPostMessage(salonDuPalier(t.partner), `<@&${role}>\n${texte}`, role);
    }

    if (poste) rappels += 1;
    else await prisma.tournament.updateMany({ where: { id: t.id }, data: { reminderSentAt: null } });
  }
  return { rappels };
}
