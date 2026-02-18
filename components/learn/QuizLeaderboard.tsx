'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

// =====================================================================
// CONSTANTS
// =====================================================================

const GOLD = '#c4a35a';
const DARK_BG = '#0a0a0a';
const PANEL_BG = '#111111';
const BORDER = '#262626';
const TEXT_LIGHT = '#cccccc';
const TEXT_DIM = '#888888';

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#3e8b3e',
  2: '#5a8bbf',
  3: '#c4a35a',
  4: '#b33e3e',
  5: '#6a6abb',
};

// =====================================================================
// TYPES
// =====================================================================

interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  accuracy: number;
  difficulty: number;
  date: string;
}

type FilterTab = 'all' | 1 | 2 | 3 | 4 | 5;

const FILTER_TABS: FilterTab[] = ['all', 1, 2, 3, 4, 5];

// =====================================================================
// COMPONENT
// =====================================================================

export function QuizLeaderboard() {
  const t = useTranslations('learn');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchLeaderboard = useCallback(async (filter: FilterTab) => {
    setLoading(true);
    setError(false);
    try {
      const diffParam = filter === 'all' ? 'all' : String(filter);
      const res = await fetch(
        `/api/quiz/leaderboard?difficulty=${diffParam}&limit=50`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntries(data.entries || []);
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

  const handleTabChange = useCallback((tab: FilterTab) => {
    setActiveTab(tab);
  }, []);

  const getTabLabel = (tab: FilterTab): string => {
    if (tab === 'all') return t('quiz.leaderboard.all');
    return t(`quiz.difficulties.${tab}`);
  };

  const getTabColor = (tab: FilterTab): string => {
    if (tab === 'all') return GOLD;
    return DIFFICULTY_COLORS[tab] ?? GOLD;
  };

  return (
    <div className="w-full">
      {/* Title */}
      <h2
        className="text-lg font-bold uppercase tracking-wider mb-2"
        style={{ color: GOLD }}
      >
        {t('quiz.leaderboard.title')}
      </h2>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const color = getTabColor(tab);

          return (
            <button
              key={String(tab)}
              onClick={() => handleTabChange(tab)}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: isActive
                  ? 'rgba(196, 163, 90, 0.1)'
                  : 'transparent',
                border: `1px solid ${isActive ? color : BORDER}`,
                borderRadius: '4px',
                color: isActive ? color : TEXT_DIM,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {getTabLabel(tab)}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="grid gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider"
          style={{
            backgroundColor: '#141414',
            color: TEXT_DIM,
            gridTemplateColumns: '30px 1fr 60px 50px 64px 70px',
          }}
        >
          <span>{t('quiz.leaderboard.rank')}</span>
          <span>{t('quiz.leaderboard.player')}</span>
          <span className="text-right">{t('quiz.leaderboard.score')}</span>
          <span className="text-right">
            {t('quiz.leaderboard.accuracy')}
          </span>
          <span className="text-center">
            {t('quiz.leaderboard.difficulty')}
          </span>
          <span className="text-right">{t('quiz.leaderboard.date')}</span>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-8 text-center"
            >
              <span className="text-sm" style={{ color: TEXT_DIM }}>
                {t('quiz.leaderboard.loading')}
              </span>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-8 text-center"
            >
              <span className="text-sm" style={{ color: '#b33e3e' }}>
                {t('quiz.leaderboard.error')}
              </span>
            </motion.div>
          ) : entries.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-8 text-center"
            >
              <span className="text-sm" style={{ color: TEXT_DIM }}>
                {t('quiz.leaderboard.empty')}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="entries"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {entries.map((entry, index) => {
                const isTop3 = index < 3;
                const diffColor =
                  DIFFICULTY_COLORS[entry.difficulty] ?? GOLD;

                const dateStr = (() => {
                  try {
                    const d = new Date(entry.date);
                    return d.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });
                  } catch {
                    return entry.date;
                  }
                })();

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="grid gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm"
                    style={{
                      borderTop: `1px solid ${BORDER}`,
                      gridTemplateColumns:
                        '30px 1fr 60px 50px 64px 70px',
                      backgroundColor: isTop3
                        ? 'rgba(196, 163, 90, 0.03)'
                        : 'transparent',
                    }}
                  >
                    {/* Rank */}
                    <span
                      className="font-bold"
                      style={{ color: isTop3 ? GOLD : TEXT_DIM }}
                    >
                      {index + 1}
                    </span>

                    {/* Player */}
                    <span
                      className="truncate"
                      style={{ color: TEXT_LIGHT }}
                    >
                      {entry.username}
                    </span>

                    {/* Score */}
                    <span
                      className="text-right font-bold"
                      style={{ color: isTop3 ? GOLD : TEXT_LIGHT }}
                    >
                      {entry.score}
                    </span>

                    {/* Accuracy */}
                    <span
                      className="text-right"
                      style={{ color: TEXT_DIM }}
                    >
                      {entry.accuracy}%
                    </span>

                    {/* Difficulty badge */}
                    <div className="flex justify-center">
                      <span
                        className="inline-block px-2 py-0.5 text-xs font-bold uppercase"
                        style={{
                          color: diffColor,
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: `1px solid ${diffColor}`,
                          borderRadius: '3px',
                          lineHeight: '1.4',
                        }}
                      >
                        {t(`quiz.difficulties.${entry.difficulty}`)}
                      </span>
                    </div>

                    {/* Date */}
                    <span
                      className="text-right"
                      style={{ color: TEXT_DIM }}
                    >
                      {dateStr}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
