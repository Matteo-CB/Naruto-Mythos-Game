export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_ALLOWED = /^[A-Za-z0-9_-]+$/;

export function sanitizeUsername(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const replaced = trimmed.replace(/[^A-Za-z0-9_-]/g, '_');
  const collapsed = replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return collapsed;
}

export type UsernameValidationError =
  | 'USERNAME_REQUIRED'
  | 'USERNAME_TOO_SHORT'
  | 'USERNAME_TOO_LONG'
  | 'USERNAME_INVALID_CHARS';

export interface UsernameValidationResult {
  ok: boolean;
  error?: UsernameValidationError;
}

export function validateUsername(candidate: string): UsernameValidationResult {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { ok: false, error: 'USERNAME_REQUIRED' };
  }
  if (candidate.length < USERNAME_MIN_LENGTH) {
    return { ok: false, error: 'USERNAME_TOO_SHORT' };
  }
  if (candidate.length > USERNAME_MAX_LENGTH) {
    return { ok: false, error: 'USERNAME_TOO_LONG' };
  }
  if (!USERNAME_ALLOWED.test(candidate)) {
    return { ok: false, error: 'USERNAME_INVALID_CHARS' };
  }
  return { ok: true };
}
