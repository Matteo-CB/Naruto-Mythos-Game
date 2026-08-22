import { describe, it, expect } from 'vitest';
import {
  computeSwissRoundCount,
  computeStandings,
  generateSwissRound1,
  generateSwissPairings,
  type SwissPlayer,
  type SwissMatchResult,
} from '@/lib/tournament/swissEngine';

function joueurs(n: number): SwissPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `u${i + 1}`, username: `J${i + 1}`, seed: i + 1,
  }));
}

function alea(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat * 1664525 + 1013904223) >>> 0;
    return etat / 0x100000000;
  };
}

interface Tour {
  round: number;
  paires: Array<{ p1: string; p2: string | null }>;
}

function jouerUnTournoi(n: number, graine: number, sortants: Set<string> = new Set()) {
  const tous = joueurs(n);
  const total = computeSwissRoundCount(n);
  const resultats: SwissMatchResult[] = [];
  const tours: Tour[] = [];
  const hasard = alea(graine);

  for (let round = 1; round <= total; round += 1) {
    const appariements = round === 1
      ? generateSwissRound1(tous.filter((p) => !sortants.has(p.userId)))
      : generateSwissPairings(tous, resultats, round, sortants);

    tours.push({
      round,
      paires: appariements.map((a) => ({ p1: a.player1.userId, p2: a.player2?.userId ?? null })),
    });

    for (const a of appariements) {
      if (!a.player2) {
        resultats.push({
          round, player1Id: a.player1.userId, player2Id: a.player1.userId,
          winnerId: a.player1.userId, isBye: true,
        });
        continue;
      }
      const gagnant = hasard() < 0.5 ? a.player1.userId : a.player2.userId;
      resultats.push({
        round, player1Id: a.player1.userId, player2Id: a.player2.userId,
        winnerId: gagnant, isBye: false,
      });
    }
  }

  return { tous, total, resultats, tours };
}

describe('le nombre de tours suisses', () => {
  const attendu: Array<[number, number]> = [
    [0, 0], [1, 0], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 3], [8, 3],
    [9, 4], [16, 4], [17, 5], [32, 5],
  ];
  for (const [n, tours] of attendu) {
    it(`${n} joueurs donnent ${tours} tours`, () => {
      expect(computeSwissRoundCount(n)).toBe(tours);
    });
  }
});

describe('chaque tour place tous les joueurs actifs, une seule fois', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 21, 32]) {
    it(`${n} joueurs, sur tous les tours et plusieurs tirages`, () => {
      for (const graine of [1, 7, 12345]) {
        const { tous, tours } = jouerUnTournoi(n, graine);
        const actifs = new Set(tous.map((p) => p.userId));

        for (const t of tours) {
          const vus: string[] = [];
          for (const paire of t.paires) {
            vus.push(paire.p1);
            if (paire.p2) vus.push(paire.p2);
          }
          expect(
            new Set(vus).size,
            `tour ${t.round} a ${n} joueurs: un joueur apparait deux fois`,
          ).toBe(vus.length);
          expect(
            vus.length,
            `tour ${t.round} a ${n} joueurs: ${actifs.size - vus.length} joueur(s) sans match`,
          ).toBe(actifs.size);
          for (const id of vus) expect(actifs.has(id), `${id} n est pas un inscrit`).toBe(true);

          const byes = t.paires.filter((p) => p.p2 === null).length;
          expect(byes, `tour ${t.round}: un bye seulement quand le nombre est impair`)
            .toBe(actifs.size % 2 === 1 ? 1 : 0);
        }
      }
    });
  }
});

