import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const namesParam = request.nextUrl.searchParams.get('names') ?? '';
  const names = namesParam
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && n.length <= 40)
    .slice(0, 4);

  if (names.length === 0) {
    return NextResponse.json({ flags: {} }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }

  try {
    const users = await prisma.user.findMany({
      where: { OR: names.map((n) => ({ username: { equals: n, mode: 'insensitive' as const } })) },
      select: { username: true, countryCode: true },
    });

    const flags: Record<string, string | null> = {};
    for (const n of names) {
      const match = users.find((u) => u.username.toLowerCase() === n.toLowerCase());
      flags[n] = match?.countryCode ?? null;
    }

    return NextResponse.json({ flags }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
  } catch {
    return NextResponse.json({ flags: {} }, { headers: { 'Cache-Control': 'public, s-maxage=60' } });
  }
}
