import { describe, it, expect } from 'vitest';
import {
  validateSuggestionPayload,
  isCategory,
  isStatus,
  TITLE_MIN,
  TITLE_MAX,
  BODY_MIN,
  BODY_MAX,
} from '@/lib/suggestions/validation';
import { buildSuggestionWhere, compareByStatus } from '@/lib/suggestions/queries';

describe('isCategory / isStatus', () => {
  it('accepts whitelisted categories only', () => {
    expect(isCategory('bug')).toBe(true);
    expect(isCategory('feature')).toBe(true);
    expect(isCategory('balance')).toBe(true);
    expect(isCategory('ui')).toBe(true);
    expect(isCategory('other')).toBe(true);
    expect(isCategory('xss')).toBe(false);
    expect(isCategory('')).toBe(false);
    expect(isCategory(null)).toBe(false);
  });

  it('accepts the 6 statuses including to_fix', () => {
    for (const s of ['open', 'planned', 'in_progress', 'to_fix', 'done', 'rejected']) {
      expect(isStatus(s)).toBe(true);
    }
    expect(isStatus('archived')).toBe(false);
  });
});

describe('validateSuggestionPayload', () => {
  function ok(extra: Partial<{ category: string; title: string; body: string }> = {}) {
    return {
      category: 'bug',
      title: 'Naruto crash',
      body: 'Quand je joue Naruto 108 puis Itachi 091, la page freeze.',
      ...extra,
    };
  }

  it('returns ok with sanitized + trimmed values', () => {
    const r = validateSuggestionPayload({ ...ok(), title: '  Trimmed  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).toBe('Trimmed');
      expect(r.data.category).toBe('bug');
    }
  });

  it('rejects non-object payloads', () => {
    expect(validateSuggestionPayload(null).ok).toBe(false);
    expect(validateSuggestionPayload('foo').ok).toBe(false);
    expect(validateSuggestionPayload(42).ok).toBe(false);
  });

  it('rejects unknown category', () => {
    const r = validateSuggestionPayload({ ...ok(), category: 'lol' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalidCategory');
  });

  it('rejects too short title and body', () => {
    expect(validateSuggestionPayload({ ...ok(), title: 'ab' }).ok).toBe(false);
    expect(validateSuggestionPayload({ ...ok(), body: 'too short' }).ok).toBe(false);
  });

  it('rejects too long title and body', () => {
    const r1 = validateSuggestionPayload({ ...ok(), title: 'x'.repeat(TITLE_MAX + 1) });
    expect(r1.ok).toBe(false);
    const r2 = validateSuggestionPayload({ ...ok(), body: 'x'.repeat(BODY_MAX + 1) });
    expect(r2.ok).toBe(false);
  });

  it('accepts at the exact boundaries', () => {
    expect(validateSuggestionPayload({ ...ok(), title: 'x'.repeat(TITLE_MIN) }).ok).toBe(true);
    expect(validateSuggestionPayload({ ...ok(), title: 'x'.repeat(TITLE_MAX) }).ok).toBe(true);
    expect(validateSuggestionPayload({ ...ok(), body: 'x'.repeat(BODY_MIN) }).ok).toBe(true);
    expect(validateSuggestionPayload({ ...ok(), body: 'x'.repeat(BODY_MAX) }).ok).toBe(true);
  });

  it('rejects HTML tags in title or body', () => {
    expect(validateSuggestionPayload({ ...ok(), title: '<script>alert(1)</script>aa' }).ok).toBe(false);
    expect(validateSuggestionPayload({ ...ok(), body: 'plain <b>tag</b> in the middle of the description' }).ok).toBe(false);
  });
});

describe('buildSuggestionWhere', () => {
  it('returns empty when no filter', () => {
    expect(buildSuggestionWhere({})).toEqual({});
  });

  it('maps category + status filters', () => {
    expect(buildSuggestionWhere({ category: 'bug', status: 'open' })).toEqual({
      category: 'bug',
      status: 'open',
    });
  });

  it('builds OR clause for case-insensitive search', () => {
    const w = buildSuggestionWhere({ q: ' rashomon ' }) as { OR: Array<{ title?: { contains: string; mode: string } }> };
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(2);
    expect(w.OR[0].title?.contains).toBe('rashomon');
    expect(w.OR[0].title?.mode).toBe('insensitive');
  });

  it('clips a long q to 80 chars', () => {
    const longQ = 'x'.repeat(200);
    const w = buildSuggestionWhere({ q: longQ }) as { OR: Array<{ title: { contains: string } }> };
    expect(w.OR[0].title.contains.length).toBe(80);
  });
});

describe('compareByStatus', () => {
  it('puts open first, rejected last, by status order', () => {
    const rows = [
      { status: 'rejected', voteCount: 100, createdAt: new Date(3000) },
      { status: 'open', voteCount: 1, createdAt: new Date(1000) },
      { status: 'done', voteCount: 50, createdAt: new Date(2000) },
    ];
    rows.sort(compareByStatus);
    expect(rows.map((r) => r.status)).toEqual(['open', 'done', 'rejected']);
  });

  it('within same status, higher voteCount first, then more recent', () => {
    const rows = [
      { status: 'open', voteCount: 5, createdAt: new Date(1000) },
      { status: 'open', voteCount: 10, createdAt: new Date(2000) },
      { status: 'open', voteCount: 10, createdAt: new Date(3000) },
    ];
    rows.sort(compareByStatus);
    expect(rows[0].voteCount).toBe(10);
    expect(rows[0].createdAt.getTime()).toBe(3000);
    expect(rows[1].voteCount).toBe(10);
    expect(rows[2].voteCount).toBe(5);
  });
});
