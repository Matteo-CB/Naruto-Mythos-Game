import { hasNewSurveys } from './seen';

const TTL_MS = 180_000;

let cachedValue: boolean | null = null;
let fetchedAt = 0;
let inflight: Promise<boolean> | null = null;

async function fetchBadge(): Promise<boolean> {
  try {
    const res = await fetch('/api/surveys/latest', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    if (typeof data.unansweredCount === 'number') return data.unansweredCount > 0;
    return hasNewSurveys(typeof data.latestOpenAt === 'string' ? data.latestOpenAt : null);
  } catch {
    return false;
  }
}

export async function getSurveysBadge(): Promise<boolean> {
  const now = Date.now();
  if (cachedValue !== null && now - fetchedAt < TTL_MS) return cachedValue;
  if (!inflight) {
    inflight = fetchBadge().then((v) => {
      cachedValue = v;
      fetchedAt = Date.now();
      inflight = null;
      return v;
    });
  }
  return inflight;
}

export function clearSurveysBadgeCache(): void {
  cachedValue = null;
  fetchedAt = 0;
  inflight = null;
}
