
const agissants = new Map<string, Set<string>>();

export function noterUneActionAuPlateau(matchId: string | null | undefined, userId: string | null | undefined): void {
  if (!matchId || !userId) return;
  const vus = agissants.get(matchId) ?? new Set<string>();
  vus.add(userId);
  agissants.set(matchId, vus);
}

export function aAgiAuPlateau(matchId: string | null | undefined, userId: string | null | undefined): boolean {
  if (!matchId || !userId) return false;
  return agissants.get(matchId)?.has(userId) === true;
}

export function oublierLeMatch(matchId: string | null | undefined): void {
  if (!matchId) return;
  agissants.delete(matchId);
}

export function reinitialiserLaPresence(): void {
  agissants.clear();
}
