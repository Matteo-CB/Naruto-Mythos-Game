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
  const { animationsEnabled, setAnimationsEnabled } = useSettingsStore();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

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
              style={{ color: '#e0e0e0' }}
            >
              {t('animations')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={animationsEnabled}
              onClick={() => setAnimationsEnabled(!animationsEnabled)}
              className="relative h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
              style={{
                backgroundColor: animationsEnabled ? '#c4a35a' : '#333333',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full transition-transform"
                style={{
                  backgroundColor: '#0a0a0a',
                  transform: animationsEnabled ? 'translateX(20px)' : 'translateX(2px)',
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
            {animationsEnabled ? t('animationsOn') : t('animationsOff')}
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
