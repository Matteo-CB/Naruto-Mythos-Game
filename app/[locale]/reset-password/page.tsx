'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';

function ResetPasswordForm() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-center" style={{ color: '#b33e3e' }}>
          {t('auth.invalidResetLink')}
        </p>
        <Link
          href="/login"
          className="text-sm underline"
          style={{ color: '#c4a35a' }}
        >
          {t('auth.goToLogin')}
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'invalidToken') {
          setError(t('auth.invalidResetLink'));
        } else {
          setError(t('common.error'));
        }
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-center" style={{ color: '#c4a35a' }}>
          {t('auth.resetSuccess')}
        </p>
        <p className="text-xs text-center" style={{ color: '#888888' }}>
          {t('auth.resetSuccessLogin')}
        </p>
        <Link
          href="/login"
          className="mt-2 inline-block rounded px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
        >
          {t('auth.signIn')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="password"
            className="text-xs uppercase tracking-wider"
            style={{ color: '#888888' }}
          >
            {t('auth.newPassword')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #262626',
              color: '#e0e0e0',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="confirmPassword"
            className="text-xs uppercase tracking-wider"
            style={{ color: '#888888' }}
          >
            {t('auth.confirmNewPassword')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="rounded px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #262626',
              color: '#e0e0e0',
            }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: '#b33e3e' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded py-2.5 text-sm font-bold uppercase tracking-wider transition-colors"
          style={{
            backgroundColor: loading ? '#333333' : '#c4a35a',
            color: '#0a0a0a',
          }}
        >
          {loading ? t('auth.resetting') : t('auth.resetPassword')}
        </button>
      </form>

      <p className="mt-6 text-center">
        <Link
          href="/login"
          className="text-xs"
          style={{ color: '#555555' }}
        >
          {t('auth.goToLogin')}
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations();

  return (
    <main
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="auth" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-lg p-8 relative z-10"
          style={{
            backgroundColor: '#141414',
            border: '1px solid #262626',
          }}
        >
          <h1
            className="text-2xl font-bold text-center mb-8 tracking-wider uppercase"
            style={{ color: '#c4a35a' }}
          >
            {t('auth.resetPasswordTitle')}
          </h1>

          <Suspense
            fallback={
              <p className="text-sm text-center" style={{ color: '#888888' }}>
                ...
              </p>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
      <Footer />
    </main>
  );
}
