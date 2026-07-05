import { describe, it, expect } from 'vitest';
import { localizeMessageParams } from '@/lib/i18n/localizeMessageParams';

describe('localizeMessageParams', () => {
  it('returns params unchanged for the base French locale', () => {
    const p = { card: 'PERSO', card_en: 'CHARACTER', mission: 2 };
    expect(localizeMessageParams(p, 'fr')).toEqual(p);
  });

  it('swaps base key to the _en variant for English', () => {
    const out = localizeMessageParams({ card: 'PERSO', card_en: 'CHARACTER' }, 'en');
    expect(out?.card).toBe('CHARACTER');
  });

  it('prefers the _{locale} variant when present', () => {
    const out = localizeMessageParams({ card: 'PERSO', card_en: 'CHARACTER', card_es: 'PERSONAJE' }, 'es');
    expect(out?.card).toBe('PERSONAJE');
  });

  it('falls back to _en when the requested locale variant is absent', () => {
    const out = localizeMessageParams({ card: 'PERSO', card_en: 'CHARACTER' }, 'ja');
    expect(out?.card).toBe('CHARACTER');
  });

  it('leaves non-card string params and numbers untouched', () => {
    const out = localizeMessageParams({ mission: '3', amount: 2, cost: '5' }, 'en');
    expect(out?.mission).toBe('3');
    expect(out?.amount).toBe(2);
    expect(out?.cost).toBe('5');
  });

  it('handles undefined params', () => {
    expect(localizeMessageParams(undefined, 'ja')).toBeUndefined();
  });

  it('resolves a hardcoded source card label from the id param', () => {
    const out = localizeMessageParams({ card: 'IGNORED_LITERAL', id: 'KS-119-R', target: 'X' }, 'en');
    expect(typeof out?.card).toBe('string');
    expect(out?.card).not.toBe('IGNORED_LITERAL');
    expect((out?.card as string).length).toBeGreaterThan(0);
  });

  it('localizes a name param that matches a real card name (EN)', () => {
    const out = localizeMessageParams({ target: 'NARUTO UZUMAKI' }, 'en');
    expect(typeof out?.target).toBe('string');
    expect((out?.target as string).length).toBeGreaterThan(0);
  });
});
