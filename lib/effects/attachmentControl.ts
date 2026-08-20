import type { AttachedCard, CardData, GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';
import { generateInstanceId } from '@/lib/engine/utils/id';
import {
  attachCardToCharacter,
  attachCardToMission,
  campDeLEquipement,
  discardAttachments,
  getCharacterAttachTargets,
  missionAlreadyHasPlayerAttachment,
  parseAttachSpec,
} from './attachments';

export interface EquipementVole {
  attachment: AttachedCard;
  missionIndex: number;
  hostInstanceId: string | null;
}

export function equipementsControlesPar(state: GameState, controllerInstanceId: string): EquipementVole[] {
  const trouves: EquipementVole[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    for (const att of mission.attachments ?? []) {
      if (att.controllerInstanceId === controllerInstanceId && att.controlledBy && att.controlledBy !== att.owner) {
        trouves.push({ attachment: att, missionIndex: mi, hostInstanceId: null });
      }
    }
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        for (const att of char.attachments ?? []) {
          if (att.controllerInstanceId === controllerInstanceId && att.controlledBy && att.controlledBy !== att.owner) {
            trouves.push({ attachment: att, missionIndex: mi, hostInstanceId: char.instanceId });
          }
        }
      }
    }
  }
  return trouves;
}

export function equipementsAuControleurDisparu(state: GameState): EquipementVole[] {
  const enJeu = new Set<string>();
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) enJeu.add(char.instanceId);
    }
  }
  const orphelins: EquipementVole[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    const examine = (att: AttachedCard, hostInstanceId: string | null) => {
      if (!att.controlledBy || att.controlledBy === att.owner) return;
      if (!att.controllerInstanceId || enJeu.has(att.controllerInstanceId)) return;
      orphelins.push({ attachment: att, missionIndex: mi, hostInstanceId });
    };
    for (const att of mission.attachments ?? []) examine(att, null);
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        for (const att of char.attachments ?? []) examine(att, char.instanceId);
      }
    }
  }
  return orphelins;
}

export function retirerEquipementDuPlateau(state: GameState, attachmentId: string): GameState {
  return {
    ...state,
    activeMissions: state.activeMissions.map((mission) => ({
      ...mission,
      attachments: (mission.attachments ?? []).filter((a) => a.instanceId !== attachmentId),
      player1Characters: mission.player1Characters.map((c) => ({
        ...c,
        attachments: (c.attachments ?? []).filter((a) => a.instanceId !== attachmentId),
      })),
      player2Characters: mission.player2Characters.map((c) => ({
        ...c,
        attachments: (c.attachments ?? []).filter((a) => a.instanceId !== attachmentId),
      })),
    })),
  };
}

export function ciblesDeRetour(state: GameState, card: CardData, proprietaire: PlayerID): string[] {
  const spec = parseAttachSpec(card);
  if (spec.toMission) {
    const cibles: string[] = [];
    for (let mi = 0; mi < state.activeMissions.length; mi++) {
      if (!missionAlreadyHasPlayerAttachment(state, proprietaire, mi)) cibles.push(`MISSION_${mi}`);
    }
    return cibles;
  }
  const cibles: string[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    for (const hote of getCharacterAttachTargets(state, proprietaire, mi, card)) {
      cibles.push(hote.instanceId);
    }
  }
  return cibles;
}

function journalDeRetour(state: GameState, proprietaire: PlayerID, card: CardData, rendu: boolean): GameState {
  return {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, proprietaire,
      rendu ? 'ATTACH_CARD' : 'DISCARD_ATTACHMENT',
      rendu
        ? `${card.name_fr} returns to its owner: the character controlling it left play.`
        : `${card.name_fr} goes to the discard pile: its owner has no legal target left.`,
      rendu ? 'game.log.attachmentReturned' : 'game.log.attachmentReturnedDiscarded',
      { card: card.name_fr, card_en: card.name_en ?? card.name_fr, id: card.id },
    ),
  };
}

export function poserEquipementRendu(
  state: GameState,
  attachmentId: string,
  proprietaire: PlayerID,
  cible: string,
): GameState {
  let carte: CardData | null = null;
  for (const mission of state.activeMissions) {
    for (const att of mission.attachments ?? []) if (att.instanceId === attachmentId) carte = att.card;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        for (const att of char.attachments ?? []) if (att.instanceId === attachmentId) carte = att.card;
      }
    }
  }
  if (!carte) return state;

  let next = retirerEquipementDuPlateau(state, attachmentId);
  next = cible.startsWith('MISSION_')
    ? attachCardToMission(next, proprietaire, carte, Number(cible.slice('MISSION_'.length)), false)
    : attachCardToCharacter(next, proprietaire, carte, cible, false);
  return journalDeRetour(next, proprietaire, carte, true);
}

function demanderLaCible(
  state: GameState,
  attachmentId: string,
  proprietaire: PlayerID,
  card: CardData,
  cibles: string[],
): GameState {
  const effId = generateInstanceId();
  const actId = generateInstanceId();
  const effet: PendingEffect = {
    id: effId,
    sourceCardId: card.id,
    sourceInstanceId: attachmentId,
    sourceMissionIndex: 0,
    effectType: 'ATTACH',
    effectDescription: JSON.stringify({ attachmentId }),
    targetSelectionType: 'ATTACH_RETURN_CHOOSE_TARGET',
    sourcePlayer: proprietaire,
    selectingPlayer: proprietaire,
    requiresTargetSelection: true,
    validTargets: cibles,
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  } as PendingEffect;
  const action: PendingAction = {
    id: actId,
    type: 'SELECT_TARGET' as PendingAction['type'],
    player: proprietaire,
    description: `Choose where ${card.name_fr} goes back.`,
    descriptionKey: 'game.effect.desc.attachReturnChooseTarget',
    descriptionParams: { card: card.name_fr },
    options: cibles,
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effId,
  } as PendingAction;

  return {
    ...state,
    pendingEffects: [...state.pendingEffects, effet],
    pendingActions: [...state.pendingActions, action],
  };
}

export function rendreUnEquipement(state: GameState, vole: EquipementVole): GameState {
  const { attachment } = vole;
  const proprietaire = attachment.owner;
  const cibles = ciblesDeRetour(state, attachment.card, proprietaire);

  if (cibles.length === 0) {
    const sansEquipement = retirerEquipementDuPlateau(state, attachment.instanceId);
    const defausse = discardAttachments(sansEquipement, [{ ...attachment, controlledBy: undefined }]);
    return journalDeRetour(defausse, proprietaire, attachment.card, false);
  }

  if (cibles.length === 1) {
    return poserEquipementRendu(state, attachment.instanceId, proprietaire, cibles[0]);
  }

  return demanderLaCible(state, attachment.instanceId, proprietaire, attachment.card, cibles);
}

export function rendreEquipementsDuControleur(state: GameState, controllerInstanceId: string): GameState {
  let next = state;
  for (const vole of equipementsControlesPar(state, controllerInstanceId)) {
    next = rendreUnEquipement(next, vole);
  }
  return next;
}

export function libererEquipementsOrphelins(state: GameState): GameState {
  let next = state;
  for (const vole of equipementsAuControleurDisparu(state)) {
    next = rendreUnEquipement(next, vole);
  }
  return next;
}

export function equipementEstVole(att: AttachedCard): boolean {
  return !!att.controlledBy && att.controlledBy !== att.owner;
}

export function campEffectif(att: AttachedCard): PlayerID {
  return campDeLEquipement(att);
}
