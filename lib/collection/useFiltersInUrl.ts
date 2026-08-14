'use client';

import { useEffect, useRef } from 'react';
import { filtersToQuery, filtersFromQuery, hasCollectionFilterQuery, type CollectionFilterState } from './filterUrl';

export function useFiltersInUrl(
  state: CollectionFilterState,
  ready: boolean,
  restore: (restored: CollectionFilterState) => void,
): void {
  const restored = useRef(false);
  const skipWrite = useRef(false);
  const restoreRef = useRef(restore);

  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const query = window.location.search;
    if (!hasCollectionFilterQuery(query)) return;
    skipWrite.current = true;
    restoreRef.current(filtersFromQuery(query));
  }, [ready]);

  const query = filtersToQuery(state);

  useEffect(() => {
    if (!restored.current) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const target = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (target === window.location.pathname + window.location.search) return;
    window.history.replaceState(window.history.state, '', target);
  }, [query]);
}
