import { describe, it, expect, afterEach, vi } from 'vitest';
import { revealsEverything } from '@/lib/cards/reveal';

const drapeauInitial = process.env.REVEAL_EVERYTHING;

afterEach(() => {
  if (drapeauInitial === undefined) delete process.env.REVEAL_EVERYTHING;
  else process.env.REVEAL_EVERYTHING = drapeauInitial;
  vi.unstubAllEnvs();
});

describe("l'interrupteur qui revele tout est reserve au poste de developpement", () => {
  it('actif quand la variable vaut 1 hors production', () => {
    vi.stubEnv('REVEAL_EVERYTHING', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(revealsEverything()).toBe(true);
  });

  it('inerte en production, meme si la variable est posee', () => {
    vi.stubEnv('REVEAL_EVERYTHING', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(revealsEverything()).toBe(false);
  });

  it('inerte pendant les tests, pour ne pas fausser les gardes', () => {
    vi.stubEnv('REVEAL_EVERYTHING', '1');
    vi.stubEnv('NODE_ENV', 'test');
    expect(revealsEverything()).toBe(false);
  });

  it('inerte quand la variable est absente', () => {
    vi.stubEnv('REVEAL_EVERYTHING', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(revealsEverything()).toBe(false);
  });
});
