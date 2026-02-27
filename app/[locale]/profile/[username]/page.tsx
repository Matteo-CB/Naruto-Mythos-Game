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
import { EloBadgeLarge } from '@/components/EloBadge';

interface ProfileData {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
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

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
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
      <div className="max-w-2xl mx-auto relative z-10 flex-1 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#e0e0e0' }}>
              {profile.username}
            </h1>
            <p className="text-xs mt-1" style={{ color: '#555555' }}>
              {t('memberSince', {
                date: new Date(profile.createdAt).toLocaleDateString(),
              })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {session?.user?.id && profile.id !== session.user.id && (
              <FriendshipButton userId={profile.id} username={profile.username} />
            )}
            <LanguageSwitcher />
            <Link
              href="/leaderboard"
              className="px-4 py-2 text-sm transition-colors"
              style={{
                backgroundColor: '#141414',
                border: '1px solid #262626',
                color: '#888888',
              }}
            >
              {tc('back')}
            </Link>
          </div>
        </div>

        {/* Discord indicator */}
        {profile.discordUsername ? (
          <div
            className="flex items-center gap-2 mb-4 px-3 py-2 rounded"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <svg width="16" height="12" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
            </svg>
            <span className="text-xs" style={{ color: '#5865F2' }}>
              {profile.discordUsername}
            </span>
            {session?.user?.id === profile.id && (
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
                className="ml-auto text-[10px] px-2 py-0.5 rounded transition-colors"
                style={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#888',
                  opacity: unlinking ? 0.5 : 1,
                }}
              >
                {td('unlinkDiscord')}
              </button>
            )}
          </div>
        ) : session?.user?.id === profile.id && (
          <a
            href="/api/user/link-discord"
            className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded transition-colors"
            style={{
              backgroundColor: '#141414',
              border: '1px solid #5865F2',
              color: '#5865F2',
            }}
          >
            <svg width="16" height="12" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
            </svg>
            <span className="text-xs font-medium">{td('linkDiscord')}</span>
          </a>
        )}

        {/* ELO Badge and Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div
            className="rounded-lg p-6 flex items-center justify-center"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            {leaguesEnabled ? (
              <EloBadgeLarge elo={profile.elo} />
            ) : (
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#888888' }}>
                  ELO
                </p>
                <p className="text-3xl font-bold" style={{ color: '#e0e0e0' }}>
                  {profile.elo}
                </p>
              </div>
            )}
          </div>
          <div
            className="rounded-lg p-6"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#888888' }}>
              {t('stats')}
            </p>
            <div className="flex justify-around text-center">
              <div>
                <p className="text-lg font-bold" style={{ color: '#3e8b3e' }}>
                  {profile.wins}
                </p>
                <p className="text-[10px]" style={{ color: '#888888' }}>W</p>
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: '#b33e3e' }}>
                  {profile.losses}
                </p>
                <p className="text-[10px]" style={{ color: '#888888' }}>L</p>
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: '#888888' }}>
                  {profile.draws}
                </p>
                <p className="text-[10px]" style={{ color: '#888888' }}>D</p>
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: '#e0e0e0' }}>
                  {winRate}%
                </p>
                <p className="text-[10px]" style={{ color: '#888888' }}>WR</p>
              </div>
            </div>
          </div>
        </div>

        {/* Decks */}
        {profile.decks.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-sm font-bold uppercase tracking-wider mb-4"
              style={{ color: '#888888' }}
            >
              {t('decks')}
            </h2>
            <div className="flex flex-col gap-2">
              {profile.decks.map((deck) => (
                <div
                  key={deck.id}
                  className="rounded px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                >
                  <span className="text-sm" style={{ color: '#e0e0e0' }}>
                    {deck.name}
                  </span>
                  <span className="text-xs" style={{ color: '#555555' }}>
                    {new Date(deck.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Games */}
        <div>
          <h2
            className="text-sm font-bold uppercase tracking-wider mb-4"
            style={{ color: '#888888' }}
          >
            {t('recentGames')}
          </h2>
          {profile.recentGames.length === 0 ? (
            <p className="text-sm" style={{ color: '#555555' }}>
              {t('noGames')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {profile.recentGames.map((game) => {
                const isPlayer1 = game.player1?.username === profile.username;
                const won = game.winnerId === profile.id;
                const opponent = game.isAiGame
                  ? `AI (${game.aiDifficulty})`
                  : isPlayer1
                    ? game.player2?.username || 'Unknown'
                    : game.player1?.username || 'Unknown';
                const myScore = isPlayer1 ? game.player1Score : game.player2Score;
                const oppScore = isPlayer1 ? game.player2Score : game.player1Score;

                return (
                  <div
                    key={game.id}
                    className="rounded px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                    style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: won ? '#0a1a0a' : '#1a0a0a',
                          color: won ? '#3e8b3e' : '#b33e3e',
                          border: `1px solid ${won ? '#3e8b3e' : '#b33e3e'}`,
                        }}
                      >
                        {won ? 'W' : 'L'}
                      </span>
                      <span className="text-sm" style={{ color: '#e0e0e0' }}>
                        vs {opponent}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <span className="text-sm" style={{ color: '#888888' }}>
                        {myScore} - {oppScore}
                      </span>
                      {game.eloChange !== null && game.eloChange !== 0 && (
                        <span
                          className="text-xs"
                          style={{
                            color: (isPlayer1 ? game.eloChange : -game.eloChange) > 0
                              ? '#3e8b3e'
                              : '#b33e3e',
                          }}
                        >
                          {(isPlayer1 ? game.eloChange : -game.eloChange) > 0 ? '+' : ''}
                          {isPlayer1 ? game.eloChange : -game.eloChange}
                        </span>
                      )}
                      {game.hasReplay && (
                        <Link
                          href={`/replay/${game.id}`}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: '#1a1a2e',
                            color: '#4a9e4a',
                            border: '1px solid #4a9e4a40',
                          }}
                        >
                          {t('replay')}
                        </Link>
                      )}
                      {game.completedAt && (
                        <span className="text-xs" style={{ color: '#555555' }}>
                          {new Date(game.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
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
                className="px-6 py-2 text-sm rounded cursor-pointer"
                style={{
                  backgroundColor: '#141414',
                  border: '1px solid #262626',
                  color: '#888888',
                  opacity: loadingMore ? 0.5 : 1,
                }}
              >
                {loadingMore ? tc('loading') : t('loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
