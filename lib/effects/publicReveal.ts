import type { CardData, GameState, PlayerID, PublicReveal, RevealedCardPreview } from '@/lib/engine/types';
import { generateInstanceId } from '@/lib/engine/utils/id';

export function apercuRevele(card: CardData, isMatch = false): RevealedCardPreview {
  return {
    id: card.id,
    name_fr: card.name_fr,
    name_en: card.name_en,
    title_fr: card.title_fr,
    title_en: card.title_en,
    chakra: card.chakra ?? 0,
    power: card.power ?? 0,
    image_file: card.image_file,
    isMatch,
  };
}

export function annoncerRevelationPublique(
  state: GameState,
  player: PlayerID,
  sourceCardId: string,
  cards: RevealedCardPreview[],
): GameState {
  if (cards.length === 0) return state;
  const revelation: PublicReveal = {
    id: generateInstanceId(),
    player,
    sourceCardId,
    cards,
  };
  return { ...state, publicReveal: revelation };
}

export function annoncerRevelationSs002(state: GameState, player: PlayerID, payload: string): GameState {
  let meta: { cardId?: string; cardName?: string; cardCost?: number; cardPower?: number; cardImageFile?: string } = {};
  try { meta = JSON.parse(payload); } catch { return state; }
  if (!meta.cardName) return state;
  return annoncerRevelationPublique(state, player, 'SS-002-UC', [{
    id: meta.cardId ?? '',
    name_fr: meta.cardName,
    chakra: meta.cardCost ?? 0,
    power: meta.cardPower ?? 0,
    image_file: meta.cardImageFile,
    isMatch: true,
  }]);
}
