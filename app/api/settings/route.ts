import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });

    return NextResponse.json({
      leaguesEnabled: settings?.leaguesEnabled ?? false,
    });
  } catch {
    return NextResponse.json({ leaguesEnabled: false });
  }
}
