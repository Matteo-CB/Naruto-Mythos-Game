import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

interface BestEntry { score: number; correct: number; total: number; bestStreak: number; at: number }
type BestByDiff = Record<string, BestEntry>;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const difficultyParam = searchParams.get('difficulty') || 'all';
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 50 : rawLimit));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    let diffKey: string | null = null;
    if (difficultyParam !== 'all') {
      const diff = parseInt(difficultyParam, 10);
      if (isNaN(diff) || diff < 1 || diff > 5) {
        return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
      }
      diffKey = String(diff);
    }

    const allRows = await prisma.quizScore.findMany({
      select: {
        userId: true,
        bestByDiff: true,
        totalRuns: true,
        updatedAt: true,
      },
      take: 2000,
    });

    const userIds = allRows.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    type Entry = {
      userId: string;
      username: string;
      score: number;
      correct: number;
      total: number;
      accuracy: number;
      difficulty: number;
      bestStreak: number;
      completedAt: string;
    };

    const entries: Entry[] = [];
    for (const row of allRows) {
      const username = usernameById.get(row.userId);
      if (!username) continue;
      const bestByDiff = (row.bestByDiff ?? {}) as unknown as BestByDiff;

      if (diffKey) {
        const best = bestByDiff[diffKey];
        if (!best) continue;
        const accuracy = best.total > 0 ? best.correct / best.total : 0;
        entries.push({
          userId: row.userId,
          username,
          score: best.score,
          correct: best.correct,
          total: best.total,
          accuracy,
          difficulty: parseInt(diffKey, 10),
          bestStreak: best.bestStreak,
          completedAt: new Date(best.at).toISOString(),
        });
      } else {
        for (const [diff, best] of Object.entries(bestByDiff)) {
          if (!best || typeof best.score !== 'number') continue;
          const accuracy = best.total > 0 ? best.correct / best.total : 0;
          entries.push({
            userId: row.userId,
            username,
            score: best.score,
            correct: best.correct,
            total: best.total,
            accuracy,
            difficulty: parseInt(diff, 10),
            bestStreak: best.bestStreak,
            completedAt: new Date(best.at).toISOString(),
          });
        }
      }
    }

    entries.sort((a, b) => b.score - a.score);
    const total = entries.length;
    const paginated = entries.slice(offset, offset + limit).map((e, i) => ({
      rank: offset + i + 1,
      username: e.username,
      score: e.score,
      accuracy: e.accuracy,
      difficulty: e.difficulty,
      correct: e.correct,
      total: e.total,
      bestStreak: e.bestStreak,
      completedAt: e.completedAt,
    }));

    const response = NextResponse.json({ entries: paginated, total, limit, offset });
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
