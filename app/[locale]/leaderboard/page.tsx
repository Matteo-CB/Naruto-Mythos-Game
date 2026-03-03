'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { EloBadge, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import { UserBadges } from '@/components/badges/UserBadges';
import { LeaguesModal } from '@/components/LeaguesModal';

interface LeaderboardUser {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  role?: string;
  badgePrefs?: string[];
}

export default function LeaderboardPage() {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('common');
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [leaguesModalOpen, setLeaguesModalOpen] = useState(false);
  const PLAYERS_PER_PAGE = 20;

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
  }, []);

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
      <div className="max-w-3xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-2xl font-bold tracking-wider uppercase"
            style={{ color: '#c4a35a' }}
          >
            {t('title')}
          </h1>
          <div className="flex items-center gap-3">
            {/* View Leagues button — only when leagues enabled */}
            {leaguesEnabled && (
              <button
                onClick={() => setLeaguesModalOpen(true)}
                className="px-4 py-2 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'rgba(196, 163, 90, 0.08)',
                  border: '1px solid rgba(196, 163, 90, 0.3)',
                  color: '#c4a35a',
                }}
              >
                {t('leagues')}
              </button>
            )}
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

        {/* Subtitle — only when leagues enabled */}
        {leaguesEnabled && (
          <p
            className="text-xs mb-4"
            style={{ color: '#666666' }}
          >
            {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
          </p>
        )}

        {/* Rankings Table */}
        <section>
          {loading ? (
            <p className="text-sm" style={{ color: '#888888' }}>
              {tc('loading')}
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm" style={{ color: '#888888' }}>
              {t('noPlayers')}
            </p>
          ) : (
            <div className="overflow-x-auto" style={{ border: '1px solid #262626' }}>
              {/* Table Header */}
              <div
                className="grid gap-2 px-4 py-3 text-xs uppercase tracking-wider"
                style={{
                  backgroundColor: '#141414',
                  color: '#888888',
                  gridTemplateColumns: leaguesEnabled
                    ? '40px 1fr auto auto auto auto'
                    : '40px 1fr auto auto auto',
                }}
              >
                <span>#</span>
                <span>{t('player')}</span>
                {leaguesEnabled && <span className="hidden sm:block">{t('league')}</span>}
                <span>{t('elo')}</span>
                <span className="hidden sm:block">{t('wins')}/{t('losses')}/{t('draws')}</span>
                <span className="hidden sm:block">{t('winRate')}</span>
              </div>

              {/* Table Rows */}
              {users.map((user, index) => {
                const total = user.wins + user.losses + user.draws;
                const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
                const globalRank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;

                return (
                  <div
                    key={user.id}
                    className="grid gap-2 px-4 py-3 text-sm items-center"
                    style={{
                      borderTop: '1px solid #262626',
                      gridTemplateColumns: leaguesEnabled
                        ? '40px 1fr auto auto auto auto'
                        : '40px 1fr auto auto auto',
                    }}
                  >
                    {/* Rank */}
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: globalRank <= 3 ? '#c4a35a' : '#888888' }}
                    >
                      {globalRank}
                    </span>

                    {/* Player */}
                    <span className="flex items-center gap-1.5 truncate min-w-0">
                      <Link
                        href={`/profile/${user.username}` as '/'}
                        className="underline truncate"
                        style={{ color: '#e0e0e0' }}
                      >
                        {user.username}
                      </Link>
                      <UserBadges
                        role={user.role}
                        elo={user.elo}
                        badgePrefs={user.badgePrefs}
                        leaguesEnabled={leaguesEnabled}
                        size="sm"
                      />
                    </span>

                    {/* League Badge — only when leagues enabled */}
                    {leaguesEnabled && (
                      <span className="hidden sm:flex items-center">
                        <EloBadge elo={user.elo} size="sm" showElo={false} totalGames={total} />
                      </span>
                    )}

                    {/* ELO */}
                    <span className="tabular-nums font-semibold" style={{ color: '#e0e0e0' }}>
                      {user.elo}
                    </span>

                    {/* W/L/D */}
                    <span className="hidden sm:block tabular-nums" style={{ color: '#888888' }}>
                      {user.wins}/{user.losses}/{user.draws}
                    </span>

                    {/* Win Rate */}
                    <span className="hidden sm:block tabular-nums" style={{ color: '#888888' }}>
                      {winRate}%
                    </span>
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
              <span className="text-xs tabular-nums" style={{ color: '#888888' }}>
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
        </section>
      </div>
      <Footer />

      {/* Leagues Modal — only rendered when leagues enabled */}
      {leaguesEnabled && (
        <LeaguesModal open={leaguesModalOpen} onClose={() => setLeaguesModalOpen(false)} />
      )}
    </main>
  );
}
