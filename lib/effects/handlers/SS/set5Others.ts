import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { AttachedCard, CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { TENTEN_021_ID, TENTEN_021_REDUCTION, reductionPremiereFrappe } from '@/lib/engine/rules/firstStrikeDiscount';
import { sideFor } from '@/lib/effects/moveNameUniqueness';
import { confirmFirst } from './confirmFirst';
import { apercuEquipements, type EquipementSituation } from './seimei065';

export const SERPENTS_056 = 'SS-056-UC';
export const OROCHIMARU_145 = 'SS-145-S';
export const KIBA_014 = 'SS-014-C';
export const TENTEN_021 = TENTEN_021_ID;
export const MIZUKI_060 = 'SS-060-UC';
export const TAZUNA_076 = 'SS-076-UC';

export const KIBA_014_THRESHOLD = 3;
export const TAZUNA_076_POINTS = 2;
export const MIZUKI_060_POINTS = 1;
export const REDUCTION_TENTEN_021 = TENTEN_021_REDUCTION;
export { reductionPremiereFrappe };

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

export function equipementsEnnemisDans(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): EquipementSituation[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const trouves: EquipementSituation[] = [];
  for (const att of mission.attachments ?? []) {
    if (att.owner === adversaire) {
      trouves.push({ attachment: att, missionIndex, hostInstanceId: null, hostName: null });
    }
  }
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    for (const c of mission[side]) {
      for (const att of c.attachments ?? []) {
        if (att.owner !== adversaire) continue;
        trouves.push({ attachment: att, missionIndex, hostInstanceId: c.instanceId, hostName: topOf(c).name_fr });
      }
    }
  }
  return trouves;
}

export function seuilDOrochimaru(char: CharacterInPlay, revele: boolean): { seuil: number; strict: boolean } {
  return { seuil: char.stack?.length ?? 0, strict: !revele };
}

export function ciblesDOrochimaru(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  seuil: number,
  strict: boolean,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return mission[sideFor(adversaire)].filter((c) => {
    const cout = c.isHidden ? 0 : ((topOf(c) as unknown as CardData).chakra ?? 0);
    return strict ? cout < seuil : cout <= seuil;
  });
}

export function cachesEnnemisDans(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return mission[sideFor(adversaire)].filter((c) => c.isHidden);
}

export function alliesCachablesDans(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideFor(player)].filter((c) => !c.isHidden && c.instanceId !== sourceInstanceId);
}


function serpents056(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const candidats = equipementsEnnemisDans(state, sourcePlayer, sourceMissionIndex);
  if (candidats.length === 0) {
    return refus(state, sourcePlayer, 'Three Giant Snakes (056): no enemy attachment in this mission.',
      'TROIS SERPENTS GEANTS', SERPENTS_056);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS056_DISCARD_ATTACHMENT',
    validTargets: candidats.map((e) => e.attachment.instanceId),
    isOptional: true,
    description: JSON.stringify({ attachments: apercuEquipements(candidats) }),
    descriptionKey: 'game.effect.desc.ss056DiscardAttachment',
  }, sourceCard.instanceId, 'SS056_CONFIRM_AMBUSH');
}

function orochimaru145(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, wasRevealed } = ctx;
  const { seuil, strict } = seuilDOrochimaru(sourceCard, !!wasRevealed);
  const cibles = ciblesDOrochimaru(state, sourcePlayer, sourceMissionIndex, seuil, strict);
  if (cibles.length === 0) {
    return refus(state, sourcePlayer, 'Orochimaru (145): no enemy character cheap enough in this mission.',
      'OROCHIMARU', OROCHIMARU_145);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS145_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ seuil, strict }),
    descriptionKey: strict ? 'game.effect.desc.ss145DefeatBelow' : 'game.effect.desc.ss145DefeatUpTo',
    descriptionParams: { amount: seuil },
  };
}

function orochimaru145Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const { seuil } = seuilDOrochimaru(sourceCard, true);
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT',
        `Orochimaru (145): revealed, the threshold becomes ${seuil} or lower.`,
        'game.log.effect.ss145Threshold',
        { card: 'OROCHIMARU', id: OROCHIMARU_145, amount: String(seuil) }),
    },
  };
}

function kiba014(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const caches = cachesEnnemisDans(state, sourcePlayer, sourceMissionIndex);
  if (caches.length === 0) {
    return refus(state, sourcePlayer, 'Kiba Inuzuka (014): no hidden enemy character in this mission.',
      'KIBA INUZUKA', KIBA_014);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS014_PEEK_AND_DEFEAT',
    validTargets: caches.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss014PeekAndDefeat',
  }, sourceCard.instanceId, 'SS014_CONFIRM_FIRST_STRIKE');
}

function tenten021(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT',
        'Tenten (021): played for 1 less as the first card of the round.',
        'game.log.effect.ss021Cheaper', { card: 'TENTEN', id: TENTEN_021 }),
    },
  };
}

function mizuki060(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const candidats = alliesCachablesDans(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  if (candidats.length === 0) {
    return refus(state, sourcePlayer, 'Mizuki (060): no other friendly character here can be hidden.',
      'MIZUKI', MIZUKI_060);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS060_HIDE_FRIENDLY',
    validTargets: candidats.map((c) => c.instanceId),
    isOptional: false,
    isMandatory: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss060HideFriendly',
    minSelections: 1,
    maxSelections: 1,
    selectingPlayer: sourcePlayer,
  };
}

function tazuna076(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS076_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss076GainPoints',
  };
}

export function registerSet5OtherHandlers(): void {
  registerEffect(SERPENTS_056, 'AMBUSH', serpents056);
  registerEffect(OROCHIMARU_145, 'MAIN', orochimaru145);
  registerEffect(OROCHIMARU_145, 'AMBUSH', orochimaru145Ambush);
  registerEffect(KIBA_014, 'FIRST_STRIKE', kiba014);
  registerEffect(TENTEN_021, 'FIRST_STRIKE', tenten021);
  registerEffect(MIZUKI_060, 'SCORE', mizuki060);
  registerEffect(TAZUNA_076, 'SCORE', tazuna076);
}

export function equipementParId(state: GameState, attachmentId: string): AttachedCard | null {
  for (const mission of state.activeMissions) {
    for (const att of mission.attachments ?? []) if (att.instanceId === attachmentId) return att;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) {
        for (const att of c.attachments ?? []) if (att.instanceId === attachmentId) return att;
      }
    }
  }
  return null;
}
