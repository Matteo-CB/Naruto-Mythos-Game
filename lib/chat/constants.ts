export const CHAT_MAX_LENGTH = 140;
export const CHAT_COOLDOWN_MS = 2000;
export const DM_MAX_LENGTH = 140;
export const REPORT_REASON_MIN = 10;
export const REPORT_REASON_MAX = 500;
export const REPORTS_PER_DAY_LIMIT = 5;
export const CHAT_MESSAGE_TTL_MS = 72 * 60 * 60 * 1000;
export const DM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SEEN_NOTIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChatEmote {
  code: string;
  display: string;
  color: string;
  bg: string;
}

export const CHAT_EMOTES: readonly ChatEmote[] = [
  { code: ':gg:', display: 'GG', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':fire:', display: '*fire*', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':laugh:', display: 'xD', color: '#c4a35a', bg: 'rgba(196,163,90,0.15)' },
  { code: ':oof:', display: 'oof', color: '#b33e3e', bg: 'rgba(179,62,62,0.15)' },
  { code: ':thumbsup:', display: '(Y)', color: '#3e8b3e', bg: 'rgba(62,139,62,0.15)' },
] as const;

export const CHAT_EMOTE_CODES: ReadonlySet<string> = new Set(CHAT_EMOTES.map((e) => e.code));

export function dmThreadKey(userIdA: string, userIdB: string): string {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}
