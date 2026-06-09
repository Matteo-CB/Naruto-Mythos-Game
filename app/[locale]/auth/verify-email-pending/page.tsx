'use client';

import { useCallback, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';

export default function VerifyEmailPendingPage() {
  const t = useTranslations('auth.verifyEmail');
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onResend = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
      } else {
        setError(typeof json?.errorKey === 'string' ? json.errorKey : 'auth.error.verifyResendFailed');
      }
    } catch {
      setError('auth.error.verifyResendFailed');
    } finally {
      setSending(false);
    }
  }, [locale]);

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: '#08070a', color: '#e8e8e8' }}>
      <CloudBackground />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative z-10 max-w-md w-full mx-4 rounded-lg p-8 text-center"
        style={{
          backgroundColor: 'rgba(20,20,24,0.78)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        }}
      >
        <h1 className="font-display text-2xl tracking-[0.2em] uppercase mb-4" style={{ color: '#c4a35a' }}>
          {t('pendingTitle')}
        </h1>
        <p className="font-body text-sm mb-6 leading-relaxed" style={{ color: 'rgba(232,232,232,0.85)' }}>
          {t('pendingBody')}
        </p>
        <button
          type="button"
          onClick={onResend}
          disabled={sending || sent}
          className="font-display uppercase text-xs tracking-widest px-5 py-2.5 rounded-md transition-opacity"
          style={{
            backgroundColor: '#c4a35a',
            color: '#0a0a0a',
            opacity: sending || sent ? 0.5 : 1,
          }}
        >
          {sending ? t('resending') : sent ? t('resent') : t('resend')}
        </button>
        {error && <p className="mt-4 font-body text-xs" style={{ color: '#d47f7f' }}>{t('resendError')}</p>}
        <p className="mt-6 font-body text-[11px]" style={{ color: '#666' }}>
          <Link href="/" className="underline" style={{ color: '#c4a35a' }}>{t('backHome')}</Link>
        </p>
      </motion.div>
    </main>
  );
}
