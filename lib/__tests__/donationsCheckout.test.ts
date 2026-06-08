import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionsCreate = vi.fn();
const customersCreate = vi.fn();
const customersRetrieve = vi.fn();
const billingPortalCreate = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  stripeClient: () => ({
    checkout: { sessions: { create: (...a: unknown[]) => sessionsCreate(...a) } },
    customers: {
      create: (...a: unknown[]) => customersCreate(...a),
      retrieve: (...a: unknown[]) => customersRetrieve(...a),
    },
    billingPortal: { sessions: { create: (...a: unknown[]) => billingPortalCreate(...a) } },
  }),
  getStripeWebhookSecret: () => 'whsec_test',
}));

import {
  validateDonationAmount,
  createDonationCheckout,
  getOrCreateStripeCustomer,
  createBillingPortalSession,
  DONATION_AMOUNT_MIN_CENTS,
  DONATION_AMOUNT_MAX_ONE_TIME_CENTS,
  DONATION_AMOUNT_MAX_MONTHLY_CENTS,
} from '@/lib/stripe/checkout';

beforeEach(() => {
  sessionsCreate.mockReset();
  customersCreate.mockReset();
  customersRetrieve.mockReset();
  billingPortalCreate.mockReset();
});

describe('validateDonationAmount', () => {
  it('accepts a valid one-time amount within bounds', () => {
    expect(validateDonationAmount('payment', 500).ok).toBe(true);
    expect(validateDonationAmount('payment', DONATION_AMOUNT_MIN_CENTS).ok).toBe(true);
    expect(validateDonationAmount('payment', DONATION_AMOUNT_MAX_ONE_TIME_CENTS).ok).toBe(true);
  });

  it('rejects one-time amounts below min or above max', () => {
    expect(validateDonationAmount('payment', 99).ok).toBe(false);
    expect(validateDonationAmount('payment', DONATION_AMOUNT_MAX_ONE_TIME_CENTS + 1).ok).toBe(false);
  });

  it('caps monthly subscriptions at the lower max', () => {
    expect(validateDonationAmount('subscription', DONATION_AMOUNT_MAX_MONTHLY_CENTS).ok).toBe(true);
    expect(validateDonationAmount('subscription', DONATION_AMOUNT_MAX_MONTHLY_CENTS + 1).ok).toBe(false);
  });

  it('rejects floats, NaN, negative, and Infinity', () => {
    expect(validateDonationAmount('payment', 1.5).ok).toBe(false);
    expect(validateDonationAmount('payment', NaN).ok).toBe(false);
    expect(validateDonationAmount('payment', -100).ok).toBe(false);
    expect(validateDonationAmount('payment', Infinity).ok).toBe(false);
  });
});

describe('createDonationCheckout', () => {
  it('builds a one-time Checkout Session with the right line item and email', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const out = await createDonationCheckout({
      mode: 'payment',
      amountCents: 500,
      locale: 'fr',
      successUrl: 'https://app/help-us?donation=success&sid={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://app/help-us?donation=cancelled',
      userId: 'user1',
      userEmail: 'a@b.c',
      customerId: null,
    });
    expect(out.url).toContain('cs_test_1');
    expect(out.sessionId).toBe('cs_test_1');

    const args = sessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(args.mode).toBe('payment');
    expect(args.customer_email).toBe('a@b.c');
    expect(args.locale).toBe('fr');
    const items = args.line_items as Array<{ price_data: { unit_amount: number; currency: string; recurring?: unknown } }>;
    expect(items[0].price_data.unit_amount).toBe(500);
    expect(items[0].price_data.currency).toBe('eur');
    expect(items[0].price_data.recurring).toBeUndefined();
  });

  it('builds a subscription Checkout Session with recurring price_data and customer', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_test_2', url: 'https://checkout.stripe.com/sub' });
    await createDonationCheckout({
      mode: 'subscription',
      amountCents: 1000,
      locale: 'en',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/ko',
      userId: 'user1',
      userEmail: 'a@b.c',
      customerId: 'cus_existing',
    });

    const args = sessionsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(args.mode).toBe('subscription');
    expect(args.customer).toBe('cus_existing');
    expect(args.customer_email).toBeUndefined();
    const items = args.line_items as Array<{ price_data: { unit_amount: number; recurring: { interval: string } } }>;
    expect(items[0].price_data.unit_amount).toBe(1000);
    expect(items[0].price_data.recurring.interval).toBe('month');
    expect(args.subscription_data).toMatchObject({ metadata: { userId: 'user1', amountCents: '1000' } });
  });

  it('refuses subscription without a customerId', async () => {
    await expect(
      createDonationCheckout({
        mode: 'subscription',
        amountCents: 1000,
        locale: 'fr',
        successUrl: 'a',
        cancelUrl: 'b',
        userId: 'u',
        userEmail: 'e',
        customerId: null,
      }),
    ).rejects.toThrow('customerIdRequiredForSubscription');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('refuses invalid amounts before hitting Stripe', async () => {
    await expect(
      createDonationCheckout({
        mode: 'payment',
        amountCents: 50,
        locale: 'fr',
        successUrl: 'a',
        cancelUrl: 'b',
      }),
    ).rejects.toThrow('amountInvalid');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('propagates Stripe errors via checkoutSessionMissingUrl when no URL returned', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_test_3' });
    await expect(
      createDonationCheckout({
        mode: 'payment',
        amountCents: 500,
        locale: 'fr',
        successUrl: 'a',
        cancelUrl: 'b',
      }),
    ).rejects.toThrow('checkoutSessionMissingUrl');
  });
});

describe('getOrCreateStripeCustomer', () => {
  it('reuses an existing valid customer', async () => {
    customersRetrieve.mockResolvedValue({ id: 'cus_x', deleted: false });
    const id = await getOrCreateStripeCustomer('user1', 'a@b.c', 'cus_x');
    expect(id).toBe('cus_x');
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it('creates a new customer when the cached one was deleted', async () => {
    customersRetrieve.mockResolvedValue({ id: 'cus_x', deleted: true });
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    const id = await getOrCreateStripeCustomer('user1', 'a@b.c', 'cus_x');
    expect(id).toBe('cus_new');
  });

  it('creates a new customer when no cached id', async () => {
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    const id = await getOrCreateStripeCustomer('user1', 'a@b.c', null);
    expect(id).toBe('cus_new');
    expect(customersRetrieve).not.toHaveBeenCalled();
  });

  it('falls back to create when retrieve throws', async () => {
    customersRetrieve.mockRejectedValue(new Error('boom'));
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    const id = await getOrCreateStripeCustomer('user1', 'a@b.c', 'cus_x');
    expect(id).toBe('cus_new');
  });
});

describe('createBillingPortalSession', () => {
  it('returns the portal URL from Stripe', async () => {
    billingPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/x' });
    const out = await createBillingPortalSession('cus_x', 'https://app/return');
    expect(out.url).toBe('https://billing.stripe.com/x');
    expect(billingPortalCreate).toHaveBeenCalledWith({ customer: 'cus_x', return_url: 'https://app/return' });
  });
});
