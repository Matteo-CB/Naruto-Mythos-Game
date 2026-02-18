'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Footer } from '@/components/Footer';

export default function LegalPage() {
  const t = useTranslations('legal');

  return (
    <div
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="auth" />

      <header
        className="relative z-20 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid rgba(196, 163, 90, 0.15)' }}
      >
        <Link
          href="/"
          className="text-sm px-3 py-1.5 rounded"
          style={{
            color: '#c4a35a',
            border: '1px solid rgba(196, 163, 90, 0.3)',
            backgroundColor: 'rgba(196, 163, 90, 0.05)',
          }}
        >
          ← {t('back')}
        </Link>

        <h1
          className="text-xl font-bold tracking-wider"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

        <LanguageSwitcher />
      </header>

      <main className="relative z-10 flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
        <div
          className="rounded p-6"
          style={{
            backgroundColor: 'rgba(20, 20, 20, 0.8)',
            border: '1px solid rgba(196, 163, 90, 0.1)',
          }}
        >
          <h2
            className="text-lg font-bold mb-4"
            style={{ color: '#c4a35a' }}
          >
            {t('disclaimer')}
          </h2>
          <p className="text-sm mb-4 leading-relaxed" style={{ color: '#aaaaaa' }}>
            {t('disclaimerText')}
          </p>

          <h2
            className="text-lg font-bold mb-4 mt-6"
            style={{ color: '#c4a35a' }}
          >
            {t('intellectual')}
          </h2>
          <p className="text-sm mb-4 leading-relaxed" style={{ color: '#aaaaaa' }}>
            {t('intellectualText')}
          </p>

          <h2
            className="text-lg font-bold mb-4 mt-6"
            style={{ color: '#c4a35a' }}
          >
            {t('contact')}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#aaaaaa' }}>
            {t('contactText')}{' '}
            <a
              href="https://hiddenlab.fr"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#c4a35a' }}
            >
              hiddenlab.fr
            </a>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
