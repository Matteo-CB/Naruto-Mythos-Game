'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';

export default function CardNexusPage() {
  const t = useTranslations('cardNexus');

  return (
    <main id="main-content" className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />
      <DecorativeIcons />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-xl w-full relative z-10"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.h1
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-3xl sm:text-4xl font-black uppercase tracking-wider mb-3"
              style={{ color: '#c4a35a', fontFamily: 'var(--font-display)', textShadow: '0 0 30px rgba(196, 163, 90, 0.3)' }}
            >
              Naruto Mythos
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg font-bold uppercase tracking-widest"
              style={{ color: '#e0e0e0' }}
            >
              x Card Nexus
            </motion.p>
          </div>

          {/* Main content card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-6 sm:p-8 mb-6"
            style={{
              backgroundColor: 'rgba(14, 14, 18, 0.95)',
              border: '1px solid rgba(196, 163, 90, 0.15)',
              borderLeft: '3px solid #c4a35a',
            }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: '#c4a35a' }}>
              {t('whyTitle')}
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#bbb' }}>
              {t('whyDesc')}
            </p>

            <div className="flex flex-col gap-3 mb-5">
              {(['reason1', 'reason2', 'reason3', 'reason4'] as const).map((key, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="flex items-start gap-3 p-3"
                  style={{ backgroundColor: 'rgba(196, 163, 90, 0.04)', borderLeft: '2px solid rgba(196, 163, 90, 0.2)' }}
                >
                  <span className="text-lg font-black shrink-0" style={{ color: '#c4a35a', fontFamily: 'var(--font-display)' }}>
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed" style={{ color: '#999' }}>
                    {t(key)}
                  </p>
                </motion.div>
              ))}
            </div>

            <p className="text-xs leading-relaxed" style={{ color: '#888' }}>
              {t('callToAction')}
            </p>
          </motion.div>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0, type: 'spring', stiffness: 200 }}
            className="text-center mb-6"
          >
            <a
              href="https://feedback.cardnexus.com/en/p/cyclone-naruto-mythos-support"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full py-4 text-sm sm:text-base font-black uppercase tracking-widest transition-all"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.12)',
                border: '2px solid #c4a35a',
                color: '#c4a35a',
                boxShadow: '0 0 20px rgba(196, 163, 90, 0.2), 0 0 40px rgba(196, 163, 90, 0.1), inset 0 0 20px rgba(196, 163, 90, 0.05)',
                textShadow: '0 0 12px rgba(196, 163, 90, 0.5)',
              }}
              onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.backgroundColor = 'rgba(196, 163, 90, 0.2)';
                t.style.boxShadow = '0 0 30px rgba(196, 163, 90, 0.4), 0 0 60px rgba(196, 163, 90, 0.2), inset 0 0 30px rgba(196, 163, 90, 0.1)';
                t.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.backgroundColor = 'rgba(196, 163, 90, 0.12)';
                t.style.boxShadow = '0 0 20px rgba(196, 163, 90, 0.2), 0 0 40px rgba(196, 163, 90, 0.1), inset 0 0 20px rgba(196, 163, 90, 0.05)';
                t.style.transform = 'scale(1)';
              }}
            >
              {t('upvoteButton')}
            </a>
          </motion.div>

          {/* Back */}
          <div className="text-center">
            <Link
              href="/"
              className="text-xs uppercase tracking-wider transition-colors"
              style={{ color: '#555' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#c4a35a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
            >
              {t('back')}
            </Link>
          </div>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}
