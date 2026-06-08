import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ activeSubscription: null });
  }

  const active = await prisma.donation.findFirst({
    where: {
      userId,
      isRecurring: true,
      status: 'succeeded',
      cancelledAt: null,
      stripeSubscriptionId: { not: null },
    },
    orderBy: { paidAt: 'desc' },
    select: { amountCents: true, stripeSubscriptionId: true },
  });

  return NextResponse.json({
    activeSubscription: active
      ? { amountCents: active.amountCents, subscriptionId: active.stripeSubscriptionId }
      : null,
  });
}
