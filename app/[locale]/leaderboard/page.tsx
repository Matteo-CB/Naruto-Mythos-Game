'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { EloBadge, RANK_TIERS, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import { UserBadges } from '@/components/badges/UserBadges';
import { LeaguesModal } from '@/components/LeaguesModal';
import Image from 'next/image';

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
  const tp = useTranslations('profile');
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [leaguesModalOpen, setLeaguesModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const PLAYERS_PER_PAGE = 20;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, leagueFilter]);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const offset = (currentPage - 1) * PLAYERS_PER_PAGE;
    const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
    const leagueParam = leagueFilter ? `&league=${encodeURIComponent(leagueFilter)}` : '';
    fetch(`/api/leaderboard?limit=${PLAYERS_PER_PAGE}&offset=${offset}${searchParam}${leagueParam}`)
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotalPlayers(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentPage, debouncedSearch, leagueFilter]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchRef.current?.focus();
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalPlayers / PLAYERS_PER_PAGE));

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="leaderboard" />

      <div className="w-full max-w-3xl mx-auto relative z-10 flex-1 px-4 sm:px-6 py-6 sm:py-10">

        {/* ──── Header ──── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-wider uppercase" style={{ color: '#c4a35a' }}>
              {t('title')}
            </h1>
            {leaguesEnabled && (
              <p className="text-[11px] mt-1" style={{ color: '#555' }}>
                {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {leaguesEnabled && (
              <button
                onClick={() => setLeaguesModalOpen(true)}
                className="px-3 py-1.5 text-[10px] sm:text-xs font-medium uppercase tracking-wider cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'rgba(196, 163, 90, 0.06)',
                  border: '1px solid rgba(196, 163, 90, 0.25)',
                  color: '#c4a35a',
                }}
              >
                {t('leagues')}
              </button>
            )}
            <LanguageSwitcher />
            <Link
              href="/"
              className="px-3 py-1.5 text-xs transition-colors"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888' }}
            >
              {tc('back')}
            </Link>
          </div>
        </div>

        {/* ──── Search ──── */}
        <div className="relative mb-5">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full px-4 py-2.5 text-sm rounded-lg"
            style={{
              backgroundColor: '#111',
              border: '1px solid #1e1e1e',
              color: '#e0e0e0',
              outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#c4a35a55')}
            onBlur={(e) => (e.target.style.borderColor = '#1e1e1e')}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
              style={{ color: '#888' }}
            >
              X
            </button>
          )}
        </div>

        {/* ──── League filter ──── */}
        {leaguesEnabled && (
          <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setLeagueFilter('')}
              className="shrink-0 px-2 py-1 text-[10px] uppercase font-bold cursor-pointer"
              style={{
                backgroundColor: !leagueFilter ? 'rgba(196,163,90,0.15)' : 'transparent',
                border: `1px solid ${!leagueFilter ? '#c4a35a' : '#262626'}`,
                color: !leagueFilter ? '#c4a35a' : '#555',
              }}
            >{tc('all')}</button>
            {RANK_TIERS.map((tier) => {
              const active = leagueFilter === tier.key;
              return (
                <button
                  key={tier.key}
                  onClick={() => setLeagueFilter(active ? '' : tier.key)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 cursor-pointer"
                  style={{
                    backgroundColor: active ? `${tier.color}15` : 'transparent',
                    border: `1px solid ${active ? tier.color : '#262626'}`,
                  }}
                >
                  <Image src={tier.image} alt="" width={14} height={14} unoptimized
                    style={{ filter: active ? 'none' : 'grayscale(0.8) opacity(0.5)' }} />
                  <span className="text-[9px] uppercase font-bold" style={{ color: active ? tier.color : '#555' }}>
                    {tp(`rankNames.${tier.key}`)}
                  </span>
                </button>
              );
            })}
            <div className="w-px h-4 shrink-0" style={{ backgroundColor: '#262626' }} />
            <button
              onClick={() => setLeagueFilter(leagueFilter === 'unranked' ? '' : 'unranked')}
              className="shrink-0 px-2 py-1 text-[9px] uppercase font-bold cursor-pointer"
              style={{
                backgroundColor: leagueFilter === 'unranked' ? 'rgba(102,102,102,0.15)' : 'transparent',
                border: `1px solid ${leagueFilter === 'unranked' ? '#666' : '#262626'}`,
                color: leagueFilter === 'unranked' ? '#999' : '#444',
              }}
            >
              {tp('rankNames.unranked')}
            </button>
          </div>
        )}

        {/* ──── Player count ──── */}
        {!loading && totalPlayers > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
            <span className="text-[10px] uppercase tracking-wider tabular-nums" style={{ color: '#444' }}>
              {totalPlayers} {t('player')}{totalPlayers > 1 ? 's' : ''}
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
          </div>
        )}

        {/* ──── Rankings ──── */}
        <section>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm" style={{ color: '#555' }}>{tc('loading')}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm" style={{ color: '#555' }}>{t('noPlayers')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {users.map((user, index) => {
                const total = user.wins + user.losses + user.draws;
                const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
                const globalRank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;
                const isTop3 = globalRank <= 3;
                const borderAccent = isTop3 ? '#c4a35a' : '#1e1e1e';

                return (
                  <div
                    key={user.id}
                    className="rounded-lg flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors"
                    style={{
                      backgroundColor: isTop3 ? '#13110e' : '#111',
                      borderLeft: `2px solid ${borderAccent}`,
                    }}
                  >
                    {/* Rank */}
                    <span
                      className="text-xs sm:text-sm font-bold tabular-nums w-6 sm:w-8 text-center shrink-0"
                      style={{ color: isTop3 ? '#c4a35a' : '#555' }}
                    >
                      {globalRank}
                    </span>

                    {/* Player name + badges */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Link
                        href={`/profile/${user.username}` as '/'}
                        className="text-sm truncate transition-colors"
                        style={{ color: '#e0e0e0' }}
                      >
                        {user.username}
                      </Link>
                      <UserBadges role={user.role} badgePrefs={user.badgePrefs} size="sm" />
                    </div>

                    {/* League badge */}
                    {leaguesEnabled && (
                      <div className="shrink-0">
                        <EloBadge elo={user.elo} size="sm" showElo={false} totalGames={total} />
                      </div>
                    )}

                    {/* ELO */}
                    <span
                      className="text-sm font-semibold tabular-nums shrink-0 w-10 text-right"
                      style={{ color: '#e0e0e0' }}
                    >
                      {user.elo}
                    </span>

                    {/* W/L/D — desktop only */}
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(62,139,62,0.1)', color: '#3e8b3e' }}>
                        {user.wins}W
                      </span>
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(179,62,62,0.1)', color: '#b33e3e' }}>
                        {user.losses}L
                      </span>
                      <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(136,136,136,0.08)', color: '#888' }}>
                        {user.draws}D
                      </span>
                    </div>

                    {/* Win rate — desktop only */}
                    <span className="hidden sm:block text-xs tabular-nums shrink-0 w-10 text-right" style={{ color: '#888' }}>
                      {winRate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ──── Pagination ──── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-xs transition-colors disabled:opacity-25 cursor-pointer"
                style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', color: '#888' }}
              >
                {tc('previous')}
              </button>
              <span className="text-xs tabular-nums" style={{ color: '#555' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs transition-colors disabled:opacity-25 cursor-pointer"
                style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', color: '#888' }}
              >
                {tc('next')}
              </button>
            </div>
          )}
        </section>
      </div>
      <Footer />

      {leaguesEnabled && (
        <LeaguesModal open={leaguesModalOpen} onClose={() => setLeaguesModalOpen(false)} />
      )}
    </main>
  );
}
