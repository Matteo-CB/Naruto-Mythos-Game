import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds required' }, { status: 400 });
    }

    // Verify all decks belong to this user
    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const ownedIds = new Set(decks.map((d: { id: string }) => d.id));
    for (const id of orderedIds) {
      if (!ownedIds.has(id)) {
        return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
      }
    }

    // Update sortOrder for each deck
    await Promise.all(
      orderedIds.map((id, index) =>
        prisma.deck.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
