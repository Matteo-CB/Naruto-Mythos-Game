import { useEffect } from 'react';
import { facetSelectionOrFallback } from './facets';

export function useValidFacetSelection<TValue extends string>(
  selected: TValue,
  options: readonly string[],
  fallback: TValue,
  reset: (value: TValue) => void,
): void {
  useEffect(() => {
    const corrected = facetSelectionOrFallback(selected, options, fallback);
    if (corrected !== selected) reset(corrected);
  }, [selected, options, fallback, reset]);
}
