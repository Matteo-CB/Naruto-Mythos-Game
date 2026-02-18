'use client';

import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useLocale } from 'next-intl';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: 'en' | 'fr') => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <nav className="flex items-center gap-1" aria-label="Language">
      <button
        onClick={() => switchLocale('en')}
        className="px-2 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
        style={{
          color: locale === 'en' ? '#c4a35a' : '#555555',
          borderBottom: locale === 'en' ? '2px solid #c4a35a' : '2px solid transparent',
        }}
        aria-label="English"
        aria-current={locale === 'en' ? 'true' : undefined}
      >
        EN
      </button>
      <span className="text-xs" style={{ color: '#333333' }} aria-hidden="true">
        /
      </span>
      <button
        onClick={() => switchLocale('fr')}
        className="px-2 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
        style={{
          color: locale === 'fr' ? '#c4a35a' : '#555555',
          borderBottom: locale === 'fr' ? '2px solid #c4a35a' : '2px solid transparent',
        }}
        aria-label="Français"
        aria-current={locale === 'fr' ? 'true' : undefined}
      >
        FR
      </button>
    </nav>
  );
}
