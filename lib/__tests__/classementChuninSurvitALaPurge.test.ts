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
const CRON = readFileSync(join(RACINE, 'app/api/cron/daily-tournament/route.ts'), 'utf8');

const RETOUR_LIGNE = String.fromCharCode(10);

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
    const standings = bloc(TIERS, 'export async function chuninStandings', 'async function championsKage');
    expect(standings, 'la frontiere est le drapeau propre a la gravure').toContain('NOT: { partnerStandingsRecorded: true }');
    expect(
      standings,
      'surtout pas le drapeau des recompenses: un tournoi peut etre grave sans avoir de vainqueur',
    ).not.toContain('partnerPrizeAwarded');
  });

  it('un champ absent en base ne se fait pas oublier par les filtres', () => {
    for (const bout of [
      bloc(TIERS, 'export async function chuninStandings', 'async function championsKage'),
      bloc(TIERS, 'async function reserverLaGravure', 'export async function graverResultatsChuninDansLaGraine'),
      bloc(TIERS, 'export async function graverAvantPurge', 'async function ecrireLesResultatsDansLaGraine'),
    ]) {
      const lignes = bout.split(RETOUR_LIGNE);
      const filtres = lignes.filter((l) => l.includes('partnerStandingsRecorded') && !l.includes('data:'));
      expect(filtres.length, 'chaque bloc lit bien ce drapeau').toBeGreaterThan(0);
      expect(
        filtres.join(' | '),
        'en Mongo un filtre a false rate un document ou le champ n existe pas encore',
      ).not.toContain('partnerStandingsRecorded: false');
    }
    const diffusion = bloc(TIERS, 'export async function diffuserCodeSiNecessaire', 'function salonDuPalier');
    expect(diffusion, 'meme piege sur une date jamais ecrite').toContain('isSet: false');
  });

  it('la gravure est reservee atomiquement, et relachee si elle echoue', () => {
    const reserve = bloc(TIERS, 'async function reserverLaGravure', 'export async function graverResultatsChuninDansLaGraine');
    expect(reserve, 'la reservation est une ecriture conditionnelle').toContain('NOT: { partnerStandingsRecorded: true }');
    const grave = bloc(TIERS, 'export async function graverResultatsChuninDansLaGraine', 'export async function graverAvantPurge');
    expect(grave, 'on ne grave qu apres avoir gagne la reservation').toContain('if (!(await reserverLaGravure(tournamentId))) return 0;');
    expect(grave, 'un echec rend la place pour une nouvelle tentative').toContain('await relacherLaGravure(tournamentId)');
  });

  it('la purge grave ce qui reste avant de le detruire', () => {
    expect(PURGE, 'la purge appelle la gravure').toContain('graverAvantPurge(ids)');
    expect(
      PURGE.indexOf('graverAvantPurge(ids)') < PURGE.indexOf('prisma.$transaction'),
      'graver AVANT la suppression, c est le dernier instant ou la donnee existe',
    ).toBe(true);
    expect(PURGE, 'si la gravure echoue, on ne supprime rien').toContain('return { deleted: 0, byStatus: {}, classementsGraves: 0 }');

    const avant = bloc(TIERS, 'export async function graverAvantPurge', 'async function ecrireLesResultatsDansLaGraine');
    expect(avant, 'seuls les Chunin ont un classement a sauver').toContain('partner: NWL_CHUNIN_PARTNER_KEY');
    expect(avant, 'et seulement ceux pas encore graves').toContain('NOT: { partnerStandingsRecorded: true }');
    const selection = avant.slice(avant.indexOf('prisma.tournament.findMany'), avant.indexOf('select: { id: true }'));
    expect(
      selection,
      'un tournoi bloque ou sans vainqueur est grave lui aussi: aucun filtre sur le statut',
    ).not.toContain('status');
    expect(selection, 'ni sur le vainqueur').not.toContain('winnerId');
  });

  it('le mois du Kage joue est retenu ailleurs que dans la ligne du tournoi', () => {
    const joue = bloc(TIERS, 'async function kageDuMoisJoue', 'export async function synchroniserRoleJonin');
    expect(joue, 'la memoire persistante est consultee en premier').toContain('(await moisDesKagesJoues()).includes(cleDuMois(now))');
    const cloture = bloc(TIERS, 'export async function cloturerPalierNwl', 'export function rolesAcceptesPourPalier');
    expect(cloture, 'le mois est enregistre a la fin du Kage').toContain('enregistrerKageJoue(cleDuMois(');
  });

  it('le champion est retenu meme si le role trophee n est pas configure', () => {
    const couronne = bloc(TIERS, 'export async function couronnerChampionKage', 'export function estPalierNwl');
    expect(
      couronne.indexOf('await ecrireChampionsKage(suivants)') < couronne.indexOf('if (!NWL_KAGE_ROLE_ID) return'),
      'la liste des champions est ecrite avant tout appel a Discord',
    ).toBe(true);
  });

  it('le code du tournoi est rediffuse tant qu il n a rien atteint', () => {
    const diffusion = bloc(TIERS, 'export async function diffuserCodeSiNecessaire', 'function salonDuPalier');
    expect(diffusion, 'une diffusion deja faite n est jamais refaite').toContain('partnerCodeSentAt');
    expect(diffusion, 'la marque est posee de facon conditionnelle').toContain('{ partnerCodeSentAt: { isSet: false } }');
    expect(diffusion, 'rien de delivre, la marque est retiree').toContain('if (envoi.mp === 0 && !envoi.salon)');
    expect(CRON, 'le cron ne conditionne plus la diffusion a la creation').toContain('diffuserCodeSiNecessaire(kage, NWL_KAGE_PARTNER_KEY)');
    expect(CRON, 'idem pour le Chunin').toContain('diffuserCodeSiNecessaire(chunin, NWL_CHUNIN_PARTNER_KEY)');
    expect(CRON, 'plus aucun appel direct qui ne passe pas par le rattrapage').not.toContain('await diffuserCodeKage(');
  });

  it('un qualifie injoignable en prive est signale aux organisateurs', () => {
    const kage = bloc(TIERS, 'export async function diffuserCodeKage', 'export async function diffuserCodeSiNecessaire');
    expect(kage, 'les injoignables sont collectes').toContain('injoignables');
    expect(kage, 'et remontes dans le salon des moderateurs').toContain('NWL_MOD_CHANNEL_ID');
    expect(kage, 'un qualifie sans Discord lie compte comme injoignable').toContain('no Discord account linked');
  });

  it('le classement publie garde un message par mois', () => {
    const publie = bloc(TIERS, 'export async function publierClassementChunin', 'export async function publierDecksDuTournoi');
    expect(publie, 'la cle du mois pilote le message').toContain('const cle = cleDuMois(now)');
    expect(publie, 'lecture par mois').toContain('refLue(cle)');
    expect(publie, 'ecriture par mois').toContain('refEcrite(cle, nouvelle)');
    const refs = bloc(TIERS, 'async function refsLues', 'async function refLue');
    expect(refs, 'l ancien format a un seul message est repris sans etre perdu').toContain("typeof brut.channelId === 'string'");
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

  it('le champion en titre survit lui aussi a la purge du tournoi Kage', () => {
    const champion = bloc(TIERS, 'export async function championKageEnTitre', 'export async function kageQualifiers');
    expect(champion, 'le tournoi reste la source principale').toContain('partner: NWL_KAGE_PARTNER_KEY');
    expect(champion, 'a defaut, la liste persistee des couronnes prend le relais').toContain('await championsKage()');
    expect(champion, 'le dernier couronne est le tenant du titre').toContain('couronnes[couronnes.length - 1]');
  });

  it('le champion ne prend pas une place de Jonin, elle descend au suivant', () => {
    const jonin = bloc(TIERS, 'export async function standingsPourJonin', 'async function kageDuMoisJoue');
    expect(jonin, 'le champion est ecarte de la liste des Jonin').toContain('e.userId !== champion.userId');
    expect(jonin, 'sept places restent a pourvoir').toContain('NWL_KAGE_STANDINGS_SLOTS');
    expect(
      jonin.indexOf('.filter((e) => e.userId !== champion.userId)') < jonin.lastIndexOf('.slice(0, NWL_KAGE_STANDINGS_SLOTS)'),
      'on ecarte avant de couper, sinon la septieme place est perdue',
    ).toBe(true);
    expect(
      jonin,
      'sans champion, le classement fournit seul les sept places',
    ).toContain('if (!champion) return classement.slice(0, NWL_KAGE_STANDINGS_SLOTS);');
  });

  it('le role Jonin designe exactement ceux qui rejoignent le champion', () => {
    const sync = bloc(TIERS, 'export async function synchroniserRoleJonin', 'async function championsKage');
    expect(sync, 'la liste vient de la meme source que le Kage').toContain('standingsPourJonin(now)');
    expect(sync, 'les porteurs indus sont retires').toContain('revokeNwlRole');
    expect(sync, 'les manquants sont ajoutes').toContain('grantNwlRole');
  });

  it('sans champion en titre, le classement fournit seul les huit places', () => {
    const qualif = bloc(TIERS, 'export async function kageQualifiers', 'export async function grainePourKage');
    expect(qualif, 'aucun champion, on prend le haut du classement').toContain('return complet.slice(0, NWL_KAGE_MAX_PLAYERS)');
    expect(qualif, 'avec un champion, il ouvre la liste').toContain('[champion, ...sansChampion.slice(0, NWL_KAGE_STANDINGS_SLOTS)]');
  });
});
