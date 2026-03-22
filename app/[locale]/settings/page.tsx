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
  const {
    animationsEnabled, allowSpectatorHand, gameBackground, isLoaded, availableBackgrounds,
    fetchFromServer, setAnimationsEnabled, setAllowSpectatorHand, setGameBackground,
  } = useSettingsStore();
  const backgrounds = availableBackgrounds;

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Load preferences + backgrounds from server once authenticated
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
        className="relative z-10 w-full max-w-md px-4 py-8"
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

        {/* Spectator Hand Visibility */}
        <div
          className="mt-4 flex flex-col gap-4 p-5"
          style={{
            backgroundColor: '#111111',
            border: '1px solid #1e1e1e',
            borderLeft: '3px solid rgba(196, 163, 90, 0.15)',
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}
            >
              {t('allowSpectatorHand')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allowSpectatorHand}
              disabled={!isLoaded}
              onClick={() => setAllowSpectatorHand(!allowSpectatorHand)}
              className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: allowSpectatorHand ? '#c4a35a' : '#333333',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: '#0a0a0a',
                  left: allowSpectatorHand ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />
          <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
            {!isLoaded ? t('loading') : allowSpectatorHand ? t('spectatorHandOn') : t('spectatorHandOff')}
          </p>
        </div>

        {/* Game Background picker */}
        {backgrounds.length > 0 && (
          <div
            className="mt-4 flex flex-col gap-4 p-5"
            style={{
              backgroundColor: '#111111',
              border: '1px solid #262626',
            }}
          >
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}
            >
              {t('gameBackground')}
            </span>

            <div className="grid grid-cols-2 gap-3">
              {backgrounds.map((bg) => {
                const isSelected = gameBackground === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    disabled={!isLoaded}
                    onClick={() => setGameBackground(bg.id, bg.url)}
                    className="relative overflow-hidden transition-all"
                    style={{
                      aspectRatio: '16/9',
                      border: isSelected ? '2px solid #c4a35a' : '2px solid #333333',
                      opacity: isLoaded ? 1 : 0.5,
                      cursor: isLoaded ? 'pointer' : 'default',
                    }}
                  >
                    <img
                      src={bg.url}
                      alt={bg.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(196, 163, 90, 0.15)' }}
                      >
                        <span
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: '#c4a35a' }}
                        >
                          {t('selected')}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
