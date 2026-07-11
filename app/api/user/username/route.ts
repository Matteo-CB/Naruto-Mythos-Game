import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { validateUsername } from '@/lib/auth/usernameValidator';

const usernameChangeAt = new Map<string, number>();
const USERNAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { usernameResetRequired: true } });
    const forcedReset = me?.usernameResetRequired === true;
    const lastChange = usernameChangeAt.get(userId);
    if (!forcedReset && lastChange && Date.now() - lastChange < USERNAME_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((USERNAME_COOLDOWN_MS - (Date.now() - lastChange)) / (60 * 60 * 1000));
      return NextResponse.json(
        { error: `Username can only be changed once per day (${hoursLeft}h left)`, errorKey: 'settings.usernameCooldown' },
        { status: 429 },
      );
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
        id: { not: userId },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Username already taken', errorKey: 'settings.usernameTaken' }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { username: newUsername, usernameResetRequired: false },
    });

    usernameChangeAt.set(userId, Date.now());

    return NextResponse.json({ username: newUsername });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
