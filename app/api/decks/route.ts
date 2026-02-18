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
      orderBy: { updatedAt: 'desc' },
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

    if (cardIds.length < 30) {
      return NextResponse.json(
        { error: 'Deck must have at least 30 character cards' },
        { status: 400 },
      );
    }

    if (missionIds.length !== 3) {
      return NextResponse.json(
        { error: 'Deck must have exactly 3 mission cards' },
        { status: 400 },
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
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
