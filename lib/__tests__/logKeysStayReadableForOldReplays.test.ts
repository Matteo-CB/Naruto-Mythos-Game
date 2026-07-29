import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const LOCALES = ['en', 'fr', 'es', 'it', 'pl', 'pt', 'ja'];

function messages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function logEffect(locale: string): Record<string, string> {
  const m = messages(locale) as { game: { log: { effect: Record<string, string> } } };
  return m.game.log.effect;
}

describe('a saved replay written before a deploy still reads as a sentence', () => {
  it('the old Gaara line keeps the placeholder the recorded games carry', () => {
    for (const locale of LOCALES) {
      const text = logEffect(locale).ss046Draw;
      expect(text, `${locale} must keep the key its recorded games use`).toBeTruthy();
      expect(placeholders(text), `${locale}: a game recorded before the deploy only stored count`)
        .not.toContain('revealed');
    }
  });

  it('the richer line lives under its own key', () => {
    for (const locale of LOCALES) {
      const text = logEffect(locale).ss046DrawNames;
      expect(text, `${locale} is missing the new key`).toBeTruthy();
      expect(placeholders(text), `${locale}: the new line names the revealed cards`).toContain('revealed');
    }
  });

  it('both lines carry the same placeholders in every language', () => {
    for (const key of ['ss046Draw', 'ss046DrawNames']) {
      const reference = placeholders(logEffect('en')[key]);
      for (const locale of LOCALES) {
        expect(placeholders(logEffect(locale)[key]), `${locale}.${key} must match the English placeholders`)
          .toEqual(reference);
      }
    }
  });
});
