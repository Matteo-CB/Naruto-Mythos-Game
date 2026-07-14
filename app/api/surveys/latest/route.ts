import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const openSurveys = await prisma.survey.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  });

  const latestOpenAt = openSurveys[0]?.createdAt.toISOString() ?? null;
  const openCount = openSurveys.length;

  let unansweredCount: number | null = null;
  const session = await auth();
  if (session?.user?.id) {
    if (openCount === 0) {
      unansweredCount = 0;
    } else {
      const answered = await prisma.surveyResponse.count({
        where: {
          userId: session.user.id,
          surveyId: { in: openSurveys.map((s) => s.id) },
        },
      });
      unansweredCount = Math.max(0, openCount - answered);
    }
  }

  return NextResponse.json(
    { latestOpenAt, openCount, unansweredCount },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
