export type SwrState = 'fresh' | 'stale' | 'expired' | 'missing';

export interface SwrParams {
  fetchedAt: number | null | undefined;
  now: number;
  freshMs: number;
  staleMs: number;
}

export function swrState({ fetchedAt, now, freshMs, staleMs }: SwrParams): SwrState {
  if (fetchedAt == null) return 'missing';
  const age = now - fetchedAt;
  if (age <= freshMs) return 'fresh';
  if (age <= staleMs) return 'stale';
  return 'expired';
}

export function shouldServeFromCache(state: SwrState): boolean {
  return state === 'fresh' || state === 'stale';
}

export function shouldRevalidate(state: SwrState): boolean {
  return state === 'stale' || state === 'expired' || state === 'missing';
}

export function mustAwaitFetch(state: SwrState): boolean {
  return state === 'expired' || state === 'missing';
}
