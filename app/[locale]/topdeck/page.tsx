'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { TopdeckBrowser } from '@/components/topdeck/TopdeckBrowser';

export default function TopdeckPage() {
  const t = useTranslations('topdeck');
  const tc = useTranslations('common');

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="font-body-force w-full max-w-5xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-8"
        >
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4">
              <img src="/images/topdeck-logo.webp" alt="TopDeck" style={{ height: 34, width: 'auto' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <Link href="/topdeck/players" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#c4a35a' }}>
                {t('players.navLink')}
              </Link>
              <LanguageSwitcher />
              <Link href="/" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
                {tc('back')}
              </Link>
            </div>
          </div>
          <p className="text-[11px] mt-3" style={{ color: '#555' }}>{t('subtitle')}</p>
        </motion.header>

        <TopdeckBrowser />
      </div>
      <Footer />
    </main>
  );
}
