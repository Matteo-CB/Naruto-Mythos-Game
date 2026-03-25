import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const newUsername = typeof body.username === 'string' ? body.username.trim() : '';

    if (newUsername.length < 3 || newUsername.length > 20) {
      return NextResponse.json({ error: 'Username must be between 3 and 20 characters', errorKey: 'settings.usernameLength' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, hyphens and underscores', errorKey: 'settings.usernameInvalid' }, { status: 400 });
    }

    // Check uniqueness (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        username: { equals: newUsername, mode: 'insensitive' },
        id: { not: session.user.id },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Username already taken', errorKey: 'settings.usernameTaken' }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { username: newUsername },
    });

    return NextResponse.json({ username: newUsername });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
