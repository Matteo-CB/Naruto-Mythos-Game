'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  deadline: string;
  onExpired?: () => void;
}

export function AbsenceTimer({ deadline, onExpired }: Props) {
  const t = useTranslations('tournament');
  const [remaining, setRemaining] = useState(() => {
    const ms = new Date(deadline).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const ms = new Date(deadline).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining <= 60;

  return (
    <div
      className="flex flex-col items-center gap-1 p-3"
      style={{
        backgroundColor: '#111111',
        border: `1px solid ${isUrgent ? '#cc4444' : '#262626'}`,
      }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: isUrgent ? '#cc4444' : '#888' }}
      >
        {t('absenceTimer')}
      </span>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{
          color: isUrgent ? '#cc4444' : '#c4a35a',
          animation: isUrgent ? 'pulse 1s ease-in-out infinite' : 'none',
        }}
      >
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
      <span className="text-[10px]" style={{ color: '#555' }}>
        {t('autoForfeit')}
      </span>
    </div>
  );
}
