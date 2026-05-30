'use client';

import { useState, useEffect, useCallback } from 'react';

let cachedUnlocked: Set<string> | null = null;
let cachedInventory: Map<string, number> | null = null;
let cachedAdmin = false;
let fetchPromise: Promise<void> | null = null;

async function fetchUnlocks(): Promise<void> {
  try {
    const res = await fetch('/api/users/me/unlocks');
    if (!res.ok) {
      cachedUnlocked = new Set();
      cachedInventory = new Map();
      cachedAdmin = false;
      return;
    }
    const data = await res.json();
    cachedUnlocked = new Set<string>(Array.isArray(data.unlockedCardIds) ? data.unlockedCardIds : []);
    cachedAdmin = !!data.admin;
    const inv = new Map<string, number>();
    if (data.inventory && typeof data.inventory === 'object') {
      for (const [k, v] of Object.entries(data.inventory)) {
        if (typeof v === 'number' && v > 0) inv.set(k, v);
      }
    }
    cachedInventory = inv;
  } catch {
    cachedUnlocked = new Set();
    cachedInventory = new Map();
    cachedAdmin = false;
  }
}

export interface UseUnlockedVariantsResult {
  unlockedIds: Set<string>;
  inventory: Map<string, number>;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => void;
}

export function useUnlockedVariants(): UseUnlockedVariantsResult {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(cachedUnlocked ?? new Set());
  const [inventory, setInventory] = useState<Map<string, number>>(cachedInventory ?? new Map());
  const [isAdminState, setIsAdmin] = useState<boolean>(cachedAdmin);
  const [loading, setLoading] = useState(cachedUnlocked === null);

  useEffect(() => {
    if (cachedUnlocked !== null) {
      setUnlockedIds(cachedUnlocked);
      setInventory(cachedInventory ?? new Map());
      setIsAdmin(cachedAdmin);
      setLoading(false);
      return;
    }
    if (!fetchPromise) fetchPromise = fetchUnlocks();
    fetchPromise.then(() => {
      setUnlockedIds(cachedUnlocked ?? new Set());
      setInventory(cachedInventory ?? new Map());
      setIsAdmin(cachedAdmin);
      setLoading(false);
      fetchPromise = null;
    });
  }, []);

  const refresh = useCallback(() => {
    cachedUnlocked = null;
    cachedInventory = null;
    cachedAdmin = false;
    fetchPromise = null;
    setLoading(true);
    fetchUnlocks().then(() => {
      setUnlockedIds(cachedUnlocked ?? new Set());
      setInventory(cachedInventory ?? new Map());
      setIsAdmin(cachedAdmin);
      setLoading(false);
    });
  }, []);

  return { unlockedIds, inventory, isAdmin: isAdminState, loading, refresh };
}

export function clearUnlockedVariantsCache(): void {
  cachedUnlocked = null;
  cachedInventory = null;
  cachedAdmin = false;
  fetchPromise = null;
}
