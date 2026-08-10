'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter, Link } from '@/lib/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';
import { isTouchPrimaryDevice } from '@/lib/utils/device';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { FlagPicker } from '@/components/FlagPicker';
import { ChatSettingsSection } from '@/components/settings/ChatSettingsSection';
import { BoardColorsSection } from '@/components/settings/BoardColorsSection';
import { SiteThemeSection } from '@/components/settings/SiteThemeSection';
import { DeckPreferencesSection } from '@/components/settings/DeckPreferencesSection';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';

const DELETE_ACCOUNT_PHRASE = 'DELETE MY ACCOUNT';

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
  const tMeta = useTranslations('_meta');
  const {
    animationsPref, isLoaded,
    fetchFromServer, setAnimationsEnabled,
    hideDeckBuilderVariants, setHideDeckBuilderVariants,
    manualPowerMode, setManualPowerMode,
    gamepadEnabled, setGamepadEnabled,
    fastAnimations, setFastAnimations,
    countryCode, setCountryCode,
    soundEnabled, setSoundEnabled,
    allowNonFriendMessages, setAllowNonFriendMessages,
    privateProfile, setPrivateProfile,
  } = useSettingsStore();
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => { setIsTouchDevice(isTouchPrimaryDevice()); }, []);
  const tFlag = useTranslations('flag');

  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [usernameError, setUsernameError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');


  useEffect(() => {
    if (session?.user?.name) {
      setUsernameInput(session.user.name);
    }
  }, [session?.user?.name]);



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
    return <div style={{ backgroundColor: 'var(--t-bg)', minHeight: '100vh' }} />;
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--t-bg)' }}
    >
      <CloudBackground animated={animationsPref} />
      <DecorativeIcons animated={animationsPref} />

      <div
        className="relative z-10 w-full max-w-md px-4 py-8 lg:max-w-6xl lg:px-8"
        style={{ zIndex: 1 }}
      >

        <h1
          className="mb-8 text-center text-base font-semibold uppercase tracking-[0.25em] lg:mb-10 lg:text-lg"
          style={{ color: 'var(--t-accent)' }}
        >
          {t('title')}
        </h1>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="min-w-0">
        <div
          className="flex flex-col gap-3 p-5"
          style={{
            backgroundColor: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
          }}
        >
          <span
            className="text-sm font-medium tracking-wide"
            style={{ color: 'var(--t-text)' }}
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
                backgroundColor: 'var(--t-bg)',
                border: '1px solid var(--t-border-strong)',
                color: 'var(--t-text)',
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--t-accent)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--t-border-strong)'; }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUsernameSave(); }}
            />
            <button
              type="button"
              disabled={usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name}
              onClick={handleUsernameSave}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-opacity"
              style={{
                backgroundColor: usernameStatus === 'saved' ? 'var(--t-success)' : 'var(--t-accent)',
                color: 'var(--t-bg)',
                opacity: (usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name) ? 0.4 : 1,
                cursor: (usernameStatus === 'saving' || usernameInput.trim() === session?.user?.name) ? 'default' : 'pointer',
              }}
            >
              {usernameStatus === 'saving' ? '...' : usernameStatus === 'saved' ? t('usernameSaved') : t('usernameSave')}
            </button>
          </div>
          {usernameError && (
            <p className="text-xs" style={{ color: 'var(--t-danger)' }}>{usernameError}</p>
          )}
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('usernameHint')}
          </p>
        </div>

        <div
          className="mt-4 flex flex-col gap-4 p-5"
          style={{
            backgroundColor: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
          }}
        >
          
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
              <img src="/images/icons/play.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.5 }} />
              {t('animations')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={animationsPref}
              disabled={!isLoaded}
              onClick={() => setAnimationsEnabled(!animationsPref)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: animationsPref ? 'var(--t-accent)' : 'var(--t-border-strong)',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: animationsPref ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <p
            className="text-xs tracking-wide"
            style={{ color: 'var(--t-dim)' }}
          >
            {!isLoaded ? t('loading') : animationsPref ? t('animationsOn') : t('animationsOff')}
          </p>

          {isLoaded && isTouchDevice && (
            <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
              {t('animationsTouchDisabled')}
            </p>
          )}

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: 'var(--t-text)' }}>
              {t('sound')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors overflow-hidden cursor-pointer"
              style={{
                backgroundColor: soundEnabled ? 'var(--t-accent)' : 'var(--t-border-strong)',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: soundEnabled ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>

          <p
            className="text-xs tracking-wide"
            style={{ color: 'var(--t-dim)' }}
          >
            {soundEnabled ? t('soundOn') : t('soundOff')}
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
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
                backgroundColor: fastAnimations ? 'var(--t-accent)' : 'var(--t-border-strong)',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: fastAnimations ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('fastAnimationsHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
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
                backgroundColor: hideDeckBuilderVariants ? 'var(--t-accent)' : 'var(--t-border-strong)',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: hideDeckBuilderVariants ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('hideVariantsHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
              {t('manualPowerMode')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={manualPowerMode}
              disabled={!isLoaded}
              onClick={() => setManualPowerMode(!manualPowerMode)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: manualPowerMode ? 'var(--t-accent)' : 'var(--t-border-strong)',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: manualPowerMode ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('manualPowerModeHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
              {t('gamepad')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={gamepadEnabled}
              disabled={!isLoaded}
              onClick={() => setGamepadEnabled(!gamepadEnabled)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
              style={{
                backgroundColor: gamepadEnabled ? 'var(--t-accent)' : 'var(--t-border-strong)',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: isLoaded ? 1 : 0.5,
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  left: gamepadEnabled ? '22px' : '2px',
                  transition: 'left 150ms ease',
                }}
              />
            </button>
          </div>
          <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
            {t('gamepadHint')}
          </p>

          <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
              {tFlag('label')}
            </span>
            <FlagPicker value={countryCode} onChange={setCountryCode} disabled={!isLoaded} />
            <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
              {tFlag('hint')}
            </p>
          </div>
        </div>
        </div>

        <div className="min-w-0 flex flex-col gap-4 lg:gap-6 lg:[&>div]:mt-0">
          <ChatSettingsSection />

          <div className="flex flex-col gap-4 p-5 lg:p-6" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
            <span className="text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
              {t('socialSectionTitle')}
            </span>

            <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
                {t('allowNonFriendMessages')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={allowNonFriendMessages}
                disabled={!isLoaded}
                onClick={() => setAllowNonFriendMessages(!allowNonFriendMessages)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
                style={{ backgroundColor: allowNonFriendMessages ? 'var(--t-accent)' : 'var(--t-border-strong)', cursor: isLoaded ? 'pointer' : 'default', opacity: isLoaded ? 1 : 0.5 }}
              >
                <span className="absolute top-0.5 h-5 w-5 rounded-full" style={{ backgroundColor: 'var(--t-bg)', left: allowNonFriendMessages ? '22px' : '2px', transition: 'left 150ms ease' }} />
              </button>
            </div>
            <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
              {t('allowNonFriendMessagesHint')}
            </p>

            <div style={{ height: '1px', backgroundColor: 'var(--t-divider)' }} />

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-medium tracking-wide" style={{ color: isLoaded ? 'var(--t-text)' : 'var(--t-dim)' }}>
                {t('privateProfile')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={privateProfile}
                disabled={!isLoaded}
                onClick={() => setPrivateProfile(!privateProfile)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden"
                style={{ backgroundColor: privateProfile ? 'var(--t-accent)' : 'var(--t-border-strong)', cursor: isLoaded ? 'pointer' : 'default', opacity: isLoaded ? 1 : 0.5 }}
              >
                <span className="absolute top-0.5 h-5 w-5 rounded-full" style={{ backgroundColor: 'var(--t-bg)', left: privateProfile ? '22px' : '2px', transition: 'left 150ms ease' }} />
              </button>
            </div>
            <p className="text-xs tracking-wide" style={{ color: 'var(--t-dim)' }}>
              {t('privateProfileHint')}
            </p>
          </div>
        </div>
        </div>

        <SiteThemeSection />

        <BoardColorsSection />

        <DeckPreferencesSection />

        <div
          className="mt-4 flex flex-col gap-4 p-5 lg:mt-6 lg:max-w-2xl"
          style={{
            backgroundColor: 'var(--t-panel)',
            }}
        >
          <div className="flex flex-col gap-1">
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: 'var(--t-danger)' }}
            >
              {t('deleteAccount.title')}
            </span>
            <p className="text-xs tracking-wide" style={{ color: 'var(--t-muted)' }}>
              {t('deleteAccount.description')}
            </p>
          </div>

          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="self-start px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: 'var(--t-surface)',
                color: 'var(--t-danger)',
                cursor: 'pointer',
              }}
            >
              {t('deleteAccount.openButton')}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text)' }}>
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
                  backgroundColor: 'var(--t-bg)',
                  color: 'var(--t-text)',
                  fontFamily: 'monospace',
                }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--t-danger)'; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'color-mix(in srgb, var(--t-danger) 27%, transparent)'; }}
              />
              {deleteError && (
                <p className="text-xs" style={{ color: 'var(--t-danger)' }}>{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteStatus === 'deleting' || deletePhrase.trim() !== DELETE_ACCOUNT_PHRASE}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--t-danger)',
                    color: 'var(--t-bg)',
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
                    border: '1px solid var(--t-border-strong)',
                    color: 'var(--t-muted)',
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
            style={{ color: 'var(--t-dim)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--t-accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--t-dim)';
            }}
          >
            {t('back')}
          </Link>
        </div>
      </div>
    </main>
  );
}
