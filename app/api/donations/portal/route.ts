import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { createBillingPortalSession } from '@/lib/stripe/checkout';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://narutomythosgame.com';

function pickLocale(value: unknown): 'fr' | 'en' {
  return value === 'en' ? 'en' : 'fr';
}

function pickReturnTo(value: unknown): 'settings' | 'help-us' {
  return value === 'settings' ? 'settings' : 'help-us';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.loginRequired' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const locale = pickLocale((body as { locale?: unknown }).locale);
  const returnTo = pickReturnTo((body as { returnTo?: unknown }).returnTo);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ errorKey: 'helpUs.donate.error.portalUnavailable' }, { status: 404 });
  }

  try {
    const result = await createBillingPortalSession(user.stripeCustomerId, `${APP_URL}/${locale}/${returnTo}`);
    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.error('[donations/portal] Stripe billing portal failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ errorKey: 'helpUs.donate.error.portalUnavailable' }, { status: 500 });
  }
}
