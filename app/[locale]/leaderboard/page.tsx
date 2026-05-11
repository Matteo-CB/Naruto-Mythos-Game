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

const PODIUM_ACCENT: Record<1 | 2 | 3, string> = {
  1: '#c4a35a',
  2: '#b8b8b8',
  3: '#a87547',
};

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

function PodiumCard({
  user,
  rank,
  tall,
  leaguesEnabled,
  delay,
}: {
  user: LeaderboardUser;
  rank: 1 | 2 | 3;
  tall?: boolean;
  leaguesEnabled: boolean;
  delay: number;
}) {
  const accent = PODIUM_ACCENT[rank];
  const total = user.wins + user.losses + user.draws;
  const placed = total >= PLACEMENT_MATCHES_REQUIRED;
  const tier = getRankTier(user.elo);
  const winrate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
  const streakWin = (user.consecutiveWins ?? 0) >= 3;
  const streakLoss = (user.consecutiveLosses ?? 0) >= 3;
  const tournaments = user.tournamentWins ?? 0;
  const eloCount = useCountUp(user.elo, 900);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex"
    >
      <Link
        href={`/profile/${encodeURIComponent(user.username)}` as '/'}
        className={`relative w-full flex flex-col items-center justify-end overflow-hidden cursor-pointer group ${tall ? 'pt-8 pb-6' : 'pt-5 pb-5'}`}
        style={{
          backgroundColor: '#101015',
          minHeight: tall ? 260 : 200,
          boxShadow: `inset 0 1px 0 0 ${accent}55, inset 0 -1px 0 0 ${accent}22`,
        }}
      >
        {rank === 1 && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.35em] font-bold"
            style={{ color: accent, fontFamily: 'var(--font-inter)' }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.4, duration: 0.4 }}
          >
            #1
          </motion.span>
        )}

        <span
          aria-hidden
          className={`pointer-events-none absolute leading-none font-black ${tall ? 'text-[140px]' : 'text-[100px]'}`}
          style={{
            color: `${accent}10`,
            top: tall ? '-22px' : '-10px',
            fontFamily: 'var(--font-inter)',
            letterSpacing: '-0.04em',
          }}
        >
          {rank === 1 ? 'I' : rank === 2 ? 'II' : 'III'}
        </span>

        {leaguesEnabled && placed ? (
          <motion.div
            className={`relative z-10 ${tall ? 'mb-3' : 'mb-2'}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: delay + 0.15, duration: 0.5, ease: 'backOut' }}
          >
            <Image
              src={tier.image}
              alt=""
              width={tall ? 72 : 56}
              height={tall ? 72 : 56}
              unoptimized
              priority
            />
          </motion.div>
        ) : (
          <div className={tall ? 'mb-3' : 'mb-2'} style={{ height: tall ? 72 : 56 }} />
        )}

        <div className="relative z-10 flex items-center gap-1.5 max-w-full px-3">
          <span
            className={`truncate font-semibold ${tall ? 'text-base sm:text-lg' : 'text-sm sm:text-base'}`}
            style={{ color: '#f0f0f0' }}
          >
            {user.username}
          </span>
          <UserBadges role={user.role} badgePrefs={user.badgePrefs} size="sm" />
        </div>

        <div
          className={`relative z-10 tabular-nums font-bold leading-none mt-2 ${tall ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'}`}
          style={{ color: accent, fontFamily: 'var(--font-inter)' }}
        >
          {eloCount}
        </div>

        <div className="relative z-10 flex items-center gap-2 mt-2.5 text-[10px] tabular-nums" style={{ fontFamily: 'var(--font-inter)' }}>
          <span style={{ color: '#5fb05f' }}>{user.wins}W</span>
          <span style={{ color: '#3a3a3a' }}>·</span>
          <span style={{ color: '#d97676' }}>{user.losses}L</span>
          {total > 0 && (
            <>
              <span style={{ color: '#3a3a3a' }}>·</span>
              <span style={{ color: '#888' }}>{winrate}%</span>
            </>
          )}
        </div>

        {(streakWin || streakLoss || tournaments > 0) && (
          <motion.div
            className="relative z-10 flex items-center gap-1 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.35, duration: 0.3 }}
          >
            {streakWin && (
              <Chip text={`${user.consecutiveWins}W`} color="#5fb05f" />
            )}
            {streakLoss && (
              <Chip text={`${user.consecutiveLosses}L`} color="#d97676" />
            )}
            {tournaments > 0 && (
              <Chip text={`${tournaments}T`} color="#c4a35a" />
            )}
          </motion.div>
        )}

        <motion.span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5"
          style={{ backgroundColor: accent }}
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ delay: delay + 0.2, duration: 0.6, ease: 'easeOut' }}
        />
      </Link>
    </motion.div>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold"
      style={{
        backgroundColor: `${color}10`,
        color,
        boxShadow: `inset 0 0 0 1px ${color}38`,
      }}
    >
      {text}
    </span>
  );
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
  const streakWin = (user.consecutiveWins ?? 0) >= 3;
  const streakLoss = (user.consecutiveLosses ?? 0) >= 3;
  const tournaments = user.tournamentWins ?? 0;
  const tierColor = placed && leaguesEnabled ? tier.color : '#444';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.025, 0.4), ease: 'easeOut' }}
      className="relative grid items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 transition-colors hover:bg-[#13110e]"
      style={{
        backgroundColor: isSelf ? 'rgba(196, 163, 90, 0.05)' : '#0f0f12',
        gridTemplateColumns: 'auto auto 1fr auto auto auto',
        boxShadow: 'inset 0 -1px 0 0 rgba(255, 255, 255, 0.03)',
      }}
    >
      <span
        className="text-xs sm:text-sm font-bold tabular-nums w-7 sm:w-9 text-center"
        style={{ color: '#5a5a5a', fontFamily: 'var(--font-inter)' }}
      >
        {globalRank}
      </span>

      {leaguesEnabled && placed ? (
        <Image
          src={tier.image}
          alt=""
          width={26}
          height={26}
          unoptimized
          className="shrink-0"
        />
      ) : (
        <span className="inline-flex items-center justify-center text-[9px] uppercase tracking-wider" style={{ width: 26, height: 26, color: '#444' }}>
          ?
        </span>
      )}

      <div className="flex items-center gap-1.5 min-w-0">
        <Link
          href={`/profile/${encodeURIComponent(user.username)}` as '/'}
          className="text-sm truncate transition-colors hover:text-[#c4a35a]"
          style={{ color: '#e0e0e0' }}
        >
          {user.username}
        </Link>
        <UserBadges role={user.role} badgePrefs={user.badgePrefs} size="sm" />
        {streakWin && <Chip text={`${user.consecutiveWins}W`} color="#5fb05f" />}
        {streakLoss && <Chip text={`${user.consecutiveLosses}L`} color="#d97676" />}
        {tournaments > 0 && <Chip text={`${tournaments}T`} color="#c4a35a" />}
      </div>

      <div className="hidden sm:flex items-center gap-1" style={{ fontFamily: 'var(--font-inter)' }}>
        <span className="text-[10px] tabular-nums px-1.5 py-0.5" style={{ backgroundColor: 'rgba(95, 176, 95, 0.08)', color: '#5fb05f' }}>
          {user.wins}
        </span>
        <span className="text-[10px] tabular-nums px-1.5 py-0.5" style={{ backgroundColor: 'rgba(217, 118, 118, 0.08)', color: '#d97676' }}>
          {user.losses}
        </span>
        <span className="text-[10px] tabular-nums px-1.5 py-0.5" style={{ backgroundColor: 'rgba(136, 136, 136, 0.06)', color: '#888' }}>
          {user.draws}
        </span>
      </div>

      <span className="hidden sm:block text-xs tabular-nums w-10 text-right" style={{ color: '#666', fontFamily: 'var(--font-inter)' }}>
        {winRate}%
      </span>

      <span
        className="text-sm sm:text-base font-bold tabular-nums w-14 text-right"
        style={{ color: tierColor, fontFamily: 'var(--font-inter)' }}
      >
        {user.elo}
      </span>
    </motion.div>
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
  const showPodium = currentPage === 1 && !debouncedSearch && !leagueFilter && users.length >= 3;
  const podiumUsers = showPodium ? users.slice(0, 3) : [];
  const listUsers = showPodium ? users.slice(3) : users;
  const listStartIndex = showPodium ? 3 : 0;

  const pageKey = useMemo(() => `${currentPage}-${debouncedSearch}-${leagueFilter}`, [currentPage, debouncedSearch, leagueFilter]);

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08080b' }}>
      <CloudBackground />

      <span
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 select-none font-black opacity-[0.04]"
        style={{
          fontSize: 'clamp(180px, 28vw, 360px)',
          color: '#c4a35a',
          letterSpacing: '-0.06em',
          lineHeight: 1,
          fontFamily: 'var(--font-inter)',
        }}
      >
        TOP
      </span>

      <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-7 sm:mb-10"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight uppercase leading-none" style={{ color: '#f0f0f0', letterSpacing: '-0.02em' }}>
                  {t('title')}
                </h1>
                <motion.span
                  className="text-xs sm:text-sm font-bold tabular-nums"
                  style={{ color: '#c4a35a', fontFamily: 'var(--font-inter)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  {totalCount} {t('player')}{totalCount > 1 ? 's' : ''}
                </motion.span>
              </div>
              {leaguesEnabled && (
                <p className="text-[11px] mt-2" style={{ color: '#555' }}>
                  {t('subtitle', { count: PLACEMENT_MATCHES_REQUIRED })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {leaguesEnabled && (
                <button
                  onClick={() => setLeaguesModalOpen(true)}
                  className="px-3 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]"
                  style={{ backgroundColor: 'transparent', color: '#888' }}
                >
                  {t('leagues')}
                </button>
              )}
              <LanguageSwitcher />
              <Link
                href="/"
                className="px-3 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ backgroundColor: 'transparent', color: '#888' }}
              >
                {tc('back')}
              </Link>
            </div>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="relative mb-5"
        >
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full px-5 py-3 text-sm transition-all"
            style={{
              backgroundColor: 'rgba(15, 15, 18, 0.85)',
              color: '#f0f0f0',
              outline: 'none',
              boxShadow: 'inset 0 -1px 0 0 rgba(196, 163, 90, 0.22)',
            }}
            onFocus={(e) => (e.target.style.boxShadow = 'inset 0 -2px 0 0 rgba(196, 163, 90, 0.7)')}
            onBlur={(e) => (e.target.style.boxShadow = 'inset 0 -1px 0 0 rgba(196, 163, 90, 0.22)')}
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
        </motion.div>

        {leaguesEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 no-scrollbar"
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
              <p className="text-sm" style={{ color: '#555' }}>{t('noPlayers')}</p>
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
                {showPodium && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 items-end">
                    <div className="self-end">
                      <PodiumCard user={podiumUsers[1]} rank={2} leaguesEnabled={leaguesEnabled} delay={0.05} />
                    </div>
                    <div className="self-end">
                      <PodiumCard user={podiumUsers[0]} rank={1} tall leaguesEnabled={leaguesEnabled} delay={0} />
                    </div>
                    <div className="self-end">
                      <PodiumCard user={podiumUsers[2]} rank={3} leaguesEnabled={leaguesEnabled} delay={0.1} />
                    </div>
                  </div>
                )}

                <div className="flex flex-col">
                  {listUsers.map((user, index) => {
                    const globalRank = (currentPage - 1) * PLAYERS_PER_PAGE + listStartIndex + index + 1;
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
              className="flex items-center justify-center gap-3 mt-7"
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-4 py-2 text-xs uppercase tracking-widest font-bold transition-colors disabled:opacity-20 cursor-pointer hover:text-[#c4a35a]"
                style={{ color: '#888' }}
              >
                {tc('previous')}
              </button>
              <span className="text-xs tabular-nums" style={{ color: '#555', fontFamily: 'var(--font-inter)' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-4 py-2 text-xs uppercase tracking-widest font-bold transition-colors disabled:opacity-20 cursor-pointer hover:text-[#c4a35a]"
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
      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? `${color}12` : 'transparent',
        boxShadow: active ? `inset 0 -2px 0 0 ${color}` : 'inset 0 -1px 0 0 rgba(255,255,255,0.04)',
        color: active ? color : '#555',
      }}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          width={14}
          height={14}
          unoptimized
          style={{ filter: active ? 'none' : 'grayscale(0.9) opacity(0.55)' }}
        />
      )}
      <span className="text-[9px] uppercase font-bold tracking-widest">{label}</span>
    </motion.button>
  );
}

function SkeletonGrid() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 items-end">
        {[200, 260, 200].map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
            style={{ height: h, backgroundColor: '#101015' }}
          />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.05 }}
            style={{ height: 44, backgroundColor: '#0f0f12', boxShadow: 'inset 0 -1px 0 0 rgba(255, 255, 255, 0.03)' }}
          />
        ))}
      </div>
    </div>
  );
}
