'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

interface DeckItem {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  sortOrder: number;
  updatedAt: string;
}

export default function ManageDecksPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDecks = useCallback(async () => {
    try {
      const res = await fetch('/api/decks');
      if (res.ok) {
        const data = await res.json();
        setDecks(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDecks((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
      // ignore
    }
    setConfirmDeleteId(null);
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/decks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        setDecks((prev) =>
          prev.map((d) => (d.id === id ? { ...d, name: renameValue.trim() } : d)),
        );
      }
    } catch {
      // ignore
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const saveOrder = async (newDecks: DeckItem[]) => {
    setSaving(true);
    try {
      await fetch('/api/decks/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newDecks.map((d) => d.id) }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newDecks = [...decks];
    [newDecks[index - 1], newDecks[index]] = [newDecks[index], newDecks[index - 1]];
    setDecks(newDecks);
    saveOrder(newDecks);
  };

  const moveDown = (index: number) => {
    if (index === decks.length - 1) return;
    const newDecks = [...decks];
    [newDecks[index], newDecks[index + 1]] = [newDecks[index + 1], newDecks[index]];
    setDecks(newDecks);
    saveOrder(newDecks);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newDecks = [...decks];
    const [dragged] = newDecks.splice(dragIndex, 1);
    newDecks.splice(index, 0, dragged);
    setDecks(newDecks);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null) {
      saveOrder(decks);
    }
    setDragIndex(null);
  };

  if (!session?.user) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <p style={{ color: '#888888' }}>{t('online.signInRequired')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <div className="max-w-xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#c4a35a' }}>
            {t('deckManager.title')}
          </h1>
          <Link
            href="/deck-builder"
            className="px-4 py-2 text-sm rounded text-center"
            style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
          >
            {t('deckManager.backToBuilder')}
          </Link>
        </div>

        <p className="text-xs mb-4" style={{ color: '#555555' }}>
          {t('deckManager.description')}
        </p>

        {loading && (
          <p className="text-sm" style={{ color: '#888888' }}>{t('common.loading')}</p>
        )}

        {!loading && decks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm mb-4" style={{ color: '#555555' }}>
              {t('deckBuilder.noSavedDecks')}
            </p>
            <Link
              href="/deck-builder"
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}
            >
              {t('deckManager.createFirst')}
            </Link>
          </div>
        )}

        {!loading && decks.length > 0 && (
          <div className="flex flex-col gap-2">
            {decks.map((deck, index) => {
              const isConfirming = confirmDeleteId === deck.id;
              const isRenaming = renamingId === deck.id;

              return (
                <div
                  key={deck.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className="rounded-lg p-4 transition-all"
                  style={{
                    backgroundColor: dragIndex === index ? '#1a1a1a' : '#141414',
                    border: `1px solid ${dragIndex === index ? '#c4a35a' : '#262626'}`,
                    cursor: 'grab',
                    opacity: dragIndex === index ? 0.8 : 1,
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Order indicator + drag handle */}
                    <div className="flex sm:flex-col items-center gap-1 sm:gap-0.5 shrink-0">
                      <button
                        onClick={() => moveUp(index)}
                        disabled={index === 0 || saving}
                        className="text-xs px-1 transition-colors"
                        style={{ color: index === 0 ? '#333333' : '#888888' }}
                      >
                        ▲
                      </button>
                      <span
                        className="text-xs font-bold w-6 text-center"
                        style={{ color: '#c4a35a' }}
                      >
                        {index + 1}
                      </span>
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index === decks.length - 1 || saving}
                        className="text-xs px-1 transition-colors"
                        style={{ color: index === decks.length - 1 ? '#333333' : '#888888' }}
                      >
                        ▼
                      </button>
                    </div>

                    {/* Deck info */}
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(deck.id);
                              if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                            }}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm bg-[#0a0a0a] border border-[#444] text-[#e0e0e0] focus:outline-none focus:border-[#c4a35a]"
                          />
                          <button
                            onClick={() => handleRename(deck.id)}
                            className="px-2 py-1 text-[10px] bg-[#1a2a1a] border border-[#3e8b3e]/30 text-[#3e8b3e]"
                          >
                            {t('common.confirm')}
                          </button>
                          <button
                            onClick={() => { setRenamingId(null); setRenameValue(''); }}
                            className="px-2 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#888]"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium" style={{ color: '#e0e0e0' }}>
                            {deck.name}
                          </span>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px]" style={{ color: '#555555' }}>
                              {deck.cardIds.length} {t('deckManager.cards')} + {deck.missionIds.length} missions
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    {!isRenaming && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isConfirming ? (
                          <>
                            <span className="text-[10px]" style={{ color: '#b33e3e' }}>
                              {t('deckBuilder.confirmDelete', { name: deck.name })}
                            </span>
                            <button
                              onClick={() => handleDelete(deck.id)}
                              className="px-2 py-1 text-[10px] bg-[#2a1a1a] border border-[#b33e3e]/40 text-[#b33e3e]"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#888]"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setRenamingId(deck.id); setRenameValue(deck.name); }}
                              className="px-2.5 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#888] hover:text-[#e0e0e0] hover:border-[#444] transition-colors"
                            >
                              {t('deckManager.rename')}
                            </button>
                            <Link
                              href="/deck-builder"
                              onClick={() => {
                                // Store the deck ID to load when the builder opens
                                sessionStorage.setItem('loadDeckId', deck.id);
                              }}
                              className="px-2.5 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#888] hover:text-[#e0e0e0] hover:border-[#444] transition-colors"
                            >
                              {t('deckBuilder.editDeck')}
                            </Link>
                            <button
                              onClick={() => setConfirmDeleteId(deck.id)}
                              className="px-2.5 py-1 text-[10px] bg-[#141414] border border-[#262626] text-[#b33e3e] hover:bg-[#1a1414] hover:border-[#b33e3e]/30 transition-colors"
                            >
                              {t('deckBuilder.deleteDeck')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {saving && (
          <p className="text-xs mt-3 text-center" style={{ color: '#555555' }}>
            {t('deckManager.saving')}
          </p>
        )}
      </div>
      <Footer />
    </main>
  );
}
