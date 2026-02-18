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
      typeof score !== 'number' ||
      typeof correct !== 'number' ||
      typeof total !== 'number' ||
      typeof accuracy !== 'number' ||
      typeof bestStreak !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid quiz score data' }, { status: 400 });
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
