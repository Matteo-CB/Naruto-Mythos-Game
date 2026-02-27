'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

interface ActionResult {
  success: boolean;
  message: string;
}

export default function AdminSettingsPage() {
  const t = useTranslations('adminSettings');
  const { data: session } = useSession();
  const [resetEloLoading, setResetEloLoading] = useState(false);
  const [discordRolesLoading, setDiscordRolesLoading] = useState(false);
  const [discordSyncLoading, setDiscordSyncLoading] = useState(false);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [leaguesToggling, setLeaguesToggling] = useState(false);
  const [results, setResults] = useState<ActionResult[]>([]);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/settings')
        .then((res) => res.json())
        .then((data) => {
          setLeaguesEnabled(data.leaguesEnabled ?? false);
          setLeaguesLoading(false);
        })
        .catch(() => setLeaguesLoading(false));
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#b33e3e' }}>{t('unauthorized')}</p>
      </main>
    );
  }

  const addResult = (result: ActionResult) => {
    setResults((prev) => [result, ...prev]);
  };

  const handleToggleLeagues = async () => {
    setLeaguesToggling(true);
    try {
      const newValue = !leaguesEnabled;
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaguesEnabled: newValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeaguesEnabled(data.leaguesEnabled);
        addResult({
          success: true,
          message: `Leagues ${data.leaguesEnabled ? 'ENABLED' : 'DISABLED'}`,
        });
      } else {
        addResult({ success: false, message: `Toggle failed: ${data.error}` });
      }
    } catch (err) {
      addResult({ success: false, message: `Toggle error: ${err}` });
    } finally {
      setLeaguesToggling(false);
    }
  };

  const handleResetElo = async () => {
    if (!confirm(t('elo.confirmReset'))) {
      return;
    }
    setResetEloLoading(true);
    try {
      const res = await fetch('/api/admin/reset-elo', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addResult({ success: true, message: `ELO Reset: ${data.message}` });
      } else {
        addResult({ success: false, message: `ELO Reset failed: ${data.error}` });
      }
    } catch (err) {
      addResult({ success: false, message: `ELO Reset error: ${err}` });
    } finally {
      setResetEloLoading(false);
    }
  };

  const handleCreateDiscordRoles = async () => {
    if (!confirm(t('discord.confirmCreate'))) {
      return;
    }
    setDiscordRolesLoading(true);
    try {
      const res = await fetch('/api/admin/discord-roles', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addResult({
          success: true,
          message: `Discord Roles: Created ${data.created}, deleted ${data.deleted}, migrated ${data.migratedChannels} channels`,
        });
        // Auto-sync all users after roles are created
        await handleSyncDiscordRoles();
      } else {
        addResult({ success: false, message: `Discord Roles failed: ${data.error}` });
      }
    } catch (err) {
      addResult({ success: false, message: `Discord Roles error: ${err}` });
    } finally {
      setDiscordRolesLoading(false);
    }
  };

  const handleSyncDiscordRoles = async () => {
    setDiscordSyncLoading(true);
    try {
      const res = await fetch('/api/admin/discord-sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addResult({
          success: true,
          message: `Discord Sync: ${data.synced}/${data.total} users synced, ${data.errors} errors`,
        });
      } else {
        addResult({ success: false, message: `Discord Sync failed: ${data.error}` });
      }
    } catch (err) {
      addResult({ success: false, message: `Discord Sync error: ${err}` });
    } finally {
      setDiscordSyncLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <div className="max-w-2xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#c4a35a' }}>
            {t('title')}
          </h1>
          <Link
            href="/"
            className="px-4 py-2 text-sm rounded"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {t('home')}
          </Link>
        </div>

        {/* Navigation tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <Link
            href="/admin/settings"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
          >
            {t('tabSettings')}
          </Link>
          <Link
            href="/admin/cards"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {t('tabCards')}
          </Link>
          <Link
            href="/admin/bugs"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {t('tabBugs')}
          </Link>
        </div>

        {/* Leagues Toggle */}
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>
            {t('leagues.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: '#555555' }}>
            {t('leagues.description')}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleLeagues}
              disabled={leaguesLoading || leaguesToggling}
              className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: leaguesEnabled ? '#3e8b3e' : '#1a1a2e',
                color: leaguesEnabled ? '#ffffff' : '#888888',
                border: `1px solid ${leaguesEnabled ? '#3e8b3e' : '#333333'}`,
                opacity: leaguesToggling ? 0.6 : 1,
              }}
            >
              {leaguesLoading
                ? t('leagues.loading')
                : leaguesToggling
                  ? t('leagues.toggling')
                  : leaguesEnabled
                    ? t('leagues.enabled')
                    : t('leagues.disabled')}
            </button>
            <span className="text-xs" style={{ color: leaguesEnabled ? '#3e8b3e' : '#b33e3e' }}>
              {leaguesEnabled
                ? t('leagues.enabledDesc')
                : t('leagues.disabledDesc')}
            </span>
          </div>
        </div>

        {/* ELO Management */}
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>
            {t('elo.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: '#555555' }}>
            {t('elo.description')}
          </p>
          <button
            onClick={handleResetElo}
            disabled={resetEloLoading}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
            style={{
              backgroundColor: resetEloLoading ? '#333333' : '#b33e3e',
              color: '#ffffff',
              border: '1px solid #b33e3e',
              opacity: resetEloLoading ? 0.6 : 1,
            }}
          >
            {resetEloLoading ? t('elo.resetting') : t('elo.resetAll')}
          </button>
        </div>

        {/* Discord Roles */}
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>
            {t('discord.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: '#555555' }}>
            {t('discord.description')}
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCreateDiscordRoles}
              disabled={discordRolesLoading}
              className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: discordRolesLoading ? '#333333' : '#5865F2',
                color: '#ffffff',
                border: '1px solid #5865F2',
                opacity: discordRolesLoading ? 0.6 : 1,
              }}
            >
              {discordRolesLoading ? t('discord.creating') : t('discord.createRoles')}
            </button>
            <button
              onClick={handleSyncDiscordRoles}
              disabled={discordSyncLoading}
              className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: discordSyncLoading ? '#333333' : '#1a1a2e',
                color: '#5865F2',
                border: '1px solid #5865F2',
                opacity: discordSyncLoading ? 0.6 : 1,
              }}
            >
              {discordSyncLoading ? t('discord.syncing') : t('discord.syncAll')}
            </button>
          </div>
        </div>

        {/* Results Log */}
        {results.length > 0 && (
          <div
            className="rounded-lg p-6"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>
              {t('actionLog')}
            </h2>
            <div className="flex flex-col gap-2">
              {results.map((result, i) => (
                <div
                  key={i}
                  className="text-xs px-3 py-2 rounded"
                  style={{
                    backgroundColor: result.success ? 'rgba(62, 139, 62, 0.1)' : 'rgba(179, 62, 62, 0.1)',
                    border: `1px solid ${result.success ? '#3e8b3e30' : '#b33e3e30'}`,
                    color: result.success ? '#3e8b3e' : '#b33e3e',
                  }}
                >
                  {result.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
