'use client';

import { useEffect } from 'react';
import { useRevealingStore } from '@/stores/revealingStore';

export default function RevealingCardsLoader() {
  const load = useRevealingStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  return null;
}
