import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { sendVerifyEmail } from '@/lib/email/sendVerifyEmail';

const RESEND_COOLDOWN_MS = 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const recentResend = new Map<string, number>();

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ errorKey: 'auth.error.loginRequired' }, { status: 401 });
  }

  const last = recentResend.get(userId);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { errorKey: 'auth.error.verifyResendCooldown', retryAfterMs: RESEND_COOLDOWN_MS - (Date.now() - last) },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true } as never,
  }) as { email: string; emailVerified: boolean } | null;
  if (!user) {
    return NextResponse.json({ errorKey: 'auth.error.userNotFound' }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (!user.email) {
    return NextResponse.json({ errorKey: 'auth.error.userNotFound' }, { status: 400 });
  }

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: token,
      emailVerifyExpiry: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    } as never,
  });

  let body: { locale?: unknown } = {};
  try { body = await req.json(); } catch { /* no-op */ }
  const locale = typeof body.locale === 'string' && body.locale === 'fr' ? 'fr' : 'en';
  try {
    await sendVerifyEmail(user.email, token, locale);
  } catch (err) {
    console.error('[verify-email/resend] send failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ errorKey: 'auth.error.verifyResendFailed' }, { status: 500 });
  }

  recentResend.set(userId, Date.now());
  return NextResponse.json({ ok: true });
}
