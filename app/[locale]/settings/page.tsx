'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { FlagPicker } from '@/components/FlagPicker';
import { ChatSettingsSection } from '@/components/settings/ChatSettingsSection';
import { useEffect, useState, useCallback } from 'react';

const DELETE_ACCOUNT_PHRASE = 'DELETE MY ACCOUNT';

interface ActiveSubscription {
  amountCents: number;
  subscriptionId: string | null;
}

function formatEur(amountCents: number, bcp47: string): string {
  try {
    return new Intl.NumberFormat(bcp47, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} €`;
  }
}

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
  const tMeta = useTranslations('_meta');
  const {
    animationsEnabled, gameBackground, isLoaded, availableBackgrounds,
    fetchFromServer, setAnimationsEnabled, setGameBackground,
    hideDeckBuilderVariants, setHideDeckBuilderVariants,
    fastAnimations, setFastAnimations,
    countryCode, setCountryCode,
    soundEnabled, setSoundEnabled,
  } = useSettingsStore();
  const tFlag = useTranslations('flag');
  const backgrounds = availableBackgrounds;

  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [usernameError, setUsernameError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');

  const [activeSub, setActiveSub] = useState<ActiveSubscription | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState('');

  useEffect(() => {
    if (session?.user?.name) {
      setUsernameInput(session.user.name);
    }
  }, [session?.user?.name]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/donations/my-status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { activeSubscription: null }))
      .then((data: { activeSubscription: ActiveSubscription | null }) => {
        if (!cancelled) setActiveSub(data.activeSubscription ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status]);

  const handleOpenPortal = useCallback(async () => {
    setLoadingPortal(true);
    setPortalError('');
    try {
      const res = await fetch('/api/donations/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, returnTo: 'settings' }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPortalError(t('subscription.errorPortal'));
        setLoadingPortal(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalError(t('subscription.errorPortal'));
      setLoadingPortal(false);
    }
  }, [locale, t]);

  const handleDeleteAccount = useCallback(async () => {
    if (deletePhrase.trim() !== DELETE_ACCOUNT_PHRASE) return;
    setDeleteStatus('deleting');
    setDeleteError('');
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deletePhrase.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.errorKey ? t(data.errorKey) : (data.error || t('deleteAccount.error.serverError'));
        setDeleteError(msg);
        setDeleteStatus('error');
        return;
      }
      await signOut({ redirect: false });
      router.replace('/');
      router.refresh();
    } catch {
      setDeleteError(t('deleteAccount.error.serverError'));
      setDeleteStatus('error');
    }
  }, [deletePhrase, t, router]);

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
      
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      setUsernameError('Network error');
      setUsernameStatus('error');
    }
  }, [usernameInput, session?.user?.name, t, updateSession]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

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
        
        <h1
          className="mb-8 text-center text-base font-semibold uppercase tracking-[0.25em]"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

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
              onChange={(e) => {
                setUsernameInput(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''));
                setUsernameStatus('idle');
                setUsernameError('');
              }}
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_-]+"
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

        {activeSub && (
          <div
            className="mt-4 flex flex-col gap-3 p-5"
            style={{
              backgroundColor: '#111111',
              border: '1px solid #262626',
            }}
          >
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: '#e0e0e0' }}
            >
              {t('subscription.title')}
            </span>
            <p className="text-sm" style={{ color: 'rgba(232,232,232,0.85)' }}>
              {t('subscription.active', { amount: formatEur(activeSub.amountCents, tMeta('bcp47')) })}
            </p>
            <button
              type="button"
              onClick={handleOpenPortal}
              disabled={loadingPortal}
              className="self-start px-4 py-2 text-xs font-bold uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: '#c4a35a',
                color: '#0a0a0a',
                opacity: loadingPortal ? 0.6 : 1,
                cursor: loadingPortal ? 'wait' : 'pointer',
              }}
            >
              {loadingPortal ? t('subscription.opening') : t('subscription.manage')}
            </button>
            {portalError && (
              <p className="text-xs" style={{ color: '#b33e3e' }}>{portalError}</p>
            )}
            <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
              {t('subscription.hint')}
            </p>
          </div>
        )}

        <div
          className="mt-4 flex flex-col gap-4 p-5"
          style={{
            backgroundColor: '#111111',
            border: '1px solid #262626',
          }}
        >
          
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}>
              <img src="/images/icons/play.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.5 }} />
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

          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          <p
            className="text-xs tracking-wide"
            style={{ color: '#555555' }}
          >
            {!isLoaded ? t('loading') : animationsEnabled ? t('animationsOn') : t('animationsOff')}
          </p>

          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: '#e0e0e0' }}>
              {t('sound')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors overflow-hidden cursor-pointer"
              style={{
                backgroundColor: soundEnabled ? '#c4a35a' : '#333333',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: '#0a0a0a',
                  left: soundEnabled ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>

          <p
            className="text-xs tracking-wide"
            style={{ color: '#555555' }}
          >
            {soundEnabled ? t('soundOn') : t('soundOff')}
          </p>

          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}>
              {t('fastAnimations')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={fastAnimations}
              disabled={!isLoaded}
              onClick={() => setFastAnimations(!fastAnimations)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: fastAnimations ? '#c4a35a' : '#333333',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: '#0a0a0a',
                  left: fastAnimations ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
            {t('fastAnimationsHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}>
              {t('hideVariants')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={hideDeckBuilderVariants}
              disabled={!isLoaded}
              onClick={() => setHideDeckBuilderVariants(!hideDeckBuilderVariants)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: hideDeckBuilderVariants ? '#c4a35a' : '#333333',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: '#0a0a0a',
                  left: hideDeckBuilderVariants ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
            {t('hideVariantsHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? '#e0e0e0' : '#555555' }}>
              {tFlag('label')}
            </span>
            <FlagPicker value={countryCode} onChange={setCountryCode} disabled={!isLoaded} />
            <p className="text-xs tracking-wide" style={{ color: '#555555' }}>
              {tFlag('hint')}
            </p>
          </div>
        </div>

        <ChatSettingsSection />

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
              {(() => {
                const isRandomSelected = gameBackground === 'random';
                return (
                  <button
                    type="button"
                    disabled={!isLoaded || backgrounds.length === 0}
                    onClick={() => setGameBackground('random', '')}
                    className="relative overflow-hidden transition-all flex items-center justify-center"
                    style={{
                      aspectRatio: '16/9',
                      border: isRandomSelected ? '2px solid #c4a35a' : '2px solid #333333',
                      backgroundColor: 'rgba(196, 163, 90, 0.06)',
                      opacity: isLoaded && backgrounds.length > 0 ? 1 : 0.5,
                      cursor: isLoaded && backgrounds.length > 0 ? 'pointer' : 'default',
                    }}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <span
                        className="text-2xl font-bold tracking-wider"
                        style={{ color: '#c4a35a', fontFamily: "'NJNaruto', sans-serif", letterSpacing: '0.1em' }}
                      >
                        ?
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.3em]"
                        style={{ color: isRandomSelected ? '#c4a35a' : '#888' }}
                      >
                        {t('gameBackgroundRandom')}
                      </span>
                    </div>
                    {isRandomSelected && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
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
              })()}
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

        <div
          className="mt-4 flex flex-col gap-4 p-5"
          style={{
            backgroundColor: '#111111',
            }}
        >
          <div className="flex flex-col gap-1">
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: '#b33e3e' }}
            >
              {t('deleteAccount.title')}
            </span>
            <p className="text-xs tracking-wide" style={{ color: '#888888' }}>
              {t('deleteAccount.description')}
            </p>
          </div>

          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="self-start px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: '#1a1414',
                color: '#b33e3e',
                cursor: 'pointer',
              }}
            >
              {t('deleteAccount.openButton')}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed" style={{ color: '#cccccc' }}>
                {t('deleteAccount.confirmHint', { phrase: DELETE_ACCOUNT_PHRASE })}
              </p>
              <input
                type="text"
                value={deletePhrase}
                onChange={(e) => {
                  setDeletePhrase(e.target.value);
                  setDeleteStatus('idle');
                  setDeleteError('');
                }}
                placeholder={DELETE_ACCOUNT_PHRASE}
                disabled={deleteStatus === 'deleting'}
                className="px-3 py-1.5 text-sm tracking-wide outline-none"
                style={{
                  backgroundColor: '#0a0a0a',
                  color: '#e0e0e0',
                  fontFamily: 'monospace',
                }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = '#b33e3e'; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#b33e3e44'; }}
              />
              {deleteError && (
                <p className="text-xs" style={{ color: '#b33e3e' }}>{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteStatus === 'deleting' || deletePhrase.trim() !== DELETE_ACCOUNT_PHRASE}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: '#b33e3e',
                    color: '#0a0a0a',
                    opacity: (deleteStatus === 'deleting' || deletePhrase.trim() !== DELETE_ACCOUNT_PHRASE) ? 0.4 : 1,
                    cursor: (deleteStatus === 'deleting' || deletePhrase.trim() !== DELETE_ACCOUNT_PHRASE) ? 'default' : 'pointer',
                  }}
                >
                  {deleteStatus === 'deleting' ? '...' : t('deleteAccount.confirmButton')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePhrase('');
                    setDeleteError('');
                    setDeleteStatus('idle');
                  }}
                  disabled={deleteStatus === 'deleting'}
                  className="px-4 py-2 text-xs font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #333333',
                    color: '#888888',
                    cursor: deleteStatus === 'deleting' ? 'default' : 'pointer',
                  }}
                >
                  {t('deleteAccount.cancelButton')}
                </button>
              </div>
            </div>
          )}
        </div>

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
