'use client';

import { useState, useEffect } from 'react';

export interface BannedCardInfo {
  cardId: string;
  reason: string | null;
}

// Module-level cache to avoid refetching across components
let cachedBannedIds: Set<string> | null = null;
let cachedBannedMap: Map<string, string | null> | null = null; // cardId -> reason
let fetchPromise: Promise<void> | null = null;

async function fetchBannedCards(): Promise<void> {
  try {
    const res = await fetch('/api/admin/banned-cards');
    if (!res.ok) {
      cachedBannedIds = new Set();
      cachedBannedMap = new Map();
      return;
    }
    const data = await res.json();
    cachedBannedIds = new Set<string>(data.bannedCardIds ?? []);
    cachedBannedMap = new Map<string, string | null>();
    for (const b of (data.bannedCards ?? [])) {
      cachedBannedMap.set(b.cardId, b.reason ?? null);
    }
  } catch {
    cachedBannedIds = new Set();
    cachedBannedMap = new Map();
  }
}

/**
 * Hook to fetch and cache banned card IDs + reasons.
 */
export function useBannedCards(): {
  bannedIds: Set<string>;
  bannedReasons: Map<string, string | null>;
  loading: boolean;
  refresh: () => void;
} {
  const [bannedIds, setBannedIds] = useState<Set<string>>(cachedBannedIds ?? new Set());
  const [bannedReasons, setBannedReasons] = useState<Map<string, string | null>>(cachedBannedMap ?? new Map());
  const [loading, setLoading] = useState(cachedBannedIds === null);

  useEffect(() => {
    if (cachedBannedIds !== null && cachedBannedMap !== null) {
      setBannedIds(cachedBannedIds);
      setBannedReasons(cachedBannedMap);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchBannedCards();
    }

    fetchPromise.then(() => {
      setBannedIds(cachedBannedIds ?? new Set());
      setBannedReasons(cachedBannedMap ?? new Map());
      setLoading(false);
      fetchPromise = null;
    });
  }, []);

  const refresh = () => {
    cachedBannedIds = null;
    cachedBannedMap = null;
    fetchPromise = null;
    setLoading(true);
    fetchBannedCards().then(() => {
      setBannedIds(cachedBannedIds ?? new Set());
      setBannedReasons(cachedBannedMap ?? new Map());
      setLoading(false);
    });
  };

  return { bannedIds, bannedReasons, loading, refresh };
}
