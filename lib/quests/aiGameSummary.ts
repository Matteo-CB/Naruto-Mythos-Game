'use client';

import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitQuestEvent } from './hooks';

export function emitAiGameSummaryHooks(state: GameState, humanPlayer: PlayerID, won: boolean): void {
  const uid = 'local-player';

  emitQuestEvent('match.played', uid, {});

  if (!won) return;

  if (state.turn <= 3) {
    emitQuestEvent('match.won.short', uid, { maxRound: 3 });
  }

  const friendlySide = humanPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  let anyDefeated = false;
  for (const log of state.log) {
    if (!log.player || log.player === humanPlayer) continue;
    const a = log.action;
    if (a.startsWith('EFFECT_DEFEAT') || a.startsWith('DEFEAT_')) {
      anyDefeated = true;
      break;
    }
  }
  if (!anyDefeated) {
    for (const mission of state.activeMissions) {
      if (mission[friendlySide].length === 0) continue;
    }
    emitQuestEvent('match.won.no_defeats_own', uid, {});
  }

  const ps = state[humanPlayer];
  if (ps) {
    const score = ps.missionPoints ?? 0;
    if (score > 0) {
      emitQuestEvent('mission_points.scored.match', uid, { threshold: score, matchKey: state.gameId });
    }
  }

  for (const mission of state.activeMissions) {
    if (mission.wonBy === humanPlayer) {
      emitQuestEvent('mission.won', uid, { rank: mission.rank, matchKey: state.gameId });
    }
  }

  const cfg = (state as { _originalDeck?: Array<{ power?: number }> })._originalDeck;
  if (!cfg) {
    const allCards = ps?.deck ? [...(ps.hand ?? []), ...(ps.deck ?? []), ...(ps.discardPile ?? [])] : [];
    const allMissionChars = state.activeMissions.flatMap(m => m[friendlySide].map(c => c.card));
    const combined = [...allCards, ...allMissionChars];
    if (combined.length >= 30 && combined.every(c => (c.power ?? 0) >= 4)) {
      emitQuestEvent('match.won.deck.power_minimum', uid, { minPrinted: 4 });
    }
  }
}
