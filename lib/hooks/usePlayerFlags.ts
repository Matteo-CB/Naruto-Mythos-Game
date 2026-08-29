'use client';

import { useEffect, useState } from 'react';

const flagCache = new Map<string, string | null>();
const badgeCache = new Map<string, string | null>();
const pending = new Set<string>();

async function fetchFlags(names: string[]): Promise<void> {
  const toFetch = names.filter((n) => !flagCache.has(n) && !pending.has(n));
  if (toFetch.length === 0) return;
  for (const n of toFetch) pending.add(n);
  try {
    const res = await fetch(`/api/users/flags?names=${encodeURIComponent(toFetch.join(','))}`);
    if (res.ok) {
      const data = (await res.json()) as { flags?: Record<string, string | null>; badges?: Record<string, string | null> };
      for (const n of toFetch) {
        flagCache.set(n, data.flags?.[n] ?? null);
        badgeCache.set(n, data.badges?.[n] ?? null);
      }
    } else {
      for (const n of toFetch) {
        flagCache.set(n, null);
        badgeCache.set(n, null);
      }
    }
  } catch {
    for (const n of toFetch) pending.delete(n);
    return;
  }
  for (const n of toFetch) pending.delete(n);
}

export function usePlayerBadge(username: string | null | undefined): string | null {
  const name = username && username !== 'Player 1' && username !== 'Player 2' ? username : null;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!name || badgeCache.has(name)) return;
    let cancelled = false;
    fetchFlags([name]).then(() => {
      if (!cancelled) bump((x) => x + 1);
    });
    return () => { cancelled = true; };
  }, [name]);

  if (!name) return null;
  return badgeCache.get(name) ?? null;
}

export function usePlayerFlag(username: string | null | undefined): string | null {
  const name = username && username !== 'Player 1' && username !== 'Player 2' ? username : null;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!name || flagCache.has(name)) return;
    let cancelled = false;
    fetchFlags([name]).then(() => {
      if (!cancelled) bump((x) => x + 1);
    });
    return () => { cancelled = true; };
  }, [name]);

  if (!name) return null;
  return flagCache.get(name) ?? null;
}