describe('personne ne recoit deux byes tant qu un autre n en a pas eu', () => {
  for (const n of [3, 5, 7, 9, 11, 13, 15, 21]) {
    it(`${n} joueurs`, () => {
      for (const graine of [3, 99, 4242]) {
        const { tours } = jouerUnTournoi(n, graine);
        const compte = new Map<string, number>();
        for (const t of tours) {
          for (const paire of t.paires) {
            if (paire.p2 === null) compte.set(paire.p1, (compte.get(paire.p1) ?? 0) + 1);
          }
        }
        const doubles = [...compte.entries()].filter(([, c]) => c >= 2);
        const nombreDeByes = [...compte.values()].reduce((a, b) => a + b, 0);
        if (nombreDeByes <= n) {
          expect(
            doubles.map(([id, c]) => `${id} a eu ${c} byes`),
            `a ${n} joueurs et ${nombreDeByes} byes distribues, personne ne doit en avoir deux`,
          ).toEqual([]);
        }
      }
    });
  }
});

describe('les revanches sont evitees tant qu un autre appariement existe', () => {
  for (const n of [4, 6, 8, 12, 16, 32]) {
    it(`${n} joueurs`, () => {
      for (const graine of [5, 500, 50_000]) {
        const { tours } = jouerUnTournoi(n, graine);
        const deja = new Set<string>();
        const revanches: string[] = [];
        for (const t of tours) {
          for (const paire of t.paires) {
            if (!paire.p2) continue;
            const cle = [paire.p1, paire.p2].sort().join('|');
            if (deja.has(cle)) revanches.push(`tour ${t.round}: ${cle}`);
            deja.add(cle);
          }
        }
        expect(revanches, `a ${n} joueurs le systeme ne doit pas refaire jouer les memes`).toEqual([]);
      }
    });
  }
});

describe('le classement est arithmetiquement juste', () => {
  for (const n of [4, 5, 8, 11, 16]) {
    it(`${n} joueurs`, () => {
      const { tous, resultats, total } = jouerUnTournoi(n, 77);
      const classement = computeStandings(tous, resultats);

      expect(classement.length, 'tout le monde figure au classement').toBe(n);
      expect(new Set(classement.map((c) => c.rank)).size, 'les rangs sont uniques').toBe(n);
      expect(classement.map((c) => c.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1));

      for (const c of classement) {
        expect(
          c.wins + c.losses + c.draws,
          `${c.username} doit avoir joue ${total} matchs`,
        ).toBe(total);
        expect(c.matchPoints, `${c.username}: 3 points par victoire, 1 par nul`)
          .toBe(c.wins * 3 + c.draws);
      }

      const totalVictoires = classement.reduce((a, c) => a + c.wins, 0);
      const totalDefaites = classement.reduce((a, c) => a + c.losses, 0);
      const byes = resultats.filter((r) => r.isBye).length;
      expect(totalVictoires - byes, 'une victoire hors bye fait une defaite en face').toBe(totalDefaites);

      for (let i = 1; i < classement.length; i += 1) {
        expect(
          classement[i - 1].matchPoints >= classement[i].matchPoints,
          'le classement est trie par points decroissants',
        ).toBe(true);
      }
    });
  }
});

