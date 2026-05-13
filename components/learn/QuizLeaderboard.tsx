'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useSession } from 'next-auth/react';

const GOLD = '#c4a35a';
const SILVER = '#c0c0c0';
const BRONZE = '#a87440';
const BORDER = '#262626';
const TEXT_LIGHT = '#e0e0e0';
const TEXT_DIM = '#888888';
const TEXT_FAINT = '#555555';

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#3e8b3e',
  2: '#5a8bbf',
  3: '#c4a35a',
  4: '#b33e3e',
  5: '#9070d0',
};

interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  accuracy: number;
  difficulty: number;
  correct: number;
  total: number;
  bestStreak: number;
  completedAt: string;
}

type FilterTab = 'all' | 1 | 2 | 3 | 4 | 5;

const FILTER_TABS: FilterTab[] = ['all', 1, 2, 3, 4, 5];

function entryKey(e: LeaderboardEntry, idx: number): string {
  return `${e.username}-${e.difficulty}-${e.score}-${idx}`;
}

function podiumColor(rank: number): string {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return TEXT_DIM;
}

function formatPercent(accuracy: number): string {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) return '-';
  return `${Math.round(accuracy * 100)}%`;
}

function formatDate(iso: string, locale: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  } catch {
    return '-';
  }
}

export function QuizLeaderboard() {
  const t = useTranslations('learn');
  const locale = useLocale();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const myUsername = (session?.user as { name?: string })?.name ?? null;

  const fetchLeaderboard = useCallback(async (filter: FilterTab) => {
    setLoading(true);
    setError(false);
    try {
      const diffParam = filter === 'all' ? 'all' : String(filter);
      const res = await fetch(`/api/quiz/leaderboard?difficulty=${diffParam}&limit=50`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setError(true);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard(activeTab);
  }, [activeTab, fetchLeaderboard]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const getTabLabel = (tab: FilterTab): string =>
    tab === 'all' ? t('quiz.leaderboard.all') : t(`quiz.difficulties.${tab}`);

  const getTabColor = (tab: FilterTab): string =>
    tab === 'all' ? GOLD : (DIFFICULTY_COLORS[tab] ?? GOLD);

  return (
    <div className="w-full">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-base sm:text-lg md:text-xl font-bold uppercase tracking-[0.15em] sm:tracking-[0.25em] text-center sm:text-left mb-3"
        style={{ color: GOLD }}
      >
        {t('quiz.leaderboard.title')}
      </motion.h2>

      <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mb-4">
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const color = getTabColor(tab);
          return (
            <button
              key={String(tab)}
              onClick={() => setActiveTab(tab)}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: isActive ? 'rgba(196, 163, 90, 0.1)' : 'transparent',
                border: `1px solid ${isActive ? color : BORDER}`,
                borderRadius: '4px',
                color: isActive ? color : TEXT_DIM,
                cursor: 'pointer',
                outline: 'none',
                minWidth: '52px',
              }}
            >
              {getTabLabel(tab)}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-12 text-center text-sm"
            style={{ color: TEXT_DIM }}
          >
            {t('quiz.leaderboard.loading')}
          </motion.div>
        )}

        {!loading && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-12 text-center text-sm"
            style={{ color: '#b33e3e' }}
          >
            {t('quiz.leaderboard.error')}
          </motion.div>
        )}

        {!loading && !error && entries.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-12 text-center text-sm"
            style={{ color: TEXT_DIM }}
          >
            {t('quiz.leaderboard.empty')}
          </motion.div>
        )}

        {!loading && !error && entries.length > 0 && (
          <motion.div
            key="data"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {top3.length > 0 && (
              <PodiumSection top3={top3} myUsername={myUsername} locale={locale} t={t} />
            )}

            {rest.length > 0 && (
              <RestSection rest={rest} myUsername={myUsername} locale={locale} t={t} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SectionProps {
  myUsername: string | null;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}

interface PodiumSectionProps extends SectionProps {
  top3: LeaderboardEntry[];
}

function PodiumSection({ top3, myUsername, locale, t }: PodiumSectionProps) {
  const order = useMemo(() => {
    const slots: Array<{ entry: LeaderboardEntry; rank: number; heightClass: string; mobileOrder: number } | null> = [null, null, null];
    top3.forEach((entry, idx) => {
      const rank = idx + 1;
      const heightClass = rank === 1 ? 'min-h-[140px] sm:min-h-[160px]' : rank === 2 ? 'min-h-[120px] sm:min-h-[140px]' : 'min-h-[110px] sm:min-h-[125px]';
      slots[idx] = { entry, rank, heightClass, mobileOrder: rank };
    });
    const second = slots[1];
    const first = slots[0];
    const third = slots[2];
    return { first, second, third };
  }, [top3]);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 items-end">
        {order.second && <PodiumCard {...order.second} myUsername={myUsername} locale={locale} t={t} order={2} />}
        {order.first && <PodiumCard {...order.first} myUsername={myUsername} locale={locale} t={t} order={1} />}
        {order.third && <PodiumCard {...order.third} myUsername={myUsername} locale={locale} t={t} order={3} />}
      </div>
    </div>
  );
}

interface PodiumCardProps extends SectionProps {
  entry: LeaderboardEntry;
  rank: number;
  heightClass: string;
  order: number;
}

function PodiumCard({ entry, rank, heightClass, order, myUsername, locale, t }: PodiumCardProps) {
  const color = podiumColor(rank);
  const isMe = myUsername === entry.username;
  const diffColor = DIFFICULTY_COLORS[entry.difficulty] ?? GOLD;
  const visualOrder = order === 1 ? 'sm:order-2' : order === 2 ? 'sm:order-1' : 'sm:order-3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + order * 0.08, duration: 0.4 }}
      className={`relative flex flex-col items-center justify-end ${heightClass} ${visualOrder} px-3 py-3 sm:py-4`}
      style={{
        backgroundColor: '#111111',
        border: `1px solid ${color}`,
        borderTop: `3px solid ${color}`,
        borderRadius: '6px',
        boxShadow: rank === 1 ? '0 0 24px -8px rgba(196, 163, 90, 0.4)' : 'none',
      }}
    >
      <div
        className="flex items-center justify-center mb-2"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.4)',
          border: `2px solid ${color}`,
          color,
          fontWeight: 'bold',
          fontSize: '15px',
        }}
      >
        {rank}
      </div>

      <div
        className="text-center font-bold truncate w-full"
        style={{ color: isMe ? color : TEXT_LIGHT, fontSize: rank === 1 ? '15px' : '13px' }}
        title={entry.username}
      >
        {entry.username}
        {isMe && (
          <span
            className="ml-1 inline-block px-1 py-0.5 text-[8px] uppercase tracking-wider align-middle"
            style={{ color, border: `1px solid ${color}`, borderRadius: '2px' }}
          >
            {t('quiz.leaderboard.you')}
          </span>
        )}
      </div>

      <div
        className="text-center font-bold tabular-nums my-1"
        style={{ color, fontSize: rank === 1 ? '22px' : '18px' }}
      >
        {entry.score}
      </div>

      <div className="flex items-center justify-center gap-2 text-[10px]" style={{ color: TEXT_DIM }}>
        <span className="tabular-nums">{formatPercent(entry.accuracy)}</span>
        <span style={{ color: TEXT_FAINT }}>·</span>
        <span className="tabular-nums">{entry.correct}/{entry.total}</span>
      </div>

      <div
        className="mt-1 inline-block px-2 py-0.5 text-[9px] uppercase font-bold"
        style={{
          color: diffColor,
          border: `1px solid ${diffColor}`,
          borderRadius: '3px',
          lineHeight: '1.3',
        }}
      >
        {t(`quiz.difficulties.${entry.difficulty}`)}
      </div>

      <div className="mt-1 text-[9px]" style={{ color: TEXT_FAINT }}>
        {formatDate(entry.completedAt, locale)}
      </div>
    </motion.div>
  );
}

