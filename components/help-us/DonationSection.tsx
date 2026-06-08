'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from '@/lib/i18n/navigation';
import { useToastStore } from '@/stores/toastStore';

const ACCENT = '#c4a35a';

const ONE_TIME_PRESETS = [300, 500, 1000, 2500] as const;
const MONTHLY_PRESETS = [300, 500, 1000] as const;

const MIN_CENTS = 100;
const MAX_ONE_TIME_CENTS = 500_000;
const MAX_MONTHLY_CENTS = 50_000;

type Mode = 'payment' | 'subscription';

interface ActiveSubscription {
  amountCents: number;
}

function formatEur(amountCents: number, locale: string): string {
  const euros = amountCents / 100;
  if (locale === 'fr') {
    const fixed = Number.isInteger(euros) ? `${euros}` : euros.toFixed(2).replace('.', ',');
    return `${fixed} €`;
  }
  const fixed = Number.isInteger(euros) ? `${euros}` : euros.toFixed(2);
  return `€${fixed}`;
}

export function DonationSection() {
  const t = useTranslations('helpUs.donate');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const showToast = useToastStore((s) => s.showToast);
  const isLoggedIn = status === 'authenticated' && !!session?.user;

  const [mode, setMode] = useState<Mode>('payment');
  const [selectedCents, setSelectedCents] = useState<number>(500);
  const [customCents, setCustomCents] = useState<string>('');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [activeSub, setActiveSub] = useState<ActiveSubscription | null>(null);
  const [bannerType, setBannerType] = useState<'success' | 'cancelled' | null>(null);

  const presets = mode === 'subscription' ? MONTHLY_PRESETS : ONE_TIME_PRESETS;
  const maxCents = mode === 'subscription' ? MAX_MONTHLY_CENTS : MAX_ONE_TIME_CENTS;

  useEffect(() => {
    if (!isLoggedIn) {
      setActiveSub(null);
      return;
    }
    let cancelled = false;
    fetch('/api/donations/my-status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { activeSubscription: null }))
      .then((data: { activeSubscription: ActiveSubscription | null }) => {
        if (!cancelled) setActiveSub(data.activeSubscription);
      })
      .catch(() => {
        if (!cancelled) setActiveSub(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const result = searchParams?.get('donation');
    if (result !== 'success' && result !== 'cancelled') return;
    setBannerType(result);
    const duration = result === 'success' ? 6000 : 4000;
    const cleanup = setTimeout(() => {
      setBannerType(null);
      router.replace('/help-us');
    }, duration);
    return () => clearTimeout(cleanup);
  }, [searchParams, router]);

  const customParsedCents = useMemo(() => {
    if (!customCents.trim()) return null;
    const normalized = customCents.replace(',', '.');
    const value = Number.parseFloat(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }, [customCents]);

  const effectiveCents = customParsedCents !== null ? customParsedCents : selectedCents;
  const effectiveValid = effectiveCents >= MIN_CENTS && effectiveCents <= maxCents;
  const subscriptionLoginBlocked = mode === 'subscription' && !isLoggedIn && status !== 'loading';

  const onPickPreset = useCallback((cents: number) => {
    setSelectedCents(cents);
    setCustomCents('');
  }, []);

  const onChangeCustom = useCallback((raw: string) => {
    const sanitized = raw.replace(/[^0-9.,]/g, '');
    setCustomCents(sanitized);
  }, []);

  const onChangeMode = useCallback((next: Mode) => {
    setMode(next);
    setCustomCents('');
    setSelectedCents(next === 'subscription' ? 500 : 500);
  }, []);

  const onCheckout = useCallback(async () => {
    if (!effectiveValid) {
      showToast({ type: 'error', messageKey: 'helpUs.donate.error.amountInvalid', dedupeKey: 'donate-amount' });
      return;
    }
    if (subscriptionLoginBlocked) {
      router.push('/login');
      return;
    }
    setLoadingCheckout(true);
    try {
      const res = await fetch('/api/donations/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, amountCents: effectiveCents, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorKey = typeof data?.errorKey === 'string' ? data.errorKey : 'helpUs.donate.error.checkoutFailed';
        showToast({ type: 'error', messageKey: errorKey, dedupeKey: `donate-${errorKey}` });
        setLoadingCheckout(false);
        return;
      }
      if (typeof data?.url === 'string') {
        window.location.assign(data.url);
        return;
      }
      showToast({ type: 'error', messageKey: 'helpUs.donate.error.checkoutFailed', dedupeKey: 'donate-checkoutFailed' });
      setLoadingCheckout(false);
    } catch {
      showToast({ type: 'error', messageKey: 'helpUs.donate.error.checkoutFailed', dedupeKey: 'donate-checkoutFailed' });
      setLoadingCheckout(false);
    }
  }, [effectiveCents, effectiveValid, mode, locale, subscriptionLoginBlocked, router, showToast]);

  const onOpenPortal = useCallback(async () => {
    setLoadingPortal(true);
    try {
      const res = await fetch('/api/donations/portal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data?.url === 'string') {
        window.location.assign(data.url);
        return;
      }
      const errorKey = typeof data?.errorKey === 'string' ? data.errorKey : 'helpUs.donate.error.portalUnavailable';
      showToast({ type: 'error', messageKey: errorKey, dedupeKey: `donate-${errorKey}` });
      setLoadingPortal(false);
    } catch {
      showToast({ type: 'error', messageKey: 'helpUs.donate.error.portalUnavailable', dedupeKey: 'donate-portalUnavailable' });
      setLoadingPortal(false);
    }
  }, [locale, showToast]);

  return (
    <section
      className="relative rounded-lg p-5 sm:p-8 mx-auto w-full"
      style={{
        backgroundColor: 'rgba(20,20,24,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <AnimatePresence>
        {bannerType && (
          <motion.div
            key={`banner-${bannerType}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mb-6 px-4 py-3 rounded-md text-sm"
            style={{
              backgroundColor: bannerType === 'success' ? 'rgba(127,212,157,0.12)' : 'rgba(232,232,232,0.06)',
              color: bannerType === 'success' ? '#7fd49d' : '#bbbbbb',
            }}
          >
            {bannerType === 'success' ? t('successBanner') : t('cancelledBanner')}
          </motion.div>
        )}
      </AnimatePresence>

      <h2
        className="font-display text-2xl sm:text-3xl tracking-[0.2em] mb-3 uppercase text-center"
        style={{ color: ACCENT }}
      >
        {t('sectionTitle')}
      </h2>
      <p
        className="font-body text-sm sm:text-[15px] leading-relaxed mb-6 text-center max-w-[560px] mx-auto"
        style={{ color: 'rgba(232,232,232,0.85)' }}
      >
        {t('intro')}
      </p>

      {activeSub && (
        <div
          className="mb-6 px-4 py-4 rounded-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ backgroundColor: 'rgba(196,163,90,0.10)', color: '#e8e8e8' }}
        >
          <span className="text-sm font-body">
            {t('alreadySubscribed', { amount: formatEur(activeSub.amountCents, locale) })}
          </span>
          <button
            type="button"
            onClick={onOpenPortal}
            disabled={loadingPortal}
            className="font-display uppercase text-xs tracking-widest px-4 py-2 rounded-md transition-opacity"
            style={{
              backgroundColor: ACCENT,
              color: '#0a0a0a',
              opacity: loadingPortal ? 0.6 : 1,
              cursor: loadingPortal ? 'wait' : 'pointer',
            }}
          >
            {loadingPortal ? t('managePortalLoading') : t('managePortal')}
          </button>
        </div>
      )}

      <div className="relative flex w-full max-w-[420px] mx-auto mb-6" role="tablist">
        {(['payment', 'subscription'] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeMode(m)}
              className="relative flex-1 py-2.5 font-display uppercase text-xs sm:text-sm tracking-widest transition-colors"
              style={{ color: active ? ACCENT : '#888' }}
            >
              {m === 'payment' ? t('tabOneTime') : t('tabMonthly')}
              {active && (
                <motion.div
                  layoutId="donate-tab-indicator"
                  className="absolute left-0 right-0 bottom-0 h-[2px]"
                  style={{ backgroundColor: ACCENT }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <p
        className="font-body text-xs uppercase tracking-widest mb-3 text-center"
        style={{ color: '#888' }}
      >
        {t('chooseAmount')}
      </p>

      <div
        className={`grid gap-2 mb-3 mx-auto w-full max-w-[420px] ${
          presets.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        }`}
      >
        {presets.map((cents) => {
          const isActive = customParsedCents === null && selectedCents === cents;
          return (
            <button
              key={cents}
              type="button"
              onClick={() => onPickPreset(cents)}
              className="py-3 rounded-md font-display text-sm sm:text-base tracking-wider transition-all"
              style={{
                backgroundColor: isActive ? 'rgba(196,163,90,0.18)' : 'rgba(255,255,255,0.04)',
                color: isActive ? ACCENT : '#e8e8e8',
                boxShadow: isActive ? '0 0 12px rgba(196,163,90,0.13)' : 'none',
              }}
              aria-pressed={isActive}
            >
              {formatEur(cents, locale)}
              {mode === 'subscription' && (
                <span className="block text-[10px] mt-0.5" style={{ color: isActive ? ACCENT : '#888' }}>
                  {t('perMonth')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mx-auto w-full max-w-[420px] mb-6">
        <input
          type="text"
          inputMode="decimal"
          value={customCents}
          onChange={(e) => onChangeCustom(e.target.value)}
          placeholder={t('customAmountPlaceholder')}
          className="w-full px-4 py-3 rounded-md font-body text-sm focus:outline-none"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            color: '#e8e8e8',
            border: customParsedCents !== null
              ? '1px solid rgba(196,163,90,0.5)'
              : '1px solid rgba(255,255,255,0.08)',
          }}
          aria-label={t('customAmountPlaceholder')}
        />
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <button
          type="button"
          onClick={onCheckout}
          disabled={loadingCheckout || !effectiveValid}
          className="w-full h-12 sm:h-14 rounded-md font-display uppercase text-sm tracking-widest transition-opacity"
          style={{
            backgroundColor: ACCENT,
            color: '#0a0a0a',
            opacity: loadingCheckout || !effectiveValid ? 0.5 : 1,
            cursor: loadingCheckout ? 'wait' : effectiveValid ? 'pointer' : 'not-allowed',
          }}
        >
          {loadingCheckout
            ? t('ctaPreparing')
            : mode === 'subscription'
              ? t('ctaSubscribe')
              : t('cta')}
        </button>
        {subscriptionLoginBlocked && (
          <p className="mt-3 text-xs text-center font-body" style={{ color: '#888' }}>
            {t('loginToSubscribe')}
          </p>
        )}
        <p className="mt-4 text-[11px] text-center font-body leading-relaxed" style={{ color: '#666' }}>
          {t('secureNote')}
        </p>
      </div>
    </section>
  );
}
