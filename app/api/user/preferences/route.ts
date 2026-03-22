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
      select: { animationsEnabled: true, gameBackground: true, allowSpectatorHand: true },
    });

    return NextResponse.json({
      animationsEnabled: user?.animationsEnabled ?? true,
      gameBackground: user?.gameBackground || 'default',
      allowSpectatorHand: user?.allowSpectatorHand ?? false,
    });
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
    const update: Record<string, unknown> = {};

    if (typeof body.animationsEnabled === 'boolean') {
      update.animationsEnabled = body.animationsEnabled;
    }
    if (typeof body.gameBackground === 'string' && body.gameBackground.length > 0) {
      update.gameBackground = body.gameBackground;
    }
    if (typeof body.allowSpectatorHand === 'boolean') {
      update.allowSpectatorHand = body.allowSpectatorHand;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: update,
    });

    return NextResponse.json({ success: true, ...update });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