interface RestSectionProps extends SectionProps {
  rest: LeaderboardEntry[];
}

function RestSection({ rest, myUsername, locale, t }: RestSectionProps) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: '#0f0f0f',
      }}
    >
      <div
        className="hidden md:grid gap-2 px-4 py-2 text-[10px] uppercase tracking-wider"
        style={{
          backgroundColor: '#141414',
          color: TEXT_DIM,
          gridTemplateColumns: '40px 1fr 80px 60px 80px 80px 60px',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span>{t('quiz.leaderboard.rank')}</span>
        <span>{t('quiz.leaderboard.player')}</span>
        <span className="text-right">{t('quiz.leaderboard.score')}</span>
        <span className="text-right">{t('quiz.leaderboard.accuracy')}</span>
        <span className="text-right">{t('quiz.leaderboard.questions')}</span>
        <span className="text-center">{t('quiz.leaderboard.difficulty')}</span>
        <span className="text-right">{t('quiz.leaderboard.date')}</span>
      </div>

      {rest.map((entry, i) => {
        const isMe = myUsername === entry.username;
        const diffColor = DIFFICULTY_COLORS[entry.difficulty] ?? GOLD;
        const rowBg = isMe ? 'rgba(196, 163, 90, 0.08)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
        const rowBorder = isMe ? GOLD : BORDER;

        return (
          <motion.div
            key={entryKey(entry, i + 3)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.025, duration: 0.25 }}
            className="border-t md:grid flex flex-col gap-1 md:gap-2 px-3 md:px-4 py-2.5 md:py-2"
            style={{
              borderColor: rowBorder,
              backgroundColor: rowBg,
              gridTemplateColumns: '40px 1fr 80px 60px 80px 80px 60px',
            }}
          >
            <div className="flex md:contents items-center gap-2">
              <span
                className="font-bold tabular-nums text-sm md:text-xs"
                style={{ color: isMe ? GOLD : TEXT_DIM, minWidth: '28px' }}
              >
                {entry.rank}
              </span>
              <span
                className="flex-1 truncate text-sm md:text-xs"
                style={{ color: isMe ? GOLD : TEXT_LIGHT, fontWeight: isMe ? 600 : 500 }}
                title={entry.username}
              >
                {entry.username}
                {isMe && (
                  <span
                    className="ml-1 inline-block px-1 py-0.5 text-[9px] uppercase tracking-wider align-middle"
                    style={{ color: GOLD, border: `1px solid ${GOLD}`, borderRadius: '2px' }}
                  >
                    {t('quiz.leaderboard.you')}
                  </span>
                )}
              </span>
              <span
                className="md:hidden font-bold tabular-nums text-base"
                style={{ color: isMe ? GOLD : TEXT_LIGHT }}
              >
                {entry.score}
              </span>
            </div>

            <span className="hidden md:block text-right font-bold tabular-nums text-sm" style={{ color: isMe ? GOLD : TEXT_LIGHT }}>
              {entry.score}
            </span>
            <span className="hidden md:block text-right tabular-nums text-xs" style={{ color: TEXT_DIM }}>
              {formatPercent(entry.accuracy)}
            </span>
            <span className="hidden md:block text-right tabular-nums text-xs" style={{ color: TEXT_DIM }}>
              {entry.correct}/{entry.total}
            </span>
            <div className="hidden md:flex justify-center items-center">
              <span
                className="inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold"
                style={{ color: diffColor, border: `1px solid ${diffColor}`, borderRadius: '3px' }}
              >
                {t(`quiz.difficulties.${entry.difficulty}`)}
              </span>
            </div>
            <span className="hidden md:block text-right tabular-nums text-xs" style={{ color: TEXT_DIM }}>
              {formatDate(entry.completedAt, locale)}
            </span>

            <div className="md:hidden flex items-center justify-between text-[11px]" style={{ color: TEXT_DIM }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold"
                  style={{ color: diffColor, border: `1px solid ${diffColor}`, borderRadius: '3px' }}
                >
                  {t(`quiz.difficulties.${entry.difficulty}`)}
                </span>
                <span className="tabular-nums">{formatPercent(entry.accuracy)}</span>
                <span style={{ color: TEXT_FAINT }}>·</span>
                <span className="tabular-nums">{entry.correct}/{entry.total}</span>
              </div>
              <span className="tabular-nums">{formatDate(entry.completedAt, locale)}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
