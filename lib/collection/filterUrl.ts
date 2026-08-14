export interface CollectionFilterState {
  rarity: string;
  group: string;
  set: string;
  variantsOnly: boolean;
  holosOnly: boolean;
  tradeableOnly: boolean;
  search: string;
  page: number;
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilterState = {
  rarity: 'all',
  group: 'all',
  set: 'all',
  variantsOnly: false,
  holosOnly: false,
  tradeableOnly: false,
  search: '',
  page: 1,
};

export function filtersToQuery(state: CollectionFilterState): string {
  const params = new URLSearchParams();
  if (state.rarity !== 'all') params.set('rarity', state.rarity);
  if (state.group !== 'all') params.set('group', state.group);
  if (state.set !== 'all') params.set('set', state.set);
  if (state.variantsOnly) params.set('variants', '1');
  if (state.holosOnly) params.set('holos', '1');
  if (state.tradeableOnly) params.set('tradeables', '1');
  if (state.search.trim() !== '') params.set('q', state.search);
  if (state.page > 1) params.set('page', String(state.page));
  return params.toString();
}

export function filtersFromQuery(query: string): CollectionFilterState {
  const params = new URLSearchParams(query);
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    rarity: params.get('rarity') || 'all',
    group: params.get('group') || 'all',
    set: params.get('set') || 'all',
    variantsOnly: params.get('variants') === '1',
    holosOnly: params.get('holos') === '1',
    tradeableOnly: params.get('tradeables') === '1',
    search: params.get('q') ?? '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function hasCollectionFilterQuery(query: string): boolean {
  return filtersToQuery(filtersFromQuery(query)) !== '';
}

export function filterSignature(state: CollectionFilterState): string {
  return [
    state.rarity,
    state.group,
    state.set,
    state.variantsOnly ? '1' : '0',
    state.holosOnly ? '1' : '0',
    state.tradeableOnly ? '1' : '0',
    state.search,
  ].join('|');
}
