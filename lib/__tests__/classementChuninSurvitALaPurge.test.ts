import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NWL_POINTS_PER_WIN,
  NWL_POINTS_PER_LOSS,
  NWL_KAGE_STANDINGS_SLOTS,
  NWL_KAGE_MAX_PLAYERS,
} from '@/lib/tournament/nwlTiers';
import { TOURNAMENT_RETENTION_MS } from '@/lib/tournament/cleanupOldTournaments';
import { TOURNAMENT_TTL_MS } from '@/lib/db/gameCleanup';

const RACINE = process.cwd();
const TIERS = readFileSync(join(RACINE, 'lib/tournament/nwlTiers.ts'), 'utf8');
const PURGE = readFileSync(join(RACINE, 'lib/tournament/cleanupOldTournaments.ts'), 'utf8');

function bloc(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  expect(i, `${debut} existe`).toBeGreaterThan(0);
  const j = source.indexOf(fin, i);
  return source.slice(i, j > i ? j : i + 3500);
}

describe('le classement mensuel Chunin survit a la purge des tournois', () => {
  it('un tournoi termine est efface bien avant la fin du mois', () => {
    expect(TOURNAMENT_RETENTION_MS, 'la purge horaire garde 24 heures').toBe(24 * 60 * 60 * 1000);
    expect(TOURNAMENT_TTL_MS, "l autre nettoyage en garde trente jours, c est la plus courte qui gagne").toBe(30 * 24 * 60 * 60 * 1000);
    const moisEnMs = 31 * 24 * 60 * 60 * 1000;
    expect(
      TOURNAMENT_RETENTION_MS < moisEnMs,
      'un classement lu a la fin du mois ne peut donc pas dependre des tournois eux-memes',
    ).toBe(true);
  });

  it('les resultats sont graves dans la graine des la cloture', () => {
    const cloture = bloc(TIERS, 'export async function cloturerPalierNwl', 'export async function annoncerOuvertureGenin');
    expect(cloture, 'la gravure suit immediatement la reservation unique').toContain('graverResultatsChuninDansLaGraine(tournamentId, matchs)');
    const apresReserve = cloture.indexOf('if (reserve.count !== 1) return false;');
    const gravure = cloture.indexOf('graverResultatsChuninDansLaGraine');
    expect(apresReserve, 'la reservation existe').toBeGreaterThan(0);
    expect(gravure, 'la gravure vient apres, donc une seule fois').toBeGreaterThan(apresReserve);
  });

  it('la gravure additionne au lieu d ecraser, et respecte le mois du tournoi', () => {
    const graveur = bloc(TIERS, 'export async function graverResultatsChuninDansLaGraine', 'export async function cloturerPalierNwl');
    expect(graveur, 'le mois vient de la date du tournoi, pas de maintenant').toContain('cleDuMois(quand)');
    expect(graveur, 'les entrees deja presentes sont conservees').toContain('lireGraineChunin(cle)');
    expect(graveur, 'les scores s additionnent').toContain("(precedent?.wins ?? 0) + c.wins");
    expect(graveur, 'seuls les matchs joues comptent').toContain("m.status !== 'completed'");
  });

  it('un tournoi deja grave n est plus recompte dans le classement vivant', () => {
    const standings = bloc(TIERS, 'export async function chuninStandings', 'export async function championKageEnTitre');
    expect(standings, 'la frontiere est le drapeau pose une seule fois a la cloture').toContain('partnerPrizeAwarded: false');
  });

  it('la purge n abandonne plus de matchs ni d inscrits orphelins', () => {
    expect(PURGE, 'les matchs partent avec leur tournoi').toContain('prisma.tournamentMatch.deleteMany');
    expect(PURGE, 'les inscrits aussi').toContain('prisma.tournamentParticipant.deleteMany');
    expect(PURGE, 'le tout en une seule transaction').toContain('prisma.$transaction');
  });

  it('le bareme et la taille du Kage restent ceux annonces aux joueurs', () => {
    expect(NWL_POINTS_PER_WIN).toBe(3);
    expect(NWL_POINTS_PER_LOSS).toBe(1);
    expect(NWL_KAGE_STANDINGS_SLOTS).toBe(7);
    expect(NWL_KAGE_MAX_PLAYERS).toBe(8);
    expect(
      NWL_KAGE_STANDINGS_SLOTS + 1,
      'sept qualifies plus le champion en titre font un bracket parfait',
    ).toBe(NWL_KAGE_MAX_PLAYERS);
  });

  it('sans champion en titre, le classement fournit seul les huit places', () => {
    const qualif = bloc(TIERS, 'export async function kageQualifiers', 'export async function grainePourKage');
    expect(qualif, 'aucun champion, on prend le haut du classement').toContain('return complet.slice(0, NWL_KAGE_MAX_PLAYERS)');
    expect(qualif, 'avec un champion, il ouvre la liste').toContain('[champion, ...sansChampion.slice(0, NWL_KAGE_STANDINGS_SLOTS)]');
  });
});
