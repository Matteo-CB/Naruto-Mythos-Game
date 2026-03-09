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
import { CreateTournamentForm } from '@/components/tournament/CreateTournamentForm';
import { useTournamentStore } from '@/stores/tournamentStore';
import { useSettingsStore } from '@/stores/settingsStore';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

type Tab = 'simulator' | 'player' | 'create';

export default function TournamentsPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const router = useRouter();
  const { data: session, status } = useSession();
  const { animationsEnabled } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<Tab>('simulator');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const {
    simulatorTournaments,
    playerTournaments,
    loading,
    error,
    fetchTournaments,
    joinByCode,
    clearError,
  } = useTournamentStore();

  const isAdmin =
    ADMIN_EMAILS.includes(session?.user?.email ?? '') ||
    ADMIN_USERNAMES.includes(session?.user?.name ?? '');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchTournaments('simulator');
      fetchTournaments('player');
    }
  }, [session, fetchTournaments]);

  const handleJoinByCode = async () => {
    if (!joinCodeInput.trim()) return;
    setJoinError('');
    try {
      const id = await joinByCode(joinCodeInput.trim().toUpperCase());
      router.push(('/tournaments/' + id) as '/');
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : 'Error');
    }
  };

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm" style={{ color: '#888888' }}>{tc('loading')}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'simulator', label: t('simulatorTab') },
    { key: 'player', label: t('playerTab') },
    { key: 'create', label: t('create') },
  ];

  const currentList = activeTab === 'simulator' ? simulatorTournaments : activeTab === 'player' ? playerTournaments : [];

  return (
    <div id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground animated={animationsEnabled} />
      <DecorativeIcons animated={animationsEnabled} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-3xl mx-auto relative z-10 flex-1 w-full px-4 py-8">
        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-2xl font-bold uppercase tracking-wider text-center mb-6" style={{ color: '#c4a35a' }}>{t('title')}</motion.h1>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="mb-6 p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#888888' }}>{t('joinByCode')}</p>
          <div className="flex gap-2">
            <input type="text" value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} placeholder={t('enterCode')} maxLength={8} className="flex-1 px-3 py-2 text-sm outline-none" style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', color: '#e0e0e0' }} onKeyDown={(e) => { if (e.key === 'Enter') handleJoinByCode(); }} />
            <button onClick={handleJoinByCode} className="px-4 py-2 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors" style={{ backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}>{t('join')}</button>
          </div>
          {joinError && <p className="text-xs mt-2" style={{ color: '#cc4444' }}>{joinError}</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="flex mb-6" style={{ borderBottom: '1px solid #262626' }}>
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); clearError(); }} className="flex-1 py-3 text-sm font-medium uppercase tracking-wider transition-colors cursor-pointer" style={{ color: activeTab === tab.key ? '#c4a35a' : '#555555', borderBottom: activeTab === tab.key ? '2px solid #c4a35a' : '2px solid transparent', backgroundColor: 'transparent' }}>{tab.label}</button>
          ))}
        </motion.div>

        {error && <div className="mb-4 p-3 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#cc4444' }}>{error}</div>}

        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {activeTab === 'create' ? (
            <CreateTournamentForm isAdmin={isAdmin} />
          ) : (
            <>
              {loading ? (
                <p className="text-sm text-center py-8" style={{ color: '#888888' }}>{tc('loading')}</p>
              ) : currentList.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: '#888888' }}>{t('noTournaments')}</p>
              ) : (
                <div className="space-y-3">
                  {currentList.map((tournament) => (
                    <Link key={tournament.id} href={('/tournaments/' + tournament.id) as '/'}><TournamentCard tournament={tournament} /></Link>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.3 }} className="mt-8 text-center">
          <Link href={'/tournaments/results' as '/'} className="text-sm transition-colors underline" style={{ color: '#888888' }}>{t('pastTournaments')}</Link>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.35 }} className="mt-4 text-center">
          <Link href="/" className="text-sm transition-colors" style={{ color: '#888888' }}>{'<'} {tc('back')}</Link>
        </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
