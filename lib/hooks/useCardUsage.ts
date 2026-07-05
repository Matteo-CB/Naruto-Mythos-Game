'use client';

import { useEffect, useState } from 'react';
import type { UsageTier } from '@/lib/cards/usageTiers';

export interface CardUsage {
  count: number;
  rate: number;
  tier: UsageTier;
  totalDecks: number;
  activePlayers: number;
}

interface UsagePayload {
  totalDecks: number;
  activePlayers: number;
  cards: Record<string, { count: number; rate: number; tier: string }>;
}

let cache: UsagePayload | null = null;
let inflight: Promise<UsagePayload | null> | null = null;

async function loadUsage(): Promise<UsagePayload | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/api/cards/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.totalDecks === 'number' && data.cards) cache = data as UsagePayload;
        return cache;
      })
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useCardUsage(cardId: string): CardUsage | null {
  const [usage, setUsage] = useState<CardUsage | null>(null);

  useEffect(() => {
    let alive = true;
    loadUsage().then((data) => {
      if (!alive || !data) return;
      const entry = data.cards[cardId];
      setUsage({
        count: entry?.count ?? 0,
        rate: entry?.rate ?? 0,
        tier: (entry?.tier as UsageTier) ?? 'NU',
        totalDecks: data.totalDecks ?? 0,
        activePlayers: data.activePlayers ?? 0,
      });
    });
    return () => { alive = false; };
  }, [cardId]);

  return usage;
}
