import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

const ADMIN_USERNAMES = ['Kutxyt', 'admin'];

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

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { leaguesEnabled } = body;

    if (typeof leaguesEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const settings = await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: { leaguesEnabled },
      create: { key: 'global', leaguesEnabled },
    });

    return NextResponse.json({
      leaguesEnabled: settings.leaguesEnabled,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
