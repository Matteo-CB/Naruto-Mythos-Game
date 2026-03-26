'use client';

import { useSession } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { useEffect, useState, useCallback } from 'react';

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const t = useTranslations('settings');
  const {
    animationsEnabled, gameBackground, isLoaded, availableBackgrounds,
    fetchFromServer, setAnimationsEnabled, setGameBackground,
  } = useSettingsStore();
  const backgrounds = availableBackgrounds;

  // Username editing state
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [usernameError, setUsernameError] = useState('');

  useEffect(() => {
    if (session?.user?.name) {
      setUsernameInput(session.user.name);
    }
  }, [session?.user?.name]);

  const handleUsernameSave = useCallback(async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === session?.user?.name) return;
    setUsernameStatus('saving');
    setUsernameError('');
    try {
      const res = await fetch('/api/user/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUsernameError(data.errorKey ? t(data.errorKey) : data.error);
        setUsernameStatus('error');
        return;
      }
      await updateSession({ name: data.username });
      setUsernameStatus('saved');
      setTimeout(() => setUsernameStatus('idle'), 2000);
    } catch {
      setUsernameError('Network error');
      setUsernameStatus('error');
    }
  }, [usernameInput, session?.user?.name, t, updateSession]);

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

        {/* Username edit */}
        <div
          className="flex flex-col gap-3 p-5"
          style={{
            backgroundColor: '#111111',
            border: '1px solid #262626',
          }}
        >
          <span
            className="text-sm font-medium tracking-wide"
            style={{ color: '#e0e0e0' }}
          >
            {t('username')}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => { setUsernameInput(e.target.value); setUsernameStatus('idle'); setUsernameError(''); }}
              maxLength={20}
              className="flex-1 px-3 py-1.5 text-sm font-medium outline-none"
              style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333333',
                color: '#e0e0e0',
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#c4a35a'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#333333'; }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUsernameSave(); }}
            />
            <button
              type="button"
              disabled={usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name}
              onClick={handleUsernameSave}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: usernameStatus === 'saved' ? '#2d5a2d' : '#c4a35a',
                color: usernameStatus === 'saved' ? '#a0d0a0' : '#0a0a0a',
                opacity: (usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name) ? 0.4 : 1,
                cursor: (usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name) ? 'default' : 'pointer',
              }}
            >
              {usernameStatus === 'saving' ? '...' : usernameStatus === 'saved' ? t('usernameSaved') : t('usernameSave')}
            </button>
          </div>
          {usernameError && (
            <p className="text-xs" style={{ color: '#b33e3e' }}>{usernameError}</p>
          )}
          <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
            {t('usernameHint')}
          </p>
        </div>

        {/* Settings card */}
        <div
          className="mt-4 flex flex-col gap-4 p-5"
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
