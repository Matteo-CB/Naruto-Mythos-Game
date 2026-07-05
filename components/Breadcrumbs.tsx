'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

const PAGE_SLUGS = ['collection', 'deck-builder', 'leaderboard', 'login', 'register', 'legal', 'friends'];
const PLAY_SLUGS = ['ai', 'online'];

export function BreadcrumbJsonLd() {
  const pathname = usePathname();
  const t = useTranslations('breadcrumbs');
  if (!pathname) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const locale = segments[0];
  if (!(routing.locales as readonly string[]).includes(locale)) return null;

  const items: Array<{ name: string; url: string }> = [
    { name: t('root'), url: `${SITE_URL}/${locale}` },
  ];

  const pageSlug = segments[1];

  if (pageSlug === 'play' && segments[2]) {
    const playType = segments[2];
    if (!PLAY_SLUGS.includes(playType)) return null;
    items.push({
      name: t(`play.${playType}`),
      url: `${SITE_URL}/${locale}/play/${playType}`,
    });
  } else if (PAGE_SLUGS.includes(pageSlug)) {
    items.push({
      name: t(`page.${pageSlug}`),
      url: `${SITE_URL}/${locale}/${pageSlug}`,
    });
  } else {
    return null;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
