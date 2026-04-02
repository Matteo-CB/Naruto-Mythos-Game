import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

/**
 * POST /api/tournaments/[id]/select-deck
 * Body: { deckId: string }
 *
 * Player selects (or changes) their deck for a tournament.
 * Validates the deck against tournament restrictions.
 * Can be changed until the tournament starts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: tournamentId } = await params;
    const body = await request.json();
    const { deckId } = body;

    if (!deckId || typeof deckId !== 'string') {
      return NextResponse.json({ error: 'deckId is required' }, { status: 400 });
    }

    // Fetch tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Tournament is no longer accepting deck changes' }, { status: 400 });
    }

    // Verify player is a participant
    const participant = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId, userId: session.user.id },
    });
    if (!participant) {
      return NextResponse.json({ error: 'You are not in this tournament' }, { status: 403 });
    }

    // Sealed mode doesn't use external decks
    if (tournament.gameMode === 'sealed') {
      return NextResponse.json({ error: 'Sealed mode builds decks in-game' }, { status: 400 });
    }

    // Fetch the deck
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck || deck.userId !== session.user.id) {
      return NextResponse.json({ error: 'Deck not found or not yours' }, { status: 404 });
    }

    // If tournament uses global ban list, merge it into tournament's bannedCardIds
    let effectiveTournament = tournament;
    if (tournament.useBanList) {
      const globalBanned = await prisma.bannedCard.findMany({ select: { cardId: true } });
      const globalIds = globalBanned.map(b => b.cardId);
      const merged = [...new Set([...(tournament.bannedCardIds ?? []), ...globalIds])];
      effectiveTournament = { ...tournament, bannedCardIds: merged };
    }

    // Validate deck against tournament rules
    const validation = validateDeckForTournament(deck, effectiveTournament);

    // Update participant
    await prisma.tournamentParticipant.update({
      where: { id: participant.id },
      data: {
        deckId,
        deckValid: validation.valid,
      },
    });

    return NextResponse.json({
      deckId,
      deckValid: validation.valid,
      errors: validation.errors,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface DeckData {
  cardIds: string[];
  missionIds: string[];
}

interface TournamentRules {
  gameMode: string;
  useBanList: boolean;
  bannedCardIds: string[];
  allowedGroups: string[];
  bannedGroups: string[];
  allowedKeywords: string[];
  bannedKeywords: string[];
  allowedRarities: string[];
  bannedRarities: string[];
  maxPerRarity: unknown;
  maxCopiesPerCard: number | null;
  minDeckSize: number | null;
  maxDeckSize: number | null;
  maxChakraCost: number | null;
}

function validateDeckForTournament(
  deck: DeckData,
  tournament: TournamentRules,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // We need card data to check groups/keywords/rarity — import dynamically
  // For now, validate structural rules; card-level checks need the card index
  const minSize = tournament.minDeckSize ?? 30;
  const maxSize = tournament.maxDeckSize ?? 999;

  if (deck.cardIds.length < minSize) {
    errors.push(`Deck must have at least ${minSize} cards (has ${deck.cardIds.length})`);
  }
  if (deck.cardIds.length > maxSize) {
    errors.push(`Deck must have at most ${maxSize} cards (has ${deck.cardIds.length})`);
  }
  if (deck.missionIds.length !== 3) {
    errors.push(`Deck must have exactly 3 mission cards (has ${deck.missionIds.length})`);
  }

  // Check banned card IDs
  if (tournament.bannedCardIds.length > 0) {
    for (const cardId of deck.cardIds) {
      if (tournament.bannedCardIds.includes(cardId)) {
        errors.push(`Card ${cardId} is banned in this tournament`);
      }
    }
    for (const missionId of deck.missionIds) {
      if (tournament.bannedCardIds.includes(missionId)) {
        errors.push(`Mission ${missionId} is banned in this tournament`);
      }
    }
  }

  // Card-level validation (group, keyword, rarity, chakra) requires loading card data
  // This is done server-side with the card index
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCardById } = require('@/lib/data/cardIndex');

    // Track copies per card for maxCopiesPerCard
    const copyCounts: Record<string, number> = {};
    const rarityCounts: Record<string, number> = {};
    const maxCopies = tournament.maxCopiesPerCard ?? 2;

    for (const cardId of deck.cardIds) {
      const card = getCardById(cardId);
      if (!card) continue;

      // Copy count
      copyCounts[cardId] = (copyCounts[cardId] ?? 0) + 1;
      if (copyCounts[cardId] > maxCopies) {
        errors.push(`Too many copies of ${card.name_fr} (${cardId}): max ${maxCopies}`);
      }

      // Rarity check
      const rarity = card.rarity;
      rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;

      if (tournament.allowedRarities.length > 0 && !tournament.allowedRarities.includes(rarity)) {
        errors.push(`Rarity ${rarity} is not allowed (card: ${card.name_fr})`);
      }
      if (tournament.bannedRarities.includes(rarity)) {
        errors.push(`Rarity ${rarity} is banned (card: ${card.name_fr})`);
      }

      // Group check
      const group = card.group ?? '';
      if (tournament.allowedGroups.length > 0 && group && !tournament.allowedGroups.includes(group)) {
        errors.push(`Group "${group}" is not allowed (card: ${card.name_fr})`);
      }
      if (tournament.bannedGroups.includes(group)) {
        errors.push(`Group "${group}" is banned (card: ${card.name_fr})`);
      }

      // Keyword check
      const keywords: string[] = card.keywords ?? [];
      if (tournament.allowedKeywords.length > 0) {
        const hasAllowed = keywords.some((kw: string) => tournament.allowedKeywords.includes(kw));
        if (!hasAllowed && keywords.length > 0) {
          errors.push(`Card ${card.name_fr} has no allowed keyword`);
        }
      }
      for (const kw of keywords) {
        if (tournament.bannedKeywords.includes(kw)) {
          errors.push(`Keyword "${kw}" is banned (card: ${card.name_fr})`);
        }
      }

      // Chakra cost check
      if (tournament.maxChakraCost != null && (card.chakra ?? 0) > tournament.maxChakraCost) {
        errors.push(`Card ${card.name_fr} costs ${card.chakra} chakra (max: ${tournament.maxChakraCost})`);
      }
    }

    // Max per rarity check
    if (tournament.maxPerRarity) {
      const limits = tournament.maxPerRarity as Record<string, number>;
      for (const [rarity, max] of Object.entries(limits)) {
        if ((rarityCounts[rarity] ?? 0) > max) {
          errors.push(`Too many ${rarity} cards: ${rarityCounts[rarity]} (max: ${max})`);
        }
      }
    }
  } catch {
    // Card index not available — skip card-level checks
  }

  // Deduplicate errors
  const uniqueErrors = [...new Set(errors)];

  return { valid: uniqueErrors.length === 0, errors: uniqueErrors };
}
