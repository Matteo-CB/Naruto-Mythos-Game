import { describe, it, expect } from 'vitest';
import { generateBracket } from '@/lib/tournament/tournamentEngine';
import {
  generateSwissRound1,
  generateSwissPairings,
  computeSwissRoundCount,
  type SwissPlayer,
  type SwissMatchResult,
} from '@/lib/tournament/swissEngine';
import { generateDoubleElimBracket, type DEParticipant } from '@/lib/tournament/doubleElimEngine';

const TAILLES = Array.from({ length: 39 }, (_, i) => i + 2);

function joueurs(nombre: number) {
  return Array.from({ length: nombre }, (_, i) => ({
    userId: `u${i + 1}`,
    username: `joueur${i + 1}`,
    elo: 1500 - i,
  }));
}

function joueursSuisse(nombre: number): SwissPlayer[] {
  return Array.from({ length: nombre }, (_, i) => ({
    userId: `u${i + 1}`,
    username: `joueur${i + 1}`,
    seed: i + 1,
  }));
}

describe('elimination directe: aucune taille de plateau ne laisse un joueur sans issue', () => {
  it('chaque joueur inscrit occupe un siege du premier tour', () => {
    for (const n of TAILLES) {
      const { matches } = generateBracket(joueurs(n));
      const assis = new Set<string>();
      for (const m of matches.filter((x) => x.round === 1)) {
        if (m.player1?.participantId) assis.add(m.player1.participantId);
        if (m.player2?.participantId) assis.add(m.player2.participantId);
      }
      expect(assis.size, `${n} joueurs: tout le monde doit avoir une place`).toBe(n);
    }
  });

  it('un match du premier tour est soit jouable soit deja tranche, jamais en attente', () => {
    for (const n of TAILLES) {
      const { matches } = generateBracket(joueurs(n));
      for (const m of matches.filter((x) => x.round === 1)) {
        expect(['ready', 'completed'], `${n} joueurs: statut ${m.status} au premier tour`).toContain(m.status);
      }
    }
  });

  it('le nombre de tours suffit toujours a designer un vainqueur unique', () => {
    for (const n of TAILLES) {
      const { matches, totalRounds } = generateBracket(joueurs(n));
      const dernierTour = matches.filter((m) => m.round === totalRounds);
      expect(dernierTour.length, `${n} joueurs: il faut une finale et une seule`).toBe(1);
      expect(totalRounds, `${n} joueurs: ${totalRounds} tours pour ${n} joueurs`).toBe(Math.ceil(Math.log2(n)));
    }
  });

  it('chaque match a un successeur, sauf la finale', () => {
    for (const n of TAILLES) {
      const { matches, totalRounds } = generateBracket(joueurs(n));
      for (const m of matches) {
        if (m.round === totalRounds) continue;
        const suivant = matches.find(
          (x) => x.round === m.round + 1 && x.matchIndex === Math.floor(m.matchIndex / 2),
        );
        expect(suivant, `${n} joueurs: le match ${m.round}.${m.matchIndex} ne mene nulle part`).toBeTruthy();
      }
    }
  });

  it('personne ne joue deux matchs en meme temps au premier tour', () => {
    for (const n of TAILLES) {
      const { matches } = generateBracket(joueurs(n));
      const vus = new Map<string, number>();
      for (const m of matches.filter((x) => x.round === 1)) {
        for (const j of [m.player1, m.player2]) {
          if (!j?.participantId) continue;
          vus.set(j.participantId, (vus.get(j.participantId) ?? 0) + 1);
        }
      }
      for (const [joueur, fois] of vus) {
        expect(fois, `${n} joueurs: ${joueur} apparait ${fois} fois au premier tour`).toBe(1);
      }
    }
  });
});

