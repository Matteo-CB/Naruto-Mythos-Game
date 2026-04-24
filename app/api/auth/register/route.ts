import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { validateUsername } from '@/lib/auth/usernameValidator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const { email, password } = body;

    if (!rawUsername || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const check = validateUsername(rawUsername);
    if (!check.ok) {
      const messages: Record<string, string> = {
        USERNAME_TOO_SHORT: 'Username must be at least 3 characters',
        USERNAME_TOO_LONG: 'Username must be at most 20 characters',
        USERNAME_INVALID_CHARS: 'Username can only contain letters, numbers, hyphens and underscores (no spaces)',
      };
      return NextResponse.json(
        { error: messages[check.error!] ?? 'Invalid username', errorKey: `settings.${check.error}` },
        { status: 400 },
      );
    }
    const username = rawUsername;

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username: { equals: username, mode: 'insensitive' } },
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username or email already taken' },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        elo: user.elo,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
