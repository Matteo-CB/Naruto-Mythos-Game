'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY_BOOSTERS_SEEN = 'naruto-mythos-battlepass-boosters-seen';

export function markBattlepassBoostersSeen(currentTier: number): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_BOOSTERS_SEEN, String(Math.max(0, currentTier)));
  } catch {
  }
}

export function readBattlepassBoostersSeen(): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY_BOOSTERS_SEEN);
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

interface BattlepassSummary {
  tier: number;
  cardClaimableTiers: number[];
}

export interface UseBattlepassBadgeResult {
  showBadge: boolean;
  cardClaimableTiers: number[];
  currentTier: number;
}

export function useBattlepassBadge(): UseBattlepassBadgeResult {
  const [summary, setSummary] = useState<BattlepassSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/battlepass', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const tiers = Array.isArray(data.tiers) ? data.tiers : [];
        const claimable = tiers
          .filter((t: { reward?: { cardClaimable?: boolean } }) => t.reward?.cardClaimable === true)
          .map((t: { tier: number }) => t.tier);
        setSummary({ tier: data.tier ?? 0, cardClaimableTiers: claimable });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!summary) return { showBadge: false, cardClaimableTiers: [], currentTier: 0 };
  return {
    showBadge: summary.cardClaimableTiers.length > 0,
    cardClaimableTiers: summary.cardClaimableTiers,
    currentTier: summary.tier,
  };
}
