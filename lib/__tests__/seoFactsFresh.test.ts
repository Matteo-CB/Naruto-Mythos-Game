import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { routing } from '@/lib/i18n/routing';
import { getSiteFacts } from '@/lib/seo/siteFacts';

const DYNAMIC_STRINGS: Array<{ path: string[]; placeholder: string }> = [
  { path: ['seoPages', 'collection', 'title'], placeholder: '{cardCount}' },
  { path: ['seoPages', 'collection', 'description'], placeholder: '{cardCount}' },
  { path: ['rootMeta', 'ogDescription'], placeholder: '{cardCount}' },
  { path: ['rootMeta', 'twitterDescription'], placeholder: '{cardCount}' },
  { path: ['seoPages', 'deckBuilder', 'description'], placeholder: '{characterCount}' },
  { path: ['seoPages', 'playSealed', 'description'], placeholder: '{boosterCount}' },
];

function read(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
}

function pick(source: Record<string, unknown>, path: string[]): string | undefined {
  let cursor: unknown = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

describe('SEO descriptions never carry a stale hardcoded count', () => {
  for (const locale of routing.locales) {
    const messages = read(locale);

    for (const { path, placeholder } of DYNAMIC_STRINGS) {
      const key = path.join('.');

      it(`${locale}: ${key} uses ${placeholder} instead of a fixed number`, () => {
        const value = pick(messages, path);
        expect(value, `${locale} is missing ${key}`).toBeTypeOf('string');
        expect(value).toContain(placeholder);
      });
    }
  }

  it('the counts come from the card data, not from a constant', () => {
    const facts = getSiteFacts();
    expect(facts.cardCount).toBeGreaterThan(0);
    expect(facts.characterCount).toBeGreaterThan(0);
    expect(facts.cardCount).toBeGreaterThan(facts.characterCount);
  });

  it('every locale declares the same dynamic values, so none drifts alone', () => {
    const reference = routing.locales.map((locale) => {
      const messages = read(locale);
      return DYNAMIC_STRINGS.map(({ path, placeholder }) => (pick(messages, path) ?? '').includes(placeholder)).join(',');
    });
    expect(new Set(reference).size).toBe(1);
  });
});
