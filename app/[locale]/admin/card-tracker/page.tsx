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
const ADMIN_USERNAMES = ['Kutxyt', 'admin'];

type IssueStatus = 'to_fix' | 'fixed_unpublished' | 'fixed_published' | 'verified';
type FilterStatus = 'all' | IssueStatus;

interface CardIssue {
  id: string;
  cardId: string;
  cardName: string;
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
  const [cardSearch, setCardSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<(CharacterCard | MissionCard) | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
    ).slice(0, 12);
  }, [cardSearch, allCards]);

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
    if (!selectedCard || !description.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/admin/card-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCard.cardId ?? selectedCard.id,
          cardName: selectedCard.name_fr,
          description: description.trim(),
        }),
      });
      setSelectedCard(null);
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
    } catch { /* ignore */ }
  }

  async function updateDescription(id: string) {
    try {
      await fetch('/api/admin/card-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: editDesc }),
      });
      setEditingId(null);
      fetchIssues();
    } catch { /* ignore */ }
  }

  async function deleteIssue(id: string) {
    try {
      await fetch(`/api/admin/card-tracker?id=${id}`, { method: 'DELETE' });
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

  // Find card object for each issue (for thumbnail)
  function findCard(cardId: string): (CharacterCard | MissionCard) | undefined {
    return allCards.find(c => c.cardId === cardId || c.id === cardId);
  }

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

        {/* New Issue Form */}
        {showForm && (
          <div
            className="mb-6 rounded-lg p-4"
            style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
          >
            <div className="mb-3" style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
              New Card Issue
            </div>

            {/* Card Selector */}
            <div className="relative mb-3" ref={searchRef}>
              {selectedCard ? (
                <div className="flex items-center gap-3 rounded p-2" style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
                  <div style={{ width: 48, flexShrink: 0 }}>
                    <CardFace card={selectedCard} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{selectedCard.name_fr}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{selectedCard.cardId ?? selectedCard.id}</div>
                  </div>
                  <button
                    onClick={() => { setSelectedCard(null); setCardSearch(''); }}
                    style={{ color: '#666', fontSize: 18, padding: '0 4px' }}
                  >
                    x
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={(e) => { setCardSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    placeholder="Search card by name or ID..."
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
                            setSelectedCard(card);
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
                </>
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
              disabled={!selectedCard || !description.trim() || submitting}
              className="px-4 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: selectedCard && description.trim() ? '#9333ea' : '#333',
                color: selectedCard && description.trim() ? '#fff' : '#666',
                borderRadius: 6,
                opacity: submitting ? 0.5 : 1,
                cursor: selectedCard && description.trim() && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Issue'}
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
              const card = findCard(issue.cardId);
              const config = STATUS_CONFIG[issue.status];
              const isEditing = editingId === issue.id;

              return (
                <div
                  key={issue.id}
                  className="flex gap-3 rounded-lg p-3 transition-all"
                  style={{ backgroundColor: '#141414', border: `1px solid #262626` }}
                >
                  {/* Card Thumbnail */}
                  <div style={{ width: 56, flexShrink: 0 }}>
                    {card ? <CardFace card={card} /> : (
                      <div className="flex items-center justify-center rounded" style={{ width: 56, height: 78, backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 8, color: '#555', textAlign: 'center' }}>
                        {issue.cardId}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{issue.cardName}</span>
                        <span className="ml-2" style={{ fontSize: 11, color: '#555' }}>{issue.cardId}</span>
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
                        className="mb-2 cursor-pointer rounded px-2 py-1 text-xs transition-colors"
                        style={{ color: '#999', backgroundColor: 'transparent', lineHeight: 1.5 }}
                        onClick={() => { setEditingId(issue.id); setEditDesc(issue.description); }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a1a1a'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                        title="Click to edit"
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

                      {/* Delete (admin only) */}
                      {isAdmin && (
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
