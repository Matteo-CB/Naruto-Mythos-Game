'use client';

import { useSession } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { useEffect } from 'react';

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const t = useTranslations('settings');
  const { animationsEnabled, isLoaded, fetchFromServer, setAnimationsEnabled } = useSettingsStore();

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Load preferences from server once authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      fetchFromServer();
    }
  }, [status, fetchFromServer]);

  if (status === 'loading' || status === 'unauthenticated') {
    return <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh' }} />;
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground animated={animationsEnabled} />
      <DecorativeIcons animated={animationsEnabled} />

      <div
        className="relative z-10 w-full max-w-xs px-4 py-8"
        style={{ zIndex: 1 }}
      >
        {/* Title */}
        <h1
          className="mb-8 text-center text-base font-semibold uppercase tracking-[0.25em]"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

        {/* Settings card */}
        <div
          className="flex flex-col gap-4 p-5"
          style={{
            backgroundColor: '#111111',
            border: '1px solid #262626',
          }}
        >
          {/* Animations toggle row */}
          <div className="flex items-center justify-between gap-4">
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}
            >
              {t('animations')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={animationsEnabled}
              disabled={!isLoaded}
              onClick={() => setAnimationsEnabled(!animationsEnabled)}
              className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: animationsEnabled ? '#c4a35a' : '#333333',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: '#0a0a0a',
                  left: animationsEnabled ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          {/* Status label */}
          <p
            className="text-xs tracking-wide"
            style={{ color: '#555555' }}
          >
            {!isLoaded ? t('loading') : animationsEnabled ? t('animationsOn') : t('animationsOff')}
          </p>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-wider transition-colors"
            style={{ color: '#555555' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = '#c4a35a';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = '#555555';
            }}
          >
            {t('back')}
          </Link>
        </div>
      </div>
    </main>
  );
}
