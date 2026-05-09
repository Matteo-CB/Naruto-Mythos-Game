import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];


export async function GET() {
  try {
    const bannedCards = await prisma.bannedCard.findMany() as Array<{ cardId: string; reason?: string | null }>;

    const response = NextResponse.json({
      bannedCardIds: bannedCards.map((b) => b.cardId),
      bannedCards: bannedCards.map((b) => ({ cardId: b.cardId, reason: b.reason ?? null })),
    });
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email && !session?.user?.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (session.user.email !== ADMIN_EMAIL && !ADMIN_USERNAMES.includes(session.user.name ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { cardId, reason } = body;

    if (!cardId || typeof cardId !== 'string' || cardId.length > 64) {
      return NextResponse.json({ error: 'cardId is required' }, { status: 400 });
    }

    const cleanReason = typeof reason === 'string'
      ? reason.trim().slice(0, 200) || undefined
      : undefined;

    const existing = await prisma.bannedCard.findUnique({
      where: { cardId },
    });

    if (existing) {
      await prisma.bannedCard.delete({ where: { cardId } });
      return NextResponse.json({ cardId, banned: false });
    } else {
      await prisma.bannedCard.create({ data: { cardId, reason: cleanReason } as any });
      return NextResponse.json({ cardId, banned: true, reason: cleanReason ?? null });
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
