'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import CardFace from '@/components/cards/CardFace';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

type FilterMode = 'all' | 'banned' | 'authorized';

export default function AdminCardsPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const allCards = useMemo(() => {
    const chars = getPlayableCharacters();
    const missions = getPlayableMissions();
    return [...chars, ...missions] as (CharacterCard | MissionCard)[];
  }, []);

  useEffect(() => {
    if (session?.user?.email === ADMIN_EMAIL) {
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
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const toggleBan = async (cardId: string) => {
    setTogglingId(cardId);
    try {
      const res = await fetch('/api/admin/banned-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
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
      }
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  };

  // Not admin
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return (
      <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
        <CloudBackground />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 relative z-10">
            <p className="text-sm" style={{ color: '#b33e3e' }}>
              {t('adminCards.forbidden')}
            </p>
            <Link
              href="/"
              className="px-6 py-2.5 text-sm"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
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
    // Search filter
    if (searchLower && !card.name_fr.toLowerCase().includes(searchLower) && !card.id.toLowerCase().includes(searchLower)) {
      return false;
    }
    // Status filter
    if (filter === 'banned' && !bannedIds.has(card.id)) return false;
    if (filter === 'authorized' && bannedIds.has(card.id)) return false;
    return true;
  });

  const bannedCount = bannedIds.size;

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />

      <div className="flex-1 flex flex-col items-center px-4 py-8 relative z-10">
        <div className="w-full max-w-6xl flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: '#c4a35a' }}>
              {t('adminCards.title')}
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-xs"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {t('common.back')}
            </Link>
          </div>

          {/* Stats + Search */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
              {t('adminCards.bannedCount', { count: bannedCount })}
            </span>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminCards.search')}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded"
              style={{
                backgroundColor: '#141414',
                border: '1px solid #262626',
                color: '#e0e0e0',
                outline: 'none',
              }}
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'banned', 'authorized'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: filter === f ? '#1a1a1a' : '#0a0a0a',
                  borderBottom: filter === f ? `2px solid ${f === 'banned' ? '#b33e3e' : f === 'authorized' ? '#4a9e4a' : '#c4a35a'}` : '2px solid transparent',
                  color: filter === f ? '#e0e0e0' : '#555555',
                }}
              >
                {t(`adminCards.filter.${f}`)}
              </button>
            ))}
          </div>

          {/* Card Grid */}
          {loading ? (
            <p className="text-sm" style={{ color: '#888888' }}>{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm" style={{ color: '#555555' }}>{t('adminCards.noCards')}</p>
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
                      backgroundColor: '#141414',
                      border: `1px solid ${isBanned ? '#b33e3e40' : '#262626'}`,
                      opacity: isBanned ? 0.6 : 1,
                      transition: 'opacity 0.2s, border-color 0.2s',
                    }}
                  >
                    {/* Card thumbnail */}
                    <div style={{ width: '100%' }}>
                      <CardFace card={card} />
                    </div>

                    {/* Card info + toggle */}
                    <div className="p-2 flex flex-col gap-1.5">
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#e0e0e0',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.name_fr}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#555555',
                        }}
                      >
                        {card.id}
                      </div>

                      <button
                        onClick={() => toggleBan(card.id)}
                        disabled={isToggling}
                        className="w-full py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                        style={{
                          backgroundColor: isBanned ? '#1a0a0a' : '#0a1a0a',
                          border: `1px solid ${isBanned ? '#b33e3e' : '#4a9e4a'}`,
                          color: isBanned ? '#b33e3e' : '#4a9e4a',
                          opacity: isToggling ? 0.5 : 1,
                          cursor: isToggling ? 'wait' : 'pointer',
                        }}
                      >
                        {isBanned ? t('adminCards.banned') : t('adminCards.authorized')}
                      </button>
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
