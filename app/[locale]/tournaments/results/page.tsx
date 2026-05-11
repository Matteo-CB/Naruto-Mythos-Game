'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { TournamentCard } from '@/components/tournament/TournamentCard';
import type { TournamentData } from '@/stores/tournamentStore';

type FilterTab = 'all' | 'simulator';

export default function TournamentResultsPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data: session, status } = useSession();

  const [results, setResults] = useState<TournamentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status, router]);

  useEffect(() => {
    if (!session?.user) return;
    setLoading(true);
    fetch('/api/tournaments?status=completed')
      .then((res) => res.json())
      .then((data) => { setResults(data.tournaments || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session]);

  const filteredResults = filterTab === 'all' ? results : results.filter((r) => r.type === filterTab);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#08070a' }}>
        <p className="font-display text-sm uppercase tracking-widest" style={{ color: '#555' }}>{tc('loading')}</p>
      </main>
    );
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: tc('all') },
    { key: 'simulator', label: t('simulatorTab') },
  ];

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />

      <div className="w-full max-w-3xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex items-end justify-between gap-3 flex-wrap mb-6 sm:mb-8"
        >
          <div>
            <h1
              className="font-display text-3xl sm:text-5xl uppercase tracking-wider leading-none"
              style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 22px rgba(196, 163, 90, 0.18)' }}
            >
              {t('resultsTitle')}
            </h1>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="font-display flex items-baseline gap-2 mt-3"
            >
              <span className="text-2xl tabular-nums leading-none" style={{ color: '#c4a35a' }}>
                {filteredResults.length}
              </span>
              <span className="text-[11px] uppercase tracking-[0.3em]" style={{ color: '#666' }}>
                {tc('all')}
              </span>
            </motion.div>
          </div>
          <Link
            href={'/tournaments' as '/'}
            className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
            style={{ color: '#888' }}
          >
            {t('backToList')}
          </Link>
        </motion.header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 no-scrollbar"
        >
          {filterTabs.map((tab) => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.94 }}
              onClick={() => setFilterTab(tab.key)}
              className="font-display shrink-0 px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
              style={{
                color: filterTab === tab.key ? '#c4a35a' : '#666',
                backgroundColor: filterTab === tab.key ? 'rgba(196, 163, 90, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                borderRadius: 9999,
              }}
            >
              {tab.label}
            </motion.button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={filterTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {loading ? (
              <p className="font-display text-sm uppercase tracking-widest text-center py-10" style={{ color: '#555' }}>{tc('loading')}</p>
            ) : filteredResults.length === 0 ? (
              <p className="font-display text-sm uppercase tracking-widest text-center py-10" style={{ color: '#555' }}>{t('noResults')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredResults.map((tournament) => (
                  <Link key={tournament.id} href={('/tournaments/' + tournament.id) as '/'} className="block">
                    <TournamentCard tournament={tournament} />
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <Footer />
    </main>
  );
}
