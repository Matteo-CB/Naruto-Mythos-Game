'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';

interface LeaderboardUser {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('common');
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const PLAYERS_PER_PAGE = 20;

  useEffect(() => {
    setLoading(true);
    const offset = (currentPage - 1) * PLAYERS_PER_PAGE;
    fetch(`/api/leaderboard?limit=${PLAYERS_PER_PAGE}&offset=${offset}`)
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotalPlayers(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalPlayers / PLAYERS_PER_PAGE));

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="leaderboard" />
      <div className="max-w-2xl mx-auto relative z-10 flex-1 px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-2xl font-bold tracking-wider uppercase"
            style={{ color: '#c4a35a' }}
          >
            {t('title')}
          </h1>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              href="/"
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

        {loading ? (
          <p className="text-sm" style={{ color: '#888888' }}>
            {tc('loading')}
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm" style={{ color: '#888888' }}>
            {t('noPlayers')}
          </p>
        ) : (
          <div style={{ border: '1px solid #262626' }}>
            {/* Header */}
            <div
              className="grid grid-cols-6 gap-2 px-4 py-3 text-xs uppercase tracking-wider"
              style={{ backgroundColor: '#141414', color: '#888888' }}
            >
              <span>{t('rank')}</span>
              <span className="col-span-2">{t('player')}</span>
              <span>{t('elo')}</span>
              <span>{t('wins')}/{t('losses')}/{t('draws')}</span>
              <span>{t('winRate')}</span>
            </div>

            {/* Rows */}
            {users.map((user, index) => {
              const total = user.wins + user.losses + user.draws;
              const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
              const globalRank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;

              return (
                <div
                  key={user.id}
                  className="grid grid-cols-6 gap-2 px-4 py-3 text-sm"
                  style={{ borderTop: '1px solid #262626' }}
                >
                  <span style={{ color: globalRank <= 3 ? '#c4a35a' : '#888888' }}>
                    {globalRank}
                  </span>
                  <Link
                    href={`/profile/${user.username}` as '/'}
                    className="col-span-2 underline"
                    style={{ color: '#e0e0e0' }}
                  >
                    {user.username}
                  </Link>
                  <span style={{ color: '#e0e0e0' }}>{user.elo}</span>
                  <span style={{ color: '#888888' }}>
                    {user.wins}/{user.losses}/{user.draws}
                  </span>
                  <span style={{ color: '#888888' }}>{winRate}%</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 text-xs transition-colors disabled:opacity-30"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {tc('previous')}
            </button>
            <span className="text-xs" style={{ color: '#888888' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 text-xs transition-colors disabled:opacity-30"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {tc('next')}
            </button>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
