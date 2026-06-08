'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { useToastStore } from '@/stores/toastStore';
import { SuggestionCard, type SuggestionRow } from './SuggestionCard';
import { SuggestionFormModal } from './SuggestionFormModal';

const ACCENT = '#c4a35a';
const PAGE_LIMIT = 20;

type Status = 'open' | 'planned' | 'in_progress' | 'to_fix' | 'done' | 'rejected';
type Category = 'bug' | 'feature' | 'balance' | 'ui' | 'other';
type Sort = 'votes' | 'recent' | 'status';

interface Filters {
  category: Category | '';
  status: Status | '';
  q: string;
  sort: Sort;
}

interface ListResponse {
  rows: SuggestionRow[];
  nextCursor: string | null;
  totalsByStatus: Record<Status, number>;
}

const DEFAULT_FILTERS: Filters = { category: '', status: '', q: '', sort: 'votes' };

function buildQuery(filters: Filters, cursor: string | null): string {
  const params = new URLSearchParams();
  params.set('sort', filters.sort);
  params.set('limit', String(PAGE_LIMIT));
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function SuggestionsSection() {
  const t = useTranslations('helpUs.suggestions');
  const { data: session, status: sessionStatus } = useSession();
  const showToast = useToastStore((s) => s.showToast);
  const isLoggedIn = sessionStatus === 'authenticated' && !!session?.user;

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(id);
  }, [filters.q]);

  const effectiveFilters = useMemo<Filters>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const fetchList = useCallback(async (resetList: boolean, cursor: string | null) => {
    const myReq = ++reqIdRef.current;
    if (resetList) {
      setLoadingInitial(true);
      setError(false);
    } else {
      setLoadingMore(true);
    }
    try {
      const qs = buildQuery(effectiveFilters, cursor);
      const res = await fetch(`/api/suggestions?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch failed');
      const data: ListResponse = await res.json();
      if (myReq !== reqIdRef.current) return;
      setRows((prev) => (resetList ? data.rows : [...prev, ...data.rows]));
      setNextCursor(data.nextCursor);
    } catch {
      if (myReq !== reqIdRef.current) return;
      setError(true);
    } finally {
      if (myReq === reqIdRef.current) {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    }
  }, [effectiveFilters]);

  useEffect(() => {
    fetchList(true, null);
  }, [fetchList]);

  const onVoteToggle = useCallback(async (id: string) => {
    if (!isLoggedIn || votingId) return;
    setVotingId(id);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, hasVoted: !r.hasVoted, voteCount: r.voteCount + (r.hasVoted ? -1 : 1) }
          : r,
      ),
    );
    try {
      const res = await fetch(`/api/suggestions/${id}/vote`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, hasVoted: !r.hasVoted, voteCount: r.voteCount + (r.hasVoted ? -1 : 1) }
              : r,
          ),
        );
        showToast({
          type: 'error',
          messageKey: typeof data?.errorKey === 'string' ? data.errorKey : 'helpUs.suggestions.error.voteFailed',
          dedupeKey: 'suggestion-vote-failed',
        });
      } else if (typeof data?.voteCount === 'number') {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, voteCount: data.voteCount, hasVoted: !!data.hasVoted } : r,
          ),
        );
      }
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, hasVoted: !r.hasVoted, voteCount: r.voteCount + (r.hasVoted ? -1 : 1) }
            : r,
        ),
      );
      showToast({
        type: 'error',
        messageKey: 'helpUs.suggestions.error.voteFailed',
        dedupeKey: 'suggestion-vote-failed',
      });
    } finally {
      setVotingId(null);
    }
  }, [isLoggedIn, votingId, showToast]);

  const onCreate = useCallback(async (data: { category: Category; title: string; body: string }): Promise<{ ok: boolean; errorKey?: string }> => {
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 201) {
        showToast({ type: 'success', messageKey: 'helpUs.suggestions.toast.created', dedupeKey: 'suggestion-created' });
        await fetchList(true, null);
        return { ok: true };
      }
      const errorKey = typeof json?.errorKey === 'string' ? json.errorKey : 'helpUs.suggestions.error.voteFailed';
      showToast({ type: 'error', messageKey: errorKey, dedupeKey: `suggestion-${errorKey}` });
      return { ok: false, errorKey };
    } catch {
      showToast({ type: 'error', messageKey: 'helpUs.suggestions.error.voteFailed', dedupeKey: 'suggestion-net' });
      return { ok: false };
    }
  }, [fetchList, showToast]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedQ('');
  }, []);

  const onChangeFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <section
      className="relative rounded-lg p-5 sm:p-8 mx-auto w-full mt-8 sm:mt-12"
      style={{
        backgroundColor: 'rgba(20,20,24,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <h2
        className="font-display text-2xl sm:text-3xl tracking-[0.2em] mb-3 uppercase text-center"
        style={{ color: ACCENT }}
      >
        {t('sectionTitle')}
      </h2>
      <p
        className="font-body text-sm leading-relaxed mb-6 text-center"
        style={{ color: 'rgba(232,232,232,0.85)' }}
      >
        {t('intro')}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="font-display uppercase text-xs tracking-widest px-4 py-2.5 rounded-md self-start"
            style={{ backgroundColor: ACCENT, color: '#0a0a0a' }}
          >
            {t('newButton')}
          </button>
        ) : (
          <p className="font-body text-sm" style={{ color: '#888' }}>
            {t('loginPrompt')}{' '}
            <Link href="/login" className="underline" style={{ color: ACCENT }}>
              {t('loginLink')}
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-5">
        <select
          value={filters.category}
          onChange={(e) => onChangeFilter('category', e.target.value as Filters['category'])}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label={t('filterCategory')}
        >
          <option value="">{t('filterCategoryAll')}</option>
          {(['bug', 'feature', 'balance', 'ui', 'other'] as Category[]).map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => onChangeFilter('status', e.target.value as Filters['status'])}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label={t('filterStatus')}
        >
          <option value="">{t('filterStatusAll')}</option>
          {(['open', 'planned', 'in_progress', 'to_fix', 'done', 'rejected'] as Status[]).map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>

        <select
          value={filters.sort}
          onChange={(e) => onChangeFilter('sort', e.target.value as Filters['sort'])}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label={t('sort')}
        >
          <option value="votes">{t('sortVotes')}</option>
          <option value="recent">{t('sortRecent')}</option>
          <option value="status">{t('sortStatus')}</option>
        </select>

        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChangeFilter('q', e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label={t('search')}
        />
      </div>

      {error ? (
        <div className="py-12 flex flex-col items-center gap-4">
          <p className="font-body text-sm" style={{ color: '#888' }}>
            {t('loadError')}
          </p>
          <button
            type="button"
            onClick={() => fetchList(true, null)}
            className="font-display uppercase text-xs tracking-widest px-4 py-2 rounded-md"
            style={{ backgroundColor: 'rgba(196,163,90,0.15)', color: ACCENT }}
          >
            {t('retry')}
          </button>
        </div>
      ) : loadingInitial ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-md p-4 h-32 animate-pulse"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-4">
          <p className="font-body text-sm" style={{ color: '#888' }}>
            {t('empty')}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="font-display uppercase text-xs tracking-widest px-4 py-2 rounded-md"
            style={{ backgroundColor: 'rgba(196,163,90,0.15)', color: ACCENT }}
          >
            {t('resetFilters')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
              >
                <SuggestionCard
                  row={r}
                  canVote={isLoggedIn}
                  onVoteToggle={onVoteToggle}
                  isVoting={votingId === r.id}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => fetchList(false, nextCursor)}
                disabled={loadingMore}
                className="font-display uppercase text-xs tracking-widest px-5 py-2.5 rounded-md transition-opacity"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: '#e8e8e8',
                  opacity: loadingMore ? 0.5 : 1,
                  cursor: loadingMore ? 'wait' : 'pointer',
                }}
              >
                {loadingMore ? t('loadingMore') : t('loadMore')}
              </button>
            </div>
          )}
        </div>
      )}

      <SuggestionFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCreate}
      />
    </section>
  );
}
