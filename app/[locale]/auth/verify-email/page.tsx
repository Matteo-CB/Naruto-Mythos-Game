'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';

type Status = 'idle' | 'loading' | 'ok' | 'expired' | 'invalid' | 'error';

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verifyEmail');
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp?.get('token') ?? '';
  const [status, setStatus] = useState<Status>('idle');
  const [username, setUsername] = useState<string | null>(null);

  const verify = useCallback(async () => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('ok');
        if (typeof json?.username === 'string') setUsername(json.username);
        return;
      }
      if (res.status === 410) {
        setStatus('expired');
        return;
      }
      setStatus('invalid');
    } catch {
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    verify();
  }, [verify]);

  useEffect(() => {
    if (status !== 'ok') return;
    const id = window.setTimeout(() => router.replace('/'), 3000);
    return () => window.clearTimeout(id);
  }, [status, router]);

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
          {t('title')}
        </h1>
        {status === 'loading' && <p className="font-body text-sm" style={{ color: 'rgba(232,232,232,0.85)' }}>{t('loading')}</p>}
        {status === 'ok' && (
          <>
            <p className="font-body text-sm mb-4" style={{ color: '#7fd49d' }}>{t('successPrefix')}{username ? ` ${username}` : ''} !</p>
            <p className="font-body text-xs" style={{ color: '#888' }}>{t('successRedirect')}</p>
          </>
        )}
        {status === 'expired' && (
          <>
            <p className="font-body text-sm mb-4" style={{ color: '#d4a87f' }}>{t('expired')}</p>
            <Link href="/auth/verify-email-pending" className="font-display uppercase text-xs tracking-widest underline" style={{ color: '#c4a35a' }}>
              {t('requestNew')}
            </Link>
          </>
        )}
        {status === 'invalid' && (
          <>
            <p className="font-body text-sm mb-4" style={{ color: '#d47f7f' }}>{t('invalid')}</p>
            <Link href="/" className="font-display uppercase text-xs tracking-widest underline" style={{ color: '#c4a35a' }}>
              {t('home')}
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="font-body text-sm mb-4" style={{ color: '#d47f7f' }}>{t('networkError')}</p>
            <button type="button" onClick={verify} className="font-display uppercase text-xs tracking-widest underline" style={{ color: '#c4a35a' }}>
              {t('retry')}
            </button>
          </>
        )}
      </motion.div>
    </main>
  );
}
