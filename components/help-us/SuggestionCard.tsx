'use client';

import { useState, memo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

export interface SuggestionRow {
  id: string;
  userId: string;
  username: string;
  category: string;
  title: string;
  body: string;
  status: string;
  voteCount: number;
  hasVoted: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  open: { text: '#9ca3af', bg: 'transparent' },
  planned: { text: '#7fa3d4', bg: 'rgba(127,163,212,0.10)' },
  in_progress: { text: '#c4a35a', bg: 'rgba(196,163,90,0.12)' },
  to_fix: { text: '#d4a87f', bg: 'rgba(212,168,127,0.12)' },
  done: { text: '#7fd49d', bg: 'rgba(127,212,157,0.10)' },
  rejected: { text: '#d47f7f', bg: 'rgba(212,127,127,0.10)' },
};

const TRUNCATE_AT = 200;

function relativeDate(iso: string, locale: string, now: number = Date.now()): { key: string; count?: number } {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return { key: 'now' };
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return { key: 'now' };
  if (minutes < 60) return { key: 'minutesAgo', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'hoursAgo', count: hours };
  const days = Math.floor(hours / 24);
  return { key: 'daysAgo', count: days };
  void locale;
}

interface Props {
  row: SuggestionRow;
  canVote: boolean;
  onVoteToggle: (id: string) => void;
  isVoting: boolean;
}

function SuggestionCardImpl({ row, canVote, onVoteToggle, isVoting }: Props) {
  const t = useTranslations('helpUs.suggestions');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  const status = STATUS_COLORS[row.status] ?? STATUS_COLORS.open;
  const truncated = row.body.length > TRUNCATE_AT && !expanded;
  const displayBody = truncated ? `${row.body.slice(0, TRUNCATE_AT).trimEnd()}…` : row.body;

  const dateRel = relativeDate(row.createdAt, locale);
  const dateLabel = dateRel.key === 'now'
    ? t('date.now')
    : t(`date.${dateRel.key}`, { count: dateRel.count ?? 0 });

  const categoryLabel = t(`category.${row.category as 'bug' | 'feature' | 'balance' | 'ui' | 'other'}`);
  const statusLabel = t(`status.${row.status as 'open' | 'planned' | 'in_progress' | 'to_fix' | 'done' | 'rejected'}`);

  return (
    <article
      className="rounded-md p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base sm:text-lg leading-tight" style={{ color: '#e8e8e8' }}>
          {row.title}
        </h3>
        <span
          className="font-display text-[11px] uppercase tracking-widest px-2 py-1 rounded-sm whitespace-nowrap"
          style={{ backgroundColor: 'rgba(196,163,90,0.10)', color: '#c4a35a' }}
        >
          {categoryLabel}
        </span>
      </div>

      <p className="font-body text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#bbbbbb' }}>
        {displayBody}
      </p>
      {row.body.length > TRUNCATE_AT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-body text-xs underline self-start"
          style={{ color: '#888' }}
        >
          {expanded ? t('collapse') : t('expand')}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className="font-display uppercase tracking-widest px-2 py-1 rounded-sm"
          style={{ backgroundColor: status.bg, color: status.text }}
        >
          {statusLabel}
        </span>
        <span className="font-body" style={{ color: '#666' }}>
          {t('by')} {row.username}
        </span>
        <span className="font-body" style={{ color: '#555' }}>
          {dateLabel}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-sm tracking-wider" style={{ color: row.hasVoted ? '#c4a35a' : '#888' }}>
          {row.voteCount}
        </span>
        <motion.button
          type="button"
          onClick={() => canVote && !isVoting && onVoteToggle(row.id)}
          disabled={!canVote || isVoting}
          whileTap={canVote && !isVoting ? { scale: 0.96 } : undefined}
          className="font-display uppercase text-xs tracking-widest px-4 py-2 rounded-md transition-colors min-h-[44px]"
          style={{
            backgroundColor: row.hasVoted ? 'rgba(196,163,90,0.20)' : 'rgba(255,255,255,0.05)',
            color: row.hasVoted ? '#c4a35a' : '#e8e8e8',
            opacity: !canVote || isVoting ? 0.5 : 1,
            cursor: !canVote ? 'not-allowed' : isVoting ? 'wait' : 'pointer',
          }}
        >
          {row.hasVoted ? t('voted') : t('vote')}
        </motion.button>
      </div>
    </article>
  );
}

export const SuggestionCard = memo(SuggestionCardImpl);
