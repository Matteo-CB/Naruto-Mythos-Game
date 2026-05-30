import { describe, it, expect } from 'vitest';
import {
  unixToDate,
  mapRawStatus,
  deriveStatus,
  normalizeSearchItem,
  normalizeDetailInfo,
  mergeDetail,
} from '@/lib/topdeck/normalize';

const NOW = Date.UTC(2026, 4, 29, 12, 0, 0);

describe('topdeck unixToDate', () => {
  it('treats <1e12 as seconds and >=1e12 as milliseconds', () => {
    const sec = unixToDate(1_700_000_000);
    const ms = unixToDate(1_700_000_000_000);
    expect(sec?.getTime()).toBe(1_700_000_000_000);
    expect(ms?.getTime()).toBe(1_700_000_000_000);
  });
  it('returns null for non-positive / invalid', () => {
    expect(unixToDate(0)).toBeNull();
    expect(unixToDate(-5)).toBeNull();
    expect(unixToDate(null)).toBeNull();
    expect(unixToDate('abc')).toBeNull();
  });
});

describe('topdeck mapRawStatus', () => {
  it('maps known status strings', () => {
    expect(mapRawStatus('Complete')).toBe('completed');
    expect(mapRawStatus('Finished')).toBe('completed');
    expect(mapRawStatus('Ongoing')).toBe('ongoing');
    expect(mapRawStatus('In Progress')).toBe('ongoing');
    expect(mapRawStatus('Upcoming')).toBe('upcoming');
    expect(mapRawStatus('Registration')).toBe('upcoming');
  });
  it('returns null for unknown / empty', () => {
    expect(mapRawStatus('Weird')).toBeNull();
    expect(mapRawStatus(null)).toBeNull();
  });
});

describe('topdeck deriveStatus', () => {
  it('upcoming when start is in the future', () => {
    expect(deriveStatus(new Date(NOW + 86_400_000), null, NOW)).toBe('upcoming');
  });
  it('ongoing when started within the last 2 days', () => {
    expect(deriveStatus(new Date(NOW - 3_600_000), null, NOW)).toBe('ongoing');
  });
  it('completed when started long ago', () => {
    expect(deriveStatus(new Date(NOW - 10 * 86_400_000), null, NOW)).toBe('completed');
  });
  it('completed when endDate is in the past', () => {
    expect(deriveStatus(new Date(NOW - 3_600_000), new Date(NOW - 60_000), NOW)).toBe('completed');
  });
  it('unknown when no dates', () => {
    expect(deriveStatus(null, null, NOW)).toBe('unknown');
  });
});

describe('topdeck normalizeSearchItem', () => {
  const raw = {
    TID: 'sky-high-cup',
    tournamentName: "Sky High Commander's Cup",
    swissNum: 3,
    startDate: Math.floor((NOW - 5 * 86_400_000) / 1000),
    game: 'Magic: The Gathering',
    format: 'EDH',
    topCut: 8,
    averageElo: 1523,
    eventData: {
      lat: 27.41,
      lng: -80.39,
      city: 'Fort Pierce',
      state: 'Florida',
      address: '2717 Peters Rd, Fort Pierce, FL 34945, USA',
      headerImage: '',
    },
    standings: [
      { name: 'A', id: 'x', standing: 1, points: 9, winRate: 1, opponentWinRate: 0.5, decklist: null },
      { name: 'B', id: 'y', standing: 2, points: 6, winRate: 0.66, opponentWinRate: 0.5, decklist: 'list' },
    ],
  };

  it('maps core fields, location from eventData, and participant count from standings', () => {
    const n = normalizeSearchItem(raw, NOW)!;
    expect(n.tid).toBe('sky-high-cup');
    expect(n.name).toBe("Sky High Commander's Cup");
    expect(n.game).toBe('Magic: The Gathering');
    expect(n.format).toBe('EDH');
    expect(n.city).toBe('Fort Pierce');
    expect(n.state).toBe('Florida');
    expect(n.lat).toBeCloseTo(27.41);
    expect(n.locationName).toContain('Fort Pierce');
    expect(n.participants).toBe(2);
    expect(n.swissNum).toBe(3);
    expect(n.topCut).toBe(8);
    expect(n.averageElo).toBe(1523);
    expect(n.standings?.length).toBe(2);
    expect(n.status).toBe('completed');
    expect(n.hasDetail).toBe(false);
  });

  it('returns null when there is no id', () => {
    expect(normalizeSearchItem({ tournamentName: 'x' }, NOW)).toBeNull();
    expect(normalizeSearchItem(null, NOW)).toBeNull();
  });

  it('tolerates empty eventData and missing standings', () => {
    const n = normalizeSearchItem({ TID: 't', startDate: Math.floor(NOW / 1000), eventData: {} }, NOW)!;
    expect(n.participants).toBe(0);
    expect(n.standings).toBeNull();
    expect(n.city).toBeNull();
    expect(n.name).toBe('t');
  });
});

describe('topdeck normalizeDetailInfo + mergeDetail', () => {
  it('parses /info and prefers raw status, parses ms endDate', () => {
    const detail = normalizeDetailInfo(
      {
        tid: 't',
        name: 'T',
        startDate: Math.floor((NOW - 3_600_000) / 1000),
        endDate: NOW - 60_000,
        status: 'Complete',
        location: { name: 'addr', city: 'Lyon', state: 'AURA', country: 'France', lat: 45.7, lng: 4.8 },
      },
      NOW,
    )!;
    expect(detail.status).toBe('completed');
    expect(detail.rawStatus).toBe('Complete');
    expect(detail.country).toBe('France');
    expect(detail.endDate?.getTime()).toBe(NOW - 60_000);
  });

  it('mergeDetail overlays detail fields and sets hasDetail', () => {
    const base = normalizeSearchItem(
      { TID: 't', tournamentName: 'T', startDate: Math.floor(NOW / 1000), eventData: { city: 'Lyon' } },
      NOW,
    )!;
    const detail = normalizeDetailInfo(
      { tid: 't', status: 'Complete', endDate: NOW, location: { country: 'France' } },
      NOW,
    )!;
    const merged = mergeDetail(base, detail);
    expect(merged.hasDetail).toBe(true);
    expect(merged.status).toBe('completed');
    expect(merged.country).toBe('France');
    expect(merged.city).toBe('Lyon');
  });
});
