import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const difficultyParam = searchParams.get('difficulty') || 'all';
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    let where: Record<string, unknown> = {};
    if (difficultyParam !== 'all') {
      const diff = parseInt(difficultyParam, 10);
      if (isNaN(diff) || diff < 1 || diff > 5) {
        return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
      }
      where = { difficulty: diff };
    }

    const [scores, total] = await Promise.all([
      prisma.quizScore.findMany({
        where,
        orderBy: { score: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      }),
      prisma.quizScore.count({ where }),
    ]);

    const entries = scores.map((s: typeof scores[number], i: number) => ({
      rank: offset + i + 1,
      username: s.user.username,
      score: s.score,
      accuracy: s.accuracy,
      difficulty: s.difficulty,
      correct: s.correct,
      total: s.total,
      bestStreak: s.bestStreak,
      completedAt: s.completedAt.toISOString(),
    }));

    const response = NextResponse.json({ entries, total, limit, offset });
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
