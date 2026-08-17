import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';
import { apercuDeCartes } from './deckPreview';

export const SHARK_SKIN_ID = 'SS-090-UC';
export const MAKE_OUT_BOOK_ID = 'SS-088-UC';
export const POISON_NEEDLES_ID = 'SS-084-C';
export const SMOKE_BOMB_ID = 'SS-086-C';
export const SEALING_SCROLL_ID = 'SS-095-UC';
export const REINFORCEMENTS_ID = 'SS-109-UC';

export const SHARK_SKIN_MAX_TOKENS = 3;

function refuse(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function sharkSkinDonors(state: GameState, player: PlayerID, missionIndex: number): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const ennemi: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return mission[sideOf(ennemi)].filter((c) => c.powerTokens > 0);
}

function sharkSkinMain(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const donneurs = sharkSkinDonors(state, sourcePlayer, sourceMissionIndex);
  if (donneurs.length === 0) {
    return refuse(state, sourcePlayer, 'Shark Skin (090): no enemy character with Power tokens in this mission.', 'PEAU DE REQUIN', SHARK_SKIN_ID);
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS090_STEAL_TOKENS',
    validTargets: donneurs.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({ hostInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ss090StealTokens',
  }, sourceCard.instanceId, 'SS090_CONFIRM_MAIN');
}

export function otherAttachmentsOn(host: CharacterInPlay | undefined, selfCardId: string): number {
  return (host?.attachments ?? []).filter((a) => a.card.id !== selfCardId).length;
}

function makeOutBookMain(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  if (otherAttachmentsOn(sourceCard, MAKE_OUT_BOOK_ID) === 0) {
    return refuse(state, sourcePlayer, 'Make-Out Paradise Book (088): this character carries no other attachment.', 'PARADIS DU BATIFOLAGE', MAKE_OUT_BOOK_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS088_DISCARD_OTHERS',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss088DiscardOthers',
  }, sourceCard.instanceId, 'SS088_CONFIRM_MAIN');
}

function poisonNeedlesAmbush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  if ((sourceCard.powerTokens ?? 0) === 0) {
    return refuse(state, sourcePlayer, 'Poison Needles (084): this character has no Power token to remove.', 'AIGUILLES EMPOISONNEES', POISON_NEEDLES_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS084_REMOVE_TOKENS',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss084RemoveTokens',
  }, sourceCard.instanceId, 'SS084_CONFIRM_AMBUSH');
}

export function smokeBombDestinations(state: GameState, missionIndex: number): number[] {
  const destinations: number[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== missionIndex) destinations.push(i);
  }
  return destinations;
}

function smokeBombMain(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const destinations = smokeBombDestinations(state, sourceMissionIndex);
  if (destinations.length === 0) {
    return refuse(state, sourcePlayer, 'Smoke Bomb (086): no other mission to move this character to.', 'BOMBE FUMIGENE', SMOKE_BOMB_ID);
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS086_HIDE_AND_MOVE',
    validTargets: destinations.map((i) => String(i)),
    isOptional: true,
    description: JSON.stringify({ hostInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ss086HideAndMove',
  }, sourceCard.instanceId, 'SS086_CONFIRM_MAIN');
}

export function sealingScrollTop3(state: GameState, player: PlayerID) {
  return state[player].deck.slice(0, 3);
}

function sealingScrollMain(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const sommet = sealingScrollTop3(state, sourcePlayer);
  if (sommet.length === 0) {
    return refuse(state, sourcePlayer, 'The Scroll of Sealing (095): the deck is empty.', 'PARCHEMIN DU SCEAU', SEALING_SCROLL_ID);
  }
  const jutsu = sommet.filter((c) => (c.keywords ?? []).includes('Jutsu'));
  if (jutsu.length === 0) {
    const sansCible = refuse(state, sourcePlayer, 'The Scroll of Sealing (095): no Jutsu character among the top 3 cards.', 'PARCHEMIN DU SCEAU', SEALING_SCROLL_ID);
    return {
      state: sansCible.state,
      requiresTargetSelection: true,
      targetSelectionType: 'SS_DECK_SEARCH_SHOW',
      validTargets: sommet.map((c) => `DECK_${state[sourcePlayer].deck.indexOf(c)}`),
      isOptional: false,
      isMandatory: true,
      description: JSON.stringify({
        depth: 3,
        sourceName: 'PARCHEMIN DU SCEAU',
        sourceId: SEALING_SCROLL_ID,
        cards: apercuDeCartes(state, sourcePlayer, sommet.map((c) => state[sourcePlayer].deck.indexOf(c))),
      }),
      descriptionKey: 'game.effect.desc.ssDeckSearchShow',
    };
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS095_TAKE_JUTSU',
    validTargets: jutsu.map((c) => `DECK_${state[sourcePlayer].deck.indexOf(c)}`),
    isOptional: true,
    description: JSON.stringify({ cards: apercuDeCartes(state, sourcePlayer, sommet.map((c) => state[sourcePlayer].deck.indexOf(c))) }),
    descriptionKey: 'game.effect.desc.ss095TakeJutsu',
  }, sourceCard.instanceId, 'SS095_CONFIRM_MAIN');
}

export function registerAttachmentHandlers(): void {
  registerEffect(SHARK_SKIN_ID, 'MAIN', sharkSkinMain);
  registerEffect(MAKE_OUT_BOOK_ID, 'MAIN', makeOutBookMain);
  registerEffect(POISON_NEEDLES_ID, 'AMBUSH', poisonNeedlesAmbush);
  registerEffect(SMOKE_BOMB_ID, 'MAIN', smokeBombMain);
  registerEffect(SEALING_SCROLL_ID, 'MAIN', sealingScrollMain);
}

export const HEAVEN_SCROLL_ID = 'SS-096-UC';
export const EARTH_SCROLL_ID = 'SS-097-UC';

export function scrollPairPresent(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  wantedCardId: string,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  const chars = mission[sideOf(player)];
  for (const char of chars) {
    for (const att of char.attachments ?? []) {
      if (att.owner === player && att.card.id === wantedCardId) return true;
    }
  }
  return (mission.attachments ?? []).some((a) => a.owner === player && a.card.id === wantedCardId);
}

function scrollScore(selfId: string, pairId: string, nom: string) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceMissionIndex } = ctx;
    if (!scrollPairPresent(state, sourcePlayer, sourceMissionIndex, pairId)) {
      return refuse(state, sourcePlayer, `${nom}: the matching scroll is not in this mission.`, nom, selfId);
    }
    const joueur = { ...state[sourcePlayer], missionPoints: state[sourcePlayer].missionPoints + 1 };
    return {
      state: {
        ...state,
        [sourcePlayer]: joueur,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_SCORE',
          `${nom}: both scrolls are here, 1 Mission point gained.`,
          'game.log.effect.ssScrollPair', { card: nom, id: selfId }),
      },
    };
  };
}

export function registerScrollHandlers(): void {
  registerEffect(HEAVEN_SCROLL_ID, 'SCORE', scrollScore(HEAVEN_SCROLL_ID, EARTH_SCROLL_ID, 'PARCHEMIN DU CIEL'));
  registerEffect(EARTH_SCROLL_ID, 'SCORE', scrollScore(EARTH_SCROLL_ID, HEAVEN_SCROLL_ID, 'PARCHEMIN DE LA TERRE'));
}
