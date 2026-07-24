'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';

export function PostDeckButton({ deckId, className, style }: { deckId: string; className?: string; style?: React.CSSProperties }) {
  const t = useTranslations('feed');
  return (
    <Link
      href={`/feed?deck=${deckId}` as '/'}
      onClick={(e) => e.stopPropagation()}
      className={className ?? 'font-display text-[9px] uppercase tracking-widest px-2 py-1'}
      style={style ?? { backgroundColor: 'rgba(196,163,90,0.08)', color: '#c4a35a' }}
    >
      {t('postToFeed')}
    </Link>
  );
}
