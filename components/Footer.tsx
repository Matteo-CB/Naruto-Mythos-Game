'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';

export function Footer() {
  const t = useTranslations('common');

  return (
    <footer
      className="relative z-20 flex items-center justify-between px-6 py-3 text-xs"
      style={{
        borderTop: '1px solid rgba(196, 163, 90, 0.1)',
        backgroundColor: 'rgba(10, 10, 10, 0.8)',
      }}
    >
      <Link
        href="/legal"
        className="transition-colors"
        style={{ color: '#666666' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#c4a35a';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#666666';
        }}
      >
        {t('legal')}
      </Link>

      <a
        href="https://hiddenlab.fr"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors"
        style={{ color: '#666666' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#c4a35a';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = '#666666';
        }}
      >
        {t('createdBy')} HiddenLab
      </a>
    </footer>
  );
}
