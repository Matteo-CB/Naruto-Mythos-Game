const STORAGE_KEY = 'naruto-mythos-surveys-lastseen';

export function getSurveysLastSeen(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markSurveysSeen(latestOpenAt: string): void {
  try {
    const prev = localStorage.getItem(STORAGE_KEY) ?? '';
    if (latestOpenAt > prev) localStorage.setItem(STORAGE_KEY, latestOpenAt);
  } catch { /* ignore */ }
}

export function hasNewSurveys(latestOpenAt: string | null): boolean {
  if (!latestOpenAt) return false;
  return latestOpenAt > getSurveysLastSeen();
}
