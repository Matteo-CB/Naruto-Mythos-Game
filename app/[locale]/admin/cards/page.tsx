'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import CardFace from '@/components/cards/CardFace';
import { getBannableCards } from '@/lib/data/bannableCards';
import { getCardName } from '@/lib/utils/cardLocale';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

type FilterMode = 'all' | 'banned' | 'authorized';

export default function AdminCardsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [filterSet, setFilterSet] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'character' | 'attachment' | 'mission' | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [banReasonCardId, setBanReasonCardId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [bannedReasons, setBannedReasons] = useState<Map<string, string | null>>(new Map());

  const allCards = useMemo(() => {
    return getBannableCards();
  }, []);

  const availableSets = useMemo(() => {
    const ids = new Set<string>();
    for (const card of allCards) if (card.set) ids.add(card.set);
    return [...ids].sort();
  }, []);

  useEffect(() => {
    if (session?.user?.email === ADMIN_EMAIL || ADMIN_USERNAMES.includes(session?.user?.name ?? '')) {
      fetchBanned();
    }
  }, [session]);

  const fetchBanned = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/banned-cards');
      const data = await res.json();
      if (res.ok) {
        setBannedIds(new Set(data.bannedCardIds ?? []));
        const reasonMap = new Map<string, string | null>();
        for (const b of (data.bannedCards ?? [])) {
          reasonMap.set(b.cardId, b.reason ?? null);
        }
        setBannedReasons(reasonMap);
      }
    } catch {
      
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = async (cardId: string, reason?: string) => {
    const isBanned = bannedIds.has(cardId);
    
    if (!isBanned && reason === undefined) {
      setBanReasonCardId(cardId);
      setBanReason('');
      return;
    }
    setTogglingId(cardId);
    setBanReasonCardId(null);
    try {
      const res = await fetch('/api/admin/banned-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, reason: reason || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setBannedIds((prev) => {
          const next = new Set(prev);
          if (data.banned) {
            next.add(cardId);
          } else {
            next.delete(cardId);
          }
          return next;
        });
        setBannedReasons((prev) => {
          const next = new Map(prev);
          if (data.banned) next.set(cardId, reason ?? null);
          else next.delete(cardId);
          return next;
        });
      }
    } catch {
      
    } finally {
      setTogglingId(null);
    }
  };

  
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 relative z-10">
            <p className="text-sm" style={{ color: 'var(--t-danger)' }}>
              {t('adminCards.forbidden')}
            </p>
            <Link
              href="/"
              className="px-6 py-2.5 text-sm"
              style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
            >
              {t('common.back')}
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  const searchLower = search.toLowerCase();
  const filtered = allCards.filter((card) => {
    
    if (searchLower && !card.name_fr.toLowerCase().includes(searchLower) && !card.id.toLowerCase().includes(searchLower)) {
      return false;
    }
    
    if (filter === 'banned' && !bannedIds.has(card.id)) return false;
    if (filter === 'authorized' && bannedIds.has(card.id)) return false;
    if (filterSet && card.set !== filterSet) return false;
    if (typeFilter && ((card as { card_type?: string }).card_type ?? 'character') !== typeFilter) return false;
    return true;
  });

  const bannedCount = bannedIds.size;

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground />

      <div className="flex-1 flex flex-col items-center px-4 py-8 relative z-10">
        <div className="w-full max-w-6xl flex flex-col gap-6">
          
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: 'var(--t-accent)' }}>
              {t('adminCards.title')}
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-xs"
              style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-muted)' }}
            >
              {t('common.back')}
            </Link>
          </div>

          
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>
              {t('adminCards.bannedCount', { count: bannedCount })}
            </span>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminCards.search')}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded"
              style={{
                backgroundColor: 'var(--t-surface)',
                border: '1px solid var(--t-border)',
                color: 'var(--t-text)',
                outline: 'none',
              }}
            />
          </div>

          
          <div className="flex flex-wrap gap-2">
            {(['all', 'banned', 'authorized'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: filter === f ? 'var(--t-surface-2)' : 'var(--t-bg)',
                  borderBottom: filter === f ? `2px solid ${f === 'banned' ? 'var(--t-danger)' : f === 'authorized' ? '#4a9e4a' : 'var(--t-accent)'}` : '2px solid transparent',
                  color: filter === f ? 'var(--t-text)' : 'var(--t-dim)',
                }}
              >
                {t(`adminCards.filter.${f}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {([null, 'character', 'attachment', 'mission'] as const).map((type) => {
              const active = typeFilter === type;
              const label = type === null
                ? t('deckBuilder.filters.allTypes')
                : type === 'character'
                  ? t('deckBuilder.filters.typeCharacters')
                  : type === 'attachment'
                    ? t('deckBuilder.filters.typeAttachments')
                    : t('collection.missions');
              return (
                <button
                  key={type ?? 'all'}
                  onClick={() => setTypeFilter(type)}
                  aria-pressed={active}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--t-accent-glow)' : 'var(--t-bg)',
                    color: active ? 'var(--t-accent)' : 'var(--t-dim)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {([null, ...availableSets] as const).map((sid) => {
              const active = filterSet === sid;
              return (
                <button
                  key={sid ?? 'all'}
                  onClick={() => setFilterSet(sid)}
                  aria-pressed={active}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--t-accent-glow)' : 'var(--t-bg)',
                    color: active ? 'var(--t-accent)' : 'var(--t-dim)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {sid ?? t('collection.allSets')}
                </button>
              );
            })}
          </div>

          
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--t-muted)' }}>{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--t-dim)' }}>{t('adminCards.noCards')}</p>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              }}
            >
              {filtered.map((card) => {
                const isBanned = bannedIds.has(card.id);
                const isToggling = togglingId === card.id;

                return (
                  <div
                    key={card.id}
                    className="flex flex-col rounded-lg overflow-hidden"
                    style={{
                      backgroundColor: 'var(--t-surface)',
                      border: `1px solid ${isBanned ? 'var(--t-danger)40' : 'var(--t-border)'}`,
                      opacity: isBanned ? 0.6 : 1,
                      transition: 'opacity 0.2s, border-color 0.2s',
                    }}
                  >
                    
                    <div style={{ width: '100%' }}>
                      <CardFace card={card} />
                    </div>

                    
                    <div className="p-2 flex flex-col gap-1.5">
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--t-text)',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getCardName(card, locale)}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--t-dim)',
                        }}
                      >
                        {card.id}
                      </div>

                      
                      {isBanned && bannedReasons.get(card.id) && (
                        <div style={{ fontSize: '9px', color: 'var(--t-danger)', lineHeight: 1.2, fontStyle: 'italic' }}>
                          {bannedReasons.get(card.id)}
                        </div>
                      )}

                      
                      {banReasonCardId === card.id && (
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder={t('tournament.reasonOptional')}
                            className="w-full px-2 py-1 text-xs rounded"
                            style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-danger)40', color: 'var(--t-text)', outline: 'none' }}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') toggleBan(card.id, banReason); }}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => toggleBan(card.id, banReason)}
                              className="flex-1 py-1 text-xs font-bold uppercase"
                              style={{ backgroundColor: 'var(--t-danger-surface)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)' }}
                            >
                              {t('adminCards.ban')}
                            </button>
                            <button
                              onClick={() => setBanReasonCardId(null)}
                              className="px-2 py-1 text-xs"
                              style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)', color: 'var(--t-dim)' }}
                              aria-label={t('common.cancel')}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}

                      {banReasonCardId !== card.id && (
                        <button
                          onClick={() => toggleBan(card.id)}
                          disabled={isToggling}
                          className="w-full py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                          style={{
                            backgroundColor: isBanned ? '#1a0a0a' : '#0a1a0a',
                            border: `1px solid ${isBanned ? 'var(--t-danger)' : '#4a9e4a'}`,
                            color: isBanned ? 'var(--t-danger)' : '#4a9e4a',
                            opacity: isToggling ? 0.5 : 1,
                            cursor: isToggling ? 'wait' : 'pointer',
                          }}
                        >
                          {isBanned ? t('adminCards.banned') : t('adminCards.authorized')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
