'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LessonViewer } from '@/components/learn/LessonViewer';
import { Footer } from '@/components/Footer';

export default function LearnPage() {
  const t = useTranslations('learn');

  return (
    <div
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="learn" />

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
          ← {t('title')}
        </Link>

        <h1
          className="text-xl font-bold tracking-wider"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

        <LanguageSwitcher />
      </header>

      <main className="relative z-10 px-4 py-2 flex-1">
        <LessonViewer />

        <div className="mt-6 text-center pb-4">
          <Link
            href="/quiz"
            className="inline-block text-sm px-6 py-2.5 rounded font-medium transition-colors"
            style={{
              color: '#0a0a0a',
              backgroundColor: '#c4a35a',
              border: '1px solid #c4a35a',
            }}
          >
            {t('quiz.title')} →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
