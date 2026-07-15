import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { issueVerificationCode } from '@/lib/auth/emailVerification';
import { routing } from '@/lib/i18n/routing';

const resendRate = new Map<string, number[]>();
const RESEND_WINDOW_MS = 10 * 60 * 1000;
const RESEND_MAX = 8;

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const now = Date.now();
    const recent = (resendRate.get(ip) ?? []).filter((t) => t > now - RESEND_WINDOW_MS);
    if (recent.length >= RESEND_MAX) {
      return NextResponse.json({ error: 'Too many requests', errorKey: 'auth.error.resendCooldown' }, { status: 429 });
    }
    recent.push(now);
    resendRate.set(ip, recent);

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const locale = typeof body.locale === 'string' && (routing.locales as readonly string[]).includes(body.locale)
      ? body.locale
      : routing.defaultLocale;
    if (!email) {
      return NextResponse.json({ error: 'Missing email', errorKey: 'auth.error.missingFields' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { emailVerifiedAt: true } });
    if (!user || user.emailVerifiedAt) {
      return NextResponse.json({ ok: true });
    }

    const result = await issueVerificationCode(email, locale);
    if (result === 'cooldown') {
      return NextResponse.json({ error: 'cooldown', errorKey: 'auth.error.resendCooldown' }, { status: 429 });
    }
    if (result === 'too_many_sends') {
      return NextResponse.json({ error: 'too_many_sends', errorKey: 'auth.error.tooManySends' }, { status: 429 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error', errorKey: 'auth.error.serverError' }, { status: 500 });
  }
}
