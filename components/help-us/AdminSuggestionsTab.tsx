'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '@/stores/toastStore';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

const ACCENT = '#c4a35a';
const NOTE_MAX = 1000;

type Status = 'open' | 'planned' | 'in_progress' | 'to_fix' | 'done' | 'rejected';
type Category = 'bug' | 'feature' | 'balance' | 'ui' | 'other';

interface AdminSuggestionRow {
  id: string;
  userId: string;
  username: string;
  category: string;
  title: string;
  body: string;
  status: string;
  voteCount: number;
  adminNote: string | null;
  hasVoted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  rows: AdminSuggestionRow[];
  nextCursor: string | null;
  totalsByStatus: Record<Status, number>;
}

const STATUSES: Status[] = ['open', 'planned', 'in_progress', 'to_fix', 'done', 'rejected'];
const CATEGORIES: Category[] = ['bug', 'feature', 'balance', 'ui', 'other'];

function formatDateTime(iso: string, bcp47: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat(bcp47, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function AdminSuggestionsTab() {
  const t = useTranslations('helpUs.admin.suggestion');
  const tStatus = useTranslations('helpUs.suggestions.status');
  const tCategory = useTranslations('helpUs.suggestions.category');
  const tAdmin = useTranslations('helpUs.admin');
  const tMeta = useTranslations('_meta');
  const showToast = useToastStore((s) => s.showToast);

  const [filterCategory, setFilterCategory] = useState<Category | ''>('');
  const [filterStatus, setFilterStatus] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<AdminSuggestionRow[]>([]);
  const [totals, setTotals] = useState<Record<Status, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [noteSaveState, setNoteSaveState] = useState<Record<string, 'saving' | 'saved' | null>>({});
  const reqIdRef = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchList = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const sp = new URLSearchParams();
      sp.set('sort', 'status');
      sp.set('limit', '100');
      if (filterCategory) sp.set('category', filterCategory);
      if (filterStatus) sp.set('status', filterStatus);
      if (debouncedSearch.trim()) sp.set('q', debouncedSearch.trim());
      const res = await fetch(`/api/suggestions?${sp.toString()}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch');
      const json = (await res.json()) as ListResponse;
      if (myReq !== reqIdRef.current) return;
      setRows(json.rows);
      setTotals(json.totalsByStatus);
    } catch {
      if (myReq !== reqIdRef.current) return;
      setError(true);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [filterCategory, filterStatus, debouncedSearch]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onChangeStatus = useCallback(async (id: string, next: Status) => {
    setUpdatingStatusId(id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('patch');
      showToast({ type: 'success', messageKey: 'helpUs.admin.suggestion.toastStatusChanged', dedupeKey: 'admin-status-changed' });
      fetchList();
    } catch {
      showToast({ type: 'error', messageKey: 'helpUs.admin.suggestion.toastError', dedupeKey: 'admin-error' });
      fetchList();
    } finally {
      setUpdatingStatusId(null);
    }
  }, [fetchList, showToast]);

  const onSaveNote = useCallback(async (id: string, note: string) => {
    setNoteSaveState((prev) => ({ ...prev, [id]: 'saving' }));
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: note }),
      });
      if (!res.ok) throw new Error('patch');
      setNoteSaveState((prev) => ({ ...prev, [id]: 'saved' }));
      setTimeout(() => {
        setNoteSaveState((prev) => ({ ...prev, [id]: null }));
      }, 1500);
    } catch {
      setNoteSaveState((prev) => ({ ...prev, [id]: null }));
      showToast({ type: 'error', messageKey: 'helpUs.admin.suggestion.toastError', dedupeKey: 'admin-note-error' });
    }
  }, [showToast]);

  const onConfirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 204) throw new Error('delete');
      setRows((prev) => prev.filter((r) => r.id !== id));
      showToast({ type: 'success', messageKey: 'helpUs.admin.suggestion.toastDeleted', dedupeKey: 'admin-deleted' });
    } catch {
      showToast({ type: 'error', messageKey: 'helpUs.admin.suggestion.toastError', dedupeKey: 'admin-delete-error' });
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, showToast]);

  const pendingDeleteTitle = useMemo(() => {
    if (!pendingDeleteId) return '';
    return rows.find((r) => r.id === pendingDeleteId)?.title ?? '';
  }, [pendingDeleteId, rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus((cur) => (cur === s ? '' : s))}
            className="rounded-md px-3 py-2 flex flex-col items-start gap-0.5 text-left transition-opacity"
            style={{
              backgroundColor: filterStatus === s ? 'rgba(196,163,90,0.18)' : 'rgba(255,255,255,0.04)',
              color: filterStatus === s ? ACCENT : '#e8e8e8',
            }}
          >
            <span className="font-display text-base tracking-wider">{totals?.[s] ?? 0}</span>
            <span className="font-body text-[10px] uppercase tracking-widest" style={{ color: '#888' }}>
              {tStatus(s)}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as Category | '')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <option value="">{t('filterAll')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{tCategory(c)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as Status | '')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <option value="">{t('filterAll')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{tStatus(s)}</option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </div>

      {error ? (
        <p className="text-sm font-body py-4" style={{ color: '#d47f7f' }}>{tAdmin('error.loadFailed')}</p>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-md animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      ) : !rows.length ? (
        <p className="text-sm font-body py-6 text-center" style={{ color: '#888' }}>{tAdmin('donations.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.article
                key={r.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="rounded-md p-3 sm:p-4 flex flex-col gap-3"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-display text-sm sm:text-base" style={{ color: '#e8e8e8' }}>
                        {r.title}
                      </h4>
                      <span
                        className="font-display text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm"
                        style={{ backgroundColor: 'rgba(196,163,90,0.10)', color: ACCENT }}
                      >
                        {tCategory(r.category as Category)}
                      </span>
                    </div>
                    <p className="font-body text-[12px] mb-1" style={{ color: '#888' }}>
                      {r.username} · {formatDateTime(r.createdAt, tMeta('bcp47'))} · {r.voteCount} votes
                    </p>
                    <p className="font-body text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#bbb' }}>
                      {r.body}
                    </p>
                  </div>

                  <div className="flex flex-row sm:flex-col items-stretch gap-2 sm:w-44 shrink-0">
                    <select
                      value={r.status}
                      onChange={(e) => onChangeStatus(r.id, e.target.value as Status)}
                      disabled={updatingStatusId === r.id}
                      className="px-2 py-1.5 rounded-md font-body text-xs focus:outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
                      aria-label={t('editStatus')}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{tStatus(s)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(r.id)}
                      className="font-display uppercase text-[10px] tracking-widest px-3 py-2 rounded-md"
                      style={{ backgroundColor: 'rgba(212,127,127,0.12)', color: '#d47f7f' }}
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-body text-[10px] uppercase tracking-widest" style={{ color: '#666' }}>
                    {t('note')}
                    {noteSaveState[r.id] === 'saving' && (
                      <span className="ml-2 italic normal-case" style={{ color: '#888' }}>
                        {t('noteSaving')}
                      </span>
                    )}
                    {noteSaveState[r.id] === 'saved' && (
                      <span className="ml-2 italic normal-case" style={{ color: '#7fd49d' }}>
                        {t('noteSaved')}
                      </span>
                    )}
                  </label>
                  <textarea
                    defaultValue={r.adminNote ?? ''}
                    maxLength={NOTE_MAX}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if ((r.adminNote ?? '') !== v) onSaveNote(r.id, v);
                    }}
                    placeholder={t('notePlaceholder')}
                    rows={2}
                    className="px-2 py-1.5 rounded-md font-body text-xs focus:outline-none resize-none"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#bbb', border: '1px solid rgba(255,255,255,0.08)' }}
                  />
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!pendingDeleteId}
        title={t('confirmTitle')}
        body={`${pendingDeleteTitle ? `"${pendingDeleteTitle}". ` : ''}${t('confirmBody')}`}
        cancelLabel={t('confirmCancel')}
        confirmLabel={t('confirmCta')}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={onConfirmDelete}
        loading={!!deletingId}
      />
    </div>
  );
}
