import { NextRequest, NextResponse } from 'next/server';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { EVOLVING_CARDS } from '@/lib/evolving/cardCosts';
import { EVOLVING_ALLOWED_SETS, EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { computeDeckEvolvingPoints, extractSetFromCardId } from '@/lib/evolving/computePoints';

const DECK_SIZE = 30;
const MISSION_COUNT = 3;

function buildRandomCompatibleDeck(): { cardIds: string[]; missionIds: string[]; evolvingPoints: number } {
  const allChars = getPlayableCharacters();
  const allMissions = getPlayableMissions();

  const compatibleChars = allChars.filter((c) =>
    EVOLVING_ALLOWED_SETS.has(extractSetFromCardId(c.id))
    && !EVOLVING_CARDS.has(c.id),
  );

  const compatibleMissions = allMissions.filter((m) =>
    EVOLVING_ALLOWED_SETS.has(extractSetFromCardId(m.id)),
  );

  const cardIds: string[] = [];
  const charCounts = new Map<string, number>();
  const shuffledChars = [...compatibleChars].sort(() => Math.random() - 0.5);
  for (const card of shuffledChars) {
    const current = charCounts.get(card.id) ?? 0;
    if (current >= 2) continue;
    cardIds.push(card.id);
    charCounts.set(card.id, current + 1);
    if (cardIds.length >= DECK_SIZE * 2) break;
  }

  while (cardIds.length < DECK_SIZE && shuffledChars.length > 0) {
    const pool = shuffledChars.filter((c) => (charCounts.get(c.id) ?? 0) < 2);
    if (pool.length === 0) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    cardIds.push(pick.id);
    charCounts.set(pick.id, (charCounts.get(pick.id) ?? 0) + 1);
  }

  const finalCards = cardIds.slice(0, Math.max(DECK_SIZE, cardIds.length));

  const shuffledMissions = [...compatibleMissions].sort(() => Math.random() - 0.5);
  const missionIds = shuffledMissions.slice(0, MISSION_COUNT).map((m) => m.id);

  const evolvingPoints = computeDeckEvolvingPoints(finalCards);

  return { cardIds: finalCards, missionIds, evolvingPoints };
}

export async function GET(_request: NextRequest) {
  try {
    const deck = buildRandomCompatibleDeck();

    if (deck.cardIds.length < DECK_SIZE) {
      return NextResponse.json(
        { error: 'Not enough KS cards available to build a 30-card deck' },
        { status: 500 },
      );
    }

    if (deck.missionIds.length < MISSION_COUNT) {
      return NextResponse.json(
        { error: 'Not enough KS missions available' },
        { status: 500 },
      );
    }

    if (deck.evolvingPoints > EVOLVING_MAX_POINTS) {
      return NextResponse.json(
        { error: 'Generated deck exceeds Evolving budget (internal error)' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      name: 'Random Evolving Deck',
      cardIds: deck.cardIds,
      missionIds: deck.missionIds,
      evolvingPoints: deck.evolvingPoints,
    });
  } catch (err) {
    console.error('[API /random-evolving-deck]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
