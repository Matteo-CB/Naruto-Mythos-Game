import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    // animationsEnabled was added to schema after initial prisma generate;
    // the field exists in MongoDB but the TS type may lag — use cast.
    const u = user as unknown as Record<string, unknown>;
    const animationsEnabled = u?.animationsEnabled ?? true;
    const gameBackground = (u?.gameBackground as string) || 'bg-game';

    return NextResponse.json({ animationsEnabled, gameBackground });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { animationsEnabled } = body as { animationsEnabled: boolean };

    if (typeof animationsEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }

    // Use $runCommandRaw to set the field without requiring prisma generate
    await prisma.$runCommandRaw({
      update: 'User',
      updates: [
        {
          q: { _id: { $oid: session.user.id } },
          u: { $set: { animationsEnabled } },
        },
      ],
    });

    return NextResponse.json({ success: true, animationsEnabled });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
