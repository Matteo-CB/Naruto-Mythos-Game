'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const ACCENT = '#c4a35a';
const HELP_US_BG = '/bgmenu/help-us-bg.webp';

export default function HelpUsPage() {
  const t = useTranslations('helpUs');
  const tCommon = useTranslations('common');

  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: '#08070a', color: '#e8e8e8' }}
    >
      <CloudBackground image={HELP_US_BG} />

      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-xs tracking-widest font-display"
          style={{ color: '#888' }}
        >
          {'< '}
          {tCommon('back')}
        </Link>
        <LanguageSwitcher />
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-[1100px] w-full mx-auto pb-12">
        <motion.h1
          className="text-3xl sm:text-4xl font-display tracking-[0.3em] mb-3 mt-6 text-center uppercase"
          style={{ color: ACCENT }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {t('title')}
        </motion.h1>
        <motion.p
          className="text-xs sm:text-sm tracking-widest mb-12 uppercase text-center"
          style={{ color: '#888' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {t('subtitle')}
        </motion.p>
      </div>

      <Footer />
    </main>
  );
}
