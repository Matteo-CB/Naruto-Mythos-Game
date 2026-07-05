import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'es', 'ja'],
  defaultLocale: 'en',
  localePrefix: 'always',
});
