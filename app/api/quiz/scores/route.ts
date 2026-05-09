import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { difficulty, score, correct, total, accuracy, bestStreak } = body;

    if (
      typeof difficulty !== 'number' ||
      difficulty < 1 ||
      difficulty > 5 ||
      typeof score !== 'number' || score < 0 || score > 1_000_000 ||
      typeof correct !== 'number' || correct < 0 ||
      typeof total !== 'number' || total < 1 || total > 500 ||
      typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100 ||
      typeof bestStreak !== 'number' || bestStreak < 0
    ) {
      return NextResponse.json({ error: 'Invalid quiz score data' }, { status: 400 });
    }

    if (correct > total || bestStreak > correct) {
      return NextResponse.json({ error: 'Inconsistent quiz score data' }, { status: 400 });
    }

    const quizScore = await prisma.quizScore.create({
      data: {
        userId: session.user.id,
        difficulty,
        score,
        correct,
        total,
        accuracy,
        bestStreak,
      },
    });

    return NextResponse.json({ quizScore }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
