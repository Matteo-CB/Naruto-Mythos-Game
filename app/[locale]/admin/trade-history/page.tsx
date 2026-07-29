'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName } from '@/lib/utils/cardLocale';
import { normalizeImagePath, portraitImagePath } from '@/lib/utils/imagePath';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];
const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

interface AdminTrade {
  id: string;
  executedAt: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  senderCards: string[];
  receiverCards: string[];
  isAdminSim: boolean;
}

function CardRow({ ids }: { ids: string[] }) {
  const locale = useLocale() as 'en' | 'fr';
  if (ids.length === 0) return <span className="text-[11px]" style={{ color: '#555' }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id, i) => {
        const card = getCardById(id);
        const img = card ? portraitImagePath(card) : null;
        return img ? (
          <img key={`${id}-${i}`} src={img} alt={card ? getCardName(card, locale) : id} title={card ? getCardName(card, locale) : id}
            style={{ width: 32, height: 45, objectFit: 'cover' }} draggable={false} />
        ) : (
          <span key={`${id}-${i}`} className="text-[10px] px-1" style={{ color: '#888' }}>{id}</span>
        );
      })}
    </div>
  );
}

export default function AdminTradeHistoryPage() {
  const t = useTranslations('adminTradeHistory');
  const locale = useLocale();
  const { data: session } = useSession();
  const [trades, setTrades] = useState<AdminTrade[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const isAdmin = !!session?.user && (
    (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) ||
    session.user.email === ADMIN_EMAIL
  );

  const load = useCallback((username: string) => {
    setTrades(null);
    const qs = username ? `?username=${encodeURIComponent(username)}` : '';
    fetch(`/api/admin/trade-history${qs}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { trades: [] }))
      .then((d) => setTrades(Array.isArray(d.trades) ? d.trades : []))
      .catch(() => setTrades([]));
  }, []);

  useEffect(() => {
    if (isAdmin) load(activeFilter);
  }, [isAdmin, activeFilter, load]);

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <CloudBackground />
        <p className="relative z-10 font-display uppercase tracking-widest text-sm" style={{ color: '#b33e3e' }}>
          {t('forbidden')}
        </p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
      <CloudBackground />
      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/admin" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
          {t('back')}
        </Link>
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-4xl w-full mx-auto pb-10">
        <h1 className="text-2xl font-display tracking-[0.2em] mb-1 mt-2" style={{ color: '#c4a35a' }}>
          {t('title')}
        </h1>
        <p className="text-xs mb-5" style={{ color: '#666' }}>{t('subtitle')}</p>

        <div className="flex items-center gap-2 mb-5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setActiveFilter(query.trim()); }}
            placeholder={t('filterPlaceholder')}
            className="flex-1 max-w-[260px] px-2.5 py-2 text-xs focus:outline-none"
            style={{ backgroundColor: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', color: '#e0e0e0' }}
          />
          <button onClick={() => setActiveFilter(query.trim())}
            className="font-display px-3 py-2 text-[10px] uppercase tracking-widest" style={{ backgroundColor: '#c4a35a', color: '#0a0a0a' }}>
            {t('filter')}
          </button>
          {activeFilter && (
            <button onClick={() => { setQuery(''); setActiveFilter(''); }}
              className="font-display px-3 py-2 text-[10px] uppercase tracking-widest" style={{ backgroundColor: '#1a1a1a', color: '#888' }}>
              {t('clear')}
            </button>
          )}
        </div>

        {trades === null && <p className="text-sm" style={{ color: '#666' }}>{t('loading')}</p>}

        {trades !== null && trades.length === 0 && (
          <p className="text-sm" style={{ color: '#555' }}>{t('empty')}</p>
        )}

        {trades !== null && trades.length > 0 && (
          <div className="flex flex-col gap-2">
            {trades.map((tr) => (
              <div key={tr.id} className="p-3" style={{ backgroundColor: '#0f0f0f', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>
                    {t('tradeBetween', { a: tr.senderUsername || tr.senderId, b: tr.receiverUsername || tr.receiverId })}
                  </span>
                  <div className="flex items-center gap-2">
                    {tr.isAdminSim && (
                      <span className="text-[8px] uppercase tracking-widest px-1.5 py-0.5" style={{ backgroundColor: '#c4a35a1f', color: '#c4a35a' }}>
                        {t('adminSimBadge')}
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: '#666' }}>
                      {new Date(tr.executedAt).toLocaleString(locale)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-widest block mb-1" style={{ color: '#d97676' }}>
                      {tr.senderUsername || tr.senderId} {t('gave')}
                    </span>
                    <CardRow ids={tr.senderCards} />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-widest block mb-1" style={{ color: '#5fb05f' }}>
                      {tr.receiverUsername || tr.receiverId} {t('gave')}
                    </span>
                    <CardRow ids={tr.receiverCards} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
