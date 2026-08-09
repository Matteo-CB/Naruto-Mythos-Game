import type { GameState, PlayerID, CardData, PendingEffect, PendingAction, EffectType } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';
import { shuffle } from '@/lib/engine/utils/shuffle';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { buildPlayLessTargets, encodePlayLessDescription, type PlayLessOptions } from '@/lib/effects/handlers/shared/playLess';

export const SS000_NINJA_HOUND = 'Ninja Hound';
export const SS000_MAX_HOUNDS = 2;

export const SS000_PLAY_OPTS: PlayLessOptions = {
  category: { kind: 'keyword', value: SS000_NINJA_HOUND },
  costReduction: 1,
  sourceName: 'KAKASHI HATAKE',
  sourceId: 'SS-149-L',
  textFallback: 'Kakashi Hatake (SS-000): Play any number of Ninja Hound characters, paying 1 less.',
  descriptionKey: 'game.effect.desc.ss000PlayHound',
  repeatable: true,
};

export interface Ss000HoundInfo {
  index: number;
  id: string;
  name_fr: string;
  name_en?: string;
  chakra?: number;
  power?: number;
  image_file?: string;
}

export function ss000HasPlayableHound(state: GameState, player: PlayerID): boolean {
  return buildPlayLessTargets(state, player, SS000_PLAY_OPTS.category, SS000_PLAY_OPTS.costReduction).targets.length > 0;
}

export function ss000DeckHounds(state: GameState, player: PlayerID): Ss000HoundInfo[] {
  const out: Ss000HoundInfo[] = [];
  state[player].deck.forEach((c: CardData, index: number) => {
    if ((c.keywords ?? []).includes(SS000_NINJA_HOUND)) {
      out.push({ index, id: c.id, name_fr: c.name_fr, name_en: c.name_en, chakra: c.chakra, power: c.power, image_file: c.image_file });
    }
  });
  return out;
}

export function ss000HoundChoicePayload(hounds: Ss000HoundInfo[], remaining: number, drawn: number): {
  validTargets: string[];
  description: string;
  descriptionKey: string;
  descriptionParams: Record<string, string | number>;
} {
  return {
    validTargets: hounds.map((h) => `DECK_${h.index}`),
    description: JSON.stringify({ hounds, remaining, drawn }),
    descriptionKey: 'game.effect.desc.ss000ChooseHound',
    descriptionParams: { remaining },
  };
}

export function ss000FinalizeSearch(
  state: GameState,
  player: PlayerID,
  effectType: EffectType,
  sourceInstanceId: string,
  sourceMissionIndex: number,
  drawnCount: number,
): GameState {
  const ps = { ...state[player] };
  ps.deck = shuffle([...ps.deck]);
  let s: GameState = {
    ...state,
    [player]: ps,
    log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_DRAW',
      `Kakashi Hatake (SS-000): searched the deck, drew ${drawnCount} Ninja Hound, then shuffled.`,
      'game.log.effect.ss000Search', { card: 'KAKASHI HATAKE', id: 'SS-149-L', count: drawnCount }),
  };

  const { targets, hiddenChars } = buildPlayLessTargets(s, player, SS000_PLAY_OPTS.category, SS000_PLAY_OPTS.costReduction);
  if (targets.length === 0) return s;

  const effId = generateInstanceId();
  const actId = generateInstanceId();
  const pe: PendingEffect = {
    id: effId,
    sourceCardId: SS000_PLAY_OPTS.sourceId,
    sourceInstanceId,
    sourceMissionIndex,
    effectType,
    effectDescription: encodePlayLessDescription(SS000_PLAY_OPTS, hiddenChars),
    targetSelectionType: 'PLAY_LESS_CATEGORY',
    sourcePlayer: player,
    requiresTargetSelection: true,
    validTargets: targets,
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
    rootOptional: true,
  };
  const pa: PendingAction = {
    id: actId,
    type: 'CHOOSE_CARD_FROM_LIST',
    player,
    originPlayer: player,
    description: SS000_PLAY_OPTS.textFallback,
    descriptionKey: SS000_PLAY_OPTS.descriptionKey,
    descriptionParams: { reduction: SS000_PLAY_OPTS.costReduction },
    options: targets,
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effId,
  };
  s = { ...s, pendingEffects: [...s.pendingEffects, pe], pendingActions: [...s.pendingActions, pa] };
  return s;
}
