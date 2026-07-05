import type Stripe from 'stripe';
import { stripeClient } from './client';

export const DONATION_AMOUNT_MIN_CENTS = 100;
export const DONATION_AMOUNT_MAX_ONE_TIME_CENTS = 500_000;
export const DONATION_AMOUNT_MAX_MONTHLY_CENTS = 50_000;

export type DonationMode = 'payment' | 'subscription';
export type SupportedLocale = string;

export interface ValidateAmountOk {
  ok: true;
}
export interface ValidateAmountKo {
  ok: false;
  reason: 'amountInvalid';
}
export type ValidateAmountResult = ValidateAmountOk | ValidateAmountKo;

export function validateDonationAmount(mode: DonationMode, amountCents: number): ValidateAmountResult {
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents)) {
    return { ok: false, reason: 'amountInvalid' };
  }
  if (amountCents < DONATION_AMOUNT_MIN_CENTS) {
    return { ok: false, reason: 'amountInvalid' };
  }
  const max = mode === 'subscription' ? DONATION_AMOUNT_MAX_MONTHLY_CENTS : DONATION_AMOUNT_MAX_ONE_TIME_CENTS;
  if (amountCents > max) {
    return { ok: false, reason: 'amountInvalid' };
  }
  return { ok: true };
}

export interface CreateDonationCheckoutParams {
  mode: DonationMode;
  amountCents: number;
  locale: SupportedLocale;
  successUrl: string;
  cancelUrl: string;
  userId?: string | null;
  userEmail?: string | null;
  customerId?: string | null;
}

export interface CreateDonationCheckoutResult {
  url: string;
  sessionId: string;
}

export async function createDonationCheckout(params: CreateDonationCheckoutParams): Promise<CreateDonationCheckoutResult> {
  const { mode, amountCents, locale, successUrl, cancelUrl, userId, userEmail, customerId } = params;

  const validation = validateDonationAmount(mode, amountCents);
  if (!validation.ok) {
    throw new Error('amountInvalid');
  }
  if (mode === 'subscription' && !customerId) {
    throw new Error('customerIdRequiredForSubscription');
  }

  const stripe = stripeClient();
  const productName = mode === 'subscription' ? 'Soutien mensuel' : 'Don ponctuel';

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    quantity: 1,
    price_data: {
      unit_amount: amountCents,
      currency: 'eur',
      product_data: { name: productName },
      ...(mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
    },
  };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: [lineItem],
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: (locale || 'auto') as Stripe.Checkout.SessionCreateParams.Locale,
    metadata: {
      userId: userId ?? '',
      locale,
      kind: mode === 'subscription' ? 'monthly' : 'one_time',
      amountCents: String(amountCents),
    },
  };

  if (mode === 'subscription' && customerId) {
    sessionParams.customer = customerId;
    sessionParams.subscription_data = {
      description: 'Naruto Mythos TCG',
      metadata: {
        userId: userId ?? '',
        amountCents: String(amountCents),
      },
    };
  } else {
    sessionParams.payment_intent_data = {
      description: 'Naruto Mythos TCG',
    };
    if (userEmail) {
      sessionParams.customer_email = userEmail;
    }
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) {
    throw new Error('checkoutSessionMissingUrl');
  }
  return { url: session.url, sessionId: session.id };
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string | null,
  existingCustomerId: string | null | undefined,
): Promise<string> {
  const stripe = stripeClient();
  if (existingCustomerId) {
    try {
      const c = await stripe.customers.retrieve(existingCustomerId);
      if (!('deleted' in c) || !c.deleted) {
        return existingCustomerId;
      }
    } catch {
      // fall through and create a new customer
    }
  }
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  });
  return customer.id;
}

export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}
