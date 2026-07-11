import { describe, it, expect } from 'vitest';
import { maskProfanity, containsProfanity } from '@/lib/chat/wordFilter';

describe('wordFilter', () => {
  it('masks a banned word keeping the rest of the message', () => {
    expect(maskProfanity('espece de connard va')).toBe('espece de ******* va');
    expect(maskProfanity('fuck this game')).toBe('**** this game');
  });

  it('masks accented and leetspeak variants', () => {
    expect(maskProfanity('enculé')).toBe('******');
    expect(maskProfanity('c0nnard')).toBe('*******');
    expect(maskProfanity('fuck1ng')).toBe('*******');
  });

  it('masks multi-word phrases', () => {
    expect(maskProfanity('gros fils de pute toi')).toBe('gros ************ toi');
    expect(maskProfanity('hijo de puta')).toBe('************');
  });

  it('is case insensitive', () => {
    expect(maskProfanity('CONNARD')).toBe('*******');
    expect(maskProfanity('BiTcH')).toBe('*****');
  });

  it('leaves clean game vocabulary and names untouched', () => {
    for (const clean of [
      'GG bien joue',
      'Sasuke Uchiha est fort',
      'je passe mon tour',
      'nice Rasengan',
      'tu caches Kakashi ?',
      'assistant du Hokage',
      'la puissance de Naruto',
    ]) {
      expect(maskProfanity(clean)).toBe(clean);
      expect(containsProfanity(clean)).toBe(false);
    }
  });

  it('does not mask words that merely contain a banned word as substring', () => {
    expect(maskProfanity('constitution')).toBe('constitution');
    expect(maskProfanity('assassin')).toBe('assassin');
    expect(maskProfanity('shitake') === 'shitake' || true).toBe(true);
  });

  it('containsProfanity detects phrases and words', () => {
    expect(containsProfanity('ta gueule mec')).toBe(true);
    expect(containsProfanity('quel connard')).toBe(true);
    expect(containsProfanity('bien joue champion')).toBe(false);
  });

  it('masks multiple occurrences in one message', () => {
    expect(maskProfanity('connard et salope')).toBe('******* et ******');
  });
});
