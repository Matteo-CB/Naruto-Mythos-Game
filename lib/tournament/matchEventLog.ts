type MatchEventType =
  | 'match.advance'
  | 'match.advance.bye'
  | 'match.forfeit.absence'
  | 'match.forfeit.disconnect'
  | 'match.forfeit.admin'
  | 'match.forfeit.double'
  | 'match.auto-forfeit.eliminated'
  | 'match.auto-forfeit.eliminated.both'
  | 'match.completed.played'
  | 'match.launch.no-contest'
  | 'match.launch.stalled'
  | 'tournament.start.begin'
  | 'tournament.start.success'
  | 'tournament.start.failed'
  | 'tournament.cancelled.admin'
  | 'tournament.cancelled.all-eliminated'
  | 'tournament.cancelled.not-enough-players'
  | 'tournament.cancelled.start-failed'
  | 'tournament.cancelled.deleted'
  | 'tournament.completed';

interface MatchEvent {
  type: MatchEventType;
  tournamentId: string;
  matchId?: string;
  bracket?: string;
  round?: number;
  matchIndex?: number;
  winnerId?: string | null;
  loserId?: string | null;
  forfeitedPlayerId?: string | null;
  forfeitedPlayer2Id?: string | null;
  reason?: string;
  detail?: string;
  format?: string;
}

export function logMatchEvent(ev: MatchEvent): void {
  const payload = JSON.stringify({ ts: new Date().toISOString(), ...ev });
  console.log(`[MatchEvent] ${payload}`);
}
