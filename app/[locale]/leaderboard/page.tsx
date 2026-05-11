'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { RANK_TIERS, PLACEMENT_MATCHES_REQUIRED, getRankTier } from '@/components/EloBadge';
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
  consecutiveWins?: number;
  consecutiveLosses?: number;
  tournamentWins?: number;
}

const ROW_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

function LeaderRow({
  user,
  globalRank,
  leaguesEnabled,
  index,
  isSelf,
}: {
  user: LeaderboardUser;
  globalRank: number;
  leaguesEnabled: boolean;
  index: number;
  isSelf: boolean;
}) {
  const total = user.wins + user.losses + user.draws;
  const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
  const tier = getRankTier(user.elo);
  const placed = total >= PLACEMENT_MATCHES_REQUIRED;
  const tierColor = placed && leaguesEnabled ? tier.color : '#777';
  const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.4), ease: 'easeOut' }}
      whileHover={{ x: 4 }}
      className="relative grid items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 cursor-default mb-1"
      style={{
        backgroundColor: isSelf ? 'rgba(196, 163, 90, 0.08)' : altBg,
        gridTemplateColumns: 'auto auto 1fr auto auto auto',
        clipPath: ROW_CLIP,
      }}
    >
      <span
        className="font-display text-base sm:text-lg tabular-nums w-7 sm:w-9 text-center"
        style={{ color: isSelf ? '#c4a35a' : '#666', letterSpacing: '0.02em' }}
      >
        {globalRank}
      </span>

      {leaguesEnabled && placed ? (
        <Image
          src={tier.image}
          alt=""
          width={30}
          height={30}
          unoptimized
          className="shrink-0"
          style={{ filter: `drop-shadow(0 0 5px ${tier.color}22)` }}
        />
      ) : (
        <span className="inline-flex items-center justify-center font-display text-[14px]" style={{ width: 30, height: 30, color: '#3a3a3a' }}>
          ·
        </span>
      )}

      <div className="flex items-center gap-1.5 min-w-0">
        <Link
          href={`/profile/${encodeURIComponent(user.username)}` as '/'}
          className="font-display text-base truncate transition-colors hover:text-[#c4a35a]"
          style={{ color: '#e8e6df', letterSpacing: '0.02em' }}
        >
          {user.username}
        </Link>
        <UserBadges role={user.role} badgePrefs={user.badgePrefs} size="sm" />
      </div>

      <div className="hidden sm:flex font-inter-force items-center gap-1.5">
        <span className="text-[10px] tabular-nums" style={{ color: '#5fb05f' }}>{user.wins}W</span>
        <span className="text-[10px] tabular-nums" style={{ color: '#d97676' }}>{user.losses}L</span>
        <span className="text-[10px] tabular-nums" style={{ color: '#888' }}>{user.draws}D</span>
      </div>

      <span className="hidden sm:block font-inter-force text-xs tabular-nums w-10 text-right" style={{ color: '#666' }}>
        {winRate}%
      </span>

      <span
        className="font-display text-lg sm:text-xl tabular-nums w-16 text-right"
        style={{ color: tierColor, textShadow: `0 0 10px ${tierColor}33`, letterSpacing: '0.02em' }}
      >
        {user.elo}
      </span>
    </motion.div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  color,
  imageSrc,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
  imageSrc?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="font-display shrink-0 flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? `${color}1f` : 'rgba(255, 255, 255, 0.03)',
        color: active ? color : '#666',
        borderRadius: 9999,
      }}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          width={16}
          height={16}
          unoptimized
          style={{ filter: active ? 'none' : 'grayscale(0.95) opacity(0.45)' }}
        />
      )}
      <span className="text-[11px] tracking-wider uppercase">{label}</span>
    </motion.button>
  );
}

