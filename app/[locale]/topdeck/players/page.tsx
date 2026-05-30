'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ROW_CLIP, EASE, TopdeckCredit } from '@/components/topdeck/shared';

interface PlayerSummary {
  playerKey: string;
  playerName: string;
  playerId: string | null;
  tournamentsPlayed: number;
}

export default function TopdeckPlayersPage() {
  const t = useTranslations('topdeck.players');
  const tc = useTranslations('common');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (debounced.trim().length < 2) { setPlayers([]); return; }
    setLoading(true);
    let cancelled = false;
    fetch(`/api/topdeck/players?q=${encodeURIComponent(debounced.trim())}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setPlayers(d.players ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPlayers([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [debounced]);

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="font-body-force w-full max-w-3xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
        <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="mb-8">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <Link href="/topdeck" className="flex items-center gap-3">
              <img src="/images/topdeck-logo.webp" alt="TopDeck" style={{ height: 28, width: 'auto', opacity: 0.92 }} />
            </Link>
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <Link href="/topdeck" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
                {tc('back')}
              </Link>
            </div>
          </div>
          <h1 className="font-display-force text-2xl sm:text-4xl tracking-wider uppercase mt-4" style={{ color: '#f2efe7', letterSpacing: '0.06em', textShadow: '0 0 22px rgba(196,163,90,0.18)' }}>
            {t('title')}
          </h1>
        </motion.header>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.06 }} className="relative mb-6">
          <div className="flex items-center gap-3 px-5 py-3" style={{ backgroundColor: 'rgba(13,12,16,0.85)', borderRadius: 9999 }}>
            <img src="/images/icons/search.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.35, flexShrink: 0 }} />
            <input
              autoFocus type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
              className="font-display flex-1 bg-transparent text-sm outline-none" style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
            />
            {search && <button onClick={() => setSearch('')} className="font-display text-[11px] uppercase cursor-pointer" style={{ color: '#888' }}>X</button>}
          </div>
        </motion.div>

        <section>
          {debounced.trim().length < 2 ? (
            <p className="font-display text-sm text-center py-16" style={{ color: '#555' }}>{t('hint')}</p>
          ) : loading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: [0.16, 0.36, 0.16] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.05 }} style={{ height: 46, backgroundColor: '#0c0b10', clipPath: ROW_CLIP }} />
              ))}
            </div>
          ) : players.length === 0 ? (
            <p className="font-display text-base uppercase tracking-wider text-center py-16" style={{ color: '#9a9a9a' }}>{t('noResults')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {players.map((p, i) => (
                <motion.div key={p.playerKey} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3), ease: EASE }}>
                  <Link
                    href={`/topdeck/players/${encodeURIComponent(p.playerKey)}` as Parameters<typeof Link>[0]['href']}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors"
                    style={{ backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#141017'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = i % 2 === 0 ? '#0c0b10' : '#0a0a0d'; }}
                  >
                    <span className="font-display text-sm truncate" style={{ color: '#e8e2d4' }}>{p.playerName}</span>
                    <span className="font-display text-[12px] tabular-nums shrink-0" style={{ color: '#c4a35a' }}>
                      {p.tournamentsPlayed} <span style={{ color: '#6a6a6a' }}>{t('tournamentsPlayed')}</span>
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-center mt-10"><TopdeckCredit /></div>
      </div>
      <Footer />
    </main>
  );
}
