import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: { post: { findMany: vi.fn().mockResolvedValue([]) } } }));

import sitemap from '@/app/sitemap';
import { routing } from '@/lib/i18n/routing';
import { ORDERED_CARD_IDS } from '@/lib/cards/order';
import { cardIdToSlug, slugToCardId } from '@/lib/cards/slug';

const SITE_URL = 'https://narutomythosgame.com';
const entries = await sitemap();
const urls = entries.map((e) => e.url);

describe('sitemap includes localized card pages (Phase A2)', () => {
  it('has exactly one URL per card per locale', () => {
    const cardUrls = urls.filter((u) => u.includes('/cards/'));
    expect(cardUrls.length).toBe(ORDERED_CARD_IDS.length * routing.locales.length);
  });

  it('links a known card in every locale with hreflang alternates', () => {
    const slug = cardIdToSlug('KS-108-R');
    for (const loc of routing.locales) {
      expect(urls).toContain(`${SITE_URL}/${loc}/cards/${slug}`);
    }
    const en = entries.find((e) => e.url === `${SITE_URL}/en/cards/${slug}`);
    expect(en?.alternates?.languages?.ja).toBe(`${SITE_URL}/ja/cards/${slug}`);
    expect(en?.alternates?.languages?.fr).toBe(`${SITE_URL}/fr/cards/${slug}`);
    expect(en?.priority).toBe(0.6);
  });

  it('every card slug in the sitemap round-trips to a real card id', () => {
    const cardEntries = entries.filter((e) => e.url.includes('/cards/'));
    const distinctSlugs = new Set(cardEntries.map((e) => e.url.split('/cards/')[1]));
    expect(distinctSlugs.size).toBe(ORDERED_CARD_IDS.length);
    for (const slug of distinctSlugs) {
      expect(slugToCardId(slug)).toBeTruthy();
    }
  });

  it('includes released cards, set 2 included', () => {
    expect(urls).toContain(`${SITE_URL}/en/cards/${cardIdToSlug('KS-108_4-MV')}`);
    expect(urls).toContain(`${SITE_URL}/fr/cards/${cardIdToSlug('SS-112-SPV')}`);
  });
});
