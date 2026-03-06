import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET — all matches for a tournament (bracket display)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const matches = await prisma.tournamentMatch.findMany({
      where: { tournamentId: id },
      orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }],
    });

    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
