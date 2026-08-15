import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isDuelCharacterPresent } from '@/lib/effects/duelUtils';
import { moveWouldViolateNameUniqueness, sideFor } from '@/lib/effects/moveNameUniqueness';
import {
  effectiveFreshPlayCost,
  effectiveRevealCost,
  type HiddenCharTarget,
} from '@/lib/effects/handlers/KS/shared/summonSearch';
import { confirmFirst } from './confirmFirst';

export const SHINO_113 = 'SS-113-R';
export const HASHIRAMA_129 = 'SS-129-R';
export const TOBIRAMA_131 = 'SS-131-R';
export const HIRUZEN_133 = 'SS-133-R';

export const SHINO_113_VARIANTS = [SHINO_113];
export const HASHIRAMA_129_VARIANTS = [HASHIRAMA_129];
export const TOBIRAMA_131_VARIANTS = [TOBIRAMA_131];
export const HIRUZEN_133_VARIANTS = [HIRUZEN_133];

export const HOKAGE = 'Hokage';
export const SUMMON = 'Summon';
export const LEAF_VILLAGE = 'Leaf Village';
export const HASHIRAMA_129_POWERUP = 2;
export const HIRUZEN_133_POWERUP = 2;
export const HIRUZEN_133_REDUCTION = 2;
export const OROCHIMARU_NOM = 'Orochimaru';
export const KANKURO_NOM = 'Kankuro';

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

export function hokagesEnJeu(state: GameState): CharacterInPlay[] {
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) {
        if (c.isHidden) continue;
        if ((topOf(c).keywords ?? []).includes(HOKAGE)) trouves.push(c);
      }
    }
  }
  return trouves;
}

export function proprietaireDe(state: GameState, instanceId: string): PlayerID | null {
  for (const mission of state.activeMissions) {
    if (mission.player1Characters.some((c) => c.instanceId === instanceId)) return 'player1';
    if (mission.player2Characters.some((c) => c.instanceId === instanceId)) return 'player2';
  }
  return null;
}

export function destinationsDeHokage(
  state: GameState,
  char: CharacterInPlay,
  proprietaire: PlayerID,
): number[] {
  const destinations: number[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === char.missionIndex) continue;
    if (moveWouldViolateNameUniqueness(state, char, i, sideFor(proprietaire))) continue;
    destinations.push(i);
  }
  return destinations;
}

export function hokagesDeplacables(state: GameState): CharacterInPlay[] {
  return hokagesEnJeu(state).filter((c) => {
    const proprietaire = proprietaireDe(state, c.instanceId);
    return !!proprietaire && destinationsDeHokage(state, c, proprietaire).length > 0;
  });
}

export function duelOrochimaruTenu(state: GameState, missionIndex: number): boolean {
  return isDuelCharacterPresent(state, missionIndex, OROCHIMARU_NOM);
}


export interface InvocationJouable {
  handIndices: number[];
  caches: HiddenCharTarget[];
}

export function invocationsJouablesIci(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  reduction: number,
): InvocationJouable {
  const chakra = state[player].chakra;
  const main = state[player].hand as unknown as CardData[];
  const handIndices: number[] = [];
  for (let i = 0; i < main.length; i++) {
    const carte = main[i];
    if (!carte || carte.card_type === 'attachment') continue;
    if (!(carte.keywords ?? []).includes(SUMMON)) continue;
    if (effectiveFreshPlayCost(state, player, carte as never, missionIndex, reduction) > chakra) continue;
    handIndices.push(i);
  }

  const mission = state.activeMissions[missionIndex];
  const caches: HiddenCharTarget[] = [];
  if (mission) {
    const cotePropre = mission[sideFor(player)];
    for (const c of cotePropre) {
      if (!c.isHidden) continue;
      const coutReveal = effectiveRevealCost(state, player, c, missionIndex, reduction);
      if (coutReveal == null || coutReveal > chakra) continue;
      const carte = topOf(c) as unknown as CardData;
      caches.push({
        instanceId: c.instanceId,
        missionIndex,
        name_fr: carte.name_fr,
        name_en: carte.name_en,
        chakra: carte.chakra,
        power: carte.power,
        image_file: carte.image_file,
      } as HiddenCharTarget);
    }
  }
  return { handIndices, caches };
}

function shino113Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const adversaire: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';
  if (state[adversaire].hand.length === 0) {
    return refus(state, sourcePlayer, 'Shino Aburame (113): the opponent hand is empty.', 'SHINO ABURAME', SHINO_113);
  }
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS113_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss113Discard',
  };
}

function ss113DuelAppliqueParLeMain(ctx: EffectContext): EffectResult {
  return { state: ctx.state };
}

function hashirama129Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const cibles = hokagesEnJeu(state);
  if (cibles.length === 0) {
    return refus(state, sourcePlayer, 'Hashirama Senju (129): no visible Hokage character in play.',
      'HASHIRAMA SENJU', HASHIRAMA_129);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS129_POWERUP_HOKAGE',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss129PowerupHokage',
  }, sourceCard.instanceId, 'SS129_CONFIRM_MAIN');
}

function tobirama131Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const cibles = hokagesDeplacables(state);
  if (cibles.length === 0) {
    return refus(state, sourcePlayer, 'Tobirama Senju (131): no Hokage character can be moved.',
      'TOBIRAMA SENJU', TOBIRAMA_131);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS131_MOVE_HOKAGE',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss131MoveHokage',
  }, sourceCard.instanceId, 'SS131_CONFIRM_MAIN');
}

function hiruzen133Duel(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const { handIndices, caches } = invocationsJouablesIci(
    state, sourcePlayer, sourceMissionIndex, HIRUZEN_133_REDUCTION,
  );
  const cibles = [
    ...handIndices.map((i) => `HAND_${i}`),
    ...caches.map((c) => `HIDDEN_${c.instanceId}`),
  ];
  if (cibles.length === 0) {
    return refus(state, sourcePlayer, 'Hiruzen Sarutobi (133): no Summon you can play in this mission.',
      'HIRUZEN SARUTOBI', HIRUZEN_133);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS133_PLAY_SUMMON',
    validTargets: cibles,
    isOptional: true,
    description: JSON.stringify({
      hiddenChars: caches,
      costReduction: HIRUZEN_133_REDUCTION,
      missionIndex: sourceMissionIndex,
    }),
    descriptionKey: 'game.effect.desc.ss133PlaySummon',
  }, sourceCard.instanceId, 'SS133_CONFIRM_DUEL');
}

export function registerDuels6Handlers(): void {
  for (const id of SHINO_113_VARIANTS) {
    registerEffect(id, 'MAIN', shino113Main);
    registerEffect(id, 'DUEL', ss113DuelAppliqueParLeMain);
  }
  for (const id of HASHIRAMA_129_VARIANTS) registerEffect(id, 'MAIN', hashirama129Main);
  for (const id of TOBIRAMA_131_VARIANTS) registerEffect(id, 'MAIN', tobirama131Main);
  for (const id of HIRUZEN_133_VARIANTS) registerEffect(id, 'DUEL', hiruzen133Duel);
}
