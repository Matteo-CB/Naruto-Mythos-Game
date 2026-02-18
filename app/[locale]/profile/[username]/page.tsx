'use client';

import { useState, useEffect, use } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { FriendshipButton } from '@/components/social/FriendshipButton';

interface ProfileData {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
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
  }>;
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/profile/${username}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Player not found');
        setLoading(false);
      });
  }, [username]);

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
    <div className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
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

        {/* ELO and Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div
            className="rounded-lg p-6 text-center"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#888888' }}>
              {t('elo')}
            </p>
            <p className="text-4xl font-bold" style={{ color: '#c4a35a' }}>
              {profile.elo}
            </p>
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
                    className="rounded px-4 py-3 flex items-center justify-between"
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
                    <div className="flex items-center gap-4">
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
        </div>
      </div>
      <Footer />
    </div>
  );
}
