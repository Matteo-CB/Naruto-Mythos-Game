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
import { getRankTier, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import { UserBadges } from '@/components/badges/UserBadges';
import { CountryFlag } from '@/components/CountryFlag';
import { EloHistoryChart } from '@/components/EloHistoryChart';
import { DeckStatsPanel } from '@/components/profile/DeckStatsPanel';
import Image from 'next/image';
import '@/styles/holo-menu.css';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { LeaderboardModeSwitch, type LeaderboardMode } from '@/components/play-online/LeaderboardModeSwitch';

interface ProfileData {
  id: string;
  username: string;
  countryCode?: string | null;
  elo: number;
  evolvingElo?: number;
  evolvingWins?: number;
  evolvingLosses?: number;
  wins: number;
  losses: number;
  role?: string;
  badgePrefs?: string[];
  discordUsername: string | null;
  createdAt: string;
  decks: Array<{ id: string; name: string; createdAt: string; evolvingPoints?: number; evolvingCompatible?: boolean }>;
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
      style={{ backgroundColor: '#0d0c10', clipPath: STAT_CLIP }}
    >
      <span
        className="font-display text-2xl sm:text-3xl tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest mt-2" style={{ color: '#555' }}>
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

  const resultColor = isDraw ? '#888888' : won ? '#5fb05f' : '#d97676';
  const resultLabel = isDraw ? 'D' : won ? 'W' : 'L';
  const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';

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

      <span className="font-display text-sm truncate flex-1 min-w-0" style={{ color: '#e8e6df' }}>
        {opponent}
      </span>

      <span className="font-inter-force text-xs tabular-nums shrink-0" style={{ color: '#777' }}>
        {myScore}-{oppScore}
      </span>

      {eloVal !== null && eloVal !== 0 && (
        <span
          className="font-inter-force text-[10px] tabular-nums shrink-0 w-9 text-right"
          style={{ color: eloVal > 0 ? '#5fb05f' : '#d97676' }}
        >
          {eloVal > 0 ? '+' : ''}{eloVal}
        </span>
      )}

      {game.hasReplay && (
        <Link
          href={`/replay/${game.id}` as '/'}
          className="font-display text-[10px] px-2 py-0.5 uppercase tracking-widest shrink-0 transition-colors hover:text-[#c4a35a]"
          style={{ color: '#5fb05f' }}
        >
          {t('replay')}
        </Link>
      )}

      {game.completedAt && (
        <span className="font-inter-force text-[10px] shrink-0 hidden sm:block" style={{ color: '#444' }}>
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

  const [profileMode, setProfileMode] = useState<LeaderboardMode>('ranked');

  const rankedTotal = profile ? profile.wins + profile.losses : 0;
  const evoTotal = profile ? (profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0) : 0;

  const displayedWins = profileMode === 'evolving' ? (profile?.evolvingWins ?? 0) : (profile?.wins ?? 0);
  const displayedLosses = profileMode === 'evolving' ? (profile?.evolvingLosses ?? 0) : (profile?.losses ?? 0);
  const displayedElo = profileMode === 'evolving' ? (profile?.evolvingElo ?? 500) : (profile?.elo ?? 0);
  const displayedTotal = profileMode === 'evolving' ? evoTotal : rankedTotal;

  const placed = rankedTotal >= PLACEMENT_MATCHES_REQUIRED;
  const evoPlaced = evoTotal >= PLACEMENT_MATCHES_REQUIRED;
  const winRate = displayedTotal > 0 ? Math.round((displayedWins / displayedTotal) * 100) : 0;
  const tier = profile ? getRankTier(profile.elo) : null;
  const evoTier = profile ? getRankTier(profile.evolvingElo ?? 500) : null;
  const displayedTier = profileMode === 'evolving' ? evoTier : tier;
  const displayedPlaced = profileMode === 'evolving' ? evoPlaced : placed;
  const eloCount = useCountUp(displayedElo, 900);
  const accentColor = leaguesEnabled && displayedPlaced && displayedTier ? displayedTier.color : '#c4a35a';

  if (loading) {
    return (
      <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#08070a' }}>
        <CloudBackground />
        <div className="w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.18, 0.45, 0.18] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{ height: 200, backgroundColor: '#0d0c10', clipPath: PANEL_CLIP, marginBottom: 24 }}
          />
        </div>
        <Footer />
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen relative flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#08070a' }}>
        <p className="font-display uppercase tracking-widest" style={{ color: '#d97676' }}>{error}</p>
        <Link href="/" className="font-display text-xs uppercase tracking-widest" style={{ color: '#888' }}>
          {tc('back')}
        </Link>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
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
              <FriendshipButton userId={profile.id} username={profile.username} />
              <ProfileModerationActions userId={profile.id} username={profile.username} />
            </>
          )}
          <LanguageSwitcher />
          <Link
            href="/leaderboard"
            className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
            style={{ color: '#888' }}
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
            backgroundColor: '#0d0c10',
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
              <div className="font-display text-5xl sm:text-6xl tabular-nums leading-none" style={{ color: '#3a3a3a' }}>
                ?
              </div>
            )}
          </div>

          <div className="relative z-10 flex flex-col justify-center items-center sm:items-start px-6 sm:px-4 pb-7 sm:py-8 pr-6 sm:pr-10 sm:w-[66%] gap-1.5 text-center sm:text-left">
            <span className="font-display text-[10px] uppercase tracking-[0.4em]" style={{ color: '#555' }}>
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
                ? t(`rankNames.${displayedTier.key}`)
                : leaguesEnabled
                  ? t('rankNames.unranked')
                  : '...'}
            </div>

            <div className="h-px w-12 sm:w-16 my-1.5" style={{ backgroundColor: '#1e1e1e' }} />

            <div className="flex items-center gap-2 max-w-full">
              <CountryFlag code={profile.countryCode} size={26} />
              <h1
                className="font-display text-lg sm:text-2xl leading-tight wrap-break-word"
                style={{ color: '#e8e6df', letterSpacing: '0.04em', wordBreak: 'break-word' }}
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
                style={{ color: '#f4f1e8', letterSpacing: '-0.01em' }}
              >
                {eloCount}
              </div>
              <span className="font-display text-[10px] uppercase tracking-[0.32em]" style={{ color: '#666' }}>
                ELO
              </span>
            </div>

            <p className="text-[11px] mt-2" style={{ color: '#555' }}>
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
                    className="font-display text-[10px] uppercase tracking-widest transition-colors hover:text-[#c4a35a] cursor-pointer"
                    style={{ color: '#666', opacity: unlinking ? 0.5 : 1 }}
                  >
                    {td('unlinkDiscord')}
                  </button>
                )}
              </div>
            )}

            {!profile.discordUsername && isOwner && (
              <a
                href="/api/user/link-discord"
                className="font-display inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
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
          <span className="font-display text-[11px] uppercase" style={{ color: '#666', letterSpacing: '0.28em' }}>
            {t('statsTitle')}
          </span>
          <LeaderboardModeSwitch value={profileMode} onChange={setProfileMode} layoutId="profile-mode-pill" size="sm" />
        </div>

        <motion.div
          key={profileMode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-3 gap-2 mb-7"
        >
          <StatPanel label={t('statsWins')} value={displayedWins} color="#5fb05f" delay={0.05} />
          <StatPanel label={t('statsLosses')} value={displayedLosses} color="#d97676" delay={0.1} />
          <StatPanel
            label={t('statsWinrate')}
            value={`${winRate}%`}
            color={winRate >= 60 ? '#5fb05f' : winRate >= 40 ? '#c4a35a' : '#d97676'}
            delay={0.2}
          />
        </motion.div>

        {isOwner && (profile.role === 'admin' || leaguesEnabled) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="p-4 mb-6"
            style={{ backgroundColor: '#0d0c10', clipPath: STAT_CLIP }}
          >
            <p className="font-display text-[11px] uppercase tracking-widest mb-1" style={{ color: '#888' }}>
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
                  <span className="font-display text-xs" style={{ color: '#e0e0e0' }}>{tb('showAdmin')}</span>
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
                  <span className="font-display text-xs" style={{ color: '#e0e0e0' }}>{tb('showLeague')}</span>
                </label>
              )}
            </div>
          </motion.div>
        )}

        {profile.decks.length > 0 && (
          <>
            {isOwner && (
              <DeckStatsPanel decks={profile.decks.map(d => ({ id: d.id, name: d.name, evolvingPoints: d.evolvingPoints, evolvingCompatible: d.evolvingCompatible }))} />
            )}
            <section className="mb-7">
              <SectionTitle label={t('decks')} count={profile.decks.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.decks.map((deck) => (
                  <EvolvingDeckHolo
                    key={deck.id}
                    points={deck.evolvingPoints ?? 0}
                    enabled={deck.evolvingCompatible === true}
                    intensity="subtle"
                    style={{ clipPath: STAT_CLIP }}
                  >
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ backgroundColor: '#0d0c10', clipPath: STAT_CLIP }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-display text-sm truncate" style={{ color: '#e8e6df' }}>
                        {deck.name}
                      </span>
                      {deck.evolvingCompatible === true && typeof deck.evolvingPoints === 'number' && (
                        <EvolvingDeckBadge points={deck.evolvingPoints} />
                      )}
                    </div>
                    <span className="font-inter-force text-[10px] shrink-0 ml-3" style={{ color: '#555' }}>
                      {new Date(deck.createdAt).toLocaleDateString(locale)}
                    </span>
                  </div>
                  </EvolvingDeckHolo>
                ))}
              </div>
            </section>
          </>
        )}

        {(typeof profile.evolvingElo === 'number' || (profile.evolvingWins ?? 0) > 0 || (profile.evolvingLosses ?? 0) > 0) && (
          <section className="mb-6">
            <SectionTitle label={t('evolvingTitle')} />
            <div
              className="flex flex-col sm:flex-row items-stretch overflow-hidden"
              style={{ backgroundColor: '#0d0c10', clipPath: STAT_CLIP }}
            >
              <div className="flex flex-col items-center justify-center px-6 py-5 sm:py-6 sm:w-[44%]" style={{ borderBottom: '1px solid #1a1a1d' }}>
                <span className="font-display text-[10px] uppercase tracking-[0.32em] mb-1" style={{ color: '#666' }}>
                  {t('evolvingElo')}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl sm:text-4xl tabular-nums" style={{ color: '#c4a35a', letterSpacing: '-0.01em' }}>
                    {profile.evolvingElo ?? 500}
                  </span>
                  <span className="font-display text-[10px] uppercase tracking-[0.28em]" style={{ color: '#666' }}>
                    ELO
                  </span>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center px-6 py-5 sm:py-6 gap-2">
                <span className="font-display text-[10px] uppercase tracking-[0.32em]" style={{ color: '#666' }}>
                  {t('evolvingMatches')}
                </span>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: '#4a9e4a' }}>
                      {profile.evolvingWins ?? 0}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>{t('wins')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: '#b33e3e' }}>
                      {profile.evolvingLosses ?? 0}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>{t('losses')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display text-xl tabular-nums" style={{ color: '#888' }}>
                      {((profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0)) > 0
                        ? Math.round(((profile.evolvingWins ?? 0) / ((profile.evolvingWins ?? 0) + (profile.evolvingLosses ?? 0))) * 100)
                        : 0}%
                    </span>
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>{t('winRate')}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mb-7">
          <EloHistoryChart key={profileMode} username={profile.username} eloType={profileMode} />
        </section>

        <section>
          <SectionTitle label={t('recentGames')} count={profile.totalGames} />

          {profile.recentGames.length === 0 ? (
            <p className="font-display text-sm py-8 text-center uppercase tracking-widest" style={{ color: '#444' }}>
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
                className="font-display px-6 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a] disabled:opacity-30"
                style={{
                  color: '#888',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 9999,
                }}
              >
                {loadingMore ? tc('loading') : t('loadMore')}
              </button>
            </motion.div>
          )}
        </section>
      </div>
      <Footer />
    </main>
  );
}

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#666' }}>
        {label}
      </h2>
      {typeof count === 'number' && (
        <span className="font-display text-[11px] tabular-nums" style={{ color: '#c4a35a' }}>
          {count}
        </span>
      )}
    </div>
  );
}
