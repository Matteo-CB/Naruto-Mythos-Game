export function shouldOfferResume(pathname: string, tournamentId?: string | null): boolean {
  if (pathname.startsWith('/game')) return false;
  if (tournamentId) return pathname.startsWith('/tournaments');
  return pathname.startsWith('/play/online');
}
