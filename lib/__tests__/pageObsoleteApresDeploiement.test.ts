import { describe, it, expect, vi } from 'vitest';
import { estBundleObsolete, rechargerUneSeuleFois, CLE_RECHARGEMENT_OBSOLETE } from '@/lib/ui/staleDeploy';

describe('une page laissee ouverte pendant un deploiement', () => {
  it('reconnait les erreurs qui viennent d un ancien code charge dans l onglet', () => {
    expect(estBundleObsolete({ message: 'Failed to find Server Action "abc123". This request might be from an older or newer deployment.' })).toBe(true);
    expect(estBundleObsolete({ name: 'ChunkLoadError', message: 'Loading chunk 42 failed' })).toBe(true);
    expect(estBundleObsolete({ message: 'Failed to fetch dynamically imported module: /_next/static/x.js' })).toBe(true);
  });

  it('ne confond pas une vraie erreur applicative avec un deploiement', () => {
    expect(estBundleObsolete({ message: 'Cannot read properties of undefined' })).toBe(false);
    expect(estBundleObsolete({ message: 'Tournament not found' })).toBe(false);
    expect(estBundleObsolete(null)).toBe(false);
    expect(estBundleObsolete(undefined)).toBe(false);
  });

  it('recharge une fois puis laisse la main, pour ne jamais boucler', () => {
    const memoire = new Map<string, string>();
    const stockage = {
      getItem: (k: string) => memoire.get(k) ?? null,
      setItem: (k: string, v: string) => { memoire.set(k, v); },
    };
    const recharger = vi.fn();

    expect(rechargerUneSeuleFois(stockage, recharger)).toBe(true);
    expect(recharger).toHaveBeenCalledTimes(1);
    expect(memoire.get(CLE_RECHARGEMENT_OBSOLETE)).toBe('1');

    expect(rechargerUneSeuleFois(stockage, recharger), 'deuxieme passage: on affiche le message').toBe(false);
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('ne tente rien quand le stockage est indisponible', () => {
    const recharger = vi.fn();
    expect(rechargerUneSeuleFois(null, recharger)).toBe(false);
    expect(recharger).not.toHaveBeenCalled();
  });
});
