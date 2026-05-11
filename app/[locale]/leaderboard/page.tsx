'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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

const PODIUM_ACCENT: Record<1 | 2 | 3, { fg: string; glow: string }> = {
  1: { fg: '#c4a35a', glow: 'rgba(196, 163, 90, 0.45)' },
  2: { fg: '#cfcfcf', glow: 'rgba(207, 207, 207, 0.32)' },
  3: { fg: '#b87a52', glow: 'rgba(184, 122, 82, 0.32)' },
};

const CHAMFER_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
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

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="font-display px-2 py-0.5 text-[10px] uppercase tracking-wider"
      style={{
        backgroundColor: `${color}14`,
        color,
        boxShadow: `0 0 0 1px ${color}30 inset`,
        borderRadius: 9999,
      }}
    >
      {text}
    </span>
  );
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
      className="relative"
      whileHover={{ y: -3 }}
    >
      <Link
        href={`/profile/${encodeURIComponent(user.username)}` as '/'}
        className={`relative w-full flex flex-col items-center justify-end overflow-hidden cursor-pointer ${tall ? 'pt-8 pb-7' : 'pt-5 pb-5'}`}
        style={{
          backgroundColor: '#0d0c10',
          minHeight: tall ? 270 : 210,
          clipPath: CHAMFER_CLIP,
          boxShadow: `0 0 60px -20px ${accent.glow}, 0 8px 20px rgba(0, 0, 0, 0.35)`,
        }}
      >
        <span
          aria-hidden
          className="font-display pointer-events-none absolute leading-none"
          style={{
            color: `${accent.fg}14`,
            fontSize: tall ? '170px' : '120px',
            top: tall ? -22 : -10,
            letterSpacing: '-0.04em',
          }}
        >
          {rank === 1 ? 'I' : rank === 2 ? 'II' : 'III'}
        </span>

        {leaguesEnabled && placed ? (
          <motion.div
            className={`relative z-10 ${tall ? 'mb-3' : 'mb-2'}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: delay + 0.15, duration: 0.55, ease: 'backOut' }}
            style={{ filter: `drop-shadow(0 0 12px ${accent.glow})` }}
          >
            <Image
              src={tier.image}
              alt=""
              width={tall ? 84 : 60}
              height={tall ? 84 : 60}
              unoptimized
              priority
            />
          </motion.div>
        ) : (
          <div className={tall ? 'mb-3' : 'mb-2'} style={{ height: tall ? 84 : 60 }} />
        )}

        <div className="relative z-10 flex items-center gap-1.5 max-w-full px-4">
          <span
            className={`font-display truncate ${tall ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'}`}
            style={{ color: '#f2f0eb', letterSpacing: '0.04em' }}
          >
            {user.username}
          </span>
          <UserBadges role={user.role} badgePrefs={user.badgePrefs} size="sm" />
        </div>

        <div
          className={`font-display relative z-10 tabular-nums leading-none mt-3 ${tall ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'}`}
          style={{ color: accent.fg, textShadow: `0 0 24px ${accent.glow}` }}
        >
          {eloCount}
        </div>

        <div className="font-inter-force relative z-10 flex items-center gap-2 mt-3 text-[10px] tabular-nums">
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
            className="relative z-10 flex items-center gap-1 mt-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.35, duration: 0.3 }}
          >
            {streakWin && <Chip text={`${user.consecutiveWins}W`} color="#5fb05f" />}
            {streakLoss && <Chip text={`${user.consecutiveLosses}L`} color="#d97676" />}
            {tournaments > 0 && <Chip text={`${tournaments}T`} color="#c4a35a" />}
          </motion.div>
        )}
      </Link>
    </motion.div>
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
        {streakWin && <Chip text={`${user.consecutiveWins}W`} color="#5fb05f" />}
        {streakLoss && <Chip text={`${user.consecutiveLosses}L`} color="#d97676" />}
        {tournaments > 0 && <Chip text={`${tournaments}T`} color="#c4a35a" />}
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
      whileTap={{ scale: 0.93 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      className="font-display shrink-0 flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? `${color}18` : 'rgba(255, 255, 255, 0.025)',
        color: active ? color : '#666',
        borderRadius: 9999,
        boxShadow: active ? `0 0 22px -6px ${color}, 0 0 0 1px ${color}28 inset` : 'none',
      }}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          width={16}
          height={16}
          unoptimized
          style={{ filter: active ? 'none' : 'grayscale(0.95) opacity(0.55)' }}
        />
      )}
      <span className="text-[11px] tracking-wider uppercase">{label}</span>
    </motion.button>
  );
}

function SkeletonGrid() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 items-end">
        {[210, 270, 210].map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.18, 0.45, 0.18] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
            style={{ height: h, backgroundColor: '#0d0c10', clipPath: CHAMFER_CLIP }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.18, 0.4, 0.18] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.05 }}
            style={{ height: 46, backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}
          />
        ))}
      </div>
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
  const showPodium = currentPage === 1 && !debouncedSearch && !leagueFilter && users.length >= 3;
  const podiumUsers = showPodium ? users.slice(0, 3) : [];
  const listUsers = showPodium ? users.slice(3) : users;
  const listStartIndex = showPodium ? 3 : 0;
  const pageKey = useMemo(() => `${currentPage}-${debouncedSearch}-${leagueFilter}`, [currentPage, debouncedSearch, leagueFilter]);

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-8"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h1
                className="font-display text-3xl sm:text-5xl tracking-wider uppercase leading-none"
                style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 22px rgba(196, 163, 90, 0.18)' }}
              >
                {t('title')}
              </h1>
              <motion.span
                className="font-display text-xs sm:text-sm tabular-nums px-2.5 py-1 ml-1"
                style={{
                  color: '#c4a35a',
                  backgroundColor: 'rgba(196, 163, 90, 0.08)',
                  borderRadius: 9999,
                  boxShadow: '0 0 0 1px rgba(196, 163, 90, 0.18) inset',
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                {totalCount}
              </motion.span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
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
                {showPodium && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-7 items-end">
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
