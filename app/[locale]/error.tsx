'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { estBundleObsolete, rechargerUneSeuleFois } from '@/lib/ui/staleDeploy';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPage');
  const retryCount = useRef(0);
  const obsolete = estBundleObsolete(error);

  useEffect(() => {
    console.error('[App Error]', error);

    if (obsolete) {
      rechargerUneSeuleFois(
        typeof window === 'undefined' ? null : window.sessionStorage,
        () => window.location.reload(),
      );
      return;
    }

    if (retryCount.current < 3) {
      retryCount.current++;
      const timer = setTimeout(() => reset(), 200);
      return () => clearTimeout(timer);
    }
  }, [error, reset, obsolete]);

  if (!obsolete && retryCount.current < 3) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
      <div className="flex flex-col items-center gap-4 max-w-md w-full text-center px-4">
        <div className="w-12 h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--t-danger) 40%, transparent)' }} />
        <h2 className="text-lg font-bold uppercase tracking-wider" style={{ color: 'var(--t-danger)' }}>
          {obsolete ? t('staleTitle') : t('title')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--t-dim)' }}>
          {obsolete ? t('staleMessage') : (error?.message || t('defaultMessage'))}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => {
              if (obsolete) { window.location.reload(); return; }
              retryCount.current = 0;
              reset();
            }}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'var(--t-accent-tint)',
              color: 'var(--t-accent)',
            }}
          >
            {obsolete ? t('reload') : t('tryAgain')}
          </button>
          <a
            href="/"
            className="px-5 py-2 text-xs uppercase tracking-wider"
            style={{
              backgroundColor: 'var(--t-surface)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-muted)',
            }}
          >
            {t('home')}
          </a>
        </div>
        <div className="w-12 h-px mt-2" style={{ backgroundColor: 'color-mix(in srgb, var(--t-danger) 40%, transparent)' }} />
      </div>
    </div>
  );
}
