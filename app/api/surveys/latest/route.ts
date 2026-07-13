import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const latest = await prisma.survey.findFirst({
    where: { status: 'open' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const openCount = await prisma.survey.count({ where: { status: 'open' } });

  return NextResponse.json(
    {
      latestOpenAt: latest ? latest.createdAt.toISOString() : null,
      openCount,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
