'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('auth.invalidCredentials'));
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
          {t('auth.signIn')}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              className="rounded px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #262626',
                color: '#e0e0e0',
              }}
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs"
              style={{ color: '#c4a35a' }}
            >
              {t('auth.forgotPassword')}
            </Link>
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
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        {/* Separator */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ backgroundColor: '#262626' }} />
          <span className="text-xs uppercase tracking-wider" style={{ color: '#555555' }}>
            {t('auth.orSeparator')}
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: '#262626' }} />
        </div>

        {/* Discord Sign In */}
        <button
          onClick={() => signIn('discord', { callbackUrl: '/' })}
          className="w-full rounded py-2.5 text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
          style={{
            backgroundColor: '#5865F2',
            color: '#ffffff',
            border: '1px solid #4752C4',
          }}
        >
          <svg width="18" height="14" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="currentColor"/>
          </svg>
          {t('auth.signInWithDiscord')}
        </button>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: '#888888' }}
        >
          {t('auth.noAccount')}{' '}
          <Link
            href="/register"
            className="underline"
            style={{ color: '#c4a35a' }}
          >
            {t('common.register')}
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
    </main>
  );
}
