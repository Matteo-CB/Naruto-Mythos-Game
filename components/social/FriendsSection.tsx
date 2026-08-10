'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useDmStore } from '@/stores/dmStore';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { UserSearchDropdown } from '@/components/social/UserSearchDropdown';
import { FriendRequestsList } from '@/components/social/FriendRequestsList';
import { useSocialStore } from '@/stores/socialStore';
import { useToastStore } from '@/stores/toastStore';
import { getRankTier, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import Image from 'next/image';
import '@/styles/holo-menu.css';

type FriendsTab = 'friends' | 'requests' | 'activity';

interface RichFriend {
  id: string;
  username: string;
  elo: number;
  role?: string;
  badgePrefs?: string[];
  wins: number;
  losses: number;
  draws: number;
  consecutiveWins?: number;
  consecutiveLosses?: number;
  tournamentWins?: number;
  friendshipId: string;
  since: string;
  h2h: { wins: number; losses: number; netDelta: number; total: number };
  lastSeenAt: string | null;
  isRival: boolean;
}

interface ActivityEntry {
  type: 'win' | 'loss' | 'draw';
  friendId: string;
  friendUsername: string;
  opponentUsername: string;
  delta: number;
  newElo: number;
  oldElo: number;
  at: string;
}

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const ROW_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

function relativeShort(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return t('never');
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return t('justNow');
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

function FriendCard({
  friend,
  index,
  leaguesEnabled,
  expanded,
  onToggle,
  onInvite,
  onRemove,
  onTrade,
  onMessage,
  tradeLabel,
  t,
  tStats,
}: {
  friend: RichFriend;
  index: number;
  leaguesEnabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onInvite: () => void;
  onRemove: () => void;
  onTrade: () => void;
  onMessage: () => void;
  tradeLabel: string;
  t: ReturnType<typeof useTranslations>;
  tStats: ReturnType<typeof useTranslations>;
}) {
  const totalGames = friend.wins + friend.losses + friend.draws;
  const placed = totalGames >= PLACEMENT_MATCHES_REQUIRED;
  const tier = getRankTier(friend.elo);
  const accent = leaguesEnabled && placed ? tier.color : 'var(--t-muted)';
  const streakWin = (friend.consecutiveWins ?? 0) >= 3;
  const streakLoss = (friend.consecutiveLosses ?? 0) >= 3;
  const tournaments = friend.tournamentWins ?? 0;
  const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4), ease: 'easeOut' }}
      className="relative mb-1.5"
    >
      <button
        onClick={onToggle}
        className="relative w-full flex items-center gap-3 px-3 sm:px-5 py-2.5 sm:py-3 cursor-pointer text-left"
        style={{
          backgroundColor: altBg,
          clipPath: ROW_CLIP,
        }}
      >
        {leaguesEnabled && placed ? (
          <Image
            src={tier.image}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="shrink-0"
          />
        ) : leaguesEnabled ? (
          <span
            className="font-display text-[8px] uppercase tracking-widest shrink-0 inline-flex items-center justify-center"
            style={{ width: 32, height: 32, color: 'var(--t-dim)' }}
          >
            ?
          </span>
        ) : null}

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 max-w-full">
            <PlayerNameLink
              username={friend.username}
              className="font-display text-sm sm:text-base truncate"
              style={{ color: 'var(--t-text)', letterSpacing: '0.03em' }}
            />
            {friend.isRival && (
              <span
                className="font-display text-[8px] uppercase px-1.5 py-0.5 tracking-widest shrink-0"
                style={{ color: 'var(--t-danger)', backgroundColor: 'rgba(217, 118, 118, 0.1)', borderRadius: 9999 }}
              >
                {t('rival')}
              </span>
            )}
            {streakWin && (
              <span
                className="font-display text-[8px] uppercase px-1.5 py-0.5 tracking-widest shrink-0"
                style={{ color: 'var(--t-success)', backgroundColor: 'rgba(95, 176, 95, 0.1)', borderRadius: 9999 }}
              >
                {friend.consecutiveWins}W
              </span>
            )}
            {streakLoss && (
              <span
                className="font-display text-[8px] uppercase px-1.5 py-0.5 tracking-widest shrink-0"
                style={{ color: 'var(--t-danger)', backgroundColor: 'rgba(217, 118, 118, 0.1)', borderRadius: 9999 }}
              >
                {friend.consecutiveLosses}L
              </span>
            )}
            {tournaments > 0 && (
              <span
                className="font-display text-[8px] uppercase px-1.5 py-0.5 tracking-widest shrink-0"
                style={{ color: 'var(--t-accent)', backgroundColor: 'var(--t-accent-glow)', borderRadius: 9999 }}
              >
                {tournaments}T
              </span>
            )}
          </div>
          <span className="font-display text-[10px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--t-dim)' }}>
            {relativeShort(friend.lastSeenAt, tStats)}
          </span>
        </div>

        <div className="font-display text-base sm:text-lg tabular-nums shrink-0" style={{ color: accent }}>
          {friend.elo}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              className="mt-1.5 px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              style={{ backgroundColor: 'var(--t-surface-2)', clipPath: ROW_CLIP }}
            >
              <div className="flex-1 grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center">
                  <span className="font-display text-xl tabular-nums" style={{ color: 'var(--t-success)' }}>
                    {friend.h2h.wins}
                  </span>
                  <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
                    {t('h2hWins')}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="font-display text-xl tabular-nums" style={{ color: 'var(--t-danger)' }}>
                    {friend.h2h.losses}
                  </span>
                  <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
                    {t('h2hLosses')}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span
                    className="font-display text-xl tabular-nums"
                    style={{ color: friend.h2h.netDelta > 0 ? 'var(--t-success)' : friend.h2h.netDelta < 0 ? 'var(--t-danger)' : 'var(--t-muted)' }}
                  >
                    {friend.h2h.netDelta > 0 ? '+' : ''}{friend.h2h.netDelta}
                  </span>
                  <span className="font-display text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
                    {t('h2hElo')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={onInvite}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[var(--t-accent)]"
                  style={{ color: 'var(--t-success)', backgroundColor: 'rgba(95, 176, 95, 0.08)', borderRadius: 9999 }}
                >
                  {t('list.invite')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={onTrade}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[var(--t-accent-bright)]"
                  style={{ color: 'var(--t-accent)', backgroundColor: 'var(--t-accent-tint)', borderRadius: 9999 }}
                >
                  {tradeLabel}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={onMessage}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[var(--t-accent)]"
                  style={{ color: '#8fae6b', backgroundColor: 'rgba(143, 174, 107, 0.08)', borderRadius: 9999 }}
                >
                  {t('list.message')}
                </motion.button>
                <Link
                  href={`/profile/${encodeURIComponent(friend.username)}` as '/'}
                  className="font-display px-4 py-2 text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)]"
                  style={{ color: 'var(--t-muted)' }}
                >
                  {t('profile')}
                </Link>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={onRemove}
                  className="font-display px-3 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[var(--t-danger)]"
                  style={{ color: 'var(--t-dim)' }}
                >
                  {t('list.remove')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TabPill({ active, onClick, label, count, alert }: { active: boolean; onClick: () => void; label: string; count?: number; alert?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="font-display flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? 'var(--t-accent-glow)' : 'rgba(255, 255, 255, 0.03)',
        color: active ? 'var(--t-accent)' : 'var(--t-dim)',
        borderRadius: 9999,
      }}
    >
      <span className="text-[11px] uppercase tracking-widest">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className="text-[10px] tabular-nums px-1.5 py-0.5 leading-none"
          style={{
            color: alert ? 'var(--t-bg)' : active ? 'var(--t-accent)' : 'var(--t-muted)',
            backgroundColor: alert ? 'var(--t-accent)' : 'transparent',
            borderRadius: 9999,
          }}
        >
          {count}
        </span>
      )}
    </motion.button>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-display text-xl sm:text-2xl tabular-nums leading-none" style={{ color }}>
        {value}
      </span>
      <span className="font-display text-[9px] uppercase tracking-widest mt-1.5" style={{ color: 'var(--t-dim)' }}>
        {label}
      </span>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.18, 0.42, 0.18] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.05 }}
          style={{ height: 56, backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}
        />
      ))}
    </div>
  );
}

