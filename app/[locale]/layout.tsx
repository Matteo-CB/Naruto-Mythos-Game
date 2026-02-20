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
    en: 'Naruto Mythos TCG - Free Online Naruto Card Game',
    fr: 'Naruto Mythos TCG - Jeu de Cartes Naruto Gratuit en Ligne',
  };

  const descriptions: Record<string, string> = {
    en: 'Play the Naruto Mythos Trading Card Game online for free. Battle a smart AI on 4 difficulty levels or challenge other players in real-time multiplayer. Build strategic decks from 186 unique Naruto Shippuden cards, collect rare cards, and climb the competitive ELO rankings. Free browser card game with deck builder, Naruto quiz, and matchmaking system.',
    fr: "Jouez gratuitement au Naruto Mythos Trading Card Game en ligne. Affrontez une IA intelligente sur 4 niveaux de difficulte ou defiez d'autres joueurs en multijoueur temps reel. Construisez votre deck strategique parmi 186 cartes uniques inspirees de Naruto Shippuden, collectionnez des cartes rares et grimpez le classement ELO competitif. Jeu de cartes gratuit avec deck builder, quiz et matchmaking.",
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

  // WebApplication schema
  const webAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Naruto Mythos TCG',
    url: `${SITE_URL}/${locale}`,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web Browser',
    browserRequirements: 'Requires JavaScript',
    description: locale === 'fr'
      ? "Jeu de cartes a collectionner Naruto Mythos en ligne gratuit. 186 cartes, IA, multijoueur, deck builder et classement ELO."
      : 'Free Naruto Mythos online trading card game. 186 cards, AI, multiplayer, deck builder, and ELO rankings.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    author: {
      '@type': 'Organization',
      name: 'HiddenLab',
      url: 'https://hiddenlab.fr',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '50',
      bestRating: '5',
      worstRating: '1',
    },
    inLanguage: ['en', 'fr'],
    genre: 'Card Game',
  };

  // VideoGame schema
  const videoGameJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Naruto Mythos TCG',
    description: locale === 'fr'
      ? "Jeu de cartes strategique en ligne inspire de l'univers Naruto Shippuden. Construisez votre deck, affrontez l'IA ou d'autres joueurs et grimpez le classement."
      : 'Strategic online card game inspired by the Naruto Shippuden universe. Build your deck, battle AI or other players, and climb the rankings.',
    url: `${SITE_URL}/${locale}`,
    image: `${SITE_URL}/images/og-image.webp`,
    genre: ['Card Game', 'Strategy Game', 'Collectible Card Game'],
    gamePlatform: ['Web Browser', 'Desktop', 'Mobile'],
    numberOfPlayers: {
      '@type': 'QuantitativeValue',
      minValue: 1,
      maxValue: 2,
    },
    playMode: ['SinglePlayer', 'MultiPlayer'],
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    author: {
      '@type': 'Organization',
      name: 'HiddenLab',
      url: 'https://hiddenlab.fr',
    },
    inLanguage: ['en', 'fr'],
  };

  // Organization schema
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'HiddenLab',
    url: 'https://hiddenlab.fr',
    logo: `${SITE_URL}/icons/icon-512x512.png`,
    sameAs: [
      'https://discord.gg/KGMG3jADyF',
    ],
  };

  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoGameJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
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
