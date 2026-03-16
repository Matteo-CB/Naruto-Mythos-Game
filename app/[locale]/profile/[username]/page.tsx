'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { FriendshipButton } from '@/components/social/FriendshipButton';
import { EloBadgeLarge, EloBadge } from '@/components/EloBadge';
import { UserBadges } from '@/components/badges/UserBadges';

interface ProfileData {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  role?: string;
  badgePrefs?: string[];
  discordUsername: string | null;
  createdAt: string;
  decks: Array<{ id: string; name: string; createdAt: string }>;
  recentGames: Array<{
    id: string;
    player1: { username: string } | null;
    player2: { username: string } | null;
    isAiGame: boolean;
    aiDifficulty: string | null;
    winnerId: string | null;
    player1Score: number;
    player2Score: number;
    eloChange: number | null;
    completedAt: string | null;
    hasReplay: boolean;
  }>;
  totalGames: number;
  page: number;
  perPage: number;
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const td = useTranslations('discord');
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [badgePrefsLocal, setBadgePrefsLocal] = useState<string[]>([]);
  const tb = useTranslations('badges');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
    if (typeof window !== 'undefined' && window.location.search.includes('discord=linked')) {
      updateSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = useCallback(async (page: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/profile/${username}?page=${page}`);
      if (!res.ok) throw new Error('Not found');
      const data: ProfileData = await res.json();

      if (append && profile) {
        setProfile({
          ...data,
          recentGames: [...profile.recentGames, ...data.recentGames],
        });
      } else {
        setProfile(data);
        setBadgePrefsLocal(data.badgePrefs ?? []);
      }
      setCurrentPage(page);
    } catch {
      setError('Player not found');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [username, profile]);

  useEffect(() => {
    fetchProfile(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const hasMore = profile
    ? profile.recentGames.length < profile.totalGames
    : false;

  const isOwner = session?.user?.id === profile?.id;

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <p style={{ color: '#888888' }}>{tc('loading')}</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <p style={{ color: '#b33e3e' }}>{error}</p>
        <Link href="/" style={{ color: '#888888' }}>
          {tc('back')}
        </Link>
      </div>
    );
  }

  const total = profile.wins + profile.losses + profile.draws;
  const winRate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="profile" />

      <div className="w-full max-w-3xl mx-auto relative z-10 flex-1 px-4 sm:px-6 py-6 sm:py-10">

        {/* ──── Nav bar ──── */}
        <div className="flex items-center justify-end gap-3 mb-6">
          {session?.user?.id && profile.id !== session.user.id && (
            <FriendshipButton userId={profile.id} username={profile.username} />
          )}
          <LanguageSwitcher />
          <Link
            href="/leaderboard"
            className="px-3 py-1.5 text-xs transition-colors"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {tc('back')}
          </Link>
        </div>

        {/* ──── Hero section: Avatar area + name + league ──── */}
        <div
          className="relative rounded-lg overflow-hidden mb-6"
          style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
        >
          {/* Subtle top accent */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 10%, #c4a35a33, transparent 90%)' }}
          />

          <div className="flex flex-col sm:flex-row items-center gap-5 p-5 sm:p-7">

            {/* League badge — large on the left */}
            {leaguesEnabled ? (
              <div className="shrink-0">
                <EloBadgeLarge elo={profile.elo} totalGames={total} />
              </div>
            ) : (
              <div
                className="shrink-0 flex flex-col items-center justify-center rounded-lg"
                style={{
                  backgroundColor: 'rgba(196,163,90,0.06)',
                  border: '1px solid rgba(196,163,90,0.2)',
                  padding: '16px 24px',
                  minWidth: '140px',
                }}
              >
                <span className="text-xs uppercase tracking-wider mb-1" style={{ color: '#888' }}>ELO</span>
                <span className="text-3xl font-bold tabular-nums" style={{ color: '#e0e0e0' }}>{profile.elo}</span>
              </div>
            )}

            {/* Name + meta */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold truncate" style={{ color: '#e0e0e0' }}>
                  {profile.username}
                </h1>
                <UserBadges
                  role={profile.role}
                  elo={profile.elo}
                  badgePrefs={profile.badgePrefs}
                  leaguesEnabled={leaguesEnabled}
                  size="md"
                />
              </div>

              <p className="text-xs mt-1" style={{ color: '#555' }}>
                {t('memberSince', { date: new Date(profile.createdAt).toLocaleDateString() })}
              </p>

              {/* Discord badge */}
              {profile.discordUsername && (
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                  <svg width="14" height="11" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
                  </svg>
                  <span className="text-xs" style={{ color: '#5865F2' }}>{profile.discordUsername}</span>
                  {isOwner && (
                    <button
                      onClick={async () => {
                        setUnlinking(true);
                        try {
                          const res = await fetch('/api/user/unlink-discord', { method: 'POST' });
                          if (res.ok) {
                            setProfile((prev) => prev ? { ...prev, discordUsername: null } : prev);
                            updateSession();
                          }
                        } catch { /* ignore */ }
                        setUnlinking(false);
                      }}
                      disabled={unlinking}
                      className="text-[10px] px-2 py-0.5 transition-colors"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#888', opacity: unlinking ? 0.5 : 1 }}
                    >
                      {td('unlinkDiscord')}
                    </button>
                  )}
                </div>
              )}

              {/* Discord link button (own profile, not linked) */}
              {!profile.discordUsername && isOwner && (
                <a
                  href="/api/user/link-discord"
                  className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 text-xs transition-colors"
                  style={{ backgroundColor: '#141414', border: '1px solid #5865F2', color: '#5865F2' }}
                >
                  <svg width="14" height="11" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
                  </svg>
                  {td('linkDiscord')}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ──── Stats row ──── */}
        <div
          className="grid grid-cols-4 gap-px rounded-lg overflow-hidden mb-6"
          style={{ backgroundColor: '#1e1e1e' }}
        >
          {[
            { label: 'W', value: profile.wins, color: '#3e8b3e' },
            { label: 'L', value: profile.losses, color: '#b33e3e' },
            { label: 'D', value: profile.draws, color: '#888888' },
            { label: 'WR', value: `${winRate}%`, color: '#e0e0e0' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-4 sm:py-5"
              style={{ backgroundColor: '#111111' }}
            >
              <span className="text-lg sm:text-xl font-bold tabular-nums" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: '#555' }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* ──── Badge Preferences (own profile only) ──── */}
        {isOwner && (profile.role === 'admin' || leaguesEnabled) && (
          <div
            className="rounded-lg p-4 mb-6"
            style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#888' }}>
              {tb('badgePrefs')}
            </p>
            <p className="text-[10px] mb-3" style={{ color: '#555' }}>
              {tb('badgePrefsDesc')}
            </p>
            <div className="flex flex-wrap gap-4">
              {profile.role === 'admin' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!badgePrefsLocal.includes('admin')}
                    onChange={async (e) => {
                      const newPrefs = e.target.checked
                        ? badgePrefsLocal.filter((b) => b !== 'admin')
                        : [...badgePrefsLocal, 'admin'];
                      setBadgePrefsLocal(newPrefs);
                      setProfile((prev) => prev ? { ...prev, badgePrefs: newPrefs } : prev);
                      await fetch('/api/user/badge-prefs', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ badgePrefs: newPrefs }),
                      });
                    }}
                    className="accent-amber-500"
                  />
                  <span className="text-xs" style={{ color: '#e0e0e0' }}>{tb('showAdmin')}</span>
                </label>
              )}
              {leaguesEnabled && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!badgePrefsLocal.includes('league')}
                    onChange={async (e) => {
                      const newPrefs = e.target.checked
                        ? badgePrefsLocal.filter((b) => b !== 'league')
                        : [...badgePrefsLocal, 'league'];
                      setBadgePrefsLocal(newPrefs);
                      setProfile((prev) => prev ? { ...prev, badgePrefs: newPrefs } : prev);
                      await fetch('/api/user/badge-prefs', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ badgePrefs: newPrefs }),
                      });
                    }}
                    className="accent-green-500"
                  />
                  <span className="text-xs" style={{ color: '#e0e0e0' }}>{tb('showLeague')}</span>
                </label>
              )}
            </div>
          </div>
        )}

        {/* ──── Decks section ──── */}
        {profile.decks.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>
                {t('decks')}
              </h2>
              <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
              <span className="text-[10px] tabular-nums" style={{ color: '#444' }}>
                {profile.decks.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profile.decks.map((deck) => (
                <div
                  key={deck.id}
                  className="rounded px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
                >
                  <span className="text-sm truncate" style={{ color: '#e0e0e0' }}>
                    {deck.name}
                  </span>
                  <span className="text-[10px] shrink-0 ml-3" style={{ color: '#444' }}>
                    {new Date(deck.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ──── Recent Games ──── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>
              {t('recentGames')}
            </h2>
            <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
            <span className="text-[10px] tabular-nums" style={{ color: '#444' }}>
              {profile.totalGames}
            </span>
          </div>

          {profile.recentGames.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: '#444' }}>
              {t('noGames')}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {profile.recentGames.map((game) => {
                const isPlayer1 = game.player1?.username === profile.username;
                const won = game.winnerId === profile.id;
                const isDraw = game.winnerId === null && game.completedAt !== null;
                const opponent = game.isAiGame
                  ? `AI (${game.aiDifficulty})`
                  : isPlayer1
                    ? game.player2?.username || '?'
                    : game.player1?.username || '?';
                const myScore = isPlayer1 ? game.player1Score : game.player2Score;
                const oppScore = isPlayer1 ? game.player2Score : game.player1Score;
                const eloVal = game.eloChange !== null
                  ? (isPlayer1 ? game.eloChange : -game.eloChange)
                  : null;

                const resultColor = isDraw ? '#888888' : won ? '#3e8b3e' : '#b33e3e';
                const resultLabel = isDraw ? 'D' : won ? 'W' : 'L';

                return (
                  <div
                    key={game.id}
                    className="rounded flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                    style={{
                      backgroundColor: '#111111',
                      borderLeft: `2px solid ${resultColor}`,
                    }}
                  >
                    {/* Result tag */}
                    <span
                      className="text-[10px] font-bold uppercase w-5 text-center shrink-0"
                      style={{ color: resultColor }}
                    >
                      {resultLabel}
                    </span>

                    {/* Opponent */}
                    <span className="text-sm truncate flex-1 min-w-0" style={{ color: '#ccc' }}>
                      {opponent}
                    </span>

                    {/* Score */}
                    <span className="text-xs tabular-nums shrink-0" style={{ color: '#888' }}>
                      {myScore}-{oppScore}
                    </span>

                    {/* ELO change */}
                    {eloVal !== null && eloVal !== 0 && (
                      <span
                        className="text-[10px] tabular-nums shrink-0 w-8 text-right"
                        style={{ color: eloVal > 0 ? '#3e8b3e' : '#b33e3e' }}
                      >
                        {eloVal > 0 ? '+' : ''}{eloVal}
                      </span>
                    )}

                    {/* Replay */}
                    {game.hasReplay && (
                      <Link
                        href={`/replay/${game.id}`}
                        className="text-[10px] px-2 py-0.5 shrink-0"
                        style={{ backgroundColor: '#0f1a0f', color: '#4a9e4a', border: '1px solid #4a9e4a30' }}
                      >
                        {t('replay')}
                      </Link>
                    )}

                    {/* Date — hidden on very small screens */}
                    {game.completedAt && (
                      <span className="text-[10px] shrink-0 hidden sm:block" style={{ color: '#444' }}>
                        {new Date(game.completedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => fetchProfile(currentPage + 1, true)}
                disabled={loadingMore}
                className="px-6 py-2 text-xs cursor-pointer transition-colors"
                style={{
                  backgroundColor: '#141414',
                  border: '1px solid #262626',
                  color: '#888',
                  opacity: loadingMore ? 0.5 : 1,
                }}
              >
                {loadingMore ? tc('loading') : t('loadMore')}
              </button>
            </div>
          )}
        </section>
      </div>
      <Footer />
    </main>
  );
}
