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
