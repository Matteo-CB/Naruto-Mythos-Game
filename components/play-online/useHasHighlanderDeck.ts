'use client';

import { useEffect, useState } from 'react';

export function useHasHighlanderDeck(): {
  hasHighlander: boolean | null;
  refresh: () => void;
} {
  const [hasHighlander, setHasHighlander] = useState<boolean | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let aborted = false;
    fetch('/api/decks?highlander=true')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((decks: unknown[]) => {
        if (aborted) return;
        setHasHighlander(Array.isArray(decks) && decks.length > 0);
      })
      .catch(() => {
        if (!aborted) setHasHighlander(false);
      });
    return () => { aborted = true; };
  }, [bump]);

  return { hasHighlander, refresh: () => setBump((b) => b + 1) };
}
