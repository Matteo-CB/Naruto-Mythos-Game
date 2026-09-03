import { describe, it, expect } from 'vitest';
import { generateBracket, MAIN_BRACKET, THIRD_PLACE_BRACKET } from '@/lib/tournament/tournamentEngine';

interface MatchSimule {
  bracket: string;
  round: number;
  matchIndex: number;
  player1: { participantId: string | null };
  player2: { participantId: string | null };
  winnerId: string | null;
  isBye: boolean;
  status: string;
}

function joueurs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `j${i + 1}`, username: `Joueur ${i + 1}` }));
}

function principaux(matches: MatchSimule[], round: number): MatchSimule[] {
  return matches.filter((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET && m.round === round);
}

function derouleParRonde(n: number): { rondesJouees: number; totalRounds: number; vainqueur: string | null } {
  const { matches, totalRounds } = generateBracket(joueurs(n) as never) as unknown as {
    matches: MatchSimule[]; totalRounds: number;
  };

  let rondeCourante = 1;
  let rondesJouees = 0;

  for (let garde = 0; garde < 64; garde++) {
    const deLaRonde = principaux(matches, rondeCourante);
    if (deLaRonde.length === 0) break;

    const jouables = deLaRonde.filter(
      (m) => !m.isBye && m.status !== 'completed' && m.player1.participantId && m.player2.participantId,
    );
    const enAttente = deLaRonde.filter(
      (m) => !m.isBye && m.status !== 'completed' && (!m.player1.participantId || !m.player2.participantId),
    );

    expect(
      enAttente,
      `effectif ${n}, ronde ${rondeCourante}: un match sans adversaire connu bloquerait le tournoi`,
    ).toEqual([]);

    for (const m of jouables) {
      m.winnerId = m.player1.participantId;
      m.status = 'completed';
      const suivant = principaux(matches, m.round + 1).find((x) => x.matchIndex === Math.floor(m.matchIndex / 2));
      if (suivant) {
        if (m.matchIndex % 2 === 0) suivant.player1 = { participantId: m.winnerId };
        else suivant.player2 = { participantId: m.winnerId };
      }
    }

    rondesJouees += 1;
    const toutFini = deLaRonde.every((m) => m.status === 'completed');
    expect(toutFini, `effectif ${n}, ronde ${rondeCourante} doit etre entierement resolue`).toBe(true);
    rondeCourante += 1;
    if (rondeCourante > totalRounds) break;
  }

  const finale = principaux(matches, totalRounds)[0];
  return { rondesJouees, totalRounds, vainqueur: finale?.winnerId ?? null };
}

describe('aucun effectif ne peut bloquer un tournoi a elimination joue par ronde', () => {
  it('de 2 a 32 joueurs, chaque ronde s enchaine jusqu a un vainqueur unique', () => {
    for (let n = 2; n <= 32; n++) {
      const { rondesJouees, totalRounds, vainqueur } = derouleParRonde(n);
      expect(totalRounds, `effectif ${n}: le nombre de rondes suit la puissance de deux superieure`)
        .toBe(Math.ceil(Math.log2(n)));
      expect(rondesJouees, `effectif ${n}: toutes les rondes sont jouees`).toBe(totalRounds);
      expect(vainqueur, `effectif ${n}: la finale designe bien quelqu un`).toBeTruthy();
    }
  });

  it('les byes du premier tour sont deja resolus et propages a la generation', () => {
    for (const n of [5, 6, 7, 9, 12, 17, 31]) {
      const { matches } = generateBracket(joueurs(n) as never) as unknown as { matches: MatchSimule[] };
      const byes = principaux(matches, 1).filter((m) => m.isBye);
      const taille = Math.pow(2, Math.ceil(Math.log2(n)));
      expect(byes.length, `effectif ${n}: un bye par place vide`).toBe(taille - n);
      for (const b of byes) {
        expect(b.status, 'un bye est deja termine').toBe('completed');
        expect(b.winnerId, 'et il a un vainqueur').toBeTruthy();
        const suivant = principaux(matches, 2).find((x) => x.matchIndex === Math.floor(b.matchIndex / 2));
        if (!suivant) continue;
        const place = b.matchIndex % 2 === 0 ? suivant.player1 : suivant.player2;
        expect(place.participantId, 'le gagnant du bye est deja place au tour suivant').toBe(b.winnerId);
      }
    }
  });

  it('le tournoi du vendredi accepte les effectifs reels annonces', () => {
    for (const n of [4, 8, 12, 16, 32]) {
      const { totalRounds } = generateBracket(joueurs(n) as never) as unknown as { totalRounds: number };
      expect(totalRounds).toBe(Math.ceil(Math.log2(n)));
      expect(derouleParRonde(n).vainqueur, `effectif ${n}`).toBeTruthy();
    }
  });

  it('la petite finale partage le numero de ronde de la finale, sans jamais la bloquer', () => {
    for (const n of [4, 5, 8, 16, 32]) {
      const { matches, totalRounds, thirdPlaceMatch } = generateBracket(joueurs(n) as never) as unknown as {
        matches: MatchSimule[]; totalRounds: number; thirdPlaceMatch: MatchSimule | null;
      };
      expect(thirdPlaceMatch, `effectif ${n}: la petite finale existe`).toBeTruthy();
      expect(thirdPlaceMatch?.round, 'elle porte le numero de la finale').toBe(totalRounds);
      expect(thirdPlaceMatch?.bracket, 'mais pas le tableau principal').toBe(THIRD_PLACE_BRACKET);
      expect(
        principaux(matches, totalRounds).length,
        'la derniere ronde du tableau principal ne contient que la finale',
      ).toBe(1);
    }
  });

  it('a moins de quatre joueurs il n y a pas de petite finale a attendre', () => {
    for (const n of [2, 3]) {
      const { thirdPlaceMatch } = generateBracket(joueurs(n) as never) as unknown as { thirdPlaceMatch: MatchSimule | null };
      expect(thirdPlaceMatch, `effectif ${n}`).toBeNull();
    }
  });
});
