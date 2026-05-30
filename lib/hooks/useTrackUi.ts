'use client';

import { useEffect, useRef } from 'react';

type TrackHook =
  | 'ui.deck_builder.opened'
  | 'ui.collection.opened'
  | 'ui.leaderboard.opened'
  | 'ui.profile.opened'
  | 'deck.exported';

export function trackUiHook(hook: TrackHook): void {
  fetch('/api/quests/track-ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook }),
    credentials: 'include',
  }).catch(() => {});
}

export function useTrackOnMount(hook: TrackHook): void {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackUiHook(hook);
  }, [hook]);
}
