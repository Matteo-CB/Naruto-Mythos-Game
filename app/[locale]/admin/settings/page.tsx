'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

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
  const [testers, setTesters] = useState<Array<{ id: string; username: string; elo: number }>>([]);
  const [testerSearch, setTesterSearch] = useState('');
  const [testerAdding, setTesterAdding] = useState(false);

  const isAdmin = session?.user?.email === ADMIN_EMAIL || ADMIN_USERNAMES.includes(session?.user?.name ?? '');

  const fetchTesters = () => {
    fetch('/api/admin/testers')
      .then((res) => res.json())
      .then((data) => setTesters(data.testers ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/admin/settings')
        .then((res) => res.json())
        .then((data) => {
          setLeaguesEnabled(data.leaguesEnabled ?? false);
          setLeaguesLoading(false);
        })
        .catch(() => setLeaguesLoading(false));
      fetchTesters();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <p style={{ color: 'var(--t-danger)' }}>{t('unauthorized')}</p>
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

  const handleAddTester = async () => {
    if (!testerSearch.trim()) return;
    setTesterAdding(true);
    try {
      const res = await fetch('/api/admin/testers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testerSearch.trim(), action: 'add' }),
      });
      const data = await res.json();
      if (res.ok) {
        addResult({ success: true, message: t('testers.added') + `: ${testerSearch.trim()}` });
        setTesterSearch('');
        fetchTesters();
      } else {
        addResult({ success: false, message: data.error === 'User not found' ? t('testers.notFound') : data.error });
      }
    } catch (err) {
      addResult({ success: false, message: `Error: ${err}` });
    } finally {
      setTesterAdding(false);
    }
  };

  const handleRemoveTester = async (username: string) => {
    try {
      const res = await fetch('/api/admin/testers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, action: 'remove' }),
      });
      if (res.ok) {
        addResult({ success: true, message: t('testers.removed') + `: ${username}` });
        fetchTesters();
      }
    } catch (err) {
      addResult({ success: false, message: `Error: ${err}` });
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
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground />
      <div className="max-w-2xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
        
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--t-accent)' }}>
            {t('title')}
          </h1>
          <Link
            href="/"
            className="px-4 py-2 text-sm rounded"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            {t('home')}
          </Link>
        </div>

        
        <div className="flex gap-2 mb-8 flex-wrap">
          <Link
            href="/admin/settings"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)' }}
          >
            {t('tabSettings')}
          </Link>
          <Link
            href="/admin/cards"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            {t('tabCards')}
          </Link>
          <Link
            href="/admin/bugs"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            {t('tabBugs')}
          </Link>
        </div>

        
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>
            {t('leagues.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>
            {t('leagues.description')}
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={handleToggleLeagues}
              disabled={leaguesLoading || leaguesToggling}
              className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: leaguesEnabled ? 'var(--t-success)' : '#1a1a2e',
                color: leaguesEnabled ? '#ffffff' : 'var(--t-muted)',
                border: `1px solid ${leaguesEnabled ? 'var(--t-success)' : 'var(--t-border-strong)'}`,
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
            <span className="text-xs" style={{ color: leaguesEnabled ? 'var(--t-success)' : 'var(--t-danger)' }}>
              {leaguesEnabled
                ? t('leagues.enabledDesc')
                : t('leagues.disabledDesc')}
            </span>
          </div>
        </div>

        
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>
            {t('elo.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>
            {t('elo.description')}
          </p>
          <button
            onClick={handleResetElo}
            disabled={resetEloLoading}
            className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
            style={{
              backgroundColor: resetEloLoading ? 'var(--t-border-strong)' : 'var(--t-danger)',
              color: 'var(--t-text)',
              border: '1px solid var(--t-danger)',
              opacity: resetEloLoading ? 0.6 : 1,
            }}
          >
            {resetEloLoading ? t('elo.resetting') : t('elo.resetAll')}
          </button>
        </div>

        
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>
            {t('discord.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>
            {t('discord.description')}
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCreateDiscordRoles}
              disabled={discordRolesLoading}
              className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: discordRolesLoading ? '#333333' : '#5865F2',
                color: 'var(--t-text)',
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
                backgroundColor: discordSyncLoading ? 'var(--t-border-strong)' : '#1a1a2e',
                color: '#5865F2',
                border: '1px solid #5865F2',
                opacity: discordSyncLoading ? 0.6 : 1,
              }}
            >
              {discordSyncLoading ? t('discord.syncing') : t('discord.syncAll')}
            </button>
          </div>
        </div>

        
        <div
          className="rounded-lg p-6 mb-6"
          style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>
            {t('testers.title')}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>
            {t('testers.description')}
          </p>

          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={testerSearch}
              onChange={(e) => setTesterSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTester()}
              placeholder={t('testers.search')}
              className="flex-1 px-3 py-2 text-sm rounded"
              style={{
                backgroundColor: 'var(--t-bg)',
                border: '1px solid var(--t-border-strong)',
                color: 'var(--t-text)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleAddTester}
              disabled={testerAdding || !testerSearch.trim()}
              className="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: 'var(--t-success)',
                color: 'var(--t-on-success)',
                border: '1px solid #00CED1',
                opacity: testerAdding || !testerSearch.trim() ? 0.5 : 1,
              }}
            >
              {t('testers.add')}
            </button>
          </div>

          
          {testers.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--t-dim)' }}>{t('testers.noTesters')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {testers.map((tester) => (
                <div
                  key={tester.id}
                  className="flex items-center justify-between px-3 py-2 rounded"
                  style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-surface-2)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--t-text)' }}>{tester.username}</span>
                    <span className="text-xs" style={{ color: 'var(--t-dim)' }}>ELO {tester.elo}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveTester(tester.username)}
                    className="text-xs px-2 py-1 rounded cursor-pointer"
                    style={{
                      backgroundColor: 'rgba(179, 62, 62, 0.1)',
                      color: 'var(--t-danger)',
                      border: '1px solid rgba(179, 62, 62, 0.3)',
                    }}
                  >
                    {t('testers.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        
        {results.length > 0 && (
          <div
            className="rounded-lg p-6"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-muted)' }}>
              {t('actionLog')}
            </h2>
            <div className="flex flex-col gap-2">
              {results.map((result, i) => (
                <div
                  key={i}
                  className="text-xs px-3 py-2 rounded"
                  style={{
                    backgroundColor: result.success ? 'rgba(62, 139, 62, 0.1)' : 'rgba(179, 62, 62, 0.1)',
                    border: `1px solid ${result.success ? 'var(--t-success)30' : 'var(--t-danger)30'}`,
                    color: result.success ? 'var(--t-success)' : 'var(--t-danger)',
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
