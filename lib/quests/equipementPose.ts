import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';
import { numeroImprime, setDeLaCarte, equipementsDeLaMission } from './effetResolu';

export const HOOK_EQUIPEMENT_POSE = 'attachment.attached.with.source';
export const HOOK_EQUIPEMENT_DEFAUSSE = 'attachment.discarded.with.source';
export const HOOK_DEFAITE_PAR_EQUIPEMENT = 'character.defeated.by.attachment';

interface CarteEquipement { id?: string; name_fr?: string; name_en?: string }

// Le camp effectif d un equipement: un equipement vole compte pour celui qui le controle.
function campDe(att: { owner: PlayerID; controlledBy?: PlayerID | null }): PlayerID {
  return (att.controlledBy ?? att.owner) as PlayerID;
}

export function annoncerEquipementPose(
  state: GameState,
  player: PlayerID,
  card: CarteEquipement,
  options: { missionIndex?: number; attachTo: 'character' | 'mission'; stolen?: boolean },
): void {
  const set = setDeLaCarte(card.id);
  const sourceNumber = numeroImprime(card.id);
  if (set === null || sourceNumber === null) return;
  emitEngineQuestEvent(state, player, HOOK_EQUIPEMENT_POSE, {
    set,
    sourceNumber,
    sourceName: card.name_fr ?? card.name_en,
    attachTo: options.attachTo,
    stolen: options.stolen === true,
    round: state.turn,
    missionAttachments: equipementsDeLaMission(state, options.missionIndex),
    pairNumbers: numerosSurLaMission(state, player, options.missionIndex),
  });
}

// Les numeros que ce joueur a reunis sur cette mission, personnages compris. Sert aux
// quetes qui demandent deux equipements precis au meme endroit.
function numerosSurLaMission(state: GameState, player: PlayerID, missionIndex?: number): number[] {
  if (missionIndex === undefined || missionIndex < 0) return [];
  const mission = state.activeMissions?.[missionIndex];
  if (!mission) return [];
  const numeros: number[] = [];
  for (const att of mission.attachments ?? []) {
    if (campDe(att) !== player) continue;
    const n = numeroImprime(att.card?.id);
    if (n !== null) numeros.push(n);
  }
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    for (const ch of mission[side] ?? []) {
      for (const att of ch.attachments ?? []) {
        if (campDe(att) !== player) continue;
        const n = numeroImprime(att.card?.id);
        if (n !== null) numeros.push(n);
      }
    }
  }
  return numeros;
}

export function annoncerEquipementDefausse(
  state: GameState,
  player: PlayerID,
  source: CarteEquipement,
  delta = 1,
): void {
  const set = setDeLaCarte(source.id);
  const sourceNumber = numeroImprime(source.id);
  if (set === null || sourceNumber === null) return;
  emitEngineQuestEvent(state, player, HOOK_EQUIPEMENT_DEFAUSSE, {
    set, sourceNumber, sourceName: source.name_fr ?? source.name_en, delta,
  });
}

export function annoncerDefaiteParEquipement(
  state: GameState,
  player: PlayerID,
  source: CarteEquipement,
  delta = 1,
): void {
  const set = setDeLaCarte(source.id);
  const sourceNumber = numeroImprime(source.id);
  if (set === null || sourceNumber === null) return;
  emitEngineQuestEvent(state, player, HOOK_DEFAITE_PAR_EQUIPEMENT, {
    set, sourceNumber, sourceName: source.name_fr ?? source.name_en, delta,
  });
}
