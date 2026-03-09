'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import CardFace from '@/components/cards/CardFace';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

type Tab = 'settings' | 'cards' | 'backgrounds';

interface ActionResult {
  success: boolean;
  message: string;
}

type FilterMode = 'all' | 'banned' | 'authorized';

export default function AdminPage() {
  const t = useTranslations('adminSettings');
  const tc = useTranslations();
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>('settings');

  // ---- Settings state ----
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

  // ---- Cards state ----
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<FilterMode>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ---- Backgrounds state ----
  const [bgList, setBgList] = useState<Array<{ id: string; name: string; url: string; sortOrder: number }>>([]);
  const [bgLoading, setBgLoading] = useState(true);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgName, setBgName] = useState('');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgConfirmDeleteId, setBgConfirmDeleteId] = useState<string | null>(null);

  const isAdmin = session?.user?.email === ADMIN_EMAIL || ADMIN_USERNAMES.includes(session?.user?.name ?? '');

  const allCards = useMemo(() => {
    const chars = getPlayableCharacters();
    const missions = getPlayableMissions();
    return [...chars, ...missions] as (CharacterCard | MissionCard)[];
  }, []);

  // ---- Fetch functions ----
  const fetchTesters = () => {
    fetch('/api/admin/testers')
      .then((res) => res.json())
      .then((data) => setTesters(data.testers ?? []))
      .catch(() => {});
  };

  const fetchBackgrounds = async () => {
    setBgLoading(true);
    try {
      const res = await fetch('/api/admin/backgrounds');
      const data = await res.json();
      if (res.ok) setBgList(data.backgrounds ?? []);
    } catch { /* ignore */ } finally {
      setBgLoading(false);
    }
  };

  const handleBgUpload = async () => {
    if (!bgFile || !bgName.trim()) return;
    setBgUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', bgFile);
      formData.append('name', bgName.trim());
      const res = await fetch('/api/admin/backgrounds', { method: 'POST', body: formData });
      if (res.ok) {
        addResult({ success: true, message: t('backgrounds.uploadSuccess') + ': ' + bgName.trim() });
        setBgName('');
        setBgFile(null);
        fetchBackgrounds();
      } else {
        const data = await res.json();
        addResult({ success: false, message: t('backgrounds.uploadError') + ': ' + (data.error || 'Unknown') });
      }
    } catch (err) {
      addResult({ success: false, message: t('backgrounds.uploadError') + ': ' + err });
    } finally {
      setBgUploading(false);
    }
  };

  const handleBgDelete = async (id: string) => {
    try {
      const res = await fetch('/api/admin/backgrounds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        addResult({ success: true, message: t('backgrounds.deleteSuccess') });
        fetchBackgrounds();
      } else {
        addResult({ success: false, message: t('backgrounds.deleteError') });
      }
    } catch {
      addResult({ success: false, message: t('backgrounds.deleteError') });
    }
    setBgConfirmDeleteId(null);
  };

  const fetchBanned = async () => {
    setCardsLoading(true);
    try {
      const res = await fetch('/api/admin/banned-cards');
      const data = await res.json();
      if (res.ok) setBannedIds(new Set(data.bannedCardIds ?? []));
    } catch { /* ignore */ } finally {
      setCardsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data) => {
        setLeaguesEnabled(data.leaguesEnabled ?? false);
        setLeaguesLoading(false);
      })
      .catch(() => setLeaguesLoading(false));
    fetchTesters();
    fetchBanned();
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

  // ---- Settings handlers ----
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
        addResult({ success: true, message: `Leagues ${data.leaguesEnabled ? 'ENABLED' : 'DISABLED'}` });
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
    if (!confirm(t('elo.confirmReset'))) return;
    setResetEloLoading(true);
    try {
      const res = await fetch('/api/admin/reset-elo', { method: 'POST' });
      const data = await res.json();
      addResult({ success: res.ok, message: res.ok ? `ELO Reset: ${data.message}` : `ELO Reset failed: ${data.error}` });
    } catch (err) {
      addResult({ success: false, message: `ELO Reset error: ${err}` });
    } finally {
      setResetEloLoading(false);
    }
  };

  const handleCreateDiscordRoles = async () => {
    if (!confirm(t('discord.confirmCreate'))) return;
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

  const handleSyncDiscordRoles = async () => {
    setDiscordSyncLoading(true);
    try {
      const res = await fetch('/api/admin/discord-sync', { method: 'POST' });
      const data = await res.json();
      addResult({
        success: res.ok,
        message: res.ok
          ? `Discord Sync: ${data.synced}/${data.total} users synced, ${data.errors} errors`
          : `Discord Sync failed: ${data.error}`,
      });
    } catch (err) {
      addResult({ success: false, message: `Discord Sync error: ${err}` });
    } finally {
      setDiscordSyncLoading(false);
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

  // ---- Cards handlers ----
  const toggleBan = async (cardId: string) => {
    setTogglingId(cardId);
    try {
      const res = await fetch('/api/admin/banned-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      if (res.ok) {
        const data = await res.json();
        setBannedIds((prev) => {
          const next = new Set(prev);
          if (data.banned) next.add(cardId); else next.delete(cardId);
          return next;
        });
      }
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  };

  // ---- Filtered data ----
  const searchLower = cardSearch.toLowerCase();
  const filteredCards = allCards.filter((card) => {
    if (searchLower && !card.name_fr.toLowerCase().includes(searchLower) && !card.id.toLowerCase().includes(searchLower)) return false;
    if (cardFilter === 'banned' && !bannedIds.has(card.id)) return false;
    if (cardFilter === 'authorized' && bannedIds.has(card.id)) return false;
    return true;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'settings', label: t('tabSettings') },
    { key: 'cards', label: t('tabCards') },
    { key: 'backgrounds', label: t('tabBackgrounds') },
  ];

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />

      <div className="max-w-6xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
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

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded cursor-pointer"
              style={{
                backgroundColor: tab === tb.key ? '#c4a35a' : '#141414',
                color: tab === tb.key ? '#0a0a0a' : '#888888',
                border: `1px solid ${tab === tb.key ? '#c4a35a' : '#262626'}`,
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* ============ SETTINGS TAB ============ */}
        {tab === 'settings' && (
          <div className="max-w-2xl">
            {/* Leagues Toggle */}
            <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>{t('leagues.title')}</h2>
              <p className="text-xs mb-4" style={{ color: '#555555' }}>{t('leagues.description')}</p>
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
                  {leaguesLoading ? t('leagues.loading') : leaguesToggling ? t('leagues.toggling') : leaguesEnabled ? t('leagues.enabled') : t('leagues.disabled')}
                </button>
                <span className="text-xs" style={{ color: leaguesEnabled ? '#3e8b3e' : '#b33e3e' }}>
                  {leaguesEnabled ? t('leagues.enabledDesc') : t('leagues.disabledDesc')}
                </span>
              </div>
            </div>

            {/* ELO Management */}
            <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>{t('elo.title')}</h2>
              <p className="text-xs mb-4" style={{ color: '#555555' }}>{t('elo.description')}</p>
              <button
                onClick={handleResetElo}
                disabled={resetEloLoading}
                className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer"
                style={{ backgroundColor: resetEloLoading ? '#333333' : '#b33e3e', color: '#ffffff', border: '1px solid #b33e3e', opacity: resetEloLoading ? 0.6 : 1 }}
              >
                {resetEloLoading ? t('elo.resetting') : t('elo.resetAll')}
              </button>
            </div>

            {/* Discord Roles */}
            <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>{t('discord.title')}</h2>
              <p className="text-xs mb-4" style={{ color: '#555555' }}>{t('discord.description')}</p>
              <div className="flex gap-3 flex-wrap">
                <button onClick={handleCreateDiscordRoles} disabled={discordRolesLoading} className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer" style={{ backgroundColor: discordRolesLoading ? '#333333' : '#5865F2', color: '#ffffff', border: '1px solid #5865F2', opacity: discordRolesLoading ? 0.6 : 1 }}>
                  {discordRolesLoading ? t('discord.creating') : t('discord.createRoles')}
                </button>
                <button onClick={handleSyncDiscordRoles} disabled={discordSyncLoading} className="px-6 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer" style={{ backgroundColor: discordSyncLoading ? '#333333' : '#1a1a2e', color: '#5865F2', border: '1px solid #5865F2', opacity: discordSyncLoading ? 0.6 : 1 }}>
                  {discordSyncLoading ? t('discord.syncing') : t('discord.syncAll')}
                </button>
              </div>
            </div>

            {/* Testers Management */}
            <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>{t('testers.title')}</h2>
              <p className="text-xs mb-4" style={{ color: '#555555' }}>{t('testers.description')}</p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text" value={testerSearch} onChange={(e) => setTesterSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTester()}
                  placeholder={t('testers.search')}
                  className="flex-1 px-3 py-2 text-sm rounded"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #333333', color: '#e0e0e0', outline: 'none' }}
                />
                <button onClick={handleAddTester} disabled={testerAdding || !testerSearch.trim()} className="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer" style={{ backgroundColor: '#00CED1', color: '#0a0a0a', border: '1px solid #00CED1', opacity: testerAdding || !testerSearch.trim() ? 0.5 : 1 }}>
                  {t('testers.add')}
                </button>
              </div>
              {testers.length === 0 ? (
                <p className="text-xs" style={{ color: '#555555' }}>{t('testers.noTesters')}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {testers.map((tester) => (
                    <div key={tester.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: '#e0e0e0' }}>{tester.username}</span>
                        <span className="text-xs" style={{ color: '#555555' }}>ELO {tester.elo}</span>
                      </div>
                      <button onClick={() => handleRemoveTester(tester.username)} className="text-xs px-2 py-1 rounded cursor-pointer" style={{ backgroundColor: 'rgba(179, 62, 62, 0.1)', color: '#b33e3e', border: '1px solid rgba(179, 62, 62, 0.3)' }}>
                        {t('testers.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Results Log */}
            {results.length > 0 && (
              <div className="rounded-lg p-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
                <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#888888' }}>{t('actionLog')}</h2>
                <div className="flex flex-col gap-2">
                  {results.map((result, i) => (
                    <div key={i} className="text-xs px-3 py-2 rounded" style={{ backgroundColor: result.success ? 'rgba(62, 139, 62, 0.1)' : 'rgba(179, 62, 62, 0.1)', border: `1px solid ${result.success ? '#3e8b3e30' : '#b33e3e30'}`, color: result.success ? '#3e8b3e' : '#b33e3e' }}>
                      {result.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ CARDS TAB ============ */}
        {tab === 'cards' && (
          <div>
            {/* Stats + Search */}
            <div className="flex items-center gap-4 flex-wrap mb-4">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
                {tc('adminCards.bannedCount', { count: bannedIds.size })}
              </span>
              <input
                type="text" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)}
                placeholder={tc('adminCards.search')}
                className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded"
                style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#e0e0e0', outline: 'none' }}
              />
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(['all', 'banned', 'authorized'] as FilterMode[]).map((f) => (
                <button key={f} onClick={() => setCardFilter(f)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer" style={{ backgroundColor: cardFilter === f ? '#1a1a1a' : '#0a0a0a', borderBottom: cardFilter === f ? `2px solid ${f === 'banned' ? '#b33e3e' : f === 'authorized' ? '#4a9e4a' : '#c4a35a'}` : '2px solid transparent', color: cardFilter === f ? '#e0e0e0' : '#555555' }}>
                  {tc(`adminCards.filter.${f}`)}
                </button>
              ))}
            </div>

            {/* Card Grid */}
            {cardsLoading ? (
              <p className="text-sm" style={{ color: '#888888' }}>{tc('common.loading')}</p>
            ) : filteredCards.length === 0 ? (
              <p className="text-sm" style={{ color: '#555555' }}>{tc('adminCards.noCards')}</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {filteredCards.map((card) => {
                  const isBanned = bannedIds.has(card.id);
                  const isToggling = togglingId === card.id;
                  return (
                    <div key={card.id} className="flex flex-col rounded-lg overflow-hidden" style={{ backgroundColor: '#141414', border: `1px solid ${isBanned ? '#b33e3e40' : '#262626'}`, opacity: isBanned ? 0.6 : 1, transition: 'opacity 0.2s, border-color 0.2s' }}>
                      <div style={{ width: '100%' }}><CardFace card={card} /></div>
                      <div className="p-2 flex flex-col gap-1.5">
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#e0e0e0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name_fr}</div>
                        <div style={{ fontSize: '10px', color: '#555555' }}>{card.id}</div>
                        <button onClick={() => toggleBan(card.id)} disabled={isToggling} className="w-full py-1.5 text-xs font-bold uppercase tracking-wider transition-colors" style={{ backgroundColor: isBanned ? '#1a0a0a' : '#0a1a0a', border: `1px solid ${isBanned ? '#b33e3e' : '#4a9e4a'}`, color: isBanned ? '#b33e3e' : '#4a9e4a', opacity: isToggling ? 0.5 : 1, cursor: isToggling ? 'wait' : 'pointer' }}>
                          {isBanned ? tc('adminCards.banned') : tc('adminCards.authorized')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ BACKGROUNDS TAB ============ */}
        {tab === 'backgrounds' && (
          <div className="max-w-2xl">
            <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: '#888888' }}>{t('backgrounds.title')}</h2>
              <p className="text-xs mb-4" style={{ color: '#555555' }}>{t('backgrounds.description')}</p>

              {/* Upload form */}
              <div className="flex flex-col gap-3 mb-6 p-4 rounded" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a' }}>
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888888' }}>{t('backgrounds.uploadLabel')}</label>
                <input
                  type="text"
                  value={bgName}
                  onChange={(e) => setBgName(e.target.value)}
                  placeholder={t('backgrounds.namePlaceholder')}
                  className="px-3 py-2 text-sm rounded"
                  style={{ backgroundColor: '#141414', border: '1px solid #333333', color: '#e0e0e0', outline: 'none' }}
                />
                <input type="file" accept="image/*" onChange={(e) => setBgFile(e.target.files?.[0] || null)} className="text-xs" style={{ color: '#888888' }} />
                <button
                  onClick={handleBgUpload}
                  disabled={bgUploading || !bgFile || !bgName.trim()}
                  className="px-4 py-2 text-sm font-bold uppercase tracking-wider rounded cursor-pointer self-start"
                  style={{
                    backgroundColor: bgUploading || !bgFile || !bgName.trim() ? '#333333' : '#c4a35a',
                    color: '#0a0a0a',
                    border: '1px solid #c4a35a',
                    opacity: bgUploading || !bgFile || !bgName.trim() ? 0.5 : 1,
                  }}
                >
                  {bgUploading ? t('backgrounds.uploading') : t('backgrounds.upload')}
                </button>
              </div>

              {/* List */}
              {bgLoading ? (
                <p className="text-sm" style={{ color: '#888888' }}>{tc('common.loading')}</p>
              ) : bgList.length === 0 ? (
                <p className="text-sm" style={{ color: '#555555' }}>{t('backgrounds.noBackgrounds')}</p>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {bgList.map((bg) => (
                    <div key={bg.id} className="rounded-lg overflow-hidden" style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626' }}>
                      <img src={bg.url} alt={bg.name} className="w-full object-cover" style={{ aspectRatio: '16/9' }} />
                      <div className="p-2 flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: '#e0e0e0' }}>{bg.name}</span>
                        {bgConfirmDeleteId === bg.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleBgDelete(bg.id)} className="px-2 py-1 text-[10px] bg-[#2a1a1a] border border-[#b33e3e]/40 text-[#b33e3e] cursor-pointer">{tc('common.confirm')}</button>
                            <button onClick={() => setBgConfirmDeleteId(null)} className="px-2 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#888] cursor-pointer">{tc('common.cancel')}</button>
                          </div>
                        ) : (
                          <button onClick={() => setBgConfirmDeleteId(bg.id)} className="px-2 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#b33e3e] hover:bg-[#1a1414] cursor-pointer">{t('backgrounds.delete')}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <Footer />
    </main>
  );
}
