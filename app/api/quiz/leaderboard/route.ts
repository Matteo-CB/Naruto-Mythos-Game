import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const difficultyParam = searchParams.get('difficulty') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where =
      difficultyParam !== 'all'
        ? { difficulty: parseInt(difficultyParam, 10) }
        : {};

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

    return NextResponse.json({ entries, total, limit, offset });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
