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
      draftEnabled: settings?.draftEnabled ?? false,
    });
  } catch {
    return NextResponse.json({ leaguesEnabled: false, draftEnabled: false });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updateData: Record<string, boolean> = {};

    if (typeof body.leaguesEnabled === 'boolean') {
      updateData.leaguesEnabled = body.leaguesEnabled;
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const settings = await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: updateData,
      create: { key: 'global', ...updateData },
    });

    return NextResponse.json({
      leaguesEnabled: settings.leaguesEnabled,
      draftEnabled: settings.draftEnabled,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
