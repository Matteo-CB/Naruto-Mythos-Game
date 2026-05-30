import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/topdeck/cache', () => ({ upsertListTournaments: vi.fn() }));

import { parseTypesenseConfig, normalizeEventDoc } from '@/lib/topdeck/eventHub';

const NOW = Date.UTC(2026, 4, 29, 12, 0, 0);

describe('parseTypesenseConfig', () => {
  it('extracts host, search key and collection from page html', () => {
    const html = `
      <script>
        const TS_HOST = "https://abc123-1.a2.typesense.net";
        const TS_SEARCH_KEY = "k9bX7Qz1aB2cD3eF4gH5iJ6kL7mN8oP";
        fetch('https://abc123-1.a2.typesense.net/collections/events/documents/search?q=*');
      </script>`;
    const cfg = parseTypesenseConfig(html);
    expect(cfg).not.toBeNull();
    expect(cfg!.host).toBe('https://abc123-1.a2.typesense.net');
    expect(cfg!.key).toBe('k9bX7Qz1aB2cD3eF4gH5iJ6kL7mN8oP');
    expect(cfg!.collection).toBe('events');
  });

  it('returns null when host or key is missing', () => {
    expect(parseTypesenseConfig('<html>no config</html>')).toBeNull();
  });
});

describe('normalizeEventDoc', () => {
  const doc = {
    id: 'naruto-weekly-1',
    eventName: 'Naruto Weekly Event',
    game: 'Naruto',
    format: 'Local Tournament',
    startDate: Math.floor((NOW + 3 * 86_400_000) / 1000),
    endDate: 0,
    city: 'Viseu',
    state: 'Viseu',
    country: 'Portugal',
    location: 'R. de Sao Pedro, Viseu, Portugal',
    coordinates: [40.65985, -7.895224],
    playersRegd: 7,
    eventHeaderImage: '',
    publish: true,
  };

  it('maps an event doc to an upcoming tournament row', () => {
    const n = normalizeEventDoc(doc, NOW)!;
    expect(n.tid).toBe('naruto-weekly-1');
    expect(n.name).toBe('Naruto Weekly Event');
    expect(n.game).toBe('Naruto');
    expect(n.format).toBe('Local Tournament');
    expect(n.status).toBe('upcoming');
    expect(n.endDate).toBeNull();
    expect(n.city).toBe('Viseu');
    expect(n.country).toBe('Portugal');
    expect(n.lat).toBeCloseTo(40.65985);
    expect(n.lng).toBeCloseTo(-7.895224);
    expect(n.participants).toBe(7);
    expect(n.standings).toBeNull();
    expect(n.hasDetail).toBe(false);
  });

  it('returns null without an id and tolerates missing fields', () => {
    expect(normalizeEventDoc({ eventName: 'x' }, NOW)).toBeNull();
    const sparse = normalizeEventDoc({ id: 'x', startDate: Math.floor(NOW / 1000) }, NOW)!;
    expect(sparse.name).toBe('x');
    expect(sparse.game).toBe('Naruto');
    expect(sparse.participants).toBe(0);
  });
});
