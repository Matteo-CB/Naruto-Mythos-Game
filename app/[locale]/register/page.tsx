'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (username.length < 3 || username.length > 20) {
      setError(t('auth.usernameLengthError'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('auth.registrationFailed'));
        return;
      }

      // Auto sign in after registration
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('auth.signInFailed'));
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
          {t('common.register')}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="username"
              className="text-xs uppercase tracking-wider"
              style={{ color: '#888888' }}
            >
              {t('auth.username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
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
              htmlFor="email"
              className="text-xs uppercase tracking-wider"
              style={{ color: '#888888' }}
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
                backgroundColor: '#0a0a0a',
                border: '1px solid #262626',
                color: '#e0e0e0',
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-xs uppercase tracking-wider"
              style={{ color: '#888888' }}
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
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
              {t('auth.confirmPassword')}
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
            {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: '#888888' }}
        >
          {t('auth.hasAccount')}{' '}
          <Link
            href="/login"
            className="underline"
            style={{ color: '#c4a35a' }}
          >
            {t('common.signIn')}
          </Link>
        </p>

        <p className="mt-4 text-center">
          <Link
            href="/"
            className="text-xs"
            style={{ color: '#555555' }}
          >
            {t('auth.backToHome')}
          </Link>
        </p>
      </div>
      </div>
      <Footer />
    </div>
  );
}
