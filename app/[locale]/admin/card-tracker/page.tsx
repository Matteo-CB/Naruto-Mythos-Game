'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import CardFace from '@/components/cards/CardFace';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

const TRACKER_USERS = ['Kutxyt', 'admin', 'Andy'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

type IssueStatus = 'to_fix' | 'fixed_unpublished' | 'fixed_published' | 'verified';
type FilterStatus = 'all' | IssueStatus;

interface CardIssue {
  id: string;
  cardIds: string[];
  cardNames: string[];
  description: string;
  status: IssueStatus;
  reportedBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<IssueStatus, { label: string; labelFr: string; color: string; bg: string }> = {
  to_fix: { label: 'To Fix', labelFr: 'A corriger', color: '#ef4444', bg: '#ef444420' },
  fixed_unpublished: { label: 'Fixed (not published)', labelFr: 'Corrige (non publie)', color: '#f59e0b', bg: '#f59e0b20' },
  fixed_published: { label: 'Fixed & Published', labelFr: 'Corrige et publie', color: '#3b82f6', bg: '#3b82f620' },
  verified: { label: 'Verified', labelFr: 'Verifie', color: '#22c55e', bg: '#22c55e20' },
};

export default function CardTrackerPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const [issues, setIssues] = useState<CardIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showForm, setShowForm] = useState(false);

  // Multi-card selection for new issue form
  const [selectedCards, setSelectedCards] = useState<(CharacterCard | MissionCard)[]>([]);
  const [cardSearch, setCardSearch] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Detail view
  const [detailIssue, setDetailIssue] = useState<CardIssue | null>(null);
  const [addCardSearch, setAddCardSearch] = useState('');
  const [addCardDropdownOpen, setAddCardDropdownOpen] = useState(false);
  const addCardRef = useRef<HTMLDivElement>(null);
  const [detailEditingDesc, setDetailEditingDesc] = useState(false);
  const [detailEditDesc, setDetailEditDesc] = useState('');

  const username = session?.user?.name ?? '';
  const isAuthorized = TRACKER_USERS.includes(username);
  const isAdmin = ADMIN_USERNAMES.includes(username);

  const allCards = useMemo(() => {
    const chars = getPlayableCharacters();
    const missions = getPlayableMissions();
    return [...chars, ...missions] as (CharacterCard | MissionCard)[];
  }, []);

  const filteredCards = useMemo(() => {
    if (!cardSearch.trim()) return [];
    const q = cardSearch.toLowerCase();
    return allCards.filter(c =>
      c.name_fr.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.cardId && c.cardId.toLowerCase().includes(q))
    ).filter(c => !selectedCards.some(sc => (sc.cardId ?? sc.id) === (c.cardId ?? c.id))).slice(0, 12);
  }, [cardSearch, allCards, selectedCards]);

  const addCardFilteredCards = useMemo(() => {
    if (!addCardSearch.trim()) return [];
    const q = addCardSearch.toLowerCase();
    return allCards.filter(c =>
      c.name_fr.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.cardId && c.cardId.toLowerCase().includes(q))
    ).filter(c => !detailIssue?.cardIds.includes(c.cardId ?? c.id)).slice(0, 12);
  }, [addCardSearch, allCards, detailIssue]);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchIssues();
  }, [isAuthorized]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (addCardRef.current && !addCardRef.current.contains(e.target as Node)) {
        setAddCardDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchIssues() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/card-tracker');
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function createIssue() {
    if (selectedCards.length === 0 || !description.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/admin/card-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardIds: selectedCards.map(c => c.cardId ?? c.id),
          cardNames: selectedCards.map(c => c.name_fr),
          description: description.trim(),
        }),
      });
      setSelectedCards([]);
      setCardSearch('');
      setDescription('');
      setShowForm(false);
      fetchIssues();
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  async function updateStatus(id: string, status: IssueStatus) {
    try {
      await fetch('/api/admin/card-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      fetchIssues();
      if (detailIssue?.id === id) {
        setDetailIssue(prev => prev ? { ...prev, status } : null);
      }
    } catch { /* ignore */ }
  }

  async function updateDescription(id: string, desc?: string) {
    const newDesc = desc ?? editDesc;
    try {
      await fetch('/api/admin/card-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: newDesc }),
      });
      setEditingId(null);
      setDetailEditingDesc(false);
      fetchIssues();
      if (detailIssue?.id === id) {
        setDetailIssue(prev => prev ? { ...prev, description: newDesc } : null);
      }
    } catch { /* ignore */ }
  }

  async function addCardToIssue(issueId: string, card: CharacterCard | MissionCard) {
    try {
      const res = await fetch('/api/admin/card-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: issueId,
          addCardId: card.cardId ?? card.id,
          addCardName: card.name_fr,
        }),
      });
      const data = await res.json();
      if (data.issue) {
        setDetailIssue(data.issue);
        setAddCardSearch('');
        setAddCardDropdownOpen(false);
        fetchIssues();
      }
    } catch { /* ignore */ }
  }

  async function removeCardFromIssue(issueId: string, cardIndex: number) {
    try {
      const res = await fetch('/api/admin/card-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issueId, removeCardIndex: cardIndex }),
      });
      const data = await res.json();
      if (data.issue) {
        setDetailIssue(data.issue);
        fetchIssues();
      }
    } catch { /* ignore */ }
  }

  async function deleteIssue(id: string) {
    try {
      await fetch(`/api/admin/card-tracker?id=${id}`, { method: 'DELETE' });
      if (detailIssue?.id === id) setDetailIssue(null);
      fetchIssues();
    } catch { /* ignore */ }
  }

  const filteredIssues = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: issues.length };
    for (const s of Object.keys(STATUS_CONFIG)) counts[s] = 0;
    for (const i of issues) counts[i.status] = (counts[i.status] || 0) + 1;
    return counts;
  }, [issues]);

  // ─── EXPORT ───
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'txt' | 'json'>('txt');
  const [exportStatuses, setExportStatuses] = useState<Record<IssueStatus, boolean>>({
    to_fix: true,
    fixed_unpublished: true,
    fixed_published: true,
    verified: true,
  });
  const [exportSortBy, setExportSortBy] = useState<'status' | 'date' | 'card'>('status');

  function toggleExportStatus(s: IssueStatus) {
    setExportStatuses(prev => ({ ...prev, [s]: !prev[s] }));
  }

  function buildExportData() {
    const selected = issues.filter(i => exportStatuses[i.status]);
    const statusOrder: IssueStatus[] = ['to_fix', 'fixed_unpublished', 'fixed_published', 'verified'];

    const sorted = [...selected].sort((a, b) => {
      if (exportSortBy === 'status') {
        const diff = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (exportSortBy === 'date') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // card name
      return a.cardNames[0].localeCompare(b.cardNames[0]);
    });

    return sorted;
  }

  function exportData() {
    const data = buildExportData();
    if (data.length === 0) return;

    const statusOrder: IssueStatus[] = ['to_fix', 'fixed_unpublished', 'fixed_published', 'verified'];
    let content: string;
    let filename: string;
    let mime: string;

    if (exportFormat === 'json') {
      const jsonData = data.map(i => ({
        cards: i.cardIds.map((id, idx) => ({ id, name: i.cardNames[idx] })),
        description: i.description,
        status: i.status,
        statusLabel: STATUS_CONFIG[i.status].label,
        reportedBy: i.reportedBy,
        updatedBy: i.updatedBy,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      }));
      content = JSON.stringify(jsonData, null, 2);
      filename = `card-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      mime = 'application/json';
    } else {
      const lines: string[] = [];
      lines.push('='.repeat(70));
      lines.push(`CARD TRACKER EXPORT — ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
      lines.push(`Total: ${data.length} issue(s)`);
      lines.push('='.repeat(70));
      lines.push('');

      if (exportSortBy === 'status') {
        // Group by status
        for (const status of statusOrder) {
          const group = data.filter(i => i.status === status);
          if (group.length === 0) continue;
          lines.push('-'.repeat(50));
          lines.push(`  ${STATUS_CONFIG[status].label.toUpperCase()} (${group.length})`);
          lines.push('-'.repeat(50));
          lines.push('');
          for (const issue of group) {
            const cards = issue.cardIds.map((id, idx) => `${issue.cardNames[idx]} [${id}]`).join(', ');
            lines.push(`  Card(s): ${cards}`);
            lines.push(`  Issue:   ${issue.description}`);
            lines.push(`  By:      ${issue.reportedBy} — ${new Date(issue.createdAt).toLocaleDateString()}`);
            if (issue.updatedBy) {
              lines.push(`  Updated: ${issue.updatedBy} — ${new Date(issue.updatedAt).toLocaleDateString()}`);
            }
            lines.push('');
          }
        }
      } else {
        for (const issue of data) {
          const cards = issue.cardIds.map((id, idx) => `${issue.cardNames[idx]} [${id}]`).join(', ');
          const statusLabel = STATUS_CONFIG[issue.status].label;
          lines.push(`  [${statusLabel}] ${cards}`);
          lines.push(`  Issue:   ${issue.description}`);
          lines.push(`  By:      ${issue.reportedBy} — ${new Date(issue.createdAt).toLocaleDateString()}`);
          if (issue.updatedBy) {
            lines.push(`  Updated: ${issue.updatedBy} — ${new Date(issue.updatedAt).toLocaleDateString()}`);
          }
          lines.push('');
        }
      }

      content = lines.join('\n');
      filename = `card-tracker-export-${new Date().toISOString().slice(0, 10)}.txt`;
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

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#0a0a0a', color: '#666' }}>
        Loading...
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: '#0a0a0a', color: '#ef4444' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Unauthorized</div>
        <Link href="/" style={{ color: '#666', fontSize: 14 }}>Back to Home</Link>
      </div>
    );
  }

  function findCard(cardId: string): (CharacterCard | MissionCard) | undefined {
    return allCards.find(c => c.cardId === cardId || c.id === cardId);
  }

  // ─── DETAIL VIEW ───
  if (detailIssue) {
    const config = STATUS_CONFIG[detailIssue.status];
    return (
      <div className="relative min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <CloudBackground />
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {/* Back button */}
          <button
            onClick={() => setDetailIssue(null)}
            className="mb-4 text-sm transition-colors"
            style={{ color: '#666' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#999'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666'; }}
          >
            &larr; Back to list
          </button>

          {/* Issue Header */}
          <div className="mb-6 rounded-lg p-5" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0e0' }}>
                  {detailIssue.cardNames.join(', ')}
                </div>
                <div className="mt-1" style={{ fontSize: 12, color: '#555' }}>
                  {detailIssue.cardIds.join(', ')}
                </div>
              </div>
              <span
                className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: config.bg, color: config.color, border: `1px solid ${config.color}40` }}
              >
                {config.label}
              </span>
            </div>

            {/* Description */}
            <div className="mb-4">
              <div className="mb-1" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
              {detailEditingDesc ? (
                <div className="flex gap-2">
                  <textarea
                    value={detailEditDesc}
                    onChange={(e) => setDetailEditDesc(e.target.value)}
                    rows={4}
                    className="flex-1 resize-none rounded px-3 py-2 text-sm"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => updateDescription(detailIssue.id, detailEditDesc)}
                      className="px-3 py-1.5 text-xs font-semibold rounded"
                      style={{ backgroundColor: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setDetailEditingDesc(false)}
                      className="px-3 py-1.5 text-xs rounded"
                      style={{ color: '#666' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer rounded px-3 py-2 text-sm transition-colors whitespace-pre-wrap"
                  style={{ color: '#ccc', backgroundColor: '#1a1a1a', border: '1px solid #262626', lineHeight: 1.6 }}
                  onClick={() => { setDetailEditingDesc(true); setDetailEditDesc(detailIssue.description); }}
                  title="Click to edit"
                >
                  {detailIssue.description}
                </div>
              )}
            </div>

            {/* Status Selector + Meta */}
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="mb-1" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
                <select
                  value={detailIssue.status}
                  onChange={(e) => updateStatus(detailIssue.id, e.target.value as IssueStatus)}
                  className="rounded px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: '#1a1a1a',
                    border: `1px solid ${config.color}40`,
                    color: config.color,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {(Object.keys(STATUS_CONFIG) as IssueStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reported</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {detailIssue.reportedBy} - {new Date(detailIssue.createdAt).toLocaleDateString()}
                </div>
              </div>
              {detailIssue.updatedBy && (
                <div>
                  <div className="mb-1" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Updated by</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {detailIssue.updatedBy} - {new Date(detailIssue.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              )}
              {isAuthorized && (
                <button
                  onClick={() => deleteIssue(detailIssue.id)}
                  className="ml-auto text-xs font-medium transition-colors"
                  style={{ color: '#ef4444', opacity: 0.7 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                >
                  Delete Issue
                </button>
              )}
            </div>
          </div>

          {/* Affected Cards Section */}
          <div className="rounded-lg p-5" style={{ backgroundColor: '#141414', border: '1px solid #262626' }}>
            <div className="mb-3 flex items-center justify-between">
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
                Affected Cards ({detailIssue.cardIds.length})
              </div>
            </div>

            {/* Cards Grid */}
            <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {detailIssue.cardIds.map((cardId, idx) => {
                const card = findCard(cardId);
                return (
                  <div
                    key={`${cardId}-${idx}`}
                    className="group relative rounded-lg p-2 transition-all"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #262626' }}
                  >
                    <div className="mb-2" style={{ aspectRatio: '0.72', overflow: 'hidden', borderRadius: 4 }}>
                      {card ? <CardFace card={card} /> : (
                        <div className="flex h-full items-center justify-center" style={{ backgroundColor: '#222', fontSize: 10, color: '#555' }}>
                          {cardId}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {detailIssue.cardNames[idx]}
                    </div>
                    <div style={{ fontSize: 9, color: '#555' }}>{cardId}</div>
                    {/* Remove button */}
                    {detailIssue.cardIds.length > 1 && (
                      <button
                        onClick={() => removeCardFromIssue(detailIssue.id, idx)}
                        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all"
                        style={{ backgroundColor: '#ef444430', color: '#ef4444', opacity: 0, border: '1px solid #ef444440' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
                        title="Remove this card from issue"
                      >
                        x
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Card to Issue */}
            <div className="relative" ref={addCardRef}>
              <input
                type="text"
                value={addCardSearch}
                onChange={(e) => { setAddCardSearch(e.target.value); setAddCardDropdownOpen(true); }}
                onFocus={() => setAddCardDropdownOpen(true)}
                placeholder="Add another card to this issue..."
                className="w-full rounded px-3 py-2 text-sm"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
              />
              {addCardDropdownOpen && addCardFilteredCards.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                >
                  {addCardFilteredCards.map(card => (
                    <button
                      key={card.id}
                      onClick={() => addCardToIssue(detailIssue.id, card)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                      style={{ borderBottom: '1px solid #222' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#222'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ width: 32, flexShrink: 0 }}>
                        <CardFace card={card} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0' }}>{card.name_fr}</div>
                        <div style={{ fontSize: 10, color: '#666' }}>{card.cardId ?? card.id}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="relative min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/" style={{ color: '#666', fontSize: 13 }}>Home</Link>
            <h1 className="mt-1" style={{ fontSize: 22, fontWeight: 700, color: '#e0e0e0' }}>
              Card Tracker
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowExport(!showExport)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  backgroundColor: showExport ? '#1a1a1a' : '#3b82f620',
                  border: `1px solid ${showExport ? '#333' : '#3b82f6'}`,
                  color: showExport ? '#999' : '#3b82f6',
                  borderRadius: 6,
                }}
              >
                {showExport ? 'Close' : 'Export'}
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: showForm ? '#1a1a1a' : '#9333ea20',
                border: `1px solid ${showForm ? '#333' : '#9333ea'}`,
                color: showForm ? '#999' : '#9333ea',
                borderRadius: 6,
              }}
            >
              {showForm ? 'Cancel' : '+ Report Issue'}
            </button>
          </div>
        </div>

        {/* New Issue Form */}
        {showForm && (
          <div
            className="mb-6 rounded-lg p-4"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <div className="mb-3" style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
              New Card Issue
            </div>

            {/* Selected Cards Chips */}
            {selectedCards.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedCards.map((card, idx) => (
                  <div
                    key={card.id}
                    className="flex items-center gap-2 rounded-full px-3 py-1"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                  >
                    <div style={{ width: 20, flexShrink: 0 }}>
                      <CardFace card={card} />
                    </div>
                    <span style={{ fontSize: 11, color: '#e0e0e0', fontWeight: 500 }}>{card.name_fr}</span>
                    <span style={{ fontSize: 9, color: '#555' }}>{card.cardId ?? card.id}</span>
                    <button
                      onClick={() => setSelectedCards(prev => prev.filter((_, i) => i !== idx))}
                      style={{ color: '#666', fontSize: 14, marginLeft: 2 }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Card Selector (always shown for adding more) */}
            <div className="relative mb-3" ref={searchRef}>
              <input
                type="text"
                value={cardSearch}
                onChange={(e) => { setCardSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                placeholder={selectedCards.length > 0 ? 'Add another card...' : 'Search card by name or ID...'}
                className="w-full rounded px-3 py-2 text-sm"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
              />
              {dropdownOpen && filteredCards.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                >
                  {filteredCards.map(card => (
                    <button
                      key={card.id}
                      onClick={() => {
                        setSelectedCards(prev => [...prev, card]);
                        setCardSearch('');
                        setDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                      style={{ borderBottom: '1px solid #222' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#222'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ width: 36, flexShrink: 0 }}>
                        <CardFace card={card} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.name_fr}
                        </div>
                        <div style={{ fontSize: 10, color: '#666' }}>{card.cardId ?? card.id} - {card.rarity}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="mb-3 w-full resize-none rounded px-3 py-2 text-sm"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
            />

            <button
              onClick={createIssue}
              disabled={selectedCards.length === 0 || !description.trim() || submitting}
              className="px-4 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: selectedCards.length > 0 && description.trim() ? '#9333ea' : '#333',
                color: selectedCards.length > 0 && description.trim() ? '#fff' : '#666',
                borderRadius: 6,
                opacity: submitting ? 0.5 : 1,
                cursor: selectedCards.length > 0 && description.trim() && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          </div>
        )}

        {/* Export Panel (admin only) */}
        {showExport && isAdmin && (
          <div
            className="mb-6 rounded-lg p-4"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <div className="mb-3" style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
              Export Issues
            </div>

            {/* Status checkboxes */}
            <div className="mb-3">
              <div className="mb-1.5" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Include statuses
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_CONFIG) as IssueStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const checked = exportStatuses[s];
                  const count = statusCounts[s] || 0;
                  return (
                    <button
                      key={s}
                      onClick={() => toggleExportStatus(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: checked ? cfg.bg : 'transparent',
                        border: `1px solid ${checked ? cfg.color + '60' : '#333'}`,
                        color: checked ? cfg.color : '#555',
                        borderRadius: 20,
                        opacity: checked ? 1 : 0.5,
                      }}
                    >
                      {cfg.label}
                      <span
                        className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: checked ? cfg.color + '30' : '#222', color: checked ? cfg.color : '#555' }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sort by + Format */}
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <div className="mb-1.5" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sort by
                </div>
                <select
                  value={exportSortBy}
                  onChange={(e) => setExportSortBy(e.target.value as 'status' | 'date' | 'card')}
                  className="rounded px-3 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="status">Status (To Fix → Verified)</option>
                  <option value="date">Date (newest first)</option>
                  <option value="card">Card name (A-Z)</option>
                </select>
              </div>
              <div>
                <div className="mb-1.5" style={{ fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Format
                </div>
                <div className="flex gap-1">
                  {(['txt', 'json'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className="px-3 py-1.5 text-xs font-semibold rounded transition-all"
                      style={{
                        backgroundColor: exportFormat === fmt ? '#3b82f620' : 'transparent',
                        border: `1px solid ${exportFormat === fmt ? '#3b82f660' : '#333'}`,
                        color: exportFormat === fmt ? '#3b82f6' : '#666',
                      }}
                    >
                      .{fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Download button */}
            <button
              onClick={exportData}
              disabled={!Object.values(exportStatuses).some(v => v)}
              className="px-5 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: Object.values(exportStatuses).some(v => v) ? '#3b82f6' : '#333',
                color: Object.values(exportStatuses).some(v => v) ? '#fff' : '#666',
                borderRadius: 6,
                cursor: Object.values(exportStatuses).some(v => v) ? 'pointer' : 'not-allowed',
              }}
            >
              Download {exportFormat.toUpperCase()} ({buildExportData().length} issues)
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(['all', 'to_fix', 'fixed_unpublished', 'fixed_published', 'verified'] as FilterStatus[]).map(s => {
            const isActive = filter === s;
            const config = s === 'all' ? { color: '#e0e0e0', bg: '#ffffff10' } : STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  backgroundColor: isActive ? config.bg : 'transparent',
                  border: `1px solid ${isActive ? config.color + '60' : '#333'}`,
                  color: isActive ? config.color : '#666',
                  borderRadius: 20,
                }}
              >
                {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ backgroundColor: isActive ? config.color + '30' : '#222', color: isActive ? config.color : '#555' }}
                >
                  {statusCounts[s] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Issues List */}
        {loading ? (
          <div className="py-12 text-center" style={{ color: '#666' }}>Loading...</div>
        ) : filteredIssues.length === 0 ? (
          <div className="py-12 text-center" style={{ color: '#444', fontSize: 14 }}>
            {filter === 'all' ? 'No issues reported yet.' : `No issues with status "${filter}".`}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredIssues.map(issue => {
              const config = STATUS_CONFIG[issue.status];
              const isEditing = editingId === issue.id;
              const firstCard = findCard(issue.cardIds[0]);

              return (
                <div
                  key={issue.id}
                  className="flex gap-3 rounded-lg p-3 transition-all cursor-pointer"
                  style={{ backgroundColor: '#141414', border: `1px solid #262626` }}
                  onClick={(e) => {
                    // Don't open detail if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.tagName === 'OPTION' || target.closest('button') || target.closest('select')) return;
                    setDetailIssue(issue);
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3a3a3a'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#262626'; }}
                >
                  {/* Card Thumbnails */}
                  <div className="flex flex-shrink-0 gap-1" style={{ width: issue.cardIds.length > 1 ? 'auto' : 56 }}>
                    {issue.cardIds.slice(0, 3).map((cardId, idx) => {
                      const card = findCard(cardId);
                      return (
                        <div key={`${cardId}-${idx}`} style={{ width: 48, flexShrink: 0 }}>
                          {card ? <CardFace card={card} /> : (
                            <div className="flex items-center justify-center rounded" style={{ width: 48, height: 67, backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 7, color: '#555', textAlign: 'center' }}>
                              {cardId}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {issue.cardIds.length > 3 && (
                      <div className="flex items-center justify-center rounded" style={{ width: 48, height: 67, backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 11, color: '#666' }}>
                        +{issue.cardIds.length - 3}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
                          {issue.cardNames.join(', ')}
                        </span>
                        {issue.cardIds.length > 1 && (
                          <span className="ml-2" style={{ fontSize: 10, color: '#666' }}>
                            ({issue.cardIds.length} cards)
                          </span>
                        )}
                      </div>
                      {/* Status Badge */}
                      <span
                        className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: config.bg, color: config.color, border: `1px solid ${config.color}40` }}
                      >
                        {config.label}
                      </span>
                    </div>

                    {/* Description */}
                    {isEditing ? (
                      <div className="flex gap-2 mb-2">
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          className="flex-1 resize-none rounded px-2 py-1 text-xs"
                          style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', outline: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => updateDescription(issue.id)}
                            className="px-2 py-1 text-[10px] font-semibold rounded"
                            style={{ backgroundColor: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-[10px] rounded"
                            style={{ color: '#666' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="mb-2 rounded px-2 py-1 text-xs"
                        style={{ color: '#999', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {issue.description}
                      </div>
                    )}

                    {/* Footer: meta + actions */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Status Selector */}
                      <select
                        value={issue.status}
                        onChange={(e) => updateStatus(issue.id, e.target.value as IssueStatus)}
                        className="rounded px-2 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: '#1a1a1a',
                          border: `1px solid ${config.color}40`,
                          color: config.color,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {(Object.keys(STATUS_CONFIG) as IssueStatus[]).map(s => (
                          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>

                      {/* Meta */}
                      <span style={{ fontSize: 10, color: '#444' }}>
                        by {issue.reportedBy} - {new Date(issue.createdAt).toLocaleDateString()}
                      </span>
                      {issue.updatedBy && (
                        <span style={{ fontSize: 10, color: '#444' }}>
                          (updated by {issue.updatedBy})
                        </span>
                      )}

                      {/* Delete (authorized tracker users) */}
                      {isAuthorized && (
                        <button
                          onClick={() => deleteIssue(issue.id)}
                          className="ml-auto text-[10px] font-medium transition-colors"
                          style={{ color: '#ef4444', opacity: 0.6 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
