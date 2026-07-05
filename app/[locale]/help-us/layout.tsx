import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, '/help-us', 'helpUs');
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
