import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/backgrounds
 * Returns all game backgrounds from the database, ordered by sortOrder.
 */
export async function GET() {
  try {
    const backgrounds = await prisma.gameBackground.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, url: true },
    });

    const response = NextResponse.json({ backgrounds });
    response.headers.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    return response;
  } catch {
    return NextResponse.json({ backgrounds: [] });
  }
}
