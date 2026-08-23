import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { podiumSuisse, matchsEncoreOuverts } from '@/lib/tournament/prizePodium';

const RACINE = join(__dirname, '..', '..');
const TIERS = readFileSync(join(RACINE, 'lib', 'tournament', 'nwlTiers.ts'), 'utf8');
const GENIN = readFileSync(join(RACINE, 'lib', 'tournament', 'nwlFridayTournament.ts'), 'utf8');
const QUOTIDIEN = readFileSync(join(RACINE, 'lib', 'tournament', 'dailyTournament.ts'), 'utf8');

function bloc(source: string, ancre: string, longueur: number): string {
  const at = source.indexOf(ancre);
  expect(at, `ancre introuvable: ${ancre}`).toBeGreaterThan(-1);
  return source.slice(at, at + longueur);
}

describe('le palier Chunin de New World Loot se joue en suisse', () => {
  it('la fiche du Chunin porte le format suisse', () => {
    const corps = bloc(TIERS, 'const SPEC_CHUNIN: SpecPalier = {', 700);
    expect(corps, 'le Chunin est un tournoi suisse').toContain("format: 'swiss'");
  });

  it('le Kage reste en bracket', () => {
    const corps = bloc(TIERS, 'const SPEC_KAGE: SpecPalier = {', 700);
    expect(corps, 'le Kage garde son bracket a elimination directe').toContain("format: 'elimination'");
    expect(corps).not.toContain("format: 'swiss'");
  });

  it('le Genin reste en bracket', () => {
    expect(GENIN, 'le Genin du vendredi garde son bracket').toContain("format: 'elimination'");
    expect(GENIN).not.toContain("format: 'swiss'");
  });

  it('les deux chemins de creation du Chunin lisent la meme fiche', () => {
    expect(TIERS, 'la creation generique suit la fiche du palier').toContain('format: spec.format');
    expect(TIERS, 'la creation qui suit le Genin aussi').toContain('format: SPEC_CHUNIN.format');
    const formatsEnDur = TIERS.split('\n').filter((l) => /format: '(swiss|elimination)',/.test(l));
    expect(
      formatsEnDur.length,
      'seules les deux fiches de palier fixent un format en dur: ' + formatsEnDur.join(' | '),
    ).toBe(2);
  });

  it('le tournoi quotidien du simulateur n est pas touche', () => {
    expect(QUOTIDIEN, 'le quotidien garde sa propre grille').toContain('format: spec.format');
    expect(QUOTIDIEN).not.toContain('NWL_CHUNIN');
  });
});

describe('le podium des recompenses suit le format du tournoi', () => {
  const participants = [
    { userId: 'a', username: 'A', seed: 1, eliminated: false },
    { userId: 'b', username: 'B', seed: 2, eliminated: false },
    { userId: 'c', username: 'C', seed: 3, eliminated: false },
    { userId: 'd', username: 'D', seed: 4, eliminated: false },
  ];
  const matchs = [
    { round: 1, player1Id: 'a', player2Id: 'b', winnerId: 'a', isBye: false, status: 'completed' },
    { round: 1, player1Id: 'c', player2Id: 'd', winnerId: 'c', isBye: false, status: 'completed' },
    { round: 2, player1Id: 'a', player2Id: 'c', winnerId: 'a', isBye: false, status: 'completed' },
    { round: 2, player1Id: 'b', player2Id: 'd', winnerId: 'b', isBye: false, status: 'completed' },
  ];

  it('en suisse, le podium sort du classement et non du premier match gagne', () => {
    const podium = podiumSuisse(participants, matchs);
    expect(podium.map((p) => p.userId), 'a gagne deux fois, b et c une fois, d aucune')
      .toEqual(['a', 'b', 'c']);
    expect(podium.map((p) => p.place)).toEqual([1, 2, 3]);
  });

  it('un joueur sorti pour absence ne prend aucune place', () => {
    const avecSorti = participants.map((p) => (p.userId === 'b' ? { ...p, eliminated: true } : p));
    const podium = podiumSuisse(avecSorti, matchs);
    expect(podium.map((p) => p.userId), 'b est sorti, il ne monte pas').not.toContain('b');
    expect(podium[0].userId, 'la premiere place reste au meilleur present').toBe('a');
  });

  it('un match encore ouvert est bien vu comme ouvert', () => {
    expect(matchsEncoreOuverts(matchs)).toBe(0);
    expect(matchsEncoreOuverts([
      ...matchs,
      { round: 3, player1Id: 'a', player2Id: 'b', winnerId: null, isBye: false, status: 'in_progress' },
    ])).toBe(1);
    expect(
      matchsEncoreOuverts([{ round: 3, player1Id: 'a', player2Id: null, winnerId: 'a', isBye: true, status: 'ready' }]),
      'un bye sans adversaire ne bloque rien',
    ).toBe(0);
  });

  it('la cloture d un palier attend que plus aucun match ne soit ouvert', () => {
    const corps = bloc(TIERS, 'export async function cloturerPalierNwl', 1400);
    expect(corps, 'aucune annonce avant la fin reelle du tournoi').toContain('matchsEncoreOuverts');
    expect(corps, 'le podium suit le format').toContain('podiumDesRecompenses');
  });
});

