import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import enMessages from '@/messages/en.json';

type Messages = Record<string, unknown>;

function deepMergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = out[key];
    const overrideVal = override[key];
    if (
      baseVal && overrideVal &&
      typeof baseVal === 'object' && typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(overrideVal)
    ) {
      out[key] = deepMergeMessages(baseVal as Messages, overrideVal as Messages);
    } else {
      out[key] = overrideVal;
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  const base = enMessages as Messages;
  let messages: Messages = base;

  if (locale !== routing.defaultLocale) {
    const localeMessages = (await import(`@/messages/${locale}.json`)).default as Messages;
    messages = deepMergeMessages(base, localeMessages);
  }

  return { locale, messages };
});
