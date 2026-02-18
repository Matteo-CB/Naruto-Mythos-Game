import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/lib/i18n/routing';
import { SessionProvider } from 'next-auth/react';
import { NotificationContainer } from '@/components/social/NotificationContainer';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
        <NotificationContainer />
      </NextIntlClientProvider>
    </SessionProvider>
  );
}
