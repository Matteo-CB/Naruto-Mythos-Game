'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { getSurveysBadge } from '@/lib/surveys/badgeCache';

export function SurveysButton() {
  const t = useTranslations('surveys');
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSurveysBadge().then((v) => {
      if (!cancelled) setHasNew(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/surveys"
      className="font-display relative px-2 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
      style={{ color: hasNew ? 'var(--t-accent)' : 'var(--t-muted)' }}
      aria-label={t('buttonLabel')}
    >
      {t('buttonLabel')}
      {hasNew && (
        <span
          className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'var(--t-accent)' }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