function ActivityRow({ entry, index, locale, t }: { entry: ActivityEntry; index: number; locale: string; t: ReturnType<typeof useTranslations> }) {
  const isWin = entry.type === 'win';
  const isDraw = entry.type === 'draw';
  const color = isDraw ? 'var(--t-muted)' : isWin ? 'var(--t-success)' : 'var(--t-danger)';
  const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';
  const date = new Date(entry.at);
  const ago = Math.floor((Date.now() - date.getTime()) / 60000);
  let when: string;
  if (ago < 60) when = `${Math.max(1, ago)}m`;
  else if (ago < 60 * 24) when = `${Math.floor(ago / 60)}h`;
  else when = `${Math.floor(ago / (60 * 24))}d`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.35) }}
      className="relative flex items-center gap-3 px-3 sm:px-5 py-2.5 mb-1"
      style={{ backgroundColor: altBg, clipPath: ROW_CLIP }}
    >
      <span
        className="font-display text-base tabular-nums w-6 text-center shrink-0"
        style={{ color }}
      >
        {entry.type === 'win' ? 'W' : entry.type === 'loss' ? 'L' : 'D'}
      </span>

      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-display text-sm truncate" style={{ color: 'var(--t-text)' }}>
          <Link href={`/profile/${encodeURIComponent(entry.friendUsername)}` as '/'} className="hover:text-[var(--t-accent)] transition-colors">
            {entry.friendUsername}
          </Link>
          <span className="font-display text-[10px] uppercase tracking-widest mx-2" style={{ color: 'var(--t-muted)' }}>
            {t(entry.type === 'win' ? 'beat' : entry.type === 'loss' ? 'lostTo' : 'drewWith')}
          </span>
          <span style={{ color: 'var(--t-muted)' }}>{entry.opponentUsername}</span>
        </span>
        <span className="font-display text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--t-dim)' }}>
          {date.toLocaleDateString(locale)} · {when}
        </span>
      </div>

      <span
        className="font-inter-force text-xs tabular-nums shrink-0 w-12 text-right"
        style={{ color: entry.delta > 0 ? 'var(--t-success)' : entry.delta < 0 ? 'var(--t-danger)' : 'var(--t-muted)' }}
      >
        {entry.delta > 0 ? '+' : ''}{entry.delta}
      </span>

      <span className="font-display text-xs tabular-nums shrink-0 w-12 text-right" style={{ color: 'var(--t-dim)' }}>
        {entry.newElo}
      </span>
    </motion.div>
  );
}

