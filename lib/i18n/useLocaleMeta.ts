'use client';

import { useTranslations } from 'next-intl';

export function useLocaleBcp47(): string {
  const t = useTranslations('_meta');
  return t('bcp47');
}