describe('suisse: chaque tour distribue tout le monde, avec au plus un exempt', () => {
  it('le premier tour asseoit chaque joueur une seule fois', () => {
    for (const n of TAILLES) {
      const pairs = generateSwissRound1(joueursSuisse(n));
      const vus = new Set<string>();
      let exempts = 0;
      for (const p of pairs) {
        expect(vus.has(p.player1.userId), `${n} joueurs: ${p.player1.username} joue deux fois`).toBe(false);
        vus.add(p.player1.userId);
        if (p.player2) {
          expect(vus.has(p.player2.userId)).toBe(false);
          vus.add(p.player2.userId);
        } else {
          exempts += 1;
        }
      }
      expect(vus.size, `${n} joueurs: tout le monde est place`).toBe(n);
      expect(exempts, `${n} joueurs: au plus un exempt`).toBeLessThanOrEqual(1);
      expect(exempts, `${n} joueurs: un exempt si et seulement si le nombre est impair`).toBe(n % 2);
    }
  });

  it('les tours suivants replacent tout le monde, meme apres des resultats', () => {
    for (const n of [3, 5, 6, 7, 8, 11, 16, 23, 32]) {
      const gens = joueursSuisse(n);
      const resultats: SwissMatchResult[] = [];
      let pairs = generateSwissRound1(gens);

      const tours = computeSwissRoundCount(n);
      for (let tour = 1; tour <= tours; tour++) {
        for (const p of pairs) {
          resultats.push({
            round: tour,
            player1Id: p.player1.userId,
            player2Id: p.player2?.userId ?? null,
            winnerId: p.player2 ? p.player1.userId : p.player1.userId,
            isBye: !p.player2,
          } as SwissMatchResult);
        }
        if (tour === tours) break;
        pairs = generateSwissPairings(gens, resultats, tour + 1);

        const vus = new Set<string>();
        for (const p of pairs) {
          expect(vus.has(p.player1.userId), `${n} joueurs, tour ${tour + 1}: doublon`).toBe(false);
          vus.add(p.player1.userId);
          if (p.player2) {
            expect(vus.has(p.player2.userId)).toBe(false);
            vus.add(p.player2.userId);
          }
        }
        expect(vus.size, `${n} joueurs, tour ${tour + 1}: personne n est oublie`).toBe(n);
        expect(pairs.length, `${n} joueurs, tour ${tour + 1}: il faut des matchs`).toBeGreaterThan(0);
      }
    }
  });

  it('un joueur exclu en cours de route ne bloque pas les appariements', () => {
    const gens = joueursSuisse(9);
    const resultats: SwissMatchResult[] = generateSwissRound1(gens).map((p) => ({
      round: 1,
      player1Id: p.player1.userId,
      player2Id: p.player2?.userId ?? null,
      winnerId: p.player1.userId,
      isBye: !p.player2,
    } as SwissMatchResult));

    const exclu = new Set(['u3']);
    const pairs = generateSwissPairings(gens, resultats, 2, exclu);
    const places = new Set<string>();
    for (const p of pairs) {
      places.add(p.player1.userId);
      if (p.player2) places.add(p.player2.userId);
    }
    expect(places.has('u3'), 'le joueur exclu ne revient pas').toBe(false);
    expect(places.size, 'les huit autres sont apparies').toBe(8);
  });

  it('le nombre de tours reste fini et raisonnable', () => {
    for (const n of TAILLES) {
      const tours = computeSwissRoundCount(n);
      expect(tours, `${n} joueurs`).toBeGreaterThan(0);
      expect(tours, `${n} joueurs: pas de tournoi sans fin`).toBeLessThanOrEqual(6);
    }
  });
});

describe('double elimination: chaque perdant a une seconde chance et le bracket se termine', () => {
  it('tout le monde entre dans le tableau des gagnants', () => {
    for (const n of TAILLES) {
      const participants: DEParticipant[] = joueurs(n).map((j) => ({ userId: j.userId, username: j.username }));
      const { matches } = generateDoubleElimBracket(participants);
      const assis = new Set<string>();
      for (const m of matches.filter((x) => x.round === 1 && x.bracket === 'winners')) {
        if (m.player1Id) assis.add(m.player1Id);
        if (m.player2Id) assis.add(m.player2Id);
      }
      expect(assis.size, `${n} joueurs: tout le monde commence dans le tableau des gagnants`).toBe(n);
    }
  });

  it('aucun match du premier tour ne reste en attente', () => {
    for (const n of TAILLES) {
      const participants: DEParticipant[] = joueurs(n).map((j) => ({ userId: j.userId, username: j.username }));
      const { matches } = generateDoubleElimBracket(participants);
      for (const m of matches.filter((x) => x.round === 1 && x.bracket === 'winners')) {
        expect(['ready', 'completed'], `${n} joueurs: statut ${m.status}`).toContain(m.status);
      }
    }
  });

  it('un exempt est deja gagne, il n attend pas d adversaire', () => {
    for (const n of TAILLES) {
      const participants: DEParticipant[] = joueurs(n).map((j) => ({ userId: j.userId, username: j.username }));
      const { matches } = generateDoubleElimBracket(participants);
      for (const m of matches.filter((x) => x.isBye)) {
        expect(m.status, `${n} joueurs: un exempt doit etre clos`).toBe('completed');
        expect(m.winnerId, `${n} joueurs: un exempt a un vainqueur`).toBeTruthy();
      }
    }
  });

  it('le tableau comporte toujours une grande finale', () => {
    for (const n of TAILLES) {
      const participants: DEParticipant[] = joueurs(n).map((j) => ({ userId: j.userId, username: j.username }));
      const { matches } = generateDoubleElimBracket(participants);
      expect(
        matches.some((m) => m.bracket === 'grand_final'),
        `${n} joueurs: il faut une grande finale pour clore le tournoi`,
      ).toBe(true);
    }
  });
});
