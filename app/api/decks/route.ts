import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      take: 50,
    });

    return NextResponse.json(decks);
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, cardIds, missionIds } = body;

    if (!name || !cardIds || !missionIds) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    if (typeof name !== 'string' || name.length > 100) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    if (!Array.isArray(cardIds) || !Array.isArray(missionIds)) {
      return NextResponse.json({ error: 'cardIds and missionIds must be arrays' }, { status: 400 });
    }

    if (cardIds.length < 30 || cardIds.length > 200) {
      return NextResponse.json(
        { error: 'Deck must have between 30 and 200 character cards' },
        { status: 400 },
      );
    }

    if (missionIds.length !== 3) {
      return NextResponse.json(
        { error: 'Deck must have exactly 3 mission cards' },
        { status: 400 },
      );
    }

    const ID_RE = /^[A-Z0-9_-]{1,30}$/;
    for (const id of cardIds) {
      if (typeof id !== 'string' || !ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid card id' }, { status: 400 });
      }
    }
    for (const id of missionIds) {
      if (typeof id !== 'string' || !ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid mission id' }, { status: 400 });
      }
    }

    const userDeckCount = await prisma.deck.count({ where: { userId: session.user.id } });
    if (userDeckCount >= 50) {
      return NextResponse.json(
        { error: 'You have reached the maximum number of decks (50)' },
        { status: 409 },
      );
    }

    const deck = await prisma.deck.create({
      data: {
        name,
        userId: session.user.id,
        cardIds,
        missionIds,
      },
    });

    return NextResponse.json(deck, { status: 201 });
  } catch (err) {
    console.error('[API /decks POST]', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
