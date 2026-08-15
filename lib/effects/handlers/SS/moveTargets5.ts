import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { AttachedCard, CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { moveWouldViolateNameUniqueness, sideFor } from '@/lib/effects/moveNameUniqueness';
import { getCharacterAttachTargets } from '@/lib/effects/attachments';
import { confirmFirst } from './confirmFirst';
import { apercuEquipements, type EquipementSituation } from './seimei065';

export const HAKU_052 = 'SS-052-C';
export const RYUGAN_073 = 'SS-073-C';
export const ZABUZA_NOM = 'ZABUZA MOMOCHI';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function refus(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

export interface ZabuzaDeplacable {
  char: CharacterInPlay;
  proprietaire: PlayerID;
  missionIndex: number;
  destinations: number[];
}

export function zabuzasDeplacables(
  state: GameState,
  missionIndex: number,
): ZabuzaDeplacable[] {
  const trouves: ZabuzaDeplacable[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const proprietaire of ['player1', 'player2'] as PlayerID[]) {
      for (const c of mission[sideFor(proprietaire)]) {
        if (c.isHidden) continue;
        const nom = `${topOf(c).name_fr ?? ''} ${topOf(c).name_en ?? ''}`.toUpperCase();
        if (!nom.includes(ZABUZA_NOM)) continue;

        const cibles = i === missionIndex
          ? state.activeMissions.map((_, j) => j).filter((j) => j !== missionIndex)
          : [missionIndex];
        const destinations = cibles.filter((j) =>
          !moveWouldViolateNameUniqueness(state, c, j, sideFor(proprietaire)));
        if (destinations.length > 0) {
          trouves.push({ char: c, proprietaire, missionIndex: i, destinations });
        }
      }
    }
  }
  return trouves;
}

export function equipementsDePersonnage(state: GameState): EquipementSituation[] {
  const trouves: EquipementSituation[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) {
        for (const att of c.attachments ?? []) {
          trouves.push({
            attachment: att,
            missionIndex: i,
            hostInstanceId: c.instanceId,
            hostName: topOf(c).name_fr,
          });
        }
      }
    }
  }
  return trouves;
}

export function hotesPossiblesPour(
  state: GameState,
  attachment: AttachedCard,
  hoteActuel: string,
): CharacterInPlay[] {
  const cibles: CharacterInPlay[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const c of getCharacterAttachTargets(state, attachment.owner, i, attachment.card as CardData)) {
      if (c.instanceId === hoteActuel) continue;
      cibles.push(c);
    }
  }
  return cibles;
}

export function equipementsAvecDestination(state: GameState): EquipementSituation[] {
  return equipementsDePersonnage(state)
    .filter((e) => hotesPossiblesPour(state, e.attachment, e.hostInstanceId ?? '').length > 0);
}

function haku052(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const candidats = zabuzasDeplacables(state, sourceMissionIndex);
  if (candidats.length === 0) {
    return refus(state, sourcePlayer, 'Haku (052): no Zabuza Momochi can be moved to or from this mission.', 'HAKU', HAKU_052);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS052_MOVE_ZABUZA',
    validTargets: candidats.map((z) => z.char.instanceId),
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.ss052MoveZabuza',
  }, sourceCard.instanceId, 'SS052_CONFIRM_AMBUSH');
}

function ryugan073(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const candidats = equipementsAvecDestination(state);
  if (candidats.length === 0) {
    return refus(state, sourcePlayer, 'Ryugan (073): no character attachment can be moved.', 'RYUGAN', RYUGAN_073);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS073_MOVE_ATTACHMENT',
    validTargets: candidats.map((e) => e.attachment.instanceId),
    isOptional: true,
    description: JSON.stringify({ attachments: apercuEquipements(candidats) }),
    descriptionKey: 'game.effect.desc.ss073MoveAttachment',
  }, sourceCard.instanceId, 'SS073_CONFIRM_AMBUSH');
}

export function registerMoveTargets5Handlers(): void {
  registerEffect(HAKU_052, 'AMBUSH', haku052);
  registerEffect(RYUGAN_073, 'AMBUSH', ryugan073);
}
