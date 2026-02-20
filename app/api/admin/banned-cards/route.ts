import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

// GET — list all banned card IDs (public, needed by all clients)
export async function GET() {
  try {
    const bannedCards = await prisma.bannedCard.findMany({
      select: { cardId: true },
    });

    return NextResponse.json({
      bannedCardIds: bannedCards.map((b) => b.cardId),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — toggle a card's ban status (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { cardId } = body;

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json({ error: 'cardId is required' }, { status: 400 });
    }

    // Toggle: if banned, unban; if not banned, ban
    const existing = await prisma.bannedCard.findUnique({
      where: { cardId },
    });

    if (existing) {
      // Unban
      await prisma.bannedCard.delete({ where: { cardId } });
      return NextResponse.json({ cardId, banned: false });
    } else {
      // Ban
      await prisma.bannedCard.create({ data: { cardId } });
      return NextResponse.json({ cardId, banned: true });
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
