'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName } from '@/lib/utils/cardLocale';
import { normalizeImagePath } from '@/lib/utils/imagePath';

const ROW_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

interface TradeEntry {
  id: string;
  executedAt: string;
  gaveCards: string[];
  receivedCards: string[];
  partnerUsername: string;
}

function CardRow({ ids }: { ids: string[] }) {
  const locale = useLocale() as 'en' | 'fr';
  if (ids.length === 0) return <span className="text-[11px]" style={{ color: '#555' }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id, i) => {
        const card = getCardById(id);
        const img = card ? normalizeImagePath(card.image_file) : null;
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

export default function TradeHistoryPage() {
  const t = useTranslations('trade');
  const locale = useLocale();
  const [trades, setTrades] = useState<TradeEntry[] | null>(null);

  useEffect(() => {
    fetch('/api/trade/history', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { trades: [] }))
      .then((d) => setTrades(Array.isArray(d.trades) ? d.trades : []))
      .catch(() => setTrades([]));
  }, []);

  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a', color: '#e8e8e8' }}>
      <CloudBackground />
      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/leaderboard?tab=friends" className="text-xs tracking-widest font-display" style={{ color: '#888' }}>
          {'< '}{t('back')}
        </Link>
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-3xl w-full mx-auto pb-10">
        <h1 className="text-2xl font-display tracking-[0.2em] mb-5 mt-2" style={{ color: '#c4a35a' }}>
          {t('history')}
        </h1>

        {trades === null && <p className="text-sm" style={{ color: '#666' }}>{t('loading')}</p>}

        {trades !== null && trades.length === 0 && (
          <p className="text-sm" style={{ color: '#555' }}>{t('historyEmpty')}</p>
        )}

        {trades !== null && trades.length > 0 && (
          <div className="flex flex-col gap-2">
            {trades.map((tr, i) => (
              <motion.div
                key={tr.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3), ease: 'easeOut' }}
                className="px-4 py-3"
                style={{ backgroundColor: '#0d0c10', clipPath: ROW_CLIP, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>
                    {t('historyWith', { name: tr.partnerUsername })}
                  </span>
                  <span className="text-[10px]" style={{ color: '#666' }}>
                    {new Date(tr.executedAt).toLocaleDateString(locale)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-widest block mb-1" style={{ color: '#d97676' }}>{t('historyGave')}</span>
                    <CardRow ids={tr.gaveCards} />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-widest block mb-1" style={{ color: '#5fb05f' }}>{t('historyReceived')}</span>
                    <CardRow ids={tr.receivedCards} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
