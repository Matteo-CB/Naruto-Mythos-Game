'use client';

import { useState, useEffect, useCallback } from 'react';

export interface BoosterInventoryEntry {
  setId: string;
  count: number;
  status: 'available' | 'coming_soon' | 'revealing';
  nameEn: string;
  nameFr: string;
  boosterImage: string;
  hasVariants: boolean;
}

interface CacheState {
  inventory: BoosterInventoryEntry[];
  totalUnopened: number;
}

const EMPTY: CacheState = { inventory: [], totalUnopened: 0 };

let cached: CacheState | null = null;
let fetchPromise: Promise<CacheState> | null = null;

async function fetchInventory(): Promise<CacheState> {
  try {
    const res = await fetch('/api/boosters/inventory');
    if (!res.ok) {
      const v = EMPTY;
      cached = v;
      return v;
    }
    const data = await res.json();
    const v: CacheState = {
      inventory: Array.isArray(data.inventory) ? data.inventory : [],
      totalUnopened: typeof data.totalUnopened === 'number' ? data.totalUnopened : 0,
    };
    cached = v;
    return v;
  } catch {
    cached = EMPTY;
    return EMPTY;
  }
}

export interface UseBoosterInventoryResult {
  inventory: BoosterInventoryEntry[];
  totalUnopened: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useBoosterInventory(): UseBoosterInventoryResult {
  const [inventory, setInventory] = useState<BoosterInventoryEntry[]>(cached?.inventory ?? []);
  const [totalUnopened, setTotalUnopened] = useState<number>(cached?.totalUnopened ?? 0);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    if (cached !== null) {
      setInventory(cached.inventory);
      setTotalUnopened(cached.totalUnopened);
      setLoading(false);
      return;
    }
    if (!fetchPromise) fetchPromise = fetchInventory();
    fetchPromise.then((value) => {
      setInventory(value.inventory);
      setTotalUnopened(value.totalUnopened);
      setLoading(false);
      fetchPromise = null;
    });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    cached = null;
    fetchPromise = null;
    setLoading(true);
    const value = await fetchInventory();
    setInventory(value.inventory);
    setTotalUnopened(value.totalUnopened);
    setLoading(false);
  }, []);

  return { inventory, totalUnopened, loading, refresh };
}

export function clearBoosterInventoryCache(): void {
  cached = null;
  fetchPromise = null;
}
