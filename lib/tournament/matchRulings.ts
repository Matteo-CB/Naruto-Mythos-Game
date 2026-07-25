import { prisma } from '@/lib/db/prisma';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';

export async function pickDoubleAbsenceLoser(
  tournamentId: string,
  playerA: string,
  playerB: string,
): Promise<string> {
  try {
    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId, userId: { in: [playerA, playerB] } },
      select: { userId: true, seed: true },
    });
    const seedOf = (userId: string): number => {
      const found = participants.find((p) => p.userId === userId);
      return typeof found?.seed === 'number' ? found.seed : Number.MAX_SAFE_INTEGER;
    };
    const seedA = seedOf(playerA);
    const seedB = seedOf(playerB);
    if (seedA === seedB) return playerA;
    return seedA > seedB ? playerA : playerB;
  } catch (err) {
    console.error('[Tournament] pickDoubleAbsenceLoser failed, defaulting to first player:', err instanceof Error ? err.message : err);
    return playerA;
  }
}

export async function confirmedDecklessSeats(
  tournamentId: string,
  hostId: string,
  guestId: string | null,
): Promise<string[]> {
  const seats = [hostId, guestId].filter((id): id is string => !!id);
  if (seats.length === 0) return [];
  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId, userId: { in: seats } },
    select: { userId: true, deckId: true },
  });
  const deckless: string[] = [];
  for (const userId of seats) {
    const participant = participants.find((p) => p.userId === userId);
    if (!participant) continue;
    if (!participant.deckId) {
      deckless.push(userId);
      continue;
    }
    const deck = await prisma.deck.findUnique({ where: { id: participant.deckId } });
    if (!deck || deck.userId !== userId) {
      deckless.push(userId);
      continue;
    }
    const characters = (deck.cardIds ?? []).map((id: string) => getCharacterById(id)).filter(Boolean);
    const missions = (deck.missionIds ?? []).map((id: string) => getMissionById(id)).filter(Boolean);
    if (characters.length === 0 || missions.length === 0) deckless.push(userId);
  }
  return deckless;
}
