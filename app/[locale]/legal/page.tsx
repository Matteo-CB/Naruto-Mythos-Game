'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Footer } from '@/components/Footer';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2
        className="text-sm font-bold uppercase tracking-wider mb-3 pb-2"
        style={{ color: '#c4a35a', borderBottom: '1px solid rgba(196, 163, 90, 0.15)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: '#aaaaaa' }}>
      {text.split('\n').map((line, i) => (
        <p key={i} className={line.startsWith('-') ? 'pl-4' : i > 0 ? 'mt-2' : ''}>
          {line}
        </p>
      ))}
    </div>
  );
}

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
          &#8592; {t('back')}
        </Link>

        <h1
          className="text-lg font-bold tracking-wider"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

        <LanguageSwitcher />
      </header>

      <main className="relative z-10 flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
        {/* ═══ MENTIONS LEGALES ═══ */}
        <div
          className="rounded p-6 mb-6"
          style={{
            backgroundColor: 'rgba(20, 20, 20, 0.8)',
            border: '1px solid rgba(196, 163, 90, 0.1)',
          }}
        >
          <h2
            className="text-base font-bold uppercase tracking-wider mb-5 text-center"
            style={{ color: '#c4a35a' }}
          >
            {t('legalNotice')}
          </h2>

          <Section title={t('editor')}>
            <TextBlock text={t('editorText')} />
          </Section>

          <Section title={t('hosting')}>
            <TextBlock text={t('hostingText')} />
          </Section>

          <Section title={t('intellectual')}>
            <TextBlock text={t('intellectualText')} />
          </Section>
        </div>

        {/* ═══ POLITIQUE DE CONFIDENTIALITE ═══ */}
        <div
          className="rounded p-6"
          style={{
            backgroundColor: 'rgba(20, 20, 20, 0.8)',
            border: '1px solid rgba(196, 163, 90, 0.1)',
          }}
        >
          <h2
            className="text-base font-bold uppercase tracking-wider mb-5 text-center"
            style={{ color: '#c4a35a' }}
          >
            {t('privacyPolicy')}
          </h2>

          <p className="text-sm leading-relaxed mb-5" style={{ color: '#999' }}>
            {t('privacyIntro')}
          </p>

          <Section title={t('dataCollected')}>
            <TextBlock text={t('dataCollectedText')} />
          </Section>

          <Section title={t('dataPurpose')}>
            <TextBlock text={t('dataPurposeText')} />
          </Section>

          <Section title={t('dataStorage')}>
            <TextBlock text={t('dataStorageText')} />
          </Section>

          <Section title={t('dataDuration')}>
            <TextBlock text={t('dataDurationText')} />
          </Section>

          <Section title={t('dataSharing')}>
            <TextBlock text={t('dataSharingText')} />
          </Section>

          <Section title={t('cookies')}>
            <TextBlock text={t('cookiesText')} />
          </Section>

          <Section title={t('userRights')}>
            <TextBlock text={t('userRightsText')} />
          </Section>

          <Section title={t('contact')}>
            <div className="text-sm leading-relaxed" style={{ color: '#aaaaaa' }}>
              {t('contactText').split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? 'mt-2' : ''}>
                  {line}
                </p>
              ))}
              {' '}
              <a
                href="https://hiddenlab.fr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#c4a35a' }}
              >
                hiddenlab.fr
              </a>
            </div>
          </Section>

          <p className="text-xs mt-4 text-center" style={{ color: '#555' }}>
            {t('lastUpdated', { date: '18/03/2026' })}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
