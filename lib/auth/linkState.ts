import crypto from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-only-link-state-secret';

export interface LinkStatePayload {
  userId: string;
  ts: number;
}

export function signLinkState(payload: LinkStatePayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyLinkState(token: string): LinkStatePayload | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkStatePayload;
    if (typeof payload.userId !== 'string' || typeof payload.ts !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}
