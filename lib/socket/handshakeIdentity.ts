export const SESSION_COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'] as const;

export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      value = raw;
    }
    if (out[key] === undefined) out[key] = value;
  }
  return out;
}

export interface SessionTokenPick {
  token: string;
  salt: string;
}

export function pickSessionToken(cookies: Record<string, string>): SessionTokenPick | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const token = cookies[name];
    if (token) return { token, salt: name };
  }
  return null;
}

export type JwtDecoder = (args: { token: string; secret: string; salt: string }) => Promise<unknown>;

export async function resolveHandshakeIdentity(
  cookieHeader: string | undefined | null,
  secret: string | undefined | null,
  decoder: JwtDecoder,
): Promise<string | null> {
  if (!secret) return null;
  const picked = pickSessionToken(parseCookieHeader(cookieHeader));
  if (!picked) return null;
  try {
    const decoded = await decoder({ token: picked.token, secret, salt: picked.salt });
    if (!decoded || typeof decoded !== 'object') return null;
    const id = (decoded as { id?: unknown }).id;
    if (typeof id === 'string' && id.length > 0) return id;
    const sub = (decoded as { sub?: unknown }).sub;
    if (typeof sub === 'string' && sub.length > 0) return sub;
    return null;
  } catch {
    return null;
  }
}

export type IdentityClaimVerdict = 'accept' | 'already-proven' | 'reject';

export function verifyIdentityClaim(
  handshakeUserId: string | null | undefined,
  claimedUserId: string | null | undefined,
): IdentityClaimVerdict {
  if (!claimedUserId) return 'reject';
  if (!handshakeUserId) return 'accept';
  if (handshakeUserId === claimedUserId) return 'already-proven';
  return 'reject';
}
