import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID, CardData } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

const MISSION_IDS: Record<number, string[]> = {
  1: ['SS-001-MMS', 'SS-001_2-MMS'],
  2: ['SS-002-MMS', 'SS-002_2-MMS'],
  3: ['SS-003-MMS', 'SS-003_2-MMS'],
  4: ['SS-004-MMS', 'SS-004_2-MMS'],
  5: ['SS-005-MMS', 'SS-005_2-MMS'],
  6: ['SS-006-MMS', 'SS-006_2-MMS'],
  7: ['SS-007-MMS', 'SS-007_2-MMS'],
  8: ['SS-008-MMS', 'SS-008_2-MMS'],
  9: ['SS-009-MMS', 'SS-009_2-MMS'],
  10: ['SS-010-MMS', 'SS-010_2-MMS'],
};

const NAMES: Record<number, string> = {
  1: 'Renforts',
  2: 'Reconnaissance',
  3: 'Duel d’honneur',
  4: 'Mission prioritaire',
  5: 'Terrain hostile',
  6: 'Faire profil bas',
  7: 'Roi de la colline',
  8: 'Entraînement d’équipe',
  9: 'Derrière les lignes ennemies',
  10: 'Sabotage',
};

function noTarget(state: GameState, player: PlayerID, message: string, missionNumber: number): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'SCORE_NO_TARGET', message,
        'game.log.effect.noTarget', { card: NAMES[missionNumber], id: MISSION_IDS[missionNumber][0] }),
    },
  };
}

export function hiddenCharactersInPlay(state: GameState): string[] {
  const ids: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) ids.push(char.instanceId);
    }
  }
  return ids;
}

export interface AttachmentInPlay {
  attachmentId: string;
  hostInstanceId: string;
  missionIndex: number;
  name_fr: string;
  name_en?: string;
  chakra: number;
  power: number;
  image_file?: string;
  hostName?: string;
}

export function attachmentsInPlay(state: GameState): AttachmentInPlay[] {
  const found: AttachmentInPlay[] = [];

  const describe = (
    attachment: { instanceId: string; card: CardData },
    hostInstanceId: string,
    missionIndex: number,
    hostName?: string,
  ): AttachmentInPlay => ({
    attachmentId: attachment.instanceId,
    hostInstanceId,
    missionIndex,
    name_fr: attachment.card.name_fr,
    name_en: attachment.card.name_en,
    chakra: typeof attachment.card.chakra === 'number' ? attachment.card.chakra : 0,
    power: typeof attachment.card.power === 'number' ? attachment.card.power : 0,
    image_file: attachment.card.image_file,
    hostName,
  });

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      for (const attachment of char.attachments ?? []) {
        found.push(describe(attachment, char.instanceId, i, char.isHidden ? undefined : top?.name_fr));
      }
    }
    for (const attachment of mission.attachments ?? []) {
      found.push(describe(attachment, '', i, mission.card?.name_fr));
    }
  }
  return found;
}

function ssMission02Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const hidden = hiddenCharactersInPlay(state);
  if (hidden.length === 0) {
    return noTarget(state, sourcePlayer, 'Reconnaissance (SS-002): No hidden character in play.', 2);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SSMSS02_CONFIRM_SCORE',
    validTargets: [MISSION_IDS[2][0]],
    isOptional: true,
    description: 'Reconnaissance (SS-002): Look at a hidden character, then you may move them.',
    descriptionKey: 'game.effect.desc.ssMss02LookHidden',
  };
}

function ssMission09Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponent: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = { ...state[opponent] };

  if (opponentState.deck.length === 0) {
    return noTarget(state, sourcePlayer, 'Behind Enemy Lines (SS-009): The opponent deck is empty.', 9);
  }

  const deck = [...opponentState.deck];
  const drawn = deck.shift();
  opponentState.deck = deck;
  opponentState.hand = drawn ? [...opponentState.hand, drawn] : opponentState.hand;

  return {
    state: {
      ...state,
      [opponent]: opponentState,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'SCORE_FORCE_DRAW',
        'Behind Enemy Lines (SS-009): The opponent must draw a card.',
        'game.log.effect.ssMss09ForcedDraw',
        { card: NAMES[9], id: MISSION_IDS[9][0] }),
    },
  };
}

function ssMission10Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const attachments = attachmentsInPlay(state);
  if (attachments.length === 0) {
    return noTarget(state, sourcePlayer, 'Sabotage (SS-010): No attachment in play.', 10);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SSMSS10_CONFIRM_SCORE',
    validTargets: [MISSION_IDS[10][0]],
    isOptional: true,
    description: 'Sabotage (SS-010): Discard an attachment in play.',
    descriptionKey: 'game.effect.desc.ssMss10DiscardAttachment',
  };
}

export function registerSSMissionHandlers(): void {
  for (const id of MISSION_IDS[2]) registerEffect(id, 'SCORE', ssMission02Score);
  for (const id of MISSION_IDS[9]) registerEffect(id, 'SCORE', ssMission09Score);
  for (const id of MISSION_IDS[10]) registerEffect(id, 'SCORE', ssMission10Score);
}
