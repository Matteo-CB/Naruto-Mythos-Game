import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { computeDeckEvolvingPoints, deckUsesOnlyAllowedSets } from '@/lib/evolving/computePoints';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deck = await prisma.deck.findUnique({
      where: { id },
    });

    if (!deck || deck.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(deck);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

async function isLockedByActiveTournament(deckId: string): Promise<boolean> {
  const inUse = await prisma.tournamentParticipant.findFirst({
    where: {
      deckId,
      tournament: { status: 'in_progress' },
    },
    select: { id: true },
  });
  return inUse !== null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, cardIds, missionIds } = body;

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const editingCards = (cardIds !== undefined) || (missionIds !== undefined);
    if (editingCards && await isLockedByActiveTournament(id)) {
      return NextResponse.json(
        { error: 'Cannot edit deck contents while it is selected in a tournament in progress' },
        { status: 409 },
      );
    }

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    if (cardIds !== undefined && !Array.isArray(cardIds)) {
      return NextResponse.json({ error: 'cardIds must be an array' }, { status: 400 });
    }
    if (missionIds !== undefined && !Array.isArray(missionIds)) {
      return NextResponse.json({ error: 'missionIds must be an array' }, { status: 400 });
    }

    if (cardIds && (cardIds.length < 30 || cardIds.length > 200)) {
      return NextResponse.json(
        { error: 'Deck must have between 30 and 200 character cards' },
        { status: 400 },
      );
    }

    if (missionIds && missionIds.length !== 3) {
      return NextResponse.json(
        { error: 'Deck must have exactly 3 mission cards' },
        { status: 400 },
      );
    }

    const ID_RE = /^[A-Z0-9_-]{1,30}$/;
    if (cardIds) {
      for (const id of cardIds) {
        if (typeof id !== 'string' || !ID_RE.test(id)) {
          return NextResponse.json({ error: 'Invalid card id' }, { status: 400 });
        }
      }
    }
    if (missionIds) {
      for (const id of missionIds) {
        if (typeof id !== 'string' || !ID_RE.test(id)) {
          return NextResponse.json({ error: 'Invalid mission id' }, { status: 400 });
        }
      }
    }

    if (cardIds) {
      const variantCheck = await validateDeckVariantUnlocks(session.user.id, cardIds);
      if (!variantCheck.ok) {
        return NextResponse.json(
          {
            error: 'Deck contains locked variant cards',
            errorKey: 'deckBuilder.error.variantLocked',
            lockedCardIds: variantCheck.lockedCardIds,
          },
          { status: 400 },
        );
      }
    }

    const updateData: {
      name?: string;
      cardIds?: string[];
      missionIds?: string[];
      evolvingPoints?: number;
      evolvingCompatible?: boolean;
    } = {};
    if (name) updateData.name = name;
    if (cardIds) updateData.cardIds = cardIds;
    if (missionIds) updateData.missionIds = missionIds;

    if (cardIds || missionIds) {
      const finalCards = cardIds ?? existing.cardIds;
      const finalMissions = missionIds ?? existing.missionIds;
      updateData.evolvingPoints = computeDeckEvolvingPoints(finalCards);
      updateData.evolvingCompatible = deckUsesOnlyAllowedSets(finalCards, finalMissions) && updateData.evolvingPoints <= EVOLVING_MAX_POINTS;
    }

    const deck = await prisma.deck.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(deck);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.deck.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (await isLockedByActiveTournament(id)) {
      return NextResponse.json(
        { error: 'Cannot delete deck while it is selected in a tournament in progress' },
        { status: 409 },
      );
    }

    await prisma.deck.delete({ where: { id } });
    await prisma.deckStats.deleteMany({ where: { deckId: id } }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
