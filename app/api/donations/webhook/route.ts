import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripeClient, getStripeWebhookSecret } from '@/lib/stripe/client';
import { prisma } from '@/lib/db/prisma';
import { sendDonationThankYouMail, type ThankYouLocale } from '@/lib/mail/donationThankYou';

export const runtime = 'nodejs';

function pickLocale(value: unknown): ThankYouLocale {
  return value === 'en' ? 'en' : 'fr';
}

function metaAmountCents(meta: Stripe.Metadata | null | undefined, fallback: number | null | undefined): number {
  const raw = meta?.amountCents;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback ?? 0;
}

async function sendThankYouOnce(opts: {
  donationId: string;
  to: string | null | undefined;
  amountCents: number;
  recurring: boolean;
  locale: ThankYouLocale;
  recipientName: string | null | undefined;
}): Promise<void> {
  const { donationId, to, amountCents, recurring, locale, recipientName } = opts;
  if (!to) return;

  const row = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { thankYouMailSentAt: true },
  });
  if (!row || row.thankYouMailSentAt) return;

  for (let i = 0; i < 3; i++) {
    const r = await sendDonationThankYouMail({ to, amountCents, recurring, locale, recipientName });
    if (r.ok) {
      await prisma.donation.update({
        where: { id: donationId },
        data: { thankYouMailSentAt: new Date() },
      });
      return;
    }
    if (r.reason === 'no_api_key') return;
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  console.warn('[donations/webhook] thank-you mail failed after 3 attempts, donation=', donationId);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const sessionId = session.id;
  const metadataAmount = metaAmountCents(session.metadata ?? null, session.amount_total);
  const isSub = session.mode === 'subscription';
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const paidAt = session.payment_status === 'paid' ? new Date() : null;
  const locale = pickLocale(session.metadata?.locale);
  const userId = session.metadata?.userId || null;
  const userEmail = session.customer_email || session.customer_details?.email || null;

  let chargeId: string | null = null;
  if (typeof session.payment_intent === 'string') {
    try {
      const pi = await stripeClient().paymentIntents.retrieve(session.payment_intent);
      chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null;
    } catch {
      chargeId = null;
    }
  }

  const upserted = await prisma.donation.upsert({
    where: { stripeSessionId: sessionId },
    create: {
      stripeSessionId: sessionId,
      stripeSubscriptionId: subscriptionId ?? undefined,
      stripeCustomerId: customerId ?? undefined,
      stripeChargeId: chargeId ?? undefined,
      userId: userId || undefined,
      userEmail: userEmail ?? undefined,
      amountCents: metadataAmount,
      currency: (session.currency ?? 'eur').toLowerCase(),
      mode: isSub ? 'subscription' : 'payment',
      status: paidAt ? 'succeeded' : 'pending',
      isRecurring: isSub,
      paidAt: paidAt ?? undefined,
    },
    update: {
      stripeSubscriptionId: subscriptionId ?? undefined,
      stripeCustomerId: customerId ?? undefined,
      stripeChargeId: chargeId ?? undefined,
      userEmail: userEmail ?? undefined,
      status: paidAt ? 'succeeded' : undefined,
      paidAt: paidAt ?? undefined,
    },
  });

  if (paidAt) {
    let recipientName: string | null = null;
    if (userId) {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        recipientName = user?.username ?? null;
      } catch {
        recipientName = null;
      }
    }
    await sendThankYouOnce({
      donationId: upserted.id,
      to: userEmail,
      amountCents: metadataAmount,
      recurring: isSub,
      locale,
      recipientName,
    });
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
      ? ((invoice as unknown as { subscription: string }).subscription)
      : ((invoice as unknown as { subscription?: Stripe.Subscription }).subscription?.id ?? null);

  if (!subscriptionId) {
    return;
  }
  const isFirst = invoice.billing_reason === 'subscription_create';
  const amount = invoice.amount_paid;
  const paidAt = invoice.status === 'paid' ? new Date((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000) : null;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
  const userEmail = invoice.customer_email ?? null;
  const chargeId = typeof (invoice as unknown as { charge?: string | Stripe.Charge }).charge === 'string'
    ? ((invoice as unknown as { charge: string }).charge)
    : ((invoice as unknown as { charge?: Stripe.Charge }).charge?.id ?? null);

  let locale: ThankYouLocale = 'fr';
  let userId: string | null = null;
  try {
    const sub = await stripeClient().subscriptions.retrieve(subscriptionId);
    locale = pickLocale(sub.metadata?.locale);
    userId = sub.metadata?.userId || null;
  } catch {
    // metadata fallback
  }

  if (isFirst) {
    const existing = await prisma.donation.findFirst({
      where: { stripeSubscriptionId: subscriptionId, stripeInvoiceId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      await prisma.donation.update({
        where: { id: existing.id },
        data: {
          stripeInvoiceId: invoice.id ?? null,
          stripeChargeId: chargeId ?? undefined,
          status: paidAt ? 'succeeded' : existing.status,
          paidAt: paidAt ?? existing.paidAt,
        },
      });
      return;
    }
  }

  if (!invoice.id) return;

  let recipientName: string | null = null;
  if (userId) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      recipientName = user?.username ?? null;
    } catch {
      recipientName = null;
    }
  }

  const row = await prisma.donation.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId ?? undefined,
      stripeChargeId: chargeId ?? undefined,
      userId: userId || undefined,
      userEmail: userEmail ?? undefined,
      username: recipientName ?? undefined,
      amountCents: amount,
      currency: (invoice.currency ?? 'eur').toLowerCase(),
      mode: 'subscription',
      status: 'succeeded',
      isRecurring: true,
      paidAt: paidAt ?? new Date(),
    },
    update: {
      stripeChargeId: chargeId ?? undefined,
      status: 'succeeded',
      paidAt: paidAt ?? new Date(),
    },
  });

  if (paidAt) {
    await sendThankYouOnce({
      donationId: row.id,
      to: userEmail,
      amountCents: amount,
      recurring: true,
      locale,
      recipientName,
    });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.id) return;
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
      ? ((invoice as unknown as { subscription: string }).subscription)
      : ((invoice as unknown as { subscription?: Stripe.Subscription }).subscription?.id ?? null);
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;

  let userId: string | null = null;
  if (subscriptionId) {
    try {
      const sub = await stripeClient().subscriptions.retrieve(subscriptionId);
      userId = sub.metadata?.userId || null;
    } catch {
      // ignore
    }
  }

  await prisma.donation.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId ?? undefined,
      stripeCustomerId: customerId ?? undefined,
      userId: userId || undefined,
      userEmail: invoice.customer_email ?? undefined,
      amountCents: invoice.amount_due ?? 0,
      currency: (invoice.currency ?? 'eur').toLowerCase(),
      mode: 'subscription',
      status: 'failed',
      isRecurring: true,
      failureReason: invoice.last_finalization_error?.message ?? 'payment_failed',
    },
    update: {
      status: 'failed',
      failureReason: invoice.last_finalization_error?.message ?? 'payment_failed',
    },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const cancelledAt = new Date();
  await prisma.donation.updateMany({
    where: { stripeSubscriptionId: sub.id, cancelledAt: null },
    data: { cancelledAt, status: 'cancelled' },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.id) return;
  await prisma.donation.updateMany({
    where: { stripeChargeId: charge.id },
    data: { status: 'refunded', refundedAt: new Date() },
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature') ?? '';
  if (!sig) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, getStripeWebhookSecret());
  } catch (e) {
    console.error('[donations/webhook] signature verification failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error('[donations/webhook] handler error for', event.type, ':', e instanceof Error ? e.message : e);
    return NextResponse.json({ received: true, handlerError: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
