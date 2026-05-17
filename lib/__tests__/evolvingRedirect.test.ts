import { describe, it, expect, vi } from 'vitest';

const redirectCalls: string[] = [];

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    const err = new Error('NEXT_REDIRECT');
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};308`;
    throw err;
  },
}));

import EvolvingPageRedirect from '../../app/[locale]/play/online/evolving/page';

describe('Phase 14.6 — /play/online/evolving redirect', () => {
  it('redirects fr locale to /fr/play/online?mode=evolving', async () => {
    redirectCalls.length = 0;
    await expect(
      EvolvingPageRedirect({ params: Promise.resolve({ locale: 'fr' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectCalls).toEqual(['/fr/play/online?mode=evolving']);
  });

  it('redirects en locale to /en/play/online?mode=evolving', async () => {
    redirectCalls.length = 0;
    await expect(
      EvolvingPageRedirect({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectCalls).toEqual(['/en/play/online?mode=evolving']);
  });

  it('preserves the ?mode=evolving query param so the lobby pre-selects evolving', async () => {
    redirectCalls.length = 0;
    await expect(
      EvolvingPageRedirect({ params: Promise.resolve({ locale: 'fr' }) }),
    ).rejects.toThrow();
    expect(redirectCalls[0]).toContain('mode=evolving');
  });

  it('targets the unified lobby /play/online, never the deleted /play/online/evolving', async () => {
    redirectCalls.length = 0;
    await expect(
      EvolvingPageRedirect({ params: Promise.resolve({ locale: 'fr' }) }),
    ).rejects.toThrow();
    expect(redirectCalls[0]).not.toContain('/play/online/evolving');
    expect(redirectCalls[0]).toContain('/play/online?');
  });
});