function SkeletonGrid() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.18, 0.4, 0.18] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.05 }}
          style={{ height: 46, backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}
        />
      ))}
    </div>
  );
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
  const [selfUsername, setSelfUsername] = useState<string | null>(null);
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
    fetch('/api/user/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d?.username) setSelfUsername(d.username); })
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
  const totalCount = useCountUp(totalPlayers, 600);
  const pageKey = useMemo(() => `${currentPage}-${debouncedSearch}-${leagueFilter}`, [currentPage, debouncedSearch, leagueFilter]);

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-8"
        >
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1
                className="font-display text-3xl sm:text-5xl tracking-wider uppercase leading-none"
                style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 22px rgba(196, 163, 90, 0.18)' }}
              >
                {t('title')}
              </h1>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="font-display flex items-baseline gap-2 mt-3"
              >
                <span className="text-2xl tabular-nums leading-none" style={{ color: '#c4a35a', textShadow: '0 0 12px rgba(196, 163, 90, 0.35)' }}>
                  {totalCount}
                </span>
                <span className="text-[11px] uppercase tracking-[0.3em]" style={{ color: '#666' }}>
                  {t('player')}{totalCount > 1 ? 's' : ''}
                </span>
              </motion.div>
            </div>
            <div className="flex items-center gap-1.5">
              {leaguesEnabled && (
                <button
                  onClick={() => setLeaguesModalOpen(true)}
                  className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]"
                  style={{ color: '#888' }}
                >
                  {t('leagues')}
                </button>
              )}
              <LanguageSwitcher />
              <Link
                href="/"
                className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
                style={{ color: '#888' }}
              >
                {tc('back')}
              </Link>
            </div>
          </div>
          {leaguesEnabled && (
            <p className="text-[11px] mt-3" style={{ color: '#555' }}>
              {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
            </p>
          )}
        </motion.header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative mb-6"
        >
          <div className="flex items-center gap-3 px-5 py-3" style={{ backgroundColor: 'rgba(13, 12, 16, 0.85)', borderRadius: 9999 }}>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="font-display flex-1 bg-transparent text-sm outline-none"
              style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="font-display text-[11px] uppercase cursor-pointer"
                style={{ color: '#888' }}
              >
                X
              </button>
            )}
          </div>
        </motion.div>

        {leaguesEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex items-center gap-1.5 mb-7 overflow-x-auto pb-1 no-scrollbar"
          >
            <FilterPill active={!leagueFilter} onClick={() => setLeagueFilter('')} label={tc('all')} color="#c4a35a" />
            {RANK_TIERS.map((tier) => (
              <FilterPill
                key={tier.key}
                active={leagueFilter === tier.key}
                onClick={() => setLeagueFilter(leagueFilter === tier.key ? '' : tier.key)}
                label={tp(`rankNames.${tier.key}`)}
                color={tier.color}
                imageSrc={tier.image}
              />
            ))}
            <FilterPill
              active={leagueFilter === 'unranked'}
              onClick={() => setLeagueFilter(leagueFilter === 'unranked' ? '' : 'unranked')}
              label={tp('rankNames.unranked')}
              color="#888"
            />
          </motion.div>
        )}

        <section>
          {loading ? (
            <SkeletonGrid />
          ) : users.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-20"
            >
              <p className="font-display text-sm uppercase tracking-widest" style={{ color: '#555' }}>{t('noPlayers')}</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={pageKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-col">
                  {users.map((user, index) => {
                    const globalRank = (currentPage - 1) * PLAYERS_PER_PAGE + index + 1;
                    return (
                      <LeaderRow
                        key={user.id}
                        user={user}
                        globalRank={globalRank}
                        leaguesEnabled={leaguesEnabled}
                        index={index}
                        isSelf={selfUsername === user.username}
                      />
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex items-center justify-center gap-6 mt-8"
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="font-display px-4 py-2 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-20 transition-colors hover:text-[#c4a35a]"
                style={{ color: '#888' }}
              >
                {tc('previous')}
              </button>
              <span className="font-display text-sm tabular-nums" style={{ color: '#c4a35a' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="font-display px-4 py-2 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-20 transition-colors hover:text-[#c4a35a]"
                style={{ color: '#888' }}
              >
                {tc('next')}
              </button>
            </motion.div>
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
