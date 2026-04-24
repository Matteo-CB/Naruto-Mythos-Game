import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { validateUsername } from '@/lib/auth/usernameValidator';

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const newUsername = typeof body.username === 'string' ? body.username.trim() : '';

    const check = validateUsername(newUsername);
    if (!check.ok) {
      const errorKey = check.error === 'USERNAME_INVALID_CHARS'
        ? 'settings.usernameInvalid'
        : 'settings.usernameLength';
      const error = check.error === 'USERNAME_INVALID_CHARS'
        ? 'Username can only contain letters, numbers, hyphens and underscores (no spaces)'
        : 'Username must be between 3 and 20 characters';
      return NextResponse.json({ error, errorKey }, { status: 400 });
    }

    
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
