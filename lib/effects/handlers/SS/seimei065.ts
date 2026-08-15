import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { AttachedCard, CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const SEIMEI_065 = 'SS-065-UC';

export interface EquipementSituation {
  attachment: AttachedCard;
  missionIndex: number;
  hostInstanceId: string | null;
  hostName: string | null;
}

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function estSeimei(char: CharacterInPlay | null | undefined): boolean {
  if (!char) return false;
  const top = topOf(char) as unknown as CardData;
  if (top.id === SEIMEI_065) return true;
  return String(top.set) === 'SS' && Number(top.number) === 65;
}

export function equipementsAllies(state: GameState, player: PlayerID): EquipementSituation[] {
  const trouves: EquipementSituation[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const att of mission.attachments ?? []) {
      if (att.owner === player) {
        trouves.push({ attachment: att, missionIndex: i, hostInstanceId: null, hostName: null });
      }
    }
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) {
        for (const att of c.attachments ?? []) {
          if (att.owner !== player) continue;
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

export function equipementsDeplacablesVers(
  state: GameState,
  player: PlayerID,
  seimeiInstanceId: string,
): EquipementSituation[] {
  return equipementsAllies(state, player)
    .filter((e) => e.hostInstanceId !== seimeiInstanceId);
}

export function apercuEquipements(situations: EquipementSituation[]) {
  return situations.map((e) => ({
    attachmentId: e.attachment.instanceId,
    name_fr: e.attachment.card.name_fr,
    name_en: e.attachment.card.name_en,
    chakra: e.attachment.card.chakra,
    power: e.attachment.card.power,
    image_file: e.attachment.card.image_file,
    missionIndex: e.missionIndex,
    hostName: e.hostName ?? undefined,
  }));
}

function seimeiMain(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const candidats = equipementsDeplacablesVers(state, sourcePlayer, sourceCard.instanceId);
  if (candidats.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Seimei (065): no friendly attachment can be moved.',
          'game.log.effect.noTarget', { card: 'SEIMEI', id: SEIMEI_065 }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS065_MOVE_ATTACHMENT',
    validTargets: candidats.map((e) => e.attachment.instanceId),
    isOptional: true,
    description: JSON.stringify({ attachments: apercuEquipements(candidats) }),
    descriptionKey: 'game.effect.desc.ss065MoveAttachment',
  }, sourceCard.instanceId, 'SS065_CONFIRM_MAIN');
}

export function registerSeimei065Handler(): void {
  registerEffect(SEIMEI_065, 'MAIN', seimeiMain);
}
