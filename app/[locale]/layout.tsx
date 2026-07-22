import { Suspense } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/lib/i18n/routing';
import { SessionProvider } from 'next-auth/react';
import { NotificationContainer } from '@/components/social/NotificationContainer';
import { DMPanel } from '@/components/dm/DMPanel';
import { PlayerNoticeGate } from '@/components/notifications/PlayerNoticeGate';
import { TradeInviteToast } from '@/components/social/TradeInviteToast';
import { ToastContainer } from '@/components/ui/Toast';
import { ConnectionStatusIndicator } from '@/components/ConnectionStatusIndicator';
import { ReconnectPrompt } from '@/components/ReconnectPrompt';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { BreadcrumbJsonLd } from '@/components/Breadcrumbs';
import { AnimationProvider } from '@/components/AnimationProvider';
import { GamepadNavigator } from '@/components/gamepad/GamepadNavigator';
import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'seo' });
  const tMeta = await getTranslations({ locale, namespace: '_meta' });

  const languages: Record<string, string> = {};
  const alternateLocale: string[] = [];
  for (const loc of routing.locales) {
    languages[loc] = `${SITE_URL}/${loc}`;
    if (loc !== locale) {
      const otherMeta = await getTranslations({ locale: loc, namespace: '_meta' });
      alternateLocale.push(otherMeta('ogLocale'));
    }
  }
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}`;

  return {
    title: t('siteTitle'),
    description: t('siteDescription'),
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages,
    },
    openGraph: {
      locale: tMeta('ogLocale'),
      alternateLocale,
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const inLanguage = [...routing.locales];

  const webAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Naruto Mythos TCG',
    url: `${SITE_URL}/${locale}`,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web Browser',
    browserRequirements: 'Requires JavaScript',
    description: tSeo('webAppDescription'),
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
    inLanguage,
    genre: 'Card Game',
  };

  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Naruto Mythos TCG',
    alternateName: 'Naruto Mythos TCG Simulator',
    url: SITE_URL,
    inLanguage,
    publisher: {
      '@type': 'Organization',
      name: 'HiddenLab',
      url: 'https://hiddenlab.fr',
    },
  };

  const videoGameJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Naruto Mythos TCG',
    description: tSeo('videoGameDescription'),
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
    inLanguage,
  };

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'HiddenLab',
    url: 'https://hiddenlab.fr',
    logo: `${SITE_URL}/icons/icon-512x512.png`,
    sameAs: [
      'https://discord.gg/BBXVUsU3hn',
    ],
  };

  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
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
        <AnimationProvider>{children}</AnimationProvider>
        <NotificationContainer />
        <DMPanel />
        <PlayerNoticeGate />
        <TradeInviteToast />
        <ToastContainer />
        <ConnectionStatusIndicator />
        <ReconnectPrompt />
        <GamepadNavigator />
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
