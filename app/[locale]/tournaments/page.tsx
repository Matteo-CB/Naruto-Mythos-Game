'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { TournamentCard } from '@/components/tournament/TournamentCard';
import { CreateTournamentForm } from '@/components/tournament/CreateTournamentForm';
import { useTournamentStore } from '@/stores/tournamentStore';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';

type Tab = 'simulator' | 'create';

export default function TournamentsPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>('simulator');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const {
    simulatorTournaments,
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
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (session?.user) fetchTournaments('simulator');
  }, [session, fetchTournaments]);

  const handleJoinByCode = async () => {
    if (!joinCodeInput.trim()) return;
    setJoinError('');
    try {
      const id = await joinByCode(joinCodeInput.trim().toUpperCase());
      router.push(('/tournaments/' + id) as '/');
    } catch (err: unknown) {
      const errorKey = (err as Error & { errorKey?: string })?.errorKey;
      if (typeof errorKey === 'string') {
        try { setJoinError(tRoot(errorKey)); return; }
        catch { /* fall through */ }
      }
      setJoinError(err instanceof Error ? err.message : t('admin.error'));
    }
  };

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#08070a' }}>
        <p className="font-display text-sm uppercase tracking-widest" style={{ color: '#555' }}>{tc('loading')}</p>
      </main>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'simulator', label: t('title') },
    ...(isAdmin ? [{ key: 'create' as Tab, label: t('create') }] : []),
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
              {t('title')}
            </h1>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="font-display flex items-baseline gap-2 mt-3"
            >
              <span className="text-2xl tabular-nums leading-none" style={{ color: '#c4a35a' }}>
                {simulatorTournaments.length}
              </span>
              <span className="text-[11px] uppercase tracking-[0.3em]" style={{ color: '#666' }}>
                {t('countLabel')}
              </span>
            </motion.div>
          </div>
          <Link
            href="/"
            className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
            style={{ color: '#888' }}
          >
            {tc('back')}
          </Link>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="relative overflow-hidden p-4 sm:p-5 mb-6"
          style={{ backgroundColor: '#0d0c10', clipPath: PANEL_CLIP }}
        >
          <p className="font-display text-[10px] sm:text-[11px] uppercase tracking-widest mb-3" style={{ color: '#666' }}>
            {t('joinByCode')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder={t('enterCode')}
              maxLength={8}
              className="font-display flex-1 px-4 py-2.5 text-sm bg-transparent outline-none"
              style={{ color: '#f0eee7', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 9999, letterSpacing: '0.2em' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoinByCode(); }}
            />
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleJoinByCode}
              className="font-display px-5 py-2.5 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#ffd966]"
              style={{ color: '#c4a35a', backgroundColor: 'rgba(196, 163, 90, 0.12)', borderRadius: 9999 }}
            >
              {t('join')}
            </motion.button>
          </div>
          {joinError && (
            <p className="font-display text-[11px] mt-3 uppercase tracking-widest" style={{ color: '#d97676' }}>
              {joinError}
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 no-scrollbar"
        >
          {tabs.map((tab) => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.94 }}
              onClick={() => { setActiveTab(tab.key); clearError(); }}
              className="font-display shrink-0 px-4 py-2 text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
              style={{
                color: activeTab === tab.key ? '#c4a35a' : '#666',
                backgroundColor: activeTab === tab.key ? 'rgba(196, 163, 90, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                borderRadius: 9999,
              }}
            >
              {tab.label}
            </motion.button>
          ))}
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-display mb-4 px-4 py-3 text-[11px] uppercase tracking-widest"
            style={{ color: '#d97676', backgroundColor: 'rgba(217, 118, 118, 0.08)', clipPath: PANEL_CLIP }}
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {activeTab === 'create' ? (
              <CreateTournamentForm isAdmin={isAdmin} />
            ) : loading ? (
              <p className="font-display text-sm uppercase tracking-widest text-center py-10" style={{ color: '#555' }}>{tc('loading')}</p>
            ) : simulatorTournaments.length === 0 ? (
              <p className="font-display text-sm uppercase tracking-widest text-center py-10" style={{ color: '#555' }}>{t('noTournaments')}</p>
            ) : (
              <div
                className="flex flex-col gap-3"
                style={simulatorTournaments.length > 5 ? { maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' } : undefined}
              >
                {simulatorTournaments.map((tournament) => (
                  <TournamentCard key={tournament.id} tournament={tournament} />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-8 flex items-center justify-center"
        >
          <Link
            href={'/tournaments/results' as '/'}
            className="font-display px-4 py-2 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
            style={{ color: '#888', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 9999 }}
          >
            {t('pastTournaments')}
          </Link>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}
