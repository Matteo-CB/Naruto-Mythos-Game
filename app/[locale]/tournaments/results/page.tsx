'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { motion } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';
import { TournamentCard } from '@/components/tournament/TournamentCard';
import { useSettingsStore } from '@/stores/settingsStore';
import type { TournamentData } from '@/stores/tournamentStore';

type FilterTab = 'all' | 'simulator' | 'player';

export default function TournamentResultsPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data: session, status } = useSession();
  const { animationsEnabled } = useSettingsStore();

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
    return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}><p className="text-sm" style={{ color: '#888888' }}>{tc('loading')}</p></div>);
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: tc('all') },
    { key: 'simulator', label: t('simulatorTab') },
    { key: 'player', label: t('playerTab') },
  ];

  return (
    <div id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground animated={animationsEnabled} />
      <DecorativeIcons animated={animationsEnabled} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-3xl mx-auto relative z-10 flex-1 w-full px-4 py-8">

        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-2xl font-bold uppercase tracking-wider text-center mb-6" style={{ color: '#c4a35a' }}>{t('resultsTitle')}</motion.h1>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="flex mb-6" style={{ borderBottom: '1px solid #262626' }}>
          {filterTabs.map((tab) => (
            <button key={tab.key} onClick={() => setFilterTab(tab.key)} className="flex-1 py-3 text-sm font-medium uppercase tracking-wider transition-colors cursor-pointer" style={{ color: filterTab === tab.key ? '#c4a35a' : '#555555', borderBottom: filterTab === tab.key ? '2px solid #c4a35a' : '2px solid transparent', backgroundColor: 'transparent' }}>{tab.label}</button>
          ))}
        </motion.div>

        <motion.div key={filterTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {loading ? (
            <p className="text-sm text-center py-8" style={{ color: '#888888' }}>{tc('loading')}</p>
          ) : filteredResults.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#888888' }}>{t('noResults')}</p>
          ) : (
            <div className="space-y-3">
              {filteredResults.map((tournament) => (
                <Link key={tournament.id} href={('/tournaments/' + tournament.id) as '/'}><TournamentCard tournament={tournament} /></Link>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.3 }} className="mt-8 text-center">
          <Link href={'/tournaments' as '/'} className="text-sm transition-colors" style={{ color: '#888888' }}>{'<'} {t('backToList')}</Link>
        </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
