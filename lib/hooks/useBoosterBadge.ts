'use client';

import { useEffect, useState } from 'react';
import { useBoosterInventory } from '@/lib/hooks/useBoosterInventory';

const STORAGE_KEY = 'naruto-mythos-boosters-last-seen-count';

export function markBoostersSeen(currentTotal: number): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, currentTotal)));
  } catch {
  }
}

function readSeen(): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface UseBoosterBadgeResult {
  showBadge: boolean;
  totalUnopened: number;
}

export function useBoosterBadge(): UseBoosterBadgeResult {
  const { totalUnopened } = useBoosterInventory();
  const [seen, setSeen] = useState<number | null>(null);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  if (totalUnopened <= 0) {
    return { showBadge: false, totalUnopened };
  }
  if (seen === null) {
    return { showBadge: true, totalUnopened };
  }
  return { showBadge: totalUnopened > seen, totalUnopened };
}
