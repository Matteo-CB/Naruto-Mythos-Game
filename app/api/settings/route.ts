import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });

    const response = NextResponse.json({
      leaguesEnabled: settings?.leaguesEnabled ?? false,
    });
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return response;
  } catch {
    return NextResponse.json({ leaguesEnabled: false });
  }
}
