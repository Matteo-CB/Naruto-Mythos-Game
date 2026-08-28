// Qui a agi dans la partie d un match de tournoi. Une partie annulee efface la salle, les
// sockets et la liste des joueurs prets: sans cette memoire, le joueur qui etait bel et bien
// au plateau devient indistinguable de celui qui n est jamais venu, et c est lui que le
// forfait d absence frappe.

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
