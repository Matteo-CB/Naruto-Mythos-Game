export const SUGGESTION_CATEGORIES = ['bug', 'feature', 'balance', 'ui', 'other'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export const SUGGESTION_STATUSES = ['open', 'planned', 'in_progress', 'to_fix', 'done', 'rejected'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const TITLE_MIN = 5;
export const TITLE_MAX = 140;
export const BODY_MIN = 20;
export const BODY_MAX = 2000;
export const ADMIN_NOTE_MAX = 1000;

export const MAX_OPEN_PER_USER = 3;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

const CATEGORY_SET = new Set<string>(SUGGESTION_CATEGORIES);
const STATUS_SET = new Set<string>(SUGGESTION_STATUSES);

export function isCategory(value: unknown): value is SuggestionCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value);
}

export function isStatus(value: unknown): value is SuggestionStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

const HTML_TAG_REGEX = /<[^>]+>/;

export interface ValidatedSuggestion {
  category: SuggestionCategory;
  title: string;
  body: string;
}

export type SuggestionValidationError =
  | 'invalidCategory'
  | 'titleTooShort'
  | 'titleTooLong'
  | 'bodyTooShort'
  | 'bodyTooLong'
  | 'htmlNotAllowed';

export function validateSuggestionPayload(input: unknown): { ok: true; data: ValidatedSuggestion } | { ok: false; reason: SuggestionValidationError } {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'invalidCategory' };
  const obj = input as Record<string, unknown>;
  if (!isCategory(obj.category)) return { ok: false, reason: 'invalidCategory' };

  const title = typeof obj.title === 'string' ? obj.title.normalize('NFC').trim() : '';
  const body = typeof obj.body === 'string' ? obj.body.normalize('NFC').trim() : '';

  if (title.length < TITLE_MIN) return { ok: false, reason: 'titleTooShort' };
  if (title.length > TITLE_MAX) return { ok: false, reason: 'titleTooLong' };
  if (body.length < BODY_MIN) return { ok: false, reason: 'bodyTooShort' };
  if (body.length > BODY_MAX) return { ok: false, reason: 'bodyTooLong' };

  if (HTML_TAG_REGEX.test(title) || HTML_TAG_REGEX.test(body)) {
    return { ok: false, reason: 'htmlNotAllowed' };
  }

  return { ok: true, data: { category: obj.category, title, body } };
}

export const VALIDATION_ERROR_KEYS: Record<SuggestionValidationError, string> = {
  invalidCategory: 'helpUs.suggestions.error.invalidCategory',
  titleTooShort: 'helpUs.suggestions.error.tooShort',
  titleTooLong: 'helpUs.suggestions.error.tooLong',
  bodyTooShort: 'helpUs.suggestions.error.tooShort',
  bodyTooLong: 'helpUs.suggestions.error.tooLong',
  htmlNotAllowed: 'helpUs.suggestions.error.tooLong',
};
