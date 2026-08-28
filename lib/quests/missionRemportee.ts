import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { numeroImprime, setDeLaCarte, equipementsDeLaMission } from './effetResolu';

export const HOOK_MISSION_REMPORTEE = 'mission.won';
export const HOOK_POINTS_DE_MISSION = 'mission_points.scored.match';

function campDe(att: { owner: PlayerID; controlledBy?: PlayerID | null }): PlayerID {
  return (att.controlledBy ?? att.owner) as PlayerID;
}

// Les numeros que le vainqueur avait reunis sur cette mission au moment du decompte.
function numerosDuVainqueurSurLaMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): number[] {
  const mission = state.activeMissions?.[missionIndex];
  if (!mission) return [];
  const numeros: number[] = [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  for (const att of mission.attachments ?? []) {
    if (campDe(att) !== player) continue;
    const n = numeroImprime(att.card?.id);
    if (n !== null) numeros.push(n);
  }
  for (const ch of mission[side] ?? []) {
    for (const att of ch.attachments ?? []) {
      if (campDe(att) !== player) continue;
      const n = numeroImprime(att.card?.id);
      if (n !== null) numeros.push(n);
    }
  }
  return numeros;
}

// La mission est annoncee a chaque decompte, pas une fois en fin de partie: sans cela une
// quete qui demande de remporter les quatre missions d une meme manche ne pourrait jamais
// se mesurer, et remporter dix fois la meme mission ne compterait qu une.
export function annoncerMissionRemportee(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  points: number,
): void {
  const mission = state.activeMissions?.[missionIndex];
  if (!mission) return;
  const carte = mission.card as { id?: string; name_fr?: string; name_en?: string } | undefined;
  const set = setDeLaCarte(carte?.id);
  const missionNumber = numeroImprime(carte?.id);

  emitEngineQuestEvent(state, player, HOOK_MISSION_REMPORTEE, {
    rank: mission.rank,
    round: state.turn,
    points,
    ...(set !== null ? { set } : {}),
    ...(missionNumber !== null ? { missionNumber, distinctKey: `${set}-${missionNumber}` } : {}),
    missionAttachments: equipementsDeLaMission(state, missionIndex),
    pairNumbers: numerosDuVainqueurSurLaMission(state, player, missionIndex),
  });

  const total = state[player]?.missionPoints ?? 0;
  emitEngineQuestEvent(state, player, HOOK_POINTS_DE_MISSION, {
    threshold: total,
    round: state.turn,
    ...(set !== null ? { set } : {}),
    pairNumbers: numerosDuVainqueurSurLaMission(state, player, missionIndex),
  });
}
