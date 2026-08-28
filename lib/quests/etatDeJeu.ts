import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { numeroImprime, setDeLaCarte } from './effetResolu';
import { HOOK_EQUIPEMENT_POSE } from './equipementPose';

// Certaines quetes ne portent pas sur un fait qui se produit mais sur une situation qui se
// constate: trois equipements en jeu en meme temps, un equipement de mission sur les quatre
// missions, deux parchemins reunis. On balaie le plateau apres chaque action, comme le font
// deja les seuils de puissance.

function campDe(att: { owner: PlayerID; controlledBy?: PlayerID | null }): PlayerID {
  return (att.controlledBy ?? att.owner) as PlayerID;
}

interface EquipementVu { numero: number; set: string; missionIndex: number; surMission: boolean }

function equipementsDuJoueur(state: GameState, player: PlayerID): EquipementVu[] {
  const vus: EquipementVu[] = [];
  const missions = state.activeMissions ?? [];
  for (let i = 0; i < missions.length; i += 1) {
    const mission = missions[i];
    for (const att of mission.attachments ?? []) {
      if (campDe(att) !== player) continue;
      const numero = numeroImprime(att.card?.id);
      const set = setDeLaCarte(att.card?.id);
      if (numero !== null && set !== null) vus.push({ numero, set, missionIndex: i, surMission: true });
    }
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const ch of mission[side] ?? []) {
        for (const att of ch.attachments ?? []) {
          if (campDe(att) !== player) continue;
          const numero = numeroImprime(att.card?.id);
          const set = setDeLaCarte(att.card?.id);
          if (numero !== null && set !== null) vus.push({ numero, set, missionIndex: i, surMission: false });
        }
      }
    }
  }
  return vus;
}

export function emitAttachmentStateEvents(state: GameState): void {
  if (!state?.activeMissions) return;
  for (const player of ['player1', 'player2'] as const) {
    const vus = equipementsDuJoueur(state, player);
    if (vus.length === 0) continue;

    const sets = [...new Set(vus.map((v) => v.set))];
    for (const set of sets) {
      const duSet = vus.filter((v) => v.set === set);
      emitEngineQuestEvent(state, player, HOOK_EQUIPEMENT_POSE, {
        set,
        simultaneous: duSet.length,
        round: state.turn,
      });

      const missionsTenues = new Set(duSet.filter((v) => v.surMission).map((v) => v.missionIndex));
      if (missionsTenues.size > 0) {
        emitEngineQuestEvent(state, player, HOOK_EQUIPEMENT_POSE, {
          set,
          attachTo: 'mission',
          simultaneous: missionsTenues.size,
          round: state.turn,
        });
      }

      const parMission = new Map<number, number[]>();
      for (const v of duSet) {
        parMission.set(v.missionIndex, [...(parMission.get(v.missionIndex) ?? []), v.numero]);
      }
      for (const [missionIndex, numeros] of parMission) {
        if (numeros.length < 2) continue;
        emitEngineQuestEvent(state, player, HOOK_EQUIPEMENT_POSE, {
          set,
          pairNumbers: numeros,
          missionIndex,
          round: state.turn,
        });
      }
    }
  }
}
