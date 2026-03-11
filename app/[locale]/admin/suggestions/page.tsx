'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const SUGGESTION_USERS = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

type SuggestionStatus = 'backlog' | 'planned' | 'in_progress' | 'done_unpublished' | 'done_published' | 'rejected';
type SuggestionCategory = 'gameplay' | 'ui' | 'cards' | 'balance' | 'social' | 'other';
type SuggestionPriority = 'low' | 'normal' | 'high' | 'critical';
type FilterStatus = 'all' | SuggestionStatus;
type FilterCategory = 'all' | SuggestionCategory;
type ViewMode = 'board' | 'list';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  priority: SuggestionPriority;
  images: string[];
  audioUrl: string | null;
  submittedBy: string;
  assignedTo: string | null;
  updatedBy: string | null;
  adminNotes: string | null;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_ORDER: SuggestionStatus[] = ['backlog', 'planned', 'in_progress', 'done_unpublished', 'done_published', 'rejected'];

const STATUS_CONFIG: Record<SuggestionStatus, { color: string; bg: string }> = {
  backlog: { color: '#9ca3af', bg: '#9ca3af18' },
  planned: { color: '#60a5fa', bg: '#60a5fa18' },
  in_progress: { color: '#f59e0b', bg: '#f59e0b18' },
  done_unpublished: { color: '#a78bfa', bg: '#a78bfa18' },
  done_published: { color: '#22c55e', bg: '#22c55e18' },
  rejected: { color: '#ef4444', bg: '#ef444418' },
};

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  gameplay: '#f59e0b',
  ui: '#60a5fa',
  cards: '#a78bfa',
  balance: '#22c55e',
  social: '#ec4899',
  other: '#9ca3af',
};

const PRIORITY_CONFIG: Record<SuggestionPriority, { color: string }> = {
  low: { color: '#6b7280' },
  normal: { color: '#9ca3af' },
  high: { color: '#f59e0b' },
  critical: { color: '#ef4444' },
};