describe('les departages suivent l ordre annonce', () => {
  it('a egalite parfaite, la tete de serie tranche, puis la confrontation directe', () => {
    const p = joueurs(4);
    const resultats: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u3', winnerId: 'u1', isBye: false },
      { round: 2, player1Id: 'u2', player2Id: 'u4', winnerId: 'u2', isBye: false },
    ];
    const c = computeStandings(p, resultats);
    expect(c[0].userId, 'u1 gagne ses deux matchs').toBe('u1');
    expect(c[0].matchPoints).toBe(6);
    expect(c[3].userId, 'u4 perd tout').toBe('u4');

    const u2 = c.find((x) => x.userId === 'u2')!;
    const u3 = c.find((x) => x.userId === 'u3')!;
    expect(u2.matchPoints, 'u2 et u3 sont a egalite de points').toBe(u3.matchPoints);
    expect(u2.buchholz, 'ils ont affronte exactement la meme force').toBe(u3.buchholz);
    expect(
      u2.rank < u3.rank,
      'a tout egal et sans confrontation directe, la tete de serie tranche',
    ).toBe(true);

    const perdant = computeStandings(joueurs(4), [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u3', winnerId: 'u1', isBye: false },
      { round: 2, player1Id: 'u2', player2Id: 'u4', winnerId: 'u2', isBye: false },
      { round: 3, player1Id: 'u2', player2Id: 'u3', winnerId: 'u3', isBye: false },
    ]);
    expect(
      perdant.find((x) => x.userId === 'u3')!.rank,
      'apres une confrontation directe gagnee, u3 passe devant u2',
    ).toBeLessThan(perdant.find((x) => x.userId === 'u2')!.rank);
  });

  it('deux vainqueurs de tours differents restent a egalite de points', () => {
    const p = joueurs(4);
    const resultats: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u2', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const c = computeStandings(p, resultats);
    const u2 = c.find((x) => x.userId === 'u2')!;
    const u3 = c.find((x) => x.userId === 'u3')!;
    expect(u2.matchPoints).toBe(u3.matchPoints);
    expect(u2.rank).toBeLessThan(5);
    expect(u3.rank).toBeLessThan(5);
  });

  it('un nul donne un point a chacun', () => {
    const p = joueurs(2);
    const c = computeStandings(p, [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: null, isBye: false },
    ]);
    expect(c.every((x) => x.matchPoints === 1 && x.draws === 1)).toBe(true);
  });

  it('un double forfait ne donne de point a personne et compte deux defaites', () => {
    const p = joueurs(2);
    const c = computeStandings(p, [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: null, isBye: false, isDoubleForfeit: true },
    ]);
    expect(c.every((x) => x.matchPoints === 0 && x.losses === 1 && x.draws === 0)).toBe(true);
  });

  it('un bye vaut une victoire pleine', () => {
    const p = joueurs(3);
    const c = computeStandings(p, [
      { round: 1, player1Id: 'u3', player2Id: 'u3', winnerId: 'u3', isBye: true },
    ]);
    const u3 = c.find((x) => x.userId === 'u3')!;
    expect(u3.matchPoints).toBe(3);
    expect(u3.hadBye).toBe(true);
    expect(u3.opponents, 'un bye n ajoute aucun adversaire au Buchholz').toEqual([]);
  });
});

describe('les joueurs sortis en cours de route ne cassent pas les tours suivants', () => {
  for (const n of [8, 9, 12, 16]) {
    it(`${n} joueurs dont deux abandonnent`, () => {
      const tous = joueurs(n);
      const resultats: SwissMatchResult[] = [];
      const total = computeSwissRoundCount(n);
      const hasard = alea(2026);
      const sortants = new Set<string>();

      for (let round = 1; round <= total; round += 1) {
        const appariements = round === 1
          ? generateSwissRound1(tous)
          : generateSwissPairings(tous, resultats, round, sortants);

        const actifs = tous.filter((p) => !sortants.has(p.userId)).length;
        const places: string[] = [];
        for (const a of appariements) {
          places.push(a.player1.userId);
          if (a.player2) places.push(a.player2.userId);
        }
        expect(new Set(places).size, `tour ${round}: doublon`).toBe(places.length);
        expect(places.length, `tour ${round}: il reste ${actifs} actifs`).toBe(actifs);
        for (const id of places) {
          expect(sortants.has(id), `${id} est sorti et ne doit plus etre apparie`).toBe(false);
        }

        for (const a of appariements) {
          if (!a.player2) {
            resultats.push({
              round, player1Id: a.player1.userId, player2Id: a.player1.userId,
              winnerId: a.player1.userId, isBye: true,
            });
            continue;
          }
          const gagnant = hasard() < 0.5 ? a.player1.userId : a.player2.userId;
          resultats.push({
            round, player1Id: a.player1.userId, player2Id: a.player2.userId,
            winnerId: gagnant, isBye: false,
          });
        }

        if (round === 1) {
          sortants.add(tous[n - 1].userId);
          sortants.add(tous[n - 2].userId);
        }
      }
    });
  }
});
