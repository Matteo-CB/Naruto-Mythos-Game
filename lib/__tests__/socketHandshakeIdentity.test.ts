import { describe, it, expect, vi } from 'vitest';
import {
  parseCookieHeader,
  pickSessionToken,
  resolveHandshakeIdentity,
  verifyIdentityClaim,
} from '@/lib/socket/handshakeIdentity';

describe('parseCookieHeader', () => {
  it('returns an empty map for a missing header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('parses several cookies and trims whitespace', () => {
    expect(parseCookieHeader('a=1; b=2;  c=3 ')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('keeps a base64url token intact even though it contains "=" padding', () => {
    const token = 'eyJhbGciOiJkaXIi.payload==';
    const parsed = parseCookieHeader(`authjs.session-token=${token}; other=x`);
    expect(parsed['authjs.session-token']).toBe(token);
  });

  it('url-decodes values and keeps the first occurrence of a duplicated name', () => {
    const parsed = parseCookieHeader('n=a%20b; n=second');
    expect(parsed.n).toBe('a b');
  });

  it('ignores malformed pairs instead of throwing', () => {
    expect(parseCookieHeader('novalue; =orphan; ok=1')).toEqual({ ok: '1' });
  });
});

describe('pickSessionToken', () => {
  it('prefers the secure cookie and reports it as the salt', () => {
    const picked = pickSessionToken({
      '__Secure-authjs.session-token': 'secure-token',
      'authjs.session-token': 'plain-token',
    });
    expect(picked).toEqual({ token: 'secure-token', salt: '__Secure-authjs.session-token' });
  });

  it('falls back to the plain cookie', () => {
    expect(pickSessionToken({ 'authjs.session-token': 'plain-token' })).toEqual({
      token: 'plain-token',
      salt: 'authjs.session-token',
    });
  });

  it('returns null when no session cookie is present', () => {
    expect(pickSessionToken({ theme: 'dark' })).toBe(null);
  });
});

describe('resolveHandshakeIdentity', () => {
  it('resolves the id claim of the decoded token', async () => {
    const decoder = vi.fn().mockResolvedValue({ id: 'user-1' });
    const id = await resolveHandshakeIdentity('authjs.session-token=tok', 'secret', decoder);
    expect(id).toBe('user-1');
    expect(decoder).toHaveBeenCalledWith({ token: 'tok', secret: 'secret', salt: 'authjs.session-token' });
  });

  it('falls back to sub when id is absent', async () => {
    const decoder = vi.fn().mockResolvedValue({ sub: 'user-sub' });
    expect(await resolveHandshakeIdentity('authjs.session-token=tok', 'secret', decoder)).toBe('user-sub');
  });

  it('returns null with no secret, no cookie or an unusable payload', async () => {
    const decoder = vi.fn().mockResolvedValue({ id: 'user-1' });
    expect(await resolveHandshakeIdentity('authjs.session-token=tok', undefined, decoder)).toBe(null);
    expect(await resolveHandshakeIdentity('theme=dark', 'secret', decoder)).toBe(null);
    expect(await resolveHandshakeIdentity('authjs.session-token=tok', 'secret', vi.fn().mockResolvedValue(null))).toBe(null);
    expect(await resolveHandshakeIdentity('authjs.session-token=tok', 'secret', vi.fn().mockResolvedValue({}))).toBe(null);
  });

  it('never throws when the decoder rejects, so an anonymous socket still connects', async () => {
    const decoder = vi.fn().mockRejectedValue(new Error('bad token'));
    await expect(resolveHandshakeIdentity('authjs.session-token=tok', 'secret', decoder)).resolves.toBe(null);
  });
});

describe('verifyIdentityClaim', () => {
  it('accepts a claim when the handshake proved nothing', () => {
    expect(verifyIdentityClaim(null, 'user-1')).toBe('accept');
    expect(verifyIdentityClaim(undefined, 'user-1')).toBe('accept');
  });

  it('treats a matching claim as already proven so it cannot downgrade the handshake identity', () => {
    expect(verifyIdentityClaim('user-1', 'user-1')).toBe('already-proven');
  });

  it('rejects a claim that contradicts the handshake identity', () => {
    expect(verifyIdentityClaim('user-1', 'user-2')).toBe('reject');
  });

  it('rejects an empty claim', () => {
    expect(verifyIdentityClaim('user-1', '')).toBe('reject');
    expect(verifyIdentityClaim(null, null)).toBe('reject');
  });
});
