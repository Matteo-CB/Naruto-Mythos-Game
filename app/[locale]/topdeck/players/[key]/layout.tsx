import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db/prisma';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; key: string }> }): Promise<Metadata> {
  const { locale, key } = await params;
  const decoded = decodeURIComponent(key);
  const t = await getTranslations({ locale, namespace: 'seoPages.topdeckPlayers' });

  let name: string | null = null;
  try {
    const row = await prisma.topdeckPlayerResult.findFirst({ where: { playerKey: decoded }, select: { playerName: true } });
    name = row?.playerName ?? null;
  } catch { /* metadata falls back to the section title */ }

  const path = `/topdeck/players/${encodeURIComponent(decoded)}`;
  const title = name ? `${name} | Naruto Mythos TCG` : t('title');
  const description = t('description');
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}${path}`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}${path}`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/${locale}${path}`, languages },
    openGraph: { title, description, url: `${SITE_URL}/${locale}${path}` },
    twitter: { card: 'summary', title, description },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
