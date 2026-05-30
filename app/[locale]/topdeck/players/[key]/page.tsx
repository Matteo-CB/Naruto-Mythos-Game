'use client';

import { use, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PANEL_CLIP, ROW_CLIP, EASE, TopdeckCredit, formatTournamentDate } from '@/components/topdeck/shared';
import { pct } from '@/lib/topdeck/detail';

interface PlayerResult {
  tid: string;
  tournamentName: string;
  game: string;
  format: string;
  startDate: string | null;
  standing: number | null;
  points: number | null;
  winRate: number | null;
}
interface PlayerStats {
  playerKey: string;
  playerName: string;
  playerId: string | null;
  tournamentsPlayed: number;
  bestFinish: number | null;
  wins: number;
  top8s: number;
  avgWinRate: number | null;
  games: string[];
  results: PlayerResult[];
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#5f5f5f' }}>{label}</span>
      <span className="font-display text-lg tabular-nums" style={{ color: '#e8e2d4' }}>{value}</span>
    </div>
  );
}

export default function TopdeckPlayerStatsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const t = useTranslations('topdeck.players');
  const tdt = useTranslations('topdeck.detail');
  const locale = useLocale();
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/topdeck/players/${encodeURIComponent(decodeURIComponent(key))}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } if (!r.ok) throw new Error('bad'); return r.json(); })
      .then((d) => { if (d?.player) setData(d.player); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [key]);

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="font-body-force w-full max-w-3xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
        <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="mb-8 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/topdeck" className="flex items-center gap-3">
            <img src="/images/topdeck-logo.webp" alt="TopDeck" style={{ height: 26, width: 'auto', opacity: 0.92 }} />
          </Link>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Link href="/topdeck/players" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
              {t('backToPlayers')}
            </Link>
          </div>
        </motion.header>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: [0.16, 0.36, 0.16] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.06 }} style={{ height: i === 0 ? 120 : 44, backgroundColor: '#0c0b10', clipPath: ROW_CLIP }} />
            ))}
          </div>
        ) : notFound || !data ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="font-display text-base uppercase tracking-wider" style={{ color: '#9a9a9a' }}>{t('notFound')}</p>
            <Link href="/topdeck/players" className="font-display text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#c4a35a' }}>{t('backToPlayers')}</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="relative overflow-hidden p-5 sm:p-6" style={{ backgroundColor: '#0d0c10', clipPath: PANEL_CLIP }}>
              <h1 className="font-display-force text-xl sm:text-3xl leading-tight mb-1" style={{ color: '#f2efe7', textShadow: '0 0 22px rgba(196,163,90,0.15)' }}>{data.playerName}</h1>
              {data.games.length > 0 && <p className="font-display text-xs mb-5" style={{ color: '#8a8a8a' }}>{data.games.join(', ')}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <StatBox label={t('tournamentsPlayed')} value={String(data.tournamentsPlayed)} />
                <StatBox label={t('bestFinish')} value={data.bestFinish != null ? `#${data.bestFinish}` : '-'} />
                <StatBox label={t('wins')} value={String(data.wins)} />
                <StatBox label={t('top8s')} value={String(data.top8s)} />
                <StatBox label={t('avgWinRate')} value={pct(data.avgWinRate)} />
              </div>
            </motion.div>

            <div>
              <span className="font-display text-xs uppercase tracking-[0.25em] block mb-3" style={{ color: '#c4a35a' }}>{t('history')}</span>
              <div className="flex flex-col gap-1">
                {data.results.map((r, i) => (
                  <Link
                    key={`${r.tid}-${i}`}
                    href={`/topdeck/tournaments/${encodeURIComponent(r.tid)}` as Parameters<typeof Link>[0]['href']}
                    className="grid grid-cols-[36px_1fr_auto] gap-3 items-center px-3 py-2.5 transition-colors"
                    style={{ backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#141017'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = i % 2 === 0 ? '#0c0b10' : '#0a0a0d'; }}
                  >
                    <span className="font-display tabular-nums text-sm" style={{ color: r.standing && r.standing <= 3 ? '#c4a35a' : '#888' }}>{r.standing != null ? `#${r.standing}` : '-'}</span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-display text-sm truncate" style={{ color: '#e8e2d4' }}>{r.tournamentName}</span>
                      <span className="font-display text-[11px]" style={{ color: '#6a6a6a' }}>{r.format}{r.startDate ? `, ${formatTournamentDate(r.startDate, locale)}` : ''}</span>
                    </span>
                    <span className="font-display tabular-nums text-xs text-right" style={{ color: '#9a9a9a' }}>{pct(r.winRate)}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex justify-center mt-4"><TopdeckCredit /></div>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
