import { Suspense } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/lib/i18n/routing';
import { SessionProvider } from 'next-auth/react';
import { NotificationContainer } from '@/components/social/NotificationContainer';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { BreadcrumbJsonLd } from '@/components/Breadcrumbs';
import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  const titles: Record<string, string> = {
    en: 'Naruto Mythos TCG - Online Card Game',
    fr: 'Naruto Mythos TCG - Jeu de Cartes en Ligne',
  };

  const descriptions: Record<string, string> = {
    en: 'Play the Naruto Mythos Trading Card Game online. Battle AI or other players, build your deck, collect cards and climb the ELO rankings.',
    fr: "Jouez au Naruto Mythos Trading Card Game en ligne. Affrontez l'IA ou d'autres joueurs, construisez votre deck, collectionnez les cartes et grimpez le classement ELO.",
  };

  return {
    title: titles[locale] || titles.en,
    description: descriptions[locale] || descriptions.en,
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        en: `${SITE_URL}/en`,
        fr: `${SITE_URL}/fr`,
      },
    },
    openGraph: {
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      alternateLocale: locale === 'fr' ? 'en_US' : 'fr_FR',
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Naruto Mythos TCG',
    url: `${SITE_URL}/${locale}`,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web Browser',
    description: locale === 'fr'
      ? "Jeu de cartes a collectionner Naruto Mythos en ligne"
      : 'Naruto Mythos online trading card game',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
    author: {
      '@type': 'Organization',
      name: 'HiddenLab',
      url: 'https://hiddenlab.fr',
    },
    inLanguage: [locale],
    genre: 'Card Game',
  };

  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Suspense fallback={null}>
          <GoogleAnalytics />
          <BreadcrumbJsonLd />
        </Suspense>
        {children}
        <NotificationContainer />
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
