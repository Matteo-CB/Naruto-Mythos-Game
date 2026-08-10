'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });

      if (!res.ok) {
        setError(t('common.error'));
      } else {
        setSent(true);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: 'var(--t-bg)' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="auth" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-lg p-8 relative z-10"
          style={{
            backgroundColor: 'var(--t-surface)',
            border: '1px solid var(--t-border)',
          }}
        >
          <h1
            className="text-2xl font-bold text-center mb-4 tracking-wider uppercase"
            style={{ color: 'var(--t-accent)' }}
          >
            {t('auth.forgotPasswordTitle')}
          </h1>

          {sent ? (
            <div className="flex flex-col items-center gap-4">
              <p
                className="text-sm text-center leading-relaxed"
                style={{ color: 'var(--t-muted)' }}
              >
                {t('auth.resetEmailSent')}
              </p>
              <Link
                href="/login"
                className="text-sm underline"
                style={{ color: 'var(--t-accent)' }}
              >
                {t('auth.goToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <p
                className="text-xs text-center mb-6"
                style={{ color: 'var(--t-muted)' }}
              >
                {t('auth.forgotPasswordDescription')}
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="email"
                    className="text-xs uppercase tracking-wider"
                    style={{ color: 'var(--t-muted)' }}
                  >
                    {t('auth.email')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="rounded px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--t-bg)',
                      border: '1px solid var(--t-border)',
                      color: 'var(--t-text)',
                    }}
                  />
                </div>

                {error && (
                  <p className="text-xs" style={{ color: 'var(--t-danger)' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 rounded py-2.5 text-sm font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: loading ? 'var(--t-border-strong)' : 'var(--t-accent)',
                    color: 'var(--t-bg)',
                  }}
                >
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </button>
              </form>

              <p className="mt-6 text-center">
                <Link
                  href="/login"
                  className="text-xs"
                  style={{ color: 'var(--t-dim)' }}
                >
                  {t('auth.goToLogin')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
