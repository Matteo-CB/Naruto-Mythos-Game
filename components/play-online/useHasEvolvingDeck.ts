'use client';

import { useEffect, useState } from 'react';

export function useHasEvolvingDeck(): {
  hasEvo: boolean | null;
  refresh: () => void;
} {
  const [hasEvo, setHasEvo] = useState<boolean | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let aborted = false;
    fetch('/api/decks?evolving=true')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('http')))
      .then((decks: unknown[]) => {
        if (aborted) return;
        setHasEvo(Array.isArray(decks) && decks.length > 0);
      })
      .catch(() => {
        if (!aborted) setHasEvo(false);
      });
    return () => { aborted = true; };
  }, [bump]);

  return { hasEvo, refresh: () => setBump((b) => b + 1) };
}
