'use client';

import { useState, useEffect } from 'react';

// Module-level cache to avoid refetching across components
let cachedBannedIds: Set<string> | null = null;
let fetchPromise: Promise<Set<string>> | null = null;

async function fetchBannedCards(): Promise<Set<string>> {
  try {
    const res = await fetch('/api/admin/banned-cards');
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set<string>(data.bannedCardIds ?? []);
  } catch {
    return new Set();
  }
}

/**
 * Hook to fetch and cache banned card IDs.
 * Shares a module-level cache so multiple components don't re-fetch.
 */
export function useBannedCards(): { bannedIds: Set<string>; loading: boolean; refresh: () => void } {
  const [bannedIds, setBannedIds] = useState<Set<string>>(cachedBannedIds ?? new Set());
  const [loading, setLoading] = useState(cachedBannedIds === null);

  useEffect(() => {
    if (cachedBannedIds !== null) {
      setBannedIds(cachedBannedIds);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchBannedCards();
    }

    fetchPromise.then((ids) => {
      cachedBannedIds = ids;
      setBannedIds(ids);
      setLoading(false);
      fetchPromise = null;
    });
  }, []);

  const refresh = () => {
    cachedBannedIds = null;
    fetchPromise = null;
    setLoading(true);
    fetchBannedCards().then((ids) => {
      cachedBannedIds = ids;
      setBannedIds(ids);
      setLoading(false);
    });
  };

  return { bannedIds, loading, refresh };
}