export default function SuggestionsPage() {
  const t = useTranslations('suggestions');
  const tCommon = useTranslations('common');
  const { data: session } = useSession();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [showForm, setShowForm] = useState(false);
  const [detailSuggestion, setDetailSuggestion] = useState<Suggestion | null>(null);

  // Export state
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'json'>('txt');
  const [exportStatuses, setExportStatuses] = useState<Record<SuggestionStatus, boolean>>({
    backlog: true, planned: true, in_progress: true, done_unpublished: true, done_published: true, rejected: false,
  });
  const [exportSortBy, setExportSortBy] = useState<'status' | 'date' | 'priority'>('status');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState<SuggestionCategory>('other');
  const [formPriority, setFormPriority] = useState<SuggestionPriority>('normal');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formAudio, setFormAudio] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const detailImageInputRef = useRef<HTMLInputElement>(null);

  const username = session?.user?.name ?? '';
  const isAuthorized = SUGGESTION_USERS.includes(username);

  useEffect(() => {
    if (isAuthorized) fetchSuggestions();
  }, [isAuthorized]);

  async function fetchSuggestions() {
    try {
      const res = await fetch('/api/admin/suggestions');
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function createSuggestion() {
    if (!formTitle.trim() || !formDesc.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDesc,
          category: formCategory,
          priority: formPriority,
          images: formImages,
          audioUrl: formAudio,
        }),
      });
      if (res.ok) {
        resetForm();
        setShowForm(false);
        fetchSuggestions();
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  async function updateSuggestion(id: string, data: Record<string, unknown>) {
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });
      if (res.ok) {
        const result = await res.json();
        setSuggestions(prev => prev.map(s => s.id === id ? result.suggestion : s));
        if (detailSuggestion?.id === id) setDetailSuggestion(result.suggestion);
      }
    } catch { /* ignore */ }
  }

  async function deleteSuggestion(id: string) {
    try {
      const res = await fetch(`/api/admin/suggestions?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== id));
        if (detailSuggestion?.id === id) setDetailSuggestion(null);
      }
    } catch { /* ignore */ }
  }

  function resetForm() {
    setFormTitle('');
    setFormDesc('');
    setFormCategory('other');
    setFormPriority('normal');
    setFormImages([]);
    setFormAudio(null);
  }

  function toggleExportStatus(s: SuggestionStatus) {
    setExportStatuses(prev => ({ ...prev, [s]: !prev[s] }));
  }

  function buildExportData() {
    const selected = suggestions.filter(s => exportStatuses[s.status]);
    const priorityOrder: SuggestionPriority[] = ['critical', 'high', 'normal', 'low'];

    return [...selected].sort((a, b) => {
      if (exportSortBy === 'status') {
        const diff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (exportSortBy === 'date') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // priority
      const diff = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function exportData() {
    const data = buildExportData();
    if (data.length === 0) return;

    let content: string;
    let filename: string;
    let mime: string;

    if (exportFormat === 'json') {
      const jsonData = data.map(s => ({
        title: s.title,
        description: s.description,
        category: s.category,
        status: s.status,
        priority: s.priority,
        submittedBy: s.submittedBy,
        assignedTo: s.assignedTo,
        adminNotes: s.adminNotes,
        hasImages: s.images.length > 0,
        hasAudio: !!s.audioUrl,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      content = JSON.stringify(jsonData, null, 2);
      filename = `suggestions-export-${new Date().toISOString().slice(0, 10)}.json`;
      mime = 'application/json';
    } else {
      const lines: string[] = [];
      lines.push('='.repeat(70));
      lines.push(`SUGGESTIONS EXPORT - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
      lines.push(`Total: ${data.length} suggestion(s)`);
      lines.push('='.repeat(70));
      lines.push('');

      if (exportSortBy === 'status') {
        for (const status of STATUS_ORDER) {
          const group = data.filter(s => s.status === status);
          if (group.length === 0) continue;
          lines.push('-'.repeat(50));
          lines.push(`  ${t(`status.${status}`).toUpperCase()} (${group.length})`);
          lines.push('-'.repeat(50));
          lines.push('');
          for (const s of group) {
            lines.push(`  Title:    ${s.title}`);
            lines.push(`  Desc:     ${s.description}`);
            lines.push(`  Category: ${t(`category.${s.category}`)} | Priority: ${t(`priority.${s.priority}`)}`);
            lines.push(`  By:       ${s.submittedBy}, ${new Date(s.createdAt).toLocaleDateString()}`);
            if (s.assignedTo) lines.push(`  Assigned: ${s.assignedTo}`);
            if (s.adminNotes) lines.push(`  Notes:    ${s.adminNotes}`);
            if (s.images.length > 0) lines.push(`  Images:   ${s.images.length} attached`);
            if (s.audioUrl) lines.push(`  Audio:    attached`);
            lines.push('');
          }
        }
      } else {
        for (const s of data) {
          lines.push(`  [${t(`status.${s.status}`)}] ${s.title}`);
          lines.push(`  Desc:     ${s.description}`);
          lines.push(`  Category: ${t(`category.${s.category}`)} | Priority: ${t(`priority.${s.priority}`)}`);
          lines.push(`  By:       ${s.submittedBy}, ${new Date(s.createdAt).toLocaleDateString()}`);
          if (s.assignedTo) lines.push(`  Assigned: ${s.assignedTo}`);
          if (s.adminNotes) lines.push(`  Notes:    ${s.adminNotes}`);
          lines.push('');
        }
      }

      content = lines.join('\n');
      filename = `suggestions-export-${new Date().toISOString().slice(0, 10)}.txt`;
      mime = 'text/plain';
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, forDetail = false) {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 2 * 1024 * 1024) return; // 2MB max
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        if (forDetail && detailSuggestion) {
          updateSuggestion(detailSuggestion.id, { addImage: base64 });
        } else {
          setFormImages(prev => {
            if (prev.length >= 5) return prev;
            return [...prev, base64];
          });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
    const reader = new FileReader();
    reader.onload = () => setFormAudio(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(s => {
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (filterCategory !== 'all' && s.category !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !s.title.toLowerCase().includes(q) &&
          !s.description.toLowerCase().includes(q) &&
          !s.submittedBy.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [suggestions, filterStatus, filterCategory, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: suggestions.length };
    STATUS_ORDER.forEach(s => { counts[s] = 0; });
    suggestions.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return counts;
  }, [suggestions]);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a', color: '#e0e0e0' }}>
        <div className="text-center">
          <p className="text-lg font-display" style={{ color: '#ef4444' }}>{t('unauthorized')}</p>
          <Link href="/" className="mt-4 inline-block font-body text-sm" style={{ color: '#c4a35a' }}>{t('backHome')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="font-body text-sm" style={{ color: '#888' }}>{tCommon('home')}</Link>
          <span style={{ color: '#333' }}>/</span>
          <h1 className="font-display text-lg tracking-wide" style={{ color: '#c4a35a' }}>{t('title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'board' ? 'list' : 'board')}
            className="font-body text-xs px-3 py-1.5 transition-colors"
            style={{ border: '1px solid #333', color: '#aaa', backgroundColor: '#141414' }}
          >
            {viewMode === 'board' ? t('listView') : t('boardView')}
          </button>
          <button
            onClick={() => setShowExport(!showExport)}
            className="font-body text-xs px-3 py-1.5 transition-colors"
            style={{
              backgroundColor: showExport ? '#1a1a1a' : '#3b82f620',
              border: `1px solid ${showExport ? '#333' : '#3b82f6'}`,
              color: showExport ? '#999' : '#3b82f6',
            }}
          >
            {showExport ? t('closeExport') : t('export')}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="font-body text-xs px-3 py-1.5 font-medium transition-colors"
            style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
          >
            {t('newSuggestion')}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="font-body text-xs px-3 py-1.5 flex-1 min-w-[160px] max-w-[280px]"
          style={{ backgroundColor: '#141414', border: '1px solid #222', color: '#e0e0e0', outline: 'none' }}
        />
        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="font-body text-xs px-2 py-1.5"
          style={{ backgroundColor: '#141414', border: '1px solid #222', color: '#aaa', outline: 'none' }}
        >
          <option value="all">{t('status.all')} ({statusCounts.all})</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{t(`status.${s}`)} ({statusCounts[s] || 0})</option>
          ))}
        </select>
        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as FilterCategory)}
          className="font-body text-xs px-2 py-1.5"
          style={{ backgroundColor: '#141414', border: '1px solid #222', color: '#aaa', outline: 'none' }}
        >
          <option value="all">{t('category.all')}</option>
          {(['gameplay', 'ui', 'cards', 'balance', 'social', 'other'] as SuggestionCategory[]).map(c => (
            <option key={c} value={c}>{t(`category.${c}`)}</option>
          ))}
        </select>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div className="relative z-10 px-4 py-3 sm:px-6" style={{ backgroundColor: '#0d0d0d', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <h3 className="font-display text-xs tracking-wide mb-3" style={{ color: '#3b82f6' }}>{t('exportTitle')}</h3>
          <div className="flex flex-wrap items-end gap-4">
            {/* Status checkboxes */}
            <div>
              <span className="font-body text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: '#555' }}>{t('exportStatuses')}</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ORDER.map(s => {
                  const checked = exportStatuses[s];
                  return (
                    <button
                      key={s}
                      onClick={() => toggleExportStatus(s)}
                      className="font-body text-[10px] px-2 py-1"
                      style={{
                        backgroundColor: checked ? `${STATUS_CONFIG[s].color}20` : '#141414',
                        border: `1px solid ${checked ? `${STATUS_CONFIG[s].color}60` : '#222'}`,
                        color: checked ? STATUS_CONFIG[s].color : '#555',
                      }}
                    >
                      {t(`status.${s}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Sort by */}
            <div>
              <span className="font-body text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: '#555' }}>{t('exportSortBy')}</span>
              <select
                value={exportSortBy}
                onChange={e => setExportSortBy(e.target.value as 'status' | 'date' | 'priority')}
                className="font-body text-xs px-2 py-1.5"
                style={{ backgroundColor: '#141414', border: '1px solid #222', color: '#aaa', outline: 'none' }}
              >
                <option value="status">{t('sortByStatus')}</option>
                <option value="date">{t('sortByDate')}</option>
                <option value="priority">{t('sortByPriority')}</option>
              </select>
            </div>
            {/* Format */}
            <div>
              <span className="font-body text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: '#555' }}>{t('exportFormat')}</span>
              <div className="flex gap-1.5">
                {(['txt', 'json'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className="font-body text-[10px] px-3 py-1"
                    style={{
                      backgroundColor: exportFormat === fmt ? '#3b82f620' : '#141414',
                      border: `1px solid ${exportFormat === fmt ? '#3b82f660' : '#222'}`,
                      color: exportFormat === fmt ? '#3b82f6' : '#555',
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {/* Download */}
            <button
              onClick={exportData}
              disabled={!Object.values(exportStatuses).some(v => v)}
              className="font-body text-xs px-4 py-1.5 font-medium"
              style={{
                backgroundColor: Object.values(exportStatuses).some(v => v) ? '#3b82f6' : '#333',
                color: Object.values(exportStatuses).some(v => v) ? '#fff' : '#666',
              }}
            >
              {t('download')} {exportFormat.toUpperCase()} ({buildExportData().length})
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-x-auto px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="font-body text-sm" style={{ color: '#888' }}>{t('loading')}</p>
          </div>
        ) : viewMode === 'board' ? (
          /* ====== KANBAN BOARD VIEW ====== */
          <div className="flex gap-3 min-w-max pb-4">
            {STATUS_ORDER.map(status => {
              const cfg = STATUS_CONFIG[status];
              const columnItems = filteredSuggestions.filter(s => s.status === status);
              return (
                <div key={status} className="flex flex-col w-[280px] min-w-[280px]" style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}>
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `2px solid ${cfg.color}` }}>
                    <span className="font-display text-xs tracking-wide" style={{ color: cfg.color }}>{t(`status.${status}`)}</span>
                    <span className="font-body text-[10px] px-1.5 py-0.5" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      {columnItems.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    {columnItems.map(s => (
                      <SuggestionCard key={s.id} suggestion={s} t={t} onClick={() => setDetailSuggestion(s)} />
                    ))}
                    {columnItems.length === 0 && (
                      <p className="font-body text-[10px] text-center py-4" style={{ color: '#444' }}>{t('emptyColumn')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ====== LIST VIEW ====== */
          <div className="flex flex-col gap-1">
            {/* List header */}
            <div className="grid gap-2 px-3 py-2 font-body text-[10px] uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 100px 80px 80px 100px 80px', color: '#555' }}>
              <span>{t('columnTitle')}</span>
              <span>{t('columnCategory')}</span>
              <span>{t('columnPriority')}</span>
              <span>{t('columnStatus')}</span>
              <span>{t('columnSubmittedBy')}</span>
              <span>{t('columnDate')}</span>
            </div>
            {filteredSuggestions.map(s => (
              <button
                key={s.id}
                onClick={() => setDetailSuggestion(s)}
                className="grid gap-2 px-3 py-2.5 text-left transition-colors w-full"
                style={{
                  gridTemplateColumns: '1fr 100px 80px 80px 100px 80px',
                  backgroundColor: '#111',
                  border: '1px solid #1a1a1a',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#161616'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#111'; }}
              >
                <span className="font-body text-xs truncate" style={{ color: '#e0e0e0' }}>
                  {s.title}
                  {s.images.length > 0 && <span style={{ color: '#555', marginLeft: 6 }}>[{s.images.length} img]</span>}
                  {s.audioUrl && <span style={{ color: '#555', marginLeft: 4 }}>[audio]</span>}
                </span>
                <span className="font-body text-[11px]" style={{ color: CATEGORY_COLORS[s.category] }}>{t(`category.${s.category}`)}</span>
                <span className="font-body text-[11px]" style={{ color: PRIORITY_CONFIG[s.priority].color }}>{t(`priority.${s.priority}`)}</span>
                <span className="font-body text-[11px]" style={{ color: STATUS_CONFIG[s.status].color }}>{t(`status.${s.status}`)}</span>
                <span className="font-body text-[11px] truncate" style={{ color: '#888' }}>{s.submittedBy}</span>
                <span className="font-body text-[10px]" style={{ color: '#555' }}>{new Date(s.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
            {filteredSuggestions.length === 0 && (
              <p className="font-body text-sm text-center py-12" style={{ color: '#555' }}>{t('noResults')}</p>
            )}
          </div>
        )}
      </main>

      <Footer />

      {/* ====== NEW SUGGESTION MODAL ====== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4 p-5"
            style={{ backgroundColor: '#111', border: '1px solid #222' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-display text-base tracking-wide mb-4" style={{ color: '#c4a35a' }}>{t('newSuggestion')}</h2>

            {/* Title */}
            <label className="block mb-3">
              <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>{t('fieldTitle')}</span>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="w-full font-body text-sm px-3 py-2"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', outline: 'none' }}
                placeholder={t('titlePlaceholder')}
              />
            </label>

            {/* Description */}
            <label className="block mb-3">
              <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>{t('fieldDescription')}</span>
              <textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                rows={4}
                className="w-full font-body text-sm px-3 py-2 resize-y"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', outline: 'none' }}
                placeholder={t('descriptionPlaceholder')}
              />
            </label>

            {/* Category + Priority row */}
            <div className="flex gap-3 mb-3">
              <label className="flex-1">
                <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>{t('fieldCategory')}</span>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value as SuggestionCategory)}
                  className="w-full font-body text-sm px-2 py-2"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', outline: 'none' }}
                >
                  {(['gameplay', 'ui', 'cards', 'balance', 'social', 'other'] as SuggestionCategory[]).map(c => (
                    <option key={c} value={c}>{t(`category.${c}`)}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>{t('fieldPriority')}</span>
                <select
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value as SuggestionPriority)}
                  className="w-full font-body text-sm px-2 py-2"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #222', color: '#e0e0e0', outline: 'none' }}
                >
                  {(['low', 'normal', 'high', 'critical'] as SuggestionPriority[]).map(p => (
                    <option key={p} value={p}>{t(`priority.${p}`)}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Images */}
            <div className="mb-3">
              <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>
                {t('fieldImages')} ({formImages.length}/5)
              </span>
              <div className="flex flex-wrap gap-2 mb-2">
                {formImages.map((img, i) => (
                  <div key={i} className="relative w-16 h-16" style={{ border: '1px solid #222' }}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setFormImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center font-body text-[10px]"
                      style={{ backgroundColor: '#ef4444', color: '#fff' }}
                    >x</button>
                  </div>
                ))}
              </div>
              {formImages.length < 5 && (
                <>
                  <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e)} />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="font-body text-xs px-3 py-1.5"
                    style={{ border: '1px solid #333', color: '#aaa', backgroundColor: '#141414' }}
                  >{t('addImage')}</button>
                </>
              )}
            </div>

            {/* Audio */}
            <div className="mb-4">
              <span className="font-body text-[11px] uppercase tracking-wider mb-1 block" style={{ color: '#888' }}>{t('fieldAudio')}</span>
              {formAudio ? (
                <div className="flex items-center gap-2">
                  <audio controls src={formAudio} className="h-8" style={{ maxWidth: 240 }} />
                  <button
                    onClick={() => setFormAudio(null)}
                    className="font-body text-xs px-2 py-1"
                    style={{ color: '#ef4444', border: '1px solid #ef444440' }}
                  >{t('remove')}</button>
                </div>
              ) : (
                <>
                  <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="font-body text-xs px-3 py-1.5"
                    style={{ border: '1px solid #333', color: '#aaa', backgroundColor: '#141414' }}
                  >{t('addAudio')}</button>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { resetForm(); setShowForm(false); }}
                className="font-body text-xs px-4 py-2"
                style={{ border: '1px solid #333', color: '#aaa' }}
              >{t('cancel')}</button>
              <button
                onClick={createSuggestion}
                disabled={submitting || !formTitle.trim() || !formDesc.trim()}
                className="font-body text-xs px-4 py-2 font-medium"
                style={{
                  backgroundColor: submitting ? '#333' : '#c4a35a',
                  color: '#0a0a0a',
                  opacity: !formTitle.trim() || !formDesc.trim() ? 0.4 : 1,
                }}
              >{submitting ? t('submitting') : t('submit')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== DETAIL MODAL ====== */}
      {detailSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={() => { setDetailSuggestion(null); setEditingField(null); }}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 p-5"
            style={{ backgroundColor: '#111', border: '1px solid #222' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Detail header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                {editingField === 'title' ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="flex-1 font-display text-base px-2 py-1"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #c4a35a', color: '#e0e0e0', outline: 'none' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { updateSuggestion(detailSuggestion.id, { title: editValue }); setEditingField(null); }
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                    />
                    <button
                      onClick={() => { updateSuggestion(detailSuggestion.id, { title: editValue }); setEditingField(null); }}
                      className="font-body text-xs px-2 py-1"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >{t('save')}</button>
                  </div>
                ) : (
                  <h2
                    className="font-display text-base tracking-wide cursor-pointer"
                    style={{ color: '#c4a35a' }}
                    onClick={() => { setEditingField('title'); setEditValue(detailSuggestion.title); }}
                  >
                    {detailSuggestion.title}
                  </h2>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-body text-[10px]" style={{ color: '#555' }}>
                    {t('by')} {detailSuggestion.submittedBy} — {new Date(detailSuggestion.createdAt).toLocaleDateString()}
                  </span>
                  {detailSuggestion.updatedBy && (
                    <span className="font-body text-[10px]" style={{ color: '#444' }}>
                      ({t('updatedBy')} {detailSuggestion.updatedBy})
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setDetailSuggestion(null); setEditingField(null); }}
                className="font-body text-sm px-2 py-1 ml-3"
                style={{ color: '#888' }}
              >X</button>
            </div>

            {/* Status + Category + Priority row */}
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                value={detailSuggestion.status}
                onChange={e => updateSuggestion(detailSuggestion.id, { status: e.target.value })}
                className="font-body text-xs px-2 py-1.5"
                style={{
                  backgroundColor: STATUS_CONFIG[detailSuggestion.status].bg,
                  border: `1px solid ${STATUS_CONFIG[detailSuggestion.status].color}40`,
                  color: STATUS_CONFIG[detailSuggestion.status].color,
                  outline: 'none',
                }}
              >
                {STATUS_ORDER.map(s => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
              <select
                value={detailSuggestion.category}
                onChange={e => updateSuggestion(detailSuggestion.id, { category: e.target.value })}
                className="font-body text-xs px-2 py-1.5"
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${CATEGORY_COLORS[detailSuggestion.category]}40`,
                  color: CATEGORY_COLORS[detailSuggestion.category],
                  outline: 'none',
                }}
              >
                {(['gameplay', 'ui', 'cards', 'balance', 'social', 'other'] as SuggestionCategory[]).map(c => (
                  <option key={c} value={c}>{t(`category.${c}`)}</option>
                ))}
              </select>
              <select
                value={detailSuggestion.priority}
                onChange={e => updateSuggestion(detailSuggestion.id, { priority: e.target.value })}
                className="font-body text-xs px-2 py-1.5"
                style={{
                  backgroundColor: '#141414',
                  border: `1px solid ${PRIORITY_CONFIG[detailSuggestion.priority].color}40`,
                  color: PRIORITY_CONFIG[detailSuggestion.priority].color,
                  outline: 'none',
                }}
              >
                {(['low', 'normal', 'high', 'critical'] as SuggestionPriority[]).map(p => (
                  <option key={p} value={p}>{t(`priority.${p}`)}</option>
                ))}
              </select>
              {/* Assign */}
              <select
                value={detailSuggestion.assignedTo ?? ''}
                onChange={e => updateSuggestion(detailSuggestion.id, { assignedTo: e.target.value })}
                className="font-body text-xs px-2 py-1.5"
                style={{ backgroundColor: '#141414', border: '1px solid #333', color: '#aaa', outline: 'none' }}
              >
                <option value="">{t('unassigned')}</option>
                {SUGGESTION_USERS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="mb-4">
              <span className="font-body text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#555' }}>{t('fieldDescription')}</span>
              {editingField === 'description' ? (
                <div>
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    rows={4}
                    className="w-full font-body text-sm px-3 py-2 resize-y mb-2"
                    style={{ backgroundColor: '#0a0a0a', border: '1px solid #c4a35a', color: '#e0e0e0', outline: 'none' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { updateSuggestion(detailSuggestion.id, { description: editValue }); setEditingField(null); }}
                      className="font-body text-xs px-3 py-1"
                      style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
                    >{t('save')}</button>
                    <button onClick={() => setEditingField(null)} className="font-body text-xs px-3 py-1" style={{ color: '#888', border: '1px solid #333' }}>{t('cancel')}</button>
                  </div>
                </div>
              ) : (
                <p
                  className="font-body text-sm cursor-pointer whitespace-pre-wrap"
                  style={{ color: '#ccc', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a' }}
                  onClick={() => { setEditingField('description'); setEditValue(detailSuggestion.description); }}
                >
                  {detailSuggestion.description}
                </p>
              )}
            </div>

            {/* Admin Notes */}
            <div className="mb-4">
              <span className="font-body text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#555' }}>{t('adminNotes')}</span>
              {editingField === 'adminNotes' ? (
                <div>
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    rows={3}
                    className="w-full font-body text-sm px-3 py-2 resize-y mb-2"
                    style={{ backgroundColor: '#0a0a0a', border: '1px solid #f59e0b', color: '#e0e0e0', outline: 'none' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { updateSuggestion(detailSuggestion.id, { adminNotes: editValue }); setEditingField(null); }}
                      className="font-body text-xs px-3 py-1"
                      style={{ backgroundColor: '#f59e0b', color: '#0a0a0a' }}
                    >{t('save')}</button>
                    <button onClick={() => setEditingField(null)} className="font-body text-xs px-3 py-1" style={{ color: '#888', border: '1px solid #333' }}>{t('cancel')}</button>
                  </div>
                </div>
              ) : (
                <p
                  className="font-body text-sm cursor-pointer whitespace-pre-wrap"
                  style={{ color: '#f59e0b90', padding: '8px', backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', minHeight: 40 }}
                  onClick={() => { setEditingField('adminNotes'); setEditValue(detailSuggestion.adminNotes ?? ''); }}
                >
                  {detailSuggestion.adminNotes || t('clickToAddNotes')}
                </p>
              )}
            </div>

            {/* Images */}
            <div className="mb-4">
              <span className="font-body text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#555' }}>
                {t('fieldImages')} ({detailSuggestion.images.length}/5)
              </span>
              <div className="flex flex-wrap gap-2 mb-2">
                {detailSuggestion.images.map((img, i) => (
                  <div key={i} className="relative" style={{ border: '1px solid #222' }}>
                    <img
                      src={img}
                      alt=""
                      className="w-20 h-20 object-cover cursor-pointer"
                      onClick={() => setViewingImage(img)}
                    />
                    <button
                      onClick={() => updateSuggestion(detailSuggestion.id, { removeImageIndex: i })}
                      className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center font-body text-[10px]"
                      style={{ backgroundColor: '#ef4444', color: '#fff' }}
                    >x</button>
                  </div>
                ))}
              </div>
              {detailSuggestion.images.length < 5 && (
                <>
                  <input ref={detailImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImageUpload(e, true)} />
                  <button
                    onClick={() => detailImageInputRef.current?.click()}
                    className="font-body text-xs px-3 py-1.5"
                    style={{ border: '1px solid #333', color: '#aaa', backgroundColor: '#141414' }}
                  >{t('addImage')}</button>
                </>
              )}
            </div>

            {/* Audio */}
            {detailSuggestion.audioUrl && (
              <div className="mb-4">
                <span className="font-body text-[10px] uppercase tracking-wider mb-1 block" style={{ color: '#555' }}>{t('fieldAudio')}</span>
                <div className="flex items-center gap-2">
                  <audio controls src={detailSuggestion.audioUrl} className="h-8" style={{ maxWidth: 300 }} />
                  <button
                    onClick={() => updateSuggestion(detailSuggestion.id, { audioUrl: null })}
                    className="font-body text-xs px-2 py-1"
                    style={{ color: '#ef4444', border: '1px solid #ef444440' }}
                  >{t('remove')}</button>
                </div>
              </div>
            )}

            {/* Delete button */}
            <div className="flex justify-end pt-3" style={{ borderTop: '1px solid #1a1a1a' }}>
              <button
                onClick={() => { if (confirm(t('confirmDelete'))) deleteSuggestion(detailSuggestion.id); }}
                className="font-body text-xs px-4 py-2"
                style={{ border: '1px solid #ef444440', color: '#ef4444' }}
              >{t('delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ====== IMAGE VIEWER MODAL ====== */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
          onClick={() => setViewingImage(null)}
        >
          <img src={viewingImage} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}
    </div>
  );
}

/* ====== KANBAN CARD COMPONENT ====== */
function SuggestionCard({ suggestion, t, onClick }: { suggestion: Suggestion; t: (key: string) => string; onClick: () => void }) {
  const s = suggestion;
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2.5 transition-colors"
      style={{ backgroundColor: '#0e0e0e', border: '1px solid #1a1a1a' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#333'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a1a'; }}
    >
      {/* Priority + Category badges */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="font-body text-[9px] uppercase tracking-wider px-1.5 py-0.5"
          style={{ backgroundColor: `${PRIORITY_CONFIG[s.priority].color}15`, color: PRIORITY_CONFIG[s.priority].color }}
        >
          {t(`priority.${s.priority}`)}
        </span>
        <span
          className="font-body text-[9px] uppercase tracking-wider px-1.5 py-0.5"
          style={{ backgroundColor: `${CATEGORY_COLORS[s.category]}15`, color: CATEGORY_COLORS[s.category] }}
        >
          {t(`category.${s.category}`)}
        </span>
      </div>

      {/* Title */}
      <p className="font-body text-xs font-medium mb-1 line-clamp-2" style={{ color: '#e0e0e0' }}>{s.title}</p>

      {/* Description preview */}
      <p className="font-body text-[10px] line-clamp-2 mb-2" style={{ color: '#777' }}>{s.description}</p>

      {/* Footer: attachments + submitter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {s.images.length > 0 && (
            <span className="font-body text-[9px] px-1 py-0.5" style={{ backgroundColor: '#222', color: '#888' }}>
              {s.images.length} img
            </span>
          )}
          {s.audioUrl && (
            <span className="font-body text-[9px] px-1 py-0.5" style={{ backgroundColor: '#222', color: '#888' }}>
              audio
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {s.assignedTo && (
            <span className="font-body text-[9px]" style={{ color: '#c4a35a' }}>{s.assignedTo}</span>
          )}
          <span className="font-body text-[9px]" style={{ color: '#444' }}>{s.submittedBy}</span>
        </div>
      </div>
    </button>
  );
}
