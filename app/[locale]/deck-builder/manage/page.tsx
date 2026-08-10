'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { exportDeckAsImage } from '@/lib/utils/exportDeckImage';
import { trackUiHook } from '@/lib/hooks/useTrackUi';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { useSettingsStore, MAX_FAVORITE_DECKS } from '@/stores/settingsStore';

interface DeckItem {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  sortOrder: number;
  evolvingPoints: number;
  evolvingCompatible?: boolean;
  updatedAt: string;
}

export default function ManageDecksPage() {
  const t = useTranslations();
  const favoriteDeckIds = useSettingsStore((s) => s.favoriteDeckIds);
  const toggleFavoriteDeck = useSettingsStore((s) => s.toggleFavoriteDeck);
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const fetchSettings = useSettingsStore((s) => s.fetchFromServer);
  useEffect(() => { if (!settingsLoaded) fetchSettings().catch(() => {}); }, [settingsLoaded, fetchSettings]);
  const { data: session } = useSession();
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportMenuId, setExportMenuId] = useState<string | null>(null);

  const fetchDecks = useCallback(async () => {
    try {
      const res = await fetch('/api/decks');
      if (res.ok) {
        const data = await res.json();
        setDecks(data);
      }
    } catch {
      
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
      
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (deck: DeckItem) => {
    setExportingId(deck.id);
    try {
      const { getCharacterById, getMissionById } = await import('@/lib/data/cardIndex');
      const chars = deck.cardIds
        .map((id) => getCharacterById(id))
        .filter((c): c is NonNullable<typeof c> => c != null);
      const missions = deck.missionIds
        .map((id) => getMissionById(id))
        .filter((m): m is NonNullable<typeof m> => m != null);
      await exportDeckAsImage(deck.name, chars, missions);
      trackUiHook('deck.exported');
    } catch {

    } finally {
      setExportingId(null);
    }
  };

  const handleExportText = (deck: DeckItem) => {
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) counts.set(id, (counts.get(id) || 0) + 1);
    for (const id of deck.missionIds) counts.set(id, (counts.get(id) || 0) + 1);
    const parts: string[] = [];
    for (const [id, qty] of counts) parts.push(`${id}--${qty}`);
    parts.push((deck.name || 'Deck').replace(/\s+/g, '_'));
    const code = parts.join('|');
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(deck.id);
      setTimeout(() => setCopiedId(null), 2000);
      trackUiHook('deck.exported');
    });
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
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <p style={{ color: 'var(--t-muted)' }}>{t('online.signInRequired')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative flex flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground />
      <div className="max-w-xl mx-auto relative z-10 flex-1 px-4 py-8 w-full">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--t-accent)' }}>
            {t('deckManager.title')}
          </h1>
          <Link
            href="/deck-builder"
            className="px-4 py-2 text-sm rounded text-center"
            style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
          >
            {t('deckManager.backToBuilder')}
          </Link>
        </div>

        <p className="text-xs mb-4" style={{ color: 'var(--t-dim)' }}>
          {t('deckManager.description')}
        </p>

        {loading && (
          <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{t('common.loading')}</p>
        )}

        {!loading && decks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm mb-4" style={{ color: 'var(--t-dim)' }}>
              {t('deckBuilder.noSavedDecks')}
            </p>
            <Link
              href="/deck-builder"
              className="px-6 py-2.5 text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)' }}
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
                <EvolvingDeckHolo
                  key={deck.id}
                  points={deck.evolvingPoints}
                  enabled={deck.evolvingCompatible === true}
                  intensity="subtle"
                >
                <div
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className="rounded-lg p-4 transition-all"
                  style={{
                    backgroundColor: dragIndex === index ? 'var(--t-surface-2)' : 'var(--t-surface)',
                    cursor: 'grab',
                    opacity: dragIndex === index ? 0.8 : 1,
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    
                    <div className="flex sm:flex-col items-center gap-1 sm:gap-0.5 shrink-0">
                      <button
                        onClick={() => moveUp(index)}
                        disabled={index === 0 || saving}
                        className="text-xs px-1 transition-colors"
                        style={{ color: index === 0 ? 'var(--t-border-strong)' : 'var(--t-muted)' }}
                      >
                        ▲
                      </button>
                      <span
                        className="text-xs font-bold w-6 text-center"
                        style={{ color: 'var(--t-accent)' }}
                      >
                        {index + 1}
                      </span>
                      <button
                        onClick={() => moveDown(index)}
                        disabled={index === decks.length - 1 || saving}
                        className="text-xs px-1 transition-colors"
                        style={{ color: index === decks.length - 1 ? 'var(--t-border-strong)' : 'var(--t-muted)' }}
                      >
                        ▼
                      </button>
                    </div>

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
                            className="flex-1 px-2 py-1 text-sm bg-[var(--t-bg)] border border-[var(--t-border-strong)] text-[var(--t-text)] focus:outline-none focus:border-[var(--t-accent)]"
                          />
                          <button
                            onClick={() => handleRename(deck.id)}
                            className="px-2 py-1 text-[10px] bg-[#1a2a1a] border border-[var(--t-success)]/30 text-[var(--t-success)]"
                          >
                            {t('common.confirm')}
                          </button>
                          <button
                            onClick={() => { setRenamingId(null); setRenameValue(''); }}
                            className="px-2 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)]"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>
                              {deck.name}
                            </span>
                            {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints} />}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px]" style={{ color: 'var(--t-dim)' }}>
                              {deck.cardIds.length} {t('deckManager.cards')} + {deck.missionIds.length} missions
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {!isRenaming && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isConfirming ? (
                          <>
                            <span className="text-[10px]" style={{ color: 'var(--t-danger)' }}>
                              {t('deckBuilder.confirmDelete', { name: deck.name })}
                            </span>
                            <button
                              onClick={() => handleDelete(deck.id)}
                              className="px-2 py-1 text-[10px] bg-[#2a1a1a] border border-[var(--t-danger)]/40 text-[var(--t-danger)]"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)]"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            {(() => {
                              const isFav = favoriteDeckIds.includes(deck.id);
                              const atCap = favoriteDeckIds.length >= MAX_FAVORITE_DECKS && !isFav;
                              return (
                                <button
                                  onClick={() => { if (!atCap) toggleFavoriteDeck(deck.id); }}
                                  disabled={atCap}
                                  title={isFav ? t('deckManager.unfavorite') : atCap ? t('deckManager.favoriteFull', { max: MAX_FAVORITE_DECKS }) : t('deckManager.favorite')}
                                  aria-label={isFav ? t('deckManager.unfavorite') : t('deckManager.favorite')}
                                  aria-pressed={isFav}
                                  className="px-2 py-1 text-[12px] leading-none transition-colors"
                                  style={{
                                    backgroundColor: isFav ? 'var(--t-accent-glow)' : 'var(--t-surface)',
                                    border: '1px solid ' + (isFav ? 'rgba(196,163,90,0.4)' : 'var(--t-border)'),
                                    color: isFav ? 'var(--t-accent)' : atCap ? 'var(--t-border-strong)' : 'var(--t-muted)',
                                    cursor: atCap ? 'default' : 'pointer',
                                  }}
                                >
                                  {isFav ? '★' : '☆'}
                                </button>
                              );
                            })()}
                            <button
                              onClick={() => { setRenamingId(deck.id); setRenameValue(deck.name); }}
                              className="px-2.5 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)] hover:border-[var(--t-border-strong)] transition-colors"
                            >
                              {t('deckManager.rename')}
                            </button>
                            <Link
                              href="/deck-builder"
                              onClick={() => {
                                
                                sessionStorage.setItem('loadDeckId', deck.id);
                              }}
                              className="px-2.5 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)] hover:border-[var(--t-border-strong)] transition-colors"
                            >
                              {t('deckBuilder.editDeck')}
                            </Link>
                            <div className="relative">
                              <button
                                onClick={() => setExportMenuId(exportMenuId === deck.id ? null : deck.id)}
                                className="px-2.5 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-muted)] hover:text-[var(--t-text)] hover:border-[var(--t-border-strong)] transition-colors"
                              >
                                {exportingId === deck.id ? '...' : copiedId === deck.id ? t('deckBuilder.exportCopied') : t('deckBuilder.exportButton')}
                              </button>
                              {exportMenuId === deck.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setExportMenuId(null)} />
                                  <div
                                    className="absolute right-0 top-full mt-1 z-20 flex flex-col rounded overflow-hidden"
                                    style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)', minWidth: '140px' }}
                                  >
                                    <button
                                      onClick={() => { setExportMenuId(null); handleExport(deck); }}
                                      disabled={exportingId === deck.id}
                                      className="px-3 py-2 text-[10px] text-left text-[var(--t-text)] hover:bg-[var(--t-border)] transition-colors disabled:opacity-40"
                                    >
                                      {t('deckBuilder.exportAsImage')}
                                    </button>
                                    <button
                                      onClick={() => { setExportMenuId(null); handleExportText(deck); }}
                                      className="px-3 py-2 text-[10px] text-left text-[var(--t-text)] hover:bg-[var(--t-border)] transition-colors"
                                    >
                                      {t('deckBuilder.exportAsText')}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                            <button
                              onClick={() => setConfirmDeleteId(deck.id)}
                              className="px-2.5 py-1 text-[10px] bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-danger)] hover:bg-[#1a1414] hover:border-[var(--t-danger)]/30 transition-colors"
                            >
                              {t('deckBuilder.deleteDeck')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                </EvolvingDeckHolo>
              );
            })}
          </div>
        )}

        {saving && (
          <p className="text-xs mt-3 text-center" style={{ color: 'var(--t-dim)' }}>
            {t('deckManager.saving')}
          </p>
        )}
      </div>
      <Footer />
    </main>
  );
}
