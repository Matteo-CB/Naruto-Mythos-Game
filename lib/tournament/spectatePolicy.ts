import { prisma } from '@/lib/db/prisma';

export type TournamentSpectateVerdict =
  | { allowed: true }
  | { allowed: false; errorKey: string };

export const TOURNAMENT_SPECTATE_MAX_TILES = 4;

export function tournamentSpectateVerdictFor(options: {
  isParticipant: boolean;
  isSignedIn: boolean;
}): TournamentSpectateVerdict {
  if (!options.isSignedIn) return { allowed: false, errorKey: 'spectate.errorSignInRequired' };
  if (options.isParticipant) return { allowed: false, errorKey: 'spectate.errorPlayerInTournament' };
  return { allowed: true };
}

export async function isTournamentParticipant(tournamentId: string, userId: string): Promise<boolean> {
  const seat = await prisma.tournamentParticipant.findFirst({
    where: { tournamentId, userId },
    select: { id: true },
  });
  return !!seat;
}

export async function canSpectateTournament(
  tournamentId: string,
  userId: string | null | undefined,
): Promise<TournamentSpectateVerdict> {
  if (!userId) return tournamentSpectateVerdictFor({ isSignedIn: false, isParticipant: false });
  const isParticipant = await isTournamentParticipant(tournamentId, userId);
  return tournamentSpectateVerdictFor({ isSignedIn: true, isParticipant });
}
