import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'],
  defaultLocale: 'en',
  localePrefix: 'always',
});
