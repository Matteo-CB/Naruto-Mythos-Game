import { prisma } from '@/lib/db/prisma';
import { buildEliminationPrizeUserIds } from '@/lib/tournament/resultsView';
import { computeStandings, type SwissPlayer, type SwissMatchResult } from '@/lib/tournament/swissEngine';
import type { TournamentData } from '@/stores/tournamentStore';

export interface PlaceDeRecompense {
  userId: string;
  place: 1 | 2 | 3;
}

interface ParticipantDePodium {
  userId: string;
  username: string;
  seed: number | null;
  eliminated: boolean;
}

interface MatchDePodium {
  round: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  isBye: boolean;
  status: string;
}

export function podiumSuisse(
  participants: ParticipantDePodium[],
  matches: MatchDePodium[],
): PlaceDeRecompense[] {
  const joueurs: SwissPlayer[] = participants.map((p, i) => ({
    userId: p.userId,
    username: p.username,
    seed: p.seed ?? (i + 1),
  }));

  const resultats: SwissMatchResult[] = matches
    .filter((m) => m.status === 'completed' || m.status === 'forfeit')
    .filter((m) => m.player1Id !== null)
    .map((m) => ({
      round: m.round,
      player1Id: m.player1Id!,
      player2Id: m.player2Id ?? m.player1Id!,
      winnerId: m.winnerId,
      isBye: m.isBye,
      isDoubleForfeit: m.status === 'forfeit' && m.winnerId === null && m.player2Id !== null && !m.isBye,
    }));

  const sortis = new Set(participants.filter((p) => p.eliminated).map((p) => p.userId));

  return computeStandings(joueurs, resultats)
    .filter((s) => !sortis.has(s.userId))
    .slice(0, 3)
    .map((s, i) => ({ userId: s.userId, place: (i + 1) as 1 | 2 | 3 }));
}

export async function podiumDesRecompenses(tournamentId: string): Promise<PlaceDeRecompense[]> {
  const tournoi = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: true, matches: true },
  });
  if (!tournoi) return [];

  if (tournoi.format === 'swiss') {
    return podiumSuisse(tournoi.participants, tournoi.matches);
  }

  return buildEliminationPrizeUserIds(tournoi as unknown as TournamentData);
}

export function matchsEncoreOuverts(matches: MatchDePodium[]): number {
  return matches.filter(
    (m) => !!m.player1Id && !!m.player2Id && m.status !== 'completed' && m.status !== 'forfeit',
  ).length;
}
