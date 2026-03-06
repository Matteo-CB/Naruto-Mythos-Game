/**
 * Manages 5-minute absence timers for tournament matches.
 * When a player doesn't show up within 5 minutes, auto-forfeit triggers.
 */

const ABSENCE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const absenceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Start a 5-minute absence timer for a match.
 * Returns the deadline Date.
 */
export function startAbsenceTimer(
  matchId: string,
  onForfeit: () => Promise<void>,
): Date {
  clearAbsenceTimer(matchId);

  const deadline = new Date(Date.now() + ABSENCE_TIMEOUT_MS);

  absenceTimers.set(
    matchId,
    setTimeout(async () => {
      absenceTimers.delete(matchId);
      try {
        await onForfeit();
      } catch (err) {
        console.error(`[Tournament] Absence forfeit error for match ${matchId}:`, err);
      }
    }, ABSENCE_TIMEOUT_MS),
  );

  return deadline;
}

/**
 * Clear an absence timer (player showed up, or match resolved).
 */
export function clearAbsenceTimer(matchId: string): void {
  const timer = absenceTimers.get(matchId);
  if (timer) {
    clearTimeout(timer);
    absenceTimers.delete(matchId);
  }
}

/**
 * Check if an absence timer is running for a match.
 */
export function hasAbsenceTimer(matchId: string): boolean {
  return absenceTimers.has(matchId);
}
