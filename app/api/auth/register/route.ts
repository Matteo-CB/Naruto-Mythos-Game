import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { COUNTRY_CODES } from '@/lib/data/countries';
import { validateUsername } from '@/lib/auth/usernameValidator';
import { normalizeEmailBase } from '@/lib/auth/emailBase';
import { routing } from '@/lib/i18n/routing';

const registerRate = new Map<string, number[]>();
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_MAX = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const now = Date.now();
    const windowStart = now - REGISTER_WINDOW_MS;
    const recent = (registerRate.get(ip) ?? []).filter((t) => t > windowStart);
    if (recent.length >= REGISTER_MAX) {
      return NextResponse.json(
        { error: 'Too many registration attempts, try again later', errorKey: 'auth.error.tooManyRegister' },
        { status: 429 },
      );
    }
    recent.push(now);
    registerRate.set(ip, recent);
    if (registerRate.size > 5000) {
      for (const [k, ts] of registerRate) {
        if (ts.length === 0 || ts[ts.length - 1] < windowStart) registerRate.delete(k);
      }
    }

    const body = await request.json();
    const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
    const { email, password } = body;

    if (!rawUsername || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields', errorKey: 'auth.error.missingFields' },
        { status: 400 },
      );
    }

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format', errorKey: 'auth.error.invalidEmail' },
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
        { error: 'Password must be at least 6 characters', errorKey: 'auth.error.passwordTooShort' },
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
        { error: 'Username or email already taken', errorKey: 'auth.error.alreadyTaken' },
        { status: 409 },
      );
    }

    const emailBase = normalizeEmailBase(email);
    if (emailBase) {
      const dupBase = await prisma.user.findFirst({ where: { emailBase } as never });
      if (dupBase) {
        return NextResponse.json(
          { error: 'An account already exists for this email base', errorKey: 'auth.error.emailBaseTaken' },
          { status: 409 },
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const countryCode = (typeof body.countryCode === 'string' && COUNTRY_CODES.has(body.countryCode)) ? body.countryCode : null;

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        emailBase,
        countryCode,
        emailVerifiedAt: new Date(),
      } as never,
    }) as { id: string; username: string; email: string; elo: number };

    await prisma.boosterInventory.create({
      data: { userId: user.id, setId: 'KS', count: 2 },
    }).catch(() => {});

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
      { error: 'Internal server error', errorKey: 'auth.error.serverError' },
      { status: 500 },
    );
  }
}
