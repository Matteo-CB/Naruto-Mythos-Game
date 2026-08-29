import { badgePourLeRang } from './saisonBadges';
import { aDesDivisions, echelleDeLaSaison, rangDeLigue, type PalierDeLigue } from '@/lib/leagues/paliers';

export const PARTIES_DE_PLACEMENT = 5;

export interface JoueurClassable {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  countryCode?: string | null;
}

export interface LigneDeClassement {
  userId: string;
  username: string;
  rank: number;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  countryCode: string | null;
  badge: string | null;
  league: string;
  leagueLevel: number | null;
}

export function partiesJouees(j: JoueurClassable): number {
  return j.wins + j.losses + j.draws;
}

export function estClasse(j: JoueurClassable, minimum = PARTIES_DE_PLACEMENT): boolean {
  return partiesJouees(j) >= minimum;
}

export function classementDeSaison(
  joueurs: readonly JoueurClassable[],
  minimum = PARTIES_DE_PLACEMENT,
  echelle: readonly PalierDeLigue[] = echelleDeLaSaison('KS'),
): LigneDeClassement[] {
  const retenus = joueurs.filter((j) => estClasse(j, minimum));
  retenus.sort((a, b) =>
    (b.elo - a.elo)
    || (b.wins - a.wins)
    || (partiesJouees(b) - partiesJouees(a))
    || a.username.localeCompare(b.username));
  const divisions = aDesDivisions(echelle);
  return retenus.map((j, i) => {
    const rank = i + 1;
    const rang = rangDeLigue(j.elo, echelle);
    return {
      userId: j.id,
      username: j.username,
      rank,
      elo: j.elo,
      wins: j.wins,
      losses: j.losses,
      draws: j.draws,
      games: partiesJouees(j),
      countryCode: j.countryCode ?? null,
      badge: badgePourLeRang(rank),
      league: rang.key,
      leagueLevel: divisions ? rang.niveau : null,
    };
  });
}
