import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import {
  createDonationCheckout,
  getOrCreateStripeCustomer,
  validateDonationAmount,
  type DonationMode,
  type SupportedLocale,
} from '@/lib/stripe/checkout';
import { rateLimit } from '@/lib/donations/rateLimit';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://narutomythosgame.com';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isMode(value: unknown): value is DonationMode {
  return value === 'payment' || value === 'subscription';
}

function isLocale(value: unknown): value is SupportedLocale {
  return value === 'fr' || value === 'en';
}

function clientKey(req: NextRequest, userId: string | null): string {
  if (userId) return `user:${userId}`;
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.amountInvalid' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.amountInvalid' }, { status: 400 });
  }
  const { mode, amountCents, locale: bodyLocale } = body as { mode?: unknown; amountCents?: unknown; locale?: unknown };

  if (!isMode(mode)) {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.amountInvalid' }, { status: 400 });
  }
  if (typeof amountCents !== 'number') {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.amountInvalid' }, { status: 400 });
  }
  const amountCheck = validateDonationAmount(mode, amountCents);
  if (!amountCheck.ok) {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.amountInvalid' }, { status: 400 });
  }

  const locale: SupportedLocale = isLocale(bodyLocale) ? bodyLocale : 'fr';

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;

  if (mode === 'subscription' && !userId) {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.loginRequired' }, { status: 401 });
  }

  const rl = rateLimit(clientKey(req, userId), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { errorKey: 'helpUs.donate.error.rateLimited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let customerId: string | null = null;
  let username: string | null = null;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, stripeCustomerId: true, email: true },
    });
    username = user?.username ?? null;
    if (mode === 'subscription') {
      customerId = await getOrCreateStripeCustomer(userId, user?.email ?? userEmail, user?.stripeCustomerId ?? null);
      if (customerId !== (user?.stripeCustomerId ?? null)) {
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }
    }
  }

  const successUrl = `${APP_URL}/${locale}/help-us?donation=success&sid={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${APP_URL}/${locale}/help-us?donation=cancelled`;

  let checkout: { url: string; sessionId: string };
  try {
    checkout = await createDonationCheckout({
      mode,
      amountCents,
      locale,
      successUrl,
      cancelUrl,
      userId,
      userEmail,
      customerId,
    });
  } catch (e) {
    console.error('[donations/checkout] Stripe createCheckout failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ errorKey: 'helpUs.donate.error.checkoutFailed' }, { status: 500 });
  }

  try {
    await prisma.donation.create({
      data: {
        stripeSessionId: checkout.sessionId,
        stripeCustomerId: customerId ?? undefined,
        userId: userId ?? undefined,
        userEmail: userEmail ?? undefined,
        username: username ?? undefined,
        amountCents,
        currency: 'eur',
        mode,
        status: 'pending',
        isRecurring: mode === 'subscription',
      },
    });
  } catch (e) {
    console.error('[donations/checkout] DB insert failed (session still usable via Stripe):', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ url: checkout.url });
}
