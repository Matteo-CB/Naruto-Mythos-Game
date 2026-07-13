'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { hasNewSurveys } from '@/lib/surveys/seen';

export function SurveysButton() {
  const t = useTranslations('surveys');
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/surveys/latest')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setHasNew(hasNewSurveys(typeof data.latestOpenAt === 'string' ? data.latestOpenAt : null));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/surveys"
      className="relative px-2 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
      style={{ color: hasNew ? '#c4a35a' : '#888888' }}
      aria-label={t('buttonLabel')}
    >
      {t('buttonLabel')}
      {hasNew && (
        <span
          className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: '#c4a35a' }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