describe('le Chunin de quatre joueurs se joue proprement en suisse', () => {
  it('deux tours, tout le monde joue les deux, et un seul vainqueur a six points', async () => {
    const { computeSwissRoundCount, computeStandings, generateSwissRound1, generateSwissPairings } =
      await import('@/lib/tournament/swissEngine');

    const inscrits = ['Kutxyt', 'mak52554', 'Im_boss', 'froakiefro05'].map((u, i) => ({
      userId: u, username: u, seed: i + 1,
    }));

    expect(computeSwissRoundCount(4), 'quatre joueurs jouent deux tours').toBe(2);

    for (const scenario of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const resultats: Array<{ round: number; player1Id: string; player2Id: string; winnerId: string | null; isBye: boolean }> = [];

      const tour1 = generateSwissRound1(inscrits);
      expect(tour1.length, 'deux matchs au premier tour').toBe(2);
      expect(tour1.every((a) => a.player2 !== null), 'aucun bye a quatre joueurs').toBe(true);
      tour1.forEach((a, i) => {
        const gagnant = scenario[i] === 0 ? a.player1.userId : a.player2!.userId;
        resultats.push({
          round: 1, player1Id: a.player1.userId, player2Id: a.player2!.userId, winnerId: gagnant, isBye: false,
        });
      });

      const tour2 = generateSwissPairings(inscrits, resultats, 2, new Set());
      expect(tour2.length, 'deux matchs au second tour').toBe(2);
      const places = tour2.flatMap((a) => [a.player1.userId, a.player2!.userId]);
      expect(new Set(places).size, 'les quatre joueurs rejouent, une seule fois chacun').toBe(4);

      const dejaVus = new Set(resultats.map((r) => [r.player1Id, r.player2Id].sort().join('|')));
      for (const a of tour2) {
        expect(
          dejaVus.has([a.player1.userId, a.player2!.userId].sort().join('|')),
          'personne ne rejoue son adversaire du premier tour',
        ).toBe(false);
      }

      const gagnantsDuUn = new Set(resultats.map((r) => r.winnerId));
      const duel = tour2.find((a) => gagnantsDuUn.has(a.player1.userId) && gagnantsDuUn.has(a.player2!.userId));
      expect(duel, 'les deux vainqueurs du premier tour se rencontrent').toBeTruthy();

      tour2.forEach((a) => {
        resultats.push({
          round: 2, player1Id: a.player1.userId, player2Id: a.player2!.userId,
          winnerId: a.player1.userId, isBye: false,
        });
      });

      const classement = computeStandings(inscrits, resultats);
      const parfaits = classement.filter((c) => c.matchPoints === 6);
      expect(parfaits.length, 'un seul joueur peut finir a deux victoires').toBe(1);
      expect(classement[0].userId, 'il est premier du classement').toBe(parfaits[0].userId);
      expect(classement.every((c) => c.wins + c.losses === 2), 'chacun a bien joue ses deux matchs').toBe(true);
    }
  });
});

describe('les tournois du partenaire sont crees a son nom, sans lui donner de pouvoir sur le site', () => {
  const PROPRIETAIRE = readFileSync(join(RACINE, 'lib', 'tournament', 'tournamentOwner.ts'), 'utf8');
  const GENIN_SRC = readFileSync(join(RACINE, 'lib', 'tournament', 'nwlFridayTournament.ts'), 'utf8');
  const ADMINS = readFileSync(join(RACINE, 'lib', 'auth', 'admins.ts'), 'utf8');

  it('les trois creations partenaires passent par le proprietaire partenaire', () => {
    for (const [nom, source] of [['paliers', TIERS], ['Genin', GENIN_SRC]] as const) {
      expect(source, `${nom}: la creation est au nom du partenaire`).toContain('findNwlTournamentOwner()');
      expect(source, `${nom}: plus de creation au nom d un administrateur`).not.toContain('await findTournamentOwner()');
    }
  });

  it('le tournoi quotidien du simulateur garde son proprietaire habituel', () => {
    expect(QUOTIDIEN).toContain('await findTournamentOwner()');
    expect(QUOTIDIEN).not.toContain('findNwlTournamentOwner');
  });

  it('si le compte du partenaire manque, la creation ne casse pas', () => {
    const at = PROPRIETAIRE.indexOf('export async function findNwlTournamentOwner');
    const corps = PROPRIETAIRE.slice(at, at + 500);
    expect(corps, 'repli sur le proprietaire habituel').toContain('return findTournamentOwner();');
  });

  it('le compte du partenaire n est pas administrateur', async () => {
    const { ADMIN_USERNAMES, ADMIN_EMAILS, isAdmin } = await import('@/lib/auth/admins');
    const { NWL_TOURNAMENT_OWNER_USERNAME } = await import('@/lib/tournament/nwlPartner');
    expect(ADMIN_USERNAMES as readonly string[]).not.toContain(NWL_TOURNAMENT_OWNER_USERNAME);
    expect(ADMIN_EMAILS.length, 'aucune adresse partenaire cote administration').toBe(1);
    expect(isAdmin({ username: NWL_TOURNAMENT_OWNER_USERNAME, email: null })).toBe(false);
  });

  it('la liste des administrateurs est celle voulue', () => {
    expect(ADMINS).toContain("ADMIN_USERNAMES = ['Kutxyt', 'Daiki0'] as const");
    expect(ADMINS, 'John Games ne fait plus partie des administrateurs').not.toContain('John_Games_TCG');
  });
});

