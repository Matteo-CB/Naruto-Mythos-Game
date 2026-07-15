'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@/lib/i18n/navigation';

const NON_LINKABLE = new Set(['deleted_user', 'unknown', '???']);

interface PlayerNameLinkProps {
  username: string | null | undefined;
  newTab?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function PlayerNameLink({
  username,
  newTab = false,
  disabled = false,
  className,
  style,
  children,
}: PlayerNameLinkProps) {
  const name = (username ?? '').trim();
  if (disabled || name.length === 0 || NON_LINKABLE.has(name.toLowerCase())) {
    return <span className={className} style={style}>{children ?? name}</span>;
  }
  return (
    <Link
      href={`/profile/${encodeURIComponent(name)}` as '/'}
      className={`${className ?? ''} hover:underline`}
      style={{ ...style, cursor: 'pointer' }}
      onClick={(e) => e.stopPropagation()}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children ?? name}
    </Link>
  );
}
