import { describe, it, expect } from 'vitest';
import { formatCardLabel, formatCardLabelShort } from '@/lib/variants/cardLabel';

describe('formatCardLabel', () => {
  it('formats a French Rare card with full title', () => {
    const label = formatCardLabel(
      {
        name_fr: 'NARUTO UZUMAKI',
        title_fr: 'Le Jinchûriki',
        name_en: 'NARUTO UZUMAKI',
        title_en: 'The Jinchûriki',
        number: 108,
        rarity: 'R',
      },
      'fr',
    );
    expect(label).toBe('NARUTO UZUMAKI Le Jinchûriki 108 Rare');
  });

  it('formats an English Mythos Variant', () => {
    const label = formatCardLabel(
      {
        name_fr: 'NARUTO UZUMAKI',
        title_fr: 'Multiclonage',
        name_en: 'NARUTO UZUMAKI',
        title_en: 'Shadow Clone Jutsu',
        number: 133,
        rarity: 'MV',
      },
      'en',
    );
    expect(label).toBe('NARUTO UZUMAKI Shadow Clone Jutsu 133 Mythos Variant');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatCardLabel(null)).toBe('');
    expect(formatCardLabel(undefined)).toBe('');
  });

  it('zero-pads numbers to 3 digits', () => {
    const label = formatCardLabel(
      {
        name_fr: 'TEST',
        title_fr: '',
        number: 1,
        rarity: 'C',
      },
      'fr',
    );
    expect(label).toContain('001');
  });

  it('handles cards with no title', () => {
    const label = formatCardLabel(
      {
        name_fr: 'AKAMARU',
        title_fr: '',
        number: 27,
        rarity: 'C',
      },
      'fr',
    );
    expect(label).toBe('AKAMARU 027 Commune');
  });

  it('formatCardLabelShort drops the rarity suffix', () => {
    const label = formatCardLabelShort(
      {
        name_fr: 'NARUTO UZUMAKI',
        title_fr: 'Le Jinchûriki',
        number: 108,
      },
      'fr',
    );
    expect(label).toBe('NARUTO UZUMAKI Le Jinchûriki 108');
  });
});
