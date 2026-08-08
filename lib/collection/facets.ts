export type FacetValue = string | readonly string[] | null | undefined;

export interface FacetRequest<T> {
  cards: readonly T[];
  predicates: Readonly<Record<string, (card: T) => boolean>>;
  dimension: string;
  valueOf: (card: T) => FacetValue;
  order?: readonly string[];
}

export function facetPool<T>(
  cards: readonly T[],
  predicates: Readonly<Record<string, (card: T) => boolean>>,
  dimension: string,
): T[] {
  const others = Object.entries(predicates).filter(([key]) => key !== dimension);
  if (others.length === 0) return [...cards];
  return cards.filter((card) => others.every(([, predicate]) => predicate(card)));
}

export function facetOptions<T>(request: FacetRequest<T>): string[] {
  const pool = facetPool(request.cards, request.predicates, request.dimension);
  const present = new Set<string>();
  for (const card of pool) {
    const value = request.valueOf(card);
    if (value == null) continue;
    if (typeof value === 'string') {
      if (value !== '') present.add(value);
      continue;
    }
    for (const entry of value) {
      if (entry) present.add(entry);
    }
  }
  if (!request.order) return Array.from(present).sort((a, b) => a.localeCompare(b));
  const ordered = request.order.filter((value) => present.has(value));
  const extras = Array.from(present)
    .filter((value) => !request.order!.includes(value))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras];
}

export function isFacetWorthShowing(options: readonly string[]): boolean {
  return options.length > 1;
}

export function facetSelectionOrFallback<TValue extends string>(
  selected: TValue,
  options: readonly string[],
  fallback: TValue,
): TValue {
  if (selected === fallback) return selected;
  return options.includes(selected) ? selected : fallback;
}