export function FriendsSection() {
  const t = useTranslations('friends');
  const tc = useTranslations('common');
  const tTrade = useTranslations('trade');
  const tStats = useTranslations('deckStats');
  const locale = useLocale();
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const { data: session } = useSession();

  const handleTrade = useCallback(async (friendId: string) => {
    try {
      const res = await fetch('/api/trade/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({ type: 'error', messageKey: typeof body.errorKey === 'string' ? body.errorKey : 'trade.error.loadError' });
        return;
      }
      router.push(`/trade/${body.roomId}` as '/trade/[roomId]');
    } catch {
      showToast({ type: 'error', messageKey: 'trade.error.loadError' });
    }
  }, [router, showToast]);
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);
  const [friends, setFriends] = useState<RichFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const {
    incomingRequests,
    fetchRequests,
    sendMatchInvite,
    removeFriend,
  } = useSocialStore();

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setLeaguesEnabled(d.leaguesEnabled ?? false))
      .catch(() => {});
  }, []);

  const reloadFriends = useCallback(() => {
    setFriendsLoading(true);
    fetch('/api/friends')
      .then((r) => r.ok ? r.json() : { friends: [] })
      .then((d) => {
        setFriends(d.friends ?? []);
        setFriendsLoading(false);
      })
      .catch(() => setFriendsLoading(false));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    reloadFriends();
    fetchRequests();
  }, [session, fetchRequests, reloadFriends]);

  const socialFriendsCount = useSocialStore((s) => s.friends.length);
  useEffect(() => {
    if (session?.user) reloadFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialFriendsCount]);

  useEffect(() => {
    if (activeTab === 'friends' && session?.user) {
      reloadFriends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'activity' || !session?.user) return;
    setActivityLoading(true);
    fetch('/api/friends/activity')
      .then((r) => r.ok ? r.json() : { activity: [] })
      .then((d) => {
        setActivity(d.activity ?? []);
        setActivityLoading(false);
      })
      .catch(() => setActivityLoading(false));
  }, [activeTab, session]);

  const aggregateStats = useMemo(() => {
    if (friends.length === 0) return null;
    const totalH2H = friends.reduce((sum, f) => sum + f.h2h.total, 0);
    const wins = friends.reduce((sum, f) => sum + f.h2h.wins, 0);
    const losses = friends.reduce((sum, f) => sum + f.h2h.losses, 0);
    const netDelta = friends.reduce((sum, f) => sum + f.h2h.netDelta, 0);
    const topElo = Math.max(...friends.map((f) => f.elo));
    const avgElo = Math.round(friends.reduce((s, f) => s + f.elo, 0) / friends.length);
    return { totalH2H, wins, losses, netDelta, topElo, avgElo };
  }, [friends]);

  if (!session?.user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center py-10"
      >
        <p className="font-display text-sm uppercase tracking-widest mb-6" style={{ color: 'var(--t-dim)' }}>
          {t('signInRequired')}
        </p>
        <Link
          href="/login"
          className="font-display px-6 py-2.5 text-xs uppercase tracking-widest transition-colors"
          style={{ color: 'var(--t-accent)', backgroundColor: 'var(--t-accent-glow)', borderRadius: 9999 }}
        >
          {tc('signIn')}
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="font-display flex items-baseline gap-2 mb-5"
      >
        <span className="text-2xl tabular-nums leading-none" style={{ color: 'var(--t-accent)' }}>
          {friends.length}
        </span>
        <span className="text-[11px] uppercase tracking-[0.3em]" style={{ color: 'var(--t-dim)' }}>
          {t('friendsCountLabel')}
        </span>
      </motion.div>

      {aggregateStats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="holo-menu-foil relative overflow-hidden mb-6 px-5 sm:px-8 py-4 sm:py-5 grid grid-cols-2 sm:grid-cols-4 gap-3"
          style={{
            backgroundColor: 'var(--t-bg)',
            clipPath: PANEL_CLIP,
            ['--foil' as string]: 'var(--t-accent)',
          } as React.CSSProperties}
        >
          <Stat label={t('aggTotal')} value={aggregateStats.totalH2H} color="var(--t-accent)" />
          <Stat
            label={t('aggRecord')}
            value={`${aggregateStats.wins}-${aggregateStats.losses}`}
            color={aggregateStats.wins >= aggregateStats.losses ? 'var(--t-success)' : 'var(--t-danger)'}
          />
          <Stat
            label={t('aggNet')}
            value={`${aggregateStats.netDelta > 0 ? '+' : ''}${aggregateStats.netDelta}`}
            color={aggregateStats.netDelta > 0 ? 'var(--t-success)' : aggregateStats.netDelta < 0 ? 'var(--t-danger)' : 'var(--t-muted)'}
          />
          <Stat label={t('aggTop')} value={aggregateStats.topElo} color="var(--t-accent)" />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mb-6"
      >
        <UserSearchDropdown />
      </motion.div>

      <div className="mb-5 -mt-2">
        <Link
          href={'/trade/history' as '/trade/history'}
          className="font-display text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)]"
          style={{ color: 'var(--t-dim)' }}
        >
          {tTrade('history')}
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="flex items-center gap-1.5 mb-7"
      >
        <TabPill active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} label={t('tabs.friends')} count={friends.length} />
        <TabPill active={activeTab === 'requests'} onClick={() => setActiveTab('requests')} label={t('tabs.requests')} count={incomingRequests.length} alert={incomingRequests.length > 0} />
        <TabPill active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} label={t('tabs.activity')} />
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'friends' && (
            <>
              {friendsLoading ? (
                <SkeletonRows count={5} />
              ) : friends.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-3">
                  <img src="/images/icons/empty-friends.svg" alt="" draggable={false} style={{ width: 48, height: 48, opacity: 0.25 }} />
                  <p className="font-display text-sm text-center uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                    {t('list.empty')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {friends.map((f, i) => (
                    <FriendCard
                      key={f.friendshipId}
                      friend={f}
                      index={i}
                      leaguesEnabled={leaguesEnabled}
                      expanded={expandedId === f.id}
                      onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
                      onInvite={() => sendMatchInvite(f.id)}
                      onTrade={() => handleTrade(f.id)}
                      onMessage={() => {
                        if (session?.user?.id) useDmStore.getState().openThread(session.user.id, { userId: f.id, username: f.username });
                      }}
                      tradeLabel={tTrade('invite')}
                      onRemove={() => {
                        removeFriend(f.friendshipId);
                        setFriends(prev => prev.filter(p => p.friendshipId !== f.friendshipId));
                      }}
                      t={t}
                      tStats={tStats}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'requests' && <FriendRequestsList />}

          {activeTab === 'activity' && (
            <>
              {activityLoading ? (
                <SkeletonRows count={6} />
              ) : !activity || activity.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-3">
                  <img src="/images/icons/empty-games.svg" alt="" draggable={false} style={{ width: 48, height: 48, opacity: 0.25 }} />
                  <p className="font-display text-sm text-center uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                    {t('activityEmpty')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {activity.map((e, i) => (
                    <ActivityRow key={`${e.friendId}-${e.at}-${i}`} entry={e} index={i} locale={locale} t={t} />
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
