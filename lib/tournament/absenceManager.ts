

export const ABSENCE_TIMEOUT_MS = 5 * 60 * 1000;

const absenceTimers = new Map<string, ReturnType<typeof setTimeout>>();


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


export function clearAbsenceTimer(matchId: string): void {
  const timer = absenceTimers.get(matchId);
  if (timer) {
    clearTimeout(timer);
    absenceTimers.delete(matchId);
  }
}


export function hasAbsenceTimer(matchId: string): boolean {
  return absenceTimers.has(matchId);
}


export function scheduleAbsenceTimerWithDeadline(
  matchId: string,
  deadline: Date,
  onForfeit: () => Promise<void>,
): number {
  clearAbsenceTimer(matchId);
  const remaining = deadline.getTime() - Date.now();
  const ms = Math.max(0, remaining);
  absenceTimers.set(
    matchId,
    setTimeout(async () => {
      absenceTimers.delete(matchId);
      try {
        await onForfeit();
      } catch (err) {
        console.error(`[Tournament] Rehydrated absence forfeit error for match ${matchId}:`, err);
      }
    }, ms),
  );
  return ms;
}
