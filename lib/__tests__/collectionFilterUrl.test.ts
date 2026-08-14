import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLLECTION_FILTERS,
  filtersToQuery,
  filtersFromQuery,
  hasCollectionFilterQuery,
  filterSignature,
} from '@/lib/collection/filterUrl';

describe('filtres de collection dans l adresse', () => {
  it('une collection sans filtre ne salit pas l adresse', () => {
    expect(filtersToQuery(DEFAULT_COLLECTION_FILTERS)).toBe('');
    expect(hasCollectionFilterQuery('')).toBe(false);
    expect(hasCollectionFilterQuery('?')).toBe(false);
  });

  it('ecrit puis relit chaque filtre a l identique', () => {
    const etat = {
      rarity: 'S',
      group: 'Leaf Village',
      set: 'SS',
      variantsOnly: true,
      holosOnly: false,
      tradeableOnly: true,
      search: 'naruto',
      page: 4,
    };
    expect(filtersFromQuery(filtersToQuery(etat))).toEqual(etat);
  });

  it('retrouve les filtres depuis une adresse avec point d interrogation', () => {
    const etat = filtersFromQuery('?rarity=RA&set=KS&variants=1&q=gaara&page=3');
    expect(etat.rarity).toBe('RA');
    expect(etat.set).toBe('KS');
    expect(etat.variantsOnly).toBe(true);
    expect(etat.holosOnly).toBe(false);
    expect(etat.search).toBe('gaara');
    expect(etat.page).toBe(3);
  });

  it('ignore une page absurde et revient a la premiere', () => {
    expect(filtersFromQuery('page=0').page).toBe(1);
    expect(filtersFromQuery('page=-2').page).toBe(1);
    expect(filtersFromQuery('page=abc').page).toBe(1);
  });

  it('une adresse vide rend exactement les filtres par defaut', () => {
    expect(filtersFromQuery('')).toEqual(DEFAULT_COLLECTION_FILTERS);
  });

  it('la page ne fait pas partie de la signature qui remet a la premiere page', () => {
    const base = { ...DEFAULT_COLLECTION_FILTERS, rarity: 'M' };
    expect(filterSignature({ ...base, page: 1 })).toBe(filterSignature({ ...base, page: 7 }));
    expect(filterSignature({ ...base, rarity: 'S' })).not.toBe(filterSignature(base));
  });

  it('une recherche vide ou faite d espaces ne s ecrit pas dans l adresse', () => {
    expect(filtersToQuery({ ...DEFAULT_COLLECTION_FILTERS, search: '   ' })).toBe('');
  });
});
