import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { ORDERED_CARD_IDS } from '@/lib/cards/order';
import { cardIdToSlug, slugToCardId } from '@/lib/cards/slug';
import { getServerCardById, isExtraSetCard } from '@/lib/data/serverCards';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';
import { getSetName, isSetRevealing } from '@/lib/data/sets/registry';
import { isCardPublic } from '@/lib/cards/reveal';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { CardPageClient } from './CardPageClient';

function cardImagePath(card: { id: string; set: string; image_file?: string }): string | null {
  if (isExtraSetCard(card.id)) return `/api/card-image/${card.id}`;
  return normalizeImagePath(card.image_file);
}

const SITE_URL = 'https://narutomythosgame.com';

type Params = { locale: string; slug: string };

export function generateStaticParams(): Params[] {
  const params: Params[] = [];
  for (const locale of routing.locales) {
    for (const id of ORDERED_CARD_IDS) {
      params.push({ locale, slug: cardIdToSlug(id) });
    }
  }
  return params;
}

function displayName(card: NonNullable<ReturnType<typeof getServerCardById>>, locale: string): string {
  const name = getCardName(card, locale);
  const title = getCardTitle(card, locale);
  return title ? `${name} ${title}` : name;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const id = slugToCardId(slug);
  const card = id ? getServerCardById(id) : undefined;
  if (!id || !card) return {};
  // A not-yet-revealed card must never leak its data, even by direct URL: noindex and no card
  // details in metadata. Released cards short-circuit before any DB read. (All localized pages
  // are already dynamic via the geo-locale middleware, so this costs no static generation.)
  if (isSetRevealing(card.set) && !(await isCardPublic(id))) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: 'seoPages.cardDetail' });
  const name = displayName(card, locale);
  const number = String(card.number);
  const set = getSetName(card.set, locale);
  const title = t('title', { name, number });
  const description = t('description', { name, number, set });
  const ogAlt = t('ogAlt', { name, number });

  const url = `${SITE_URL}/${locale}/cards/${slug}`;
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/cards/${slug}`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/cards/${slug}`;

  const img = cardImagePath(card);
  const image = img ? `${SITE_URL}${img}` : `${SITE_URL}/images/og-image.webp`;

  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: { title, description, url, images: [{ url: image, alt: ogAlt }] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CardPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const id = slugToCardId(slug);
  const card = id ? getServerCardById(id) : undefined;
  if (!id || !card) notFound();
  // A not-yet-revealed card 404s for everyone except admins/testers, so nothing about it is
  // ever emitted server-side. Released cards short-circuit before the DB read.
  if (isSetRevealing(card.set) && !(await isCardPublic(id))) notFound();

  const tMeta = await getTranslations({ locale, namespace: '_meta' });
  const tBreadcrumbs = await getTranslations({ locale, namespace: 'breadcrumbs' });
  const name = displayName(card, locale);
  const setName = getSetName(card.set, locale);
  const img = cardImagePath(card);
  const image = img ? `${SITE_URL}${img}` : undefined;
  const effects = getCardEffectDescriptions(card.id, locale) ?? card.effects.map((e) => e.description);
  const url = `${SITE_URL}/${locale}/cards/${slug}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: `${name} ${card.number}`,
      description: effects.length > 0 ? effects.join(' ') : `${name} ${card.number}`,
      inLanguage: tMeta('bcp47'),
      url,
      ...(image ? { image } : {}),
      isPartOf: { '@type': 'CreativeWorkSeries', name: setName },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: tBreadcrumbs('root'), item: `${SITE_URL}/${locale}` },
        { '@type': 'ListItem', position: 2, name: tBreadcrumbs('page.collection'), item: `${SITE_URL}/${locale}/collection` },
        { '@type': 'ListItem', position: 3, name: `${name} ${card.number}` },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CardPageClient cardId={id} />
    </>
  );
}
