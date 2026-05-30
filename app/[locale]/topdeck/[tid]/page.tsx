'use client';

import { use } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { TournamentDetail } from '@/components/topdeck/TournamentDetail';

export default function TopdeckTournamentPage({ params }: { params: Promise<{ tid: string }> }) {
  const { tid } = use(params);
  const td = useTranslations('topdeck.detail');

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="font-body-force w-full max-w-4xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-8 flex items-center justify-between gap-3 flex-wrap"
        >
          <Link href="/topdeck" className="flex items-center gap-3">
            <img src="/images/topdeck-logo.webp" alt="TopDeck" style={{ height: 26, width: 'auto', opacity: 0.92 }} />
          </Link>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Link href="/topdeck" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
              {td('backToList')}
            </Link>
          </div>
        </motion.header>

        <TournamentDetail tid={decodeURIComponent(tid)} />
      </div>
      <Footer />
    </main>
  );
}
