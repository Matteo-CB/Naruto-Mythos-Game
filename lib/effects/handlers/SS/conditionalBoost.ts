import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';
import { confirmFirst } from './confirmFirst';
import { characterHasGroup } from '@/lib/effects/groupUtils';

export const SHIZUNE_003 = 'SS-003-C';
export const ASUMA_012 = 'SS-012-C';
export const UDON_063 = 'SS-063-C';
export const MOEGI_064 = 'SS-064-C';
export const HOKI_071 = 'SS-071-C';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
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

export function alliesIn(
  state: GameState,
  missionIndex: number,
  player: PlayerID,
  accepte: (char: CharacterInPlay) => boolean,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideOf(player)].filter((c) => !c.isHidden && accepte(c));
}

export function konohamaruIn(state: GameState, missionIndex: number, player: PlayerID): boolean {
  return alliesIn(state, missionIndex, player, (c) =>
    `${topOf(c).name_fr ?? ''} ${topOf(c).name_en ?? ''}`.toUpperCase().includes('KONOHAMARU')).length > 0;
}

export function attachmentsInMission(state: GameState, missionIndex: number): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  let total = (mission.attachments ?? []).length;
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    for (const c of mission[side]) total += (c.attachments ?? []).length;
  }
  return total;
}

function powerupSelfResult(
  state: GameState,
  player: PlayerID,
  source: CharacterInPlay,
  montant: number,
  nom: string,
  id: string,
): EffectResult {
  if (montant <= 0) {
    return refus(state, player, `${nom} (${id}): nothing to gain here.`, nom, id);
  }
  const missions = state.activeMissions.map((m) => ({
    ...m,
    player1Characters: m.player1Characters.map((c) => c.instanceId === source.instanceId
      ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(state, c.instanceId, montant) } : c),
    player2Characters: m.player2Characters.map((c) => c.instanceId === source.instanceId
      ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(state, c.instanceId, montant) } : c),
  }));
  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_POWERUP',
        `${nom} (${id}): POWERUP ${montant}.`,
        'game.log.effect.powerup',
        { card: nom, id, amount: String(montant), target: topOf(source).name_fr }),
    },
  };
}

function targetedPowerup(
  nom: string,
  id: string,
  montant: number,
  accepte: (char: CharacterInPlay) => boolean,
  refusTexte: string,
) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
    const cibles = alliesIn(state, sourceMissionIndex, sourcePlayer, accepte)
      .filter((c) => c.instanceId !== sourceCard.instanceId);
    if (cibles.length === 0) return refus(state, sourcePlayer, `${nom} (${id}): ${refusTexte}`, nom, id);

    return confirmFirst({
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SS_TARGETED_POWERUP',
      validTargets: cibles.map((c) => c.instanceId),
      isOptional: true,
      description: JSON.stringify({ amount: montant, sourceName: nom, sourceId: id }),
      descriptionKey: 'game.effect.desc.ssTargetedPowerup',
    }, sourceCard.instanceId, 'SS_TARGETED_POWERUP_CONFIRM');
  };
}

function udon063(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  if (!konohamaruIn(state, sourceMissionIndex, sourcePlayer)) {
    return refus(state, sourcePlayer, 'Udon (063): no friendly Konohamaru in this mission.', 'UDON', UDON_063);
  }
  return powerupSelfResult(state, sourcePlayer, sourceCard, 1, 'UDON', UDON_063);
}

function moegi064(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  if (!konohamaruIn(state, sourceMissionIndex, sourcePlayer)) {
    return refus(state, sourcePlayer, 'Moegi (064): no friendly Konohamaru in this mission.', 'MOEGI', MOEGI_064);
  }
  const deck = state[sourcePlayer].deck;
  if (deck.length === 0) {
    return refus(state, sourcePlayer, 'Moegi (064): the deck is empty.', 'MOEGI', MOEGI_064);
  }
  return {
    state: {
      ...state,
      [sourcePlayer]: {
        ...state[sourcePlayer],
        deck: deck.slice(1),
        hand: [...state[sourcePlayer].hand, deck[0]],
      },
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DRAW',
        'Moegi (064): 1 card drawn thanks to Konohamaru.',
        'game.log.effect.draw', { card: 'MOEGI', id: MOEGI_064, amount: '1' }),
    },
  };
}

function hoki071(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const total = attachmentsInMission(state, sourceMissionIndex);
  if (total === 0) {
    return refus(state, sourcePlayer, 'Hoki (071): no attachment in this mission.', 'HOKI', HOKI_071);
  }
  return powerupSelfResult(state, sourcePlayer, sourceCard, total, 'HOKI', HOKI_071);
}

export function registerConditionalBoostHandlers(): void {
  registerEffect(SHIZUNE_003, 'MAIN', targetedPowerup(
    'SHIZUNE', SHIZUNE_003, 1,
    (c) => characterHasGroup(c, 'Leaf Village'),
    'no friendly Leaf Village character in this mission.',
  ));
  registerEffect(ASUMA_012, 'MAIN', targetedPowerup(
    'ASUMA SARUTOBI', ASUMA_012, 2,
    (c) => (topOf(c).keywords ?? []).includes('Team 10'),
    'no friendly Team 10 character in this mission.',
  ));
  registerEffect(UDON_063, 'MAIN', udon063);
  registerEffect(MOEGI_064, 'MAIN', moegi064);
  registerEffect(HOKI_071, 'MAIN', hoki071);
}
