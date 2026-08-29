'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useTrackOnMount } from '@/lib/hooks/useTrackUi';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { FriendshipButton } from '@/components/social/FriendshipButton';
import { ProfileModerationActions } from '@/components/social/ProfileModerationActions';
import { getRankTier, rankDivisionLabel, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import { UserBadges } from '@/components/badges/UserBadges';
import { CountryFlag } from '@/components/CountryFlag';
import { EloHistoryChart } from '@/components/EloHistoryChart';
import { DeckStatsPanel } from '@/components/profile/DeckStatsPanel';
import { SeasonBadgesPanel } from '@/components/profile/SeasonBadgesPanel';
import { FollowButton } from '@/components/social/FollowButton';
import { ProfilePostsSection } from '@/components/profile/ProfilePostsSection';
import Image from 'next/image';
import '@/styles/holo-menu.css';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { isSealedModeKey, sealedSetFromModeKey } from '@/lib/stats/modeKey';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { getSetName } from '@/lib/data/sets/registry';
import dynamic from 'next/dynamic';

const DeckViewerModal = dynamic(() => import('@/components/profile/DeckViewerModal'), { ssr: false });

type ProfileStatsMode = 'ranked' | 'evolving' | 'highlander' | 'casual' | 'sealed' | 'all';

const PROFILE_MODES: ProfileStatsMode[] = ['ranked', 'evolving', 'highlander', 'casual', 'sealed', 'all'];

function ProfileModeSwitch({ value, onChange }: { value: ProfileStatsMode; onChange: (m: ProfileStatsMode) => void }) {
  const t = useTranslations('profile');
  return (
    <div
      className="relative inline-flex items-center flex-wrap"
      style={{ backgroundColor: 'var(--t-switch-track)', boxShadow: 'inset 0 0 0 1px var(--t-divider)' }}
    >
      {PROFILE_MODES.map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className="relative px-2.5 py-1.5 font-bold uppercase text-[9px] cursor-pointer no-select"
            style={{
              letterSpacing: '0.14em',
              color: active ? 'var(--t-text)' : 'var(--t-switch-inactive)',
              transition: 'color 0.2s',
              background: 'transparent',
              minHeight: 32,
            }}
          >
            {active && (
              <motion.span
                layoutId="profile-mode-pill"
                className="absolute inset-0"
                style={{
                  backgroundColor: 'var(--t-accent-glow)',
                  boxShadow: 'inset 0 -2px 0 var(--t-accent)',
                  pointerEvents: 'none',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative" style={{ zIndex: 1 }}>
              {t(`mode_${mode}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface ProfileData {
  id: string;
  username: string;
  countryCode?: string | null;
  elo: number;
  evolvingElo?: number;
  evolvingWins?: number;
  evolvingLosses?: number;
  highlanderElo?: number;
  highlanderWins?: number;
  highlanderLosses?: number;
  wins: number;
  losses: number;
  role?: string;
  badgePrefs?: string[];
  discordUsername: string | null;
  createdAt: string;
  modeStats?: Record<string, { games: number; wins: number; losses: number }>;
  seasonBadges?: Array<{ seasonId: string; badge: string | null; league: string | null; rank: number; elo: number }>;
  decks: Array<{ id: string; name: string; createdAt: string; evolvingPoints?: number; evolvingCompatible?: boolean; isPublic?: boolean; cardIds?: string[]; missionIds?: string[] }>;
  canViewDeckContents?: boolean;
  followerCount?: number;
  followingCount?: number;
  viewerFollowing?: boolean;
  isPrivate?: boolean;
  viewerIsFriend?: boolean;
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

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const STAT_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
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

function StatPanel({ label, value, color, delay }: { label: string; value: string | number; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-5"
      style={{ backgroundColor: 'var(--t-bg)', clipPath: STAT_CLIP }}
    >
      <span
        className="font-display text-2xl sm:text-3xl tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest mt-2" style={{ color: 'var(--t-dim)' }}>
        {label}
      </span>
    </motion.div>
  );
}

function GameRow({
  game,
  profile,
  index,
  locale,
  t,
}: {
  game: ProfileData['recentGames'][number];
  profile: ProfileData;
  index: number;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
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

  const resultColor = isDraw ? 'var(--t-muted)' : won ? 'var(--t-success)' : 'var(--t-danger)';
  const resultLabel = isDraw ? 'D' : won ? 'W' : 'L';
  const altBg = index % 2 === 0 ? 'var(--t-row-alt-a)' : 'var(--t-row-alt-b)';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
      whileHover={{ x: 3 }}
      className="relative flex items-center gap-3 px-3 sm:px-5 py-2.5 mb-1"
      style={{ backgroundColor: altBg, clipPath: ROW_CLIP }}
    >
      <span
        className="font-display text-base tabular-nums w-6 text-center shrink-0"
        style={{ color: resultColor }}
      >
        {resultLabel}
      </span>

      <PlayerNameLink
        username={opponent}
        disabled={game.isAiGame}
        className="font-display text-sm truncate flex-1 min-w-0"
        style={{ color: 'var(--t-text)' }}
      />

      <span className="font-inter-force text-xs tabular-nums shrink-0" style={{ color: 'var(--t-dim)' }}>
        {myScore}-{oppScore}
      </span>

      {eloVal !== null && eloVal !== 0 && (
        <span
          className="font-inter-force text-[10px] tabular-nums shrink-0 w-9 text-right"
          style={{ color: eloVal > 0 ? 'var(--t-success)' : 'var(--t-danger)' }}
        >
          {eloVal > 0 ? '+' : ''}{eloVal}
        </span>
      )}

      {game.hasReplay && (
        <Link
          href={`/replay/${game.id}` as '/'}
          className="font-display text-[10px] px-2 py-0.5 uppercase tracking-widest shrink-0 transition-colors hover:text-[var(--t-accent)]"
          style={{ color: 'var(--t-success)' }}
        >
          {t('replay')}
        </Link>
      )}

      {game.completedAt && (
        <span className="font-inter-force text-[10px] shrink-0 hidden sm:block" style={{ color: 'var(--t-muted)' }}>
          {new Date(game.completedAt).toLocaleDateString(locale)}
        </span>
      )}
    </motion.div>
  );
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
  const tSocial = useTranslations('social');
  const locale = useLocale();
  useTrackOnMount('ui.profile.opened');
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [badgePrefsLocal, setBadgePrefsLocal] = useState<string[]>([]);
  const [openDeck, setOpenDeck] = useState<{ id: string; name: string; cardIds: string[]; missionIds: string[]; isPublic?: boolean } | null>(null);
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
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}?page=${page}`);
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
      setError(t('playerNotFound'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [username, profile, t]);

  useEffect(() => {
    fetchProfile(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const hasMore = profile
    ? profile.recentGames.length < profile.totalGames
    : false;

  const isOwner = session?.user?.id === profile?.id;

  const [profileMode, setProfileMode] = useState<ProfileStatsMode>('ranked');

  const rankedTotal = profile ? profile.wins + profile.losses : 0;
  const evoTotal = profile ? (profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0) : 0;

  const modeStatsMap = profile?.modeStats ?? {};
  const casualStats = modeStatsMap['casual'] ?? { games: 0, wins: 0, losses: 0 };
  const sealedEntries = Object.entries(modeStatsMap)
    .filter(([k]) => isSealedModeKey(k))
    .sort((a, b) => b[1].games - a[1].games);
  const sealedTotals = sealedEntries.reduce(
    (acc, [, v]) => ({ games: acc.games + v.games, wins: acc.wins + v.wins, losses: acc.losses + v.losses }),
    { games: 0, wins: 0, losses: 0 },
  );
  const allWins = (profile?.wins ?? 0) + (profile?.evolvingWins ?? 0) + (profile?.highlanderWins ?? 0) + casualStats.wins + sealedTotals.wins;
  const allLosses = (profile?.losses ?? 0) + (profile?.evolvingLosses ?? 0) + (profile?.highlanderLosses ?? 0) + casualStats.losses + sealedTotals.losses;

  const displayedWins =
    profileMode === 'evolving' ? (profile?.evolvingWins ?? 0)
    : profileMode === 'highlander' ? (profile?.highlanderWins ?? 0)
    : profileMode === 'casual' ? casualStats.wins
    : profileMode === 'sealed' ? sealedTotals.wins
    : profileMode === 'all' ? allWins
    : (profile?.wins ?? 0);
  const displayedLosses =
    profileMode === 'evolving' ? (profile?.evolvingLosses ?? 0)
    : profileMode === 'highlander' ? (profile?.highlanderLosses ?? 0)
    : profileMode === 'casual' ? casualStats.losses
    : profileMode === 'sealed' ? sealedTotals.losses
    : profileMode === 'all' ? allLosses
    : (profile?.losses ?? 0);
  const eloMode: 'ranked' | 'evolving' | 'highlander' =
    profileMode === 'evolving' ? 'evolving' : profileMode === 'highlander' ? 'highlander' : 'ranked';
  const displayedElo = eloMode === 'evolving'
    ? (profile?.evolvingElo ?? 500)
    : eloMode === 'highlander' ? (profile?.highlanderElo ?? 500) : (profile?.elo ?? 0);
  const displayedTotal = displayedWins + displayedLosses;

  const placed = rankedTotal >= PLACEMENT_MATCHES_REQUIRED;
  const evoPlaced = evoTotal >= PLACEMENT_MATCHES_REQUIRED;
  const winRate = displayedTotal > 0 ? Math.round((displayedWins / displayedTotal) * 100) : 0;
  const tier = profile ? getRankTier(profile.elo) : null;
  const evoTier = profile ? getRankTier(profile.evolvingElo ?? 500) : null;
  const highlanderTier = profile ? getRankTier(profile.highlanderElo ?? 500) : null;
  const highlanderPlaced = ((profile?.highlanderWins ?? 0) + (profile?.highlanderLosses ?? 0)) >= PLACEMENT_MATCHES_REQUIRED;
  const displayedTier = eloMode === 'evolving' ? evoTier : eloMode === 'highlander' ? highlanderTier : tier;
  const displayedPlaced = eloMode === 'evolving' ? evoPlaced : eloMode === 'highlander' ? highlanderPlaced : placed;
  const eloCount = useCountUp(displayedElo, 900);
  const accentColor = leaguesEnabled && displayedPlaced && displayedTier ? displayedTier.color : 'var(--t-accent)';

  if (loading) {
    return (
      <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.18, 0.45, 0.18] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{ height: 200, backgroundColor: 'var(--t-bg)', clipPath: PANEL_CLIP, marginBottom: 24 }}
          />
        </div>
        <Footer />
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen relative flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--t-bg)' }}>
        <p className="font-display uppercase tracking-widest" style={{ color: 'var(--t-danger)' }}>{error}</p>
        <Link href="/" className="font-display text-xs uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
          {tc('back')}
        </Link>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground />

      <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex items-center justify-end gap-2 mb-7"
        >
          {session?.user?.id && profile.id !== session.user.id && (
            <>
              {!(profile.isPrivate && !profile.viewerIsFriend) && (
                <FollowButton targetId={profile.id} initialFollowing={profile.viewerFollowing === true} />
              )}
              <FriendshipButton userId={profile.id} username={profile.username} />
              <ProfileModerationActions userId={profile.id} username={profile.username} />
            </>
          )}
          <LanguageSwitcher />
          <Link
            href="/leaderboard"
            className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)]"
            style={{ color: 'var(--t-muted)' }}
          >
            {tc('back')}
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="holo-menu-foil relative flex flex-col sm:flex-row items-center sm:items-stretch overflow-hidden mb-6"
          style={{
            backgroundColor: 'var(--t-bg)',
            clipPath: PANEL_CLIP,
            minHeight: 200,
            ['--foil' as string]: accentColor,
          } as React.CSSProperties}
        >
          <div className="relative z-10 flex items-center justify-center px-6 sm:px-10 py-7 sm:py-8 sm:w-[34%]">
            {leaguesEnabled && displayedPlaced && displayedTier ? (
              <Image
                src={displayedTier.image}
                alt=""
                width={130}
                height={130}
                unoptimized
                priority
              />
            ) : (
              <div className="font-display text-5xl sm:text-6xl tabular-nums leading-none" style={{ color: 'var(--t-muted)' }}>
                ?
              </div>
            )}
          </div>

          <div className="relative z-10 flex flex-col justify-center items-center sm:items-start px-6 sm:px-4 pb-7 sm:py-8 pr-6 sm:pr-10 sm:w-[66%] gap-1.5 text-center sm:text-left">
            <span className="font-display text-[10px] uppercase tracking-[0.4em]" style={{ color: 'var(--t-dim)' }}>
              {t('rank')}
            </span>

            <div
              className="font-display uppercase leading-none wrap-break-word max-w-full"
              style={{
                color: accentColor,
                fontSize: 'clamp(14px, 2.4vw, 18px)',
                letterSpacing: '0.06em',
              }}
            >
              {leaguesEnabled && displayedPlaced && displayedTier
                ? t('rankDivision', { name: t(`rankNames.${displayedTier.key}`), level: rankDivisionLabel(displayedElo) })
                : leaguesEnabled
                  ? t('rankNames.unranked')
                  : '...'}
            </div>

            <div className="flex items-center gap-2 max-w-full mt-3">
              <CountryFlag code={profile.countryCode} size={26} />
              <h1
                className="font-display text-lg sm:text-2xl leading-tight wrap-break-word"
                style={{ color: 'var(--t-text)', letterSpacing: '0.04em', wordBreak: 'break-word' }}
              >
                {profile.username}
              </h1>
              <UserBadges
                role={profile.role}
                badgePrefs={profile.badgePrefs}
                size="md"
              />
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <div
                className="font-display tabular-nums leading-none text-2xl sm:text-3xl"
                style={{ color: 'var(--t-text-warm)', letterSpacing: '-0.01em' }}
              >
                {eloCount}
              </div>
              <span className="font-display text-[10px] uppercase tracking-[0.32em]" style={{ color: 'var(--t-dim)' }}>
                ELO
              </span>
            </div>

            <p className="text-[11px] mt-2" style={{ color: 'var(--t-dim)' }}>
              {t('memberSince', { date: new Date(profile.createdAt).toLocaleDateString(locale) })}
            </p>

            {profile.discordUsername && (
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <svg width="14" height="11" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
                </svg>
                <span className="font-display text-xs" style={{ color: '#5865F2' }}>{profile.discordUsername}</span>
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
                    className="font-display text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)] cursor-pointer"
                    style={{ color: 'var(--t-dim)', opacity: unlinking ? 0.5 : 1 }}
                  >
                    {td('unlinkDiscord')}
                  </button>
                )}
              </div>
            )}

            {!profile.discordUsername && isOwner && (
              <a
                href="/api/user/link-discord"
                className="font-display inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)]"
                style={{ color: '#5865F2' }}
              >
                <svg width="14" height="11" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
                </svg>
                {td('linkDiscord')}
              </a>
            )}
          </div>
        </motion.div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="font-display text-[11px] uppercase" style={{ color: 'var(--t-dim)', letterSpacing: '0.28em' }}>
            {t('statsTitle')}
          </span>
          <ProfileModeSwitch value={profileMode} onChange={setProfileMode} />
        </div>

        <motion.div
          key={profileMode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-3 gap-2 mb-7"
        >
          <StatPanel label={t('statsWins')} value={displayedWins} color="var(--t-success)" delay={0.05} />
          <StatPanel label={t('statsLosses')} value={displayedLosses} color="var(--t-danger)" delay={0.1} />
          <StatPanel
            label={t('statsWinrate')}
            value={`${winRate}%`}
            color={winRate >= 60 ? 'var(--t-success)' : winRate >= 40 ? 'var(--t-accent)' : 'var(--t-danger)'}
            delay={0.2}
          />
        </motion.div>

        {profileMode === 'sealed' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mb-7 -mt-4 flex flex-col gap-1.5"
          >
            {sealedEntries.length === 0 ? (
              <p className="font-display text-xs py-3 text-center uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                {t('sealedNoGames')}
              </p>
            ) : (
              sealedEntries.map(([modeKey, v]) => {
                const setId = sealedSetFromModeKey(modeKey);
                const label = setId === 'random' ? t('sealedRandomSet') : getSetName(setId, locale);
                const rate = v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0;
                return (
                  <div
                    key={modeKey}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
                    style={{ backgroundColor: 'var(--t-bg)', clipPath: STAT_CLIP }}
                  >
                    <span className="font-display text-sm truncate" style={{ color: 'var(--t-text)' }}>{label}</span>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-inter-force text-[11px] tabular-nums" style={{ color: 'var(--t-muted)' }}>
                        {t('sealedGamesCount', { count: v.games })}
                      </span>
                      <span className="font-display text-sm tabular-nums" style={{ color: 'var(--t-success)' }}>{v.wins}</span>
                      <span className="font-display text-sm tabular-nums" style={{ color: 'var(--t-danger)' }}>{v.losses}</span>
                      <span className="font-display text-sm tabular-nums w-11 text-right" style={{ color: rate >= 60 ? 'var(--t-success)' : rate >= 40 ? 'var(--t-accent)' : 'var(--t-danger)' }}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}

        {isOwner && (profile.role === 'admin' || leaguesEnabled) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="p-4 mb-6"
            style={{ backgroundColor: 'var(--t-bg)', clipPath: STAT_CLIP }}
          >
            <p className="font-display text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--t-muted)' }}>
              {tb('badgePrefs')}
            </p>
            <p className="text-[10px] mb-3" style={{ color: 'var(--t-dim)' }}>
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
                  <span className="font-display text-xs" style={{ color: 'var(--t-text)' }}>{tb('showAdmin')}</span>
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
                  <span className="font-display text-xs" style={{ color: 'var(--t-text)' }}>{tb('showLeague')}</span>
                </label>
              )}
            </div>
          </motion.div>
        )}

        {(typeof profile.followerCount === 'number' || typeof profile.followingCount === 'number') && (
          <div className="flex items-center gap-5 mb-6 px-1">
            <span className="text-sm" style={{ color: 'var(--t-muted)' }}>
              <span className="font-display tabular-nums" style={{ color: 'var(--t-text)' }}>{profile.followerCount ?? 0}</span> <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>{tSocial('followers')}</span>
            </span>
            <span className="text-sm" style={{ color: 'var(--t-muted)' }}>
              <span className="font-display tabular-nums" style={{ color: 'var(--t-text)' }}>{profile.followingCount ?? 0}</span> <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>{tSocial('followingLabel')}</span>
            </span>
          </div>
        )}

        {profile.decks.length > 0 && (
          <>
            {isOwner && (
              <DeckStatsPanel decks={profile.decks.map(d => ({ id: d.id, name: d.name, evolvingPoints: d.evolvingPoints, evolvingCompatible: d.evolvingCompatible }))} />
            )}
            <section className="mb-7">
              <SectionTitle label={t('decks')} count={profile.decks.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.decks.map((deck) => {
                  const canView = Array.isArray(deck.cardIds);
                  const openViewer = () => setOpenDeck({ id: deck.id, name: deck.name, cardIds: deck.cardIds ?? [], missionIds: deck.missionIds ?? [], isPublic: deck.isPublic === true });
                  return (
                  <EvolvingDeckHolo
                    key={deck.id}
                    points={deck.evolvingPoints ?? 0}
                    enabled={deck.evolvingCompatible === true}
                    intensity="subtle"
                    style={{ clipPath: STAT_CLIP }}
                  >
                  <div
                    role={canView ? 'button' : undefined}
                    tabIndex={canView ? 0 : undefined}
                    onClick={canView ? openViewer : undefined}
                    onKeyDown={canView ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(); } } : undefined}
                    className="px-4 py-3 flex items-center justify-between transition-colors"
                    style={{ backgroundColor: 'var(--t-bg)', clipPath: STAT_CLIP, cursor: canView ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-sm truncate" style={{ color: 'var(--t-text)' }}>
                        {deck.name}
                      </span>
                      {deck.evolvingCompatible === true && typeof deck.evolvingPoints === 'number' && (
                        <EvolvingDeckBadge points={deck.evolvingPoints} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {canView && (
                        <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-accent)' }}>
                          {t('viewDeck')}
                        </span>
                      )}
                      <span className="font-inter-force text-[10px]" style={{ color: 'var(--t-dim)' }}>
                        {new Date(deck.createdAt).toLocaleDateString(locale)}
                      </span>
                    </div>
                  </div>
                  </EvolvingDeckHolo>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <ProfilePostsSection userId={profile.id} />

        {(typeof profile.evolvingElo === 'number' || (profile.evolvingWins ?? 0) > 0 || (profile.evolvingLosses ?? 0) > 0) && (
          <section className="mb-6">
            <SectionTitle label={t('evolvingTitle')} />
            <div
              className="flex flex-col sm:flex-row items-stretch overflow-hidden"
              style={{ backgroundColor: 'var(--t-bg)', clipPath: STAT_CLIP }}
            >
              <div className="flex flex-col items-center justify-center px-6 py-5 sm:py-6 sm:w-[44%]" style={{ borderBottom: '1px solid var(--t-divider)' }}>
                <span className="font-display text-[10px] uppercase tracking-[0.32em] mb-1" style={{ color: 'var(--t-dim)' }}>
                  {t('evolvingElo')}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl sm:text-4xl tabular-nums" style={{ color: 'var(--t-accent)', letterSpacing: '-0.01em' }}>
                    {profile.evolvingElo ?? 500}
                  </span>
                  <span className="font-display text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--t-dim)' }}>
                    ELO
                  </span>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center px-6 py-5 sm:py-6 gap-2">
                <span className="font-display text-[10px] uppercase tracking-[0.32em]" style={{ color: 'var(--t-dim)' }}>
                  {t('evolvingMatches')}
                </span>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: 'var(--t-success-bright)' }}>
                      {profile.evolvingWins ?? 0}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>{t('wins')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: 'var(--t-danger)' }}>
                      {profile.evolvingLosses ?? 0}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>{t('losses')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: 'var(--t-muted)' }}>
                      {((profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0)) > 0
                        ? Math.round(((profile.evolvingWins ?? 0) / ((profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0))) * 100)
                        : 0}%
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>{t('winRate')}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {(profile.seasonBadges?.length ?? 0) > 0 && (
          <SeasonBadgesPanel badges={profile.seasonBadges!} />
        )}

        {(profileMode === 'ranked' || profileMode === 'evolving' || profileMode === 'highlander') && (
          <section className="mb-7">
            <EloHistoryChart key={profileMode} username={profile.username} eloType={profileMode} />
          </section>
        )}

        <section>
          <SectionTitle label={t('recentGames')} count={profile.totalGames} />

          {profile.recentGames.length === 0 ? (
            <p className="font-display text-sm py-8 text-center uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
              {t('noGames')}
            </p>
          ) : (
            <div className="flex flex-col">
              {profile.recentGames.map((game, index) => (
                <GameRow
                  key={game.id + index}
                  game={game}
                  profile={profile}
                  index={index}
                  locale={locale}
                  t={t}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex justify-center mt-5"
            >
              <button
                onClick={() => fetchProfile(currentPage + 1, true)}
                disabled={loadingMore}
                className="font-display px-6 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[var(--t-accent)] disabled:opacity-30"
                style={{
                  color: 'var(--t-muted)',
                  backgroundColor: 'var(--t-divider)',
                  borderRadius: 9999,
                }}
              >
                {loadingMore ? tc('loading') : t('loadMore')}
              </button>
            </motion.div>
          )}
        </section>
      </div>

      {openDeck && (
        <DeckViewerModal
          deck={openDeck}
          ownerName={profile.username}
          isAdminView={!isOwner}
          isOwner={isOwner}
          deckIsPublic={openDeck.isPublic === true}
          onClose={() => setOpenDeck(null)}
        />
      )}

      <Footer />
    </main>
  );
}

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
        {label}
      </h2>
      {typeof count === 'number' && (
        <span className="font-display text-[11px] tabular-nums" style={{ color: 'var(--t-accent)' }}>
          {count}
        </span>
      )}
    </div>
  );
}