describe('le journal des nouveautes ne nomme plus le partenaire', () => {
  it('aucune entree ne cite New World Loot', async () => {
    const journal = JSON.parse(readFileSync(join(RACINE, 'lib', 'data', 'changelog.json'), 'utf8')) as {
      entries: Array<Record<string, unknown>>;
    };
    const motif = /new\s*world\s*loot|newworldloot|NWL/i;
    const fautifs: string[] = [];
    for (const entree of journal.entries) {
      for (const [cle, valeur] of Object.entries(entree)) {
        if (typeof valeur === 'string' && cle.startsWith('title_') && motif.test(valeur)) {
          fautifs.push(`${entree.date} ${cle}: ${valeur}`);
        }
        if (Array.isArray(valeur) && cle.startsWith('changes_')) {
          valeur.forEach((ligne, i) => {
            if (typeof ligne === 'string' && motif.test(ligne)) fautifs.push(`${entree.date} ${cle}[${i}]: ${ligne}`);
          });
        }
      }
    }
    expect(fautifs, 'le partenaire ne doit plus etre nomme dans les nouveautes').toEqual([]);
  });
});

describe('le partenaire suit ses tournois sans y jouer', () => {
  const LISTE = readFileSync(join(RACINE, 'app', 'api', 'tournaments', 'route.ts'), 'utf8');
  const DETAIL = readFileSync(join(RACINE, 'app', 'api', 'tournaments', '[id]', 'route.ts'), 'utf8');
  const MATCHS = readFileSync(join(RACINE, 'app', 'api', 'tournaments', '[id]', 'matches', 'route.ts'), 'utf8');
  const SOCKET = readFileSync(join(RACINE, 'lib', 'socket', 'tournamentHandlers.ts'), 'utf8');
  const PAGE = readFileSync(join(RACINE, 'app', '[locale]', 'tournaments', '[id]', 'page.tsx'), 'utf8');

  it('un tournoi prive apparait dans la liste pour celui qui l a cree', () => {
    expect(LISTE).toContain('if (viewerId && t.creatorId === viewerId) return true;');
  });

  it('il ouvre la fiche du tournoi et voit le code d acces', () => {
    expect(DETAIL).toContain('const isCreator = !!viewerId && tournament.creatorId === viewerId;');
    expect(DETAIL, 'le code d acces reste visible pour le createur').toContain('(isCreator || viewerIsAdmin)');
  });

  it('il voit tous les matchs, donc les appariements et les resultats', () => {
    expect(MATCHS).toContain('const isCreator = !!viewerId && tournament.creatorId === viewerId;');
    expect(MATCHS).toContain('if (!isCreator && !viewerIsAdmin && !isParticipant)');
  });

  it('il recoit les mises a jour en direct', () => {
    const at = SOCKET.indexOf("socket.on('tournament:subscribe'");
    const corps = SOCKET.slice(at, at + 800);
    expect(corps, 'le createur entre dans le salon du tournoi sans etre inscrit')
      .toContain('if (tournament.creatorId !== authedUserId)');
  });

  it('le classement se calcule a partir des donnees qu il recoit', () => {
    expect(PAGE, 'classement reconstruit depuis les participants et les matchs').toContain('computeStandings(players, results)');
  });

  it('il peut regarder les parties en cours puisqu il ne joue pas', async () => {
    const { tournamentSpectateVerdictFor } = await import('@/lib/tournament/spectatePolicy');
    expect(tournamentSpectateVerdictFor({ isSignedIn: true, isParticipant: false })).toEqual({ allowed: true });
    expect(tournamentSpectateVerdictFor({ isSignedIn: true, isParticipant: true }).allowed).toBe(false);
  });
});
