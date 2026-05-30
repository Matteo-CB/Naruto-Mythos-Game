'use client';

import type { ReactNode } from 'react';
import { LockBadge } from '@/components/badges/LockBadge';

interface LockedCardWrapperProps {
  children: ReactNode;
  badgeSize?: number;
  badgeLabel?: string;
  badgeTooltip?: string;
  brightness?: number;
}

export function LockedCardWrapper({
  children,
  badgeSize = 28,
  badgeLabel,
  badgeTooltip,
  brightness = 0.55,
}: LockedCardWrapperProps) {
  return (
    <div className="relative w-full h-full">
      <div
        className="w-full h-full"
        style={{ filter: `brightness(${brightness})` }}
      >
        {children}
      </div>
      <LockBadge size={badgeSize} label={badgeLabel} tooltip={badgeTooltip} />
    </div>
  );
}
