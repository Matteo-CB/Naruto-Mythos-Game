import type { VisibleGameState, VisibleCharacter, CardData } from '@/lib/engine/types';
import { getCardById } from '@/lib/data/cardIndex';
import { isSetRevealing } from '@/lib/data/sets/registry';
import { holoBaseId } from '@/lib/holo/holoId';

const MASK_IMAGE = '/images/card-back.webp';

// Masks revealing-set cards that are not yet revealed, so a non-privileged viewer (or a
// spectator) never sees an unreleased card's identity, effects or art in a live game. The
// masked form is a plain card back, identical to how a hidden card is shown, and carries no
// real card id (so nothing leaks through the packed state ref).
function needsMask(
  card: { id?: string; cardId?: string; set?: string } | null | undefined,
  hiddenIds: Set<string>,
): boolean {
  if (!card) return false;
  const id = holoBaseId(card.cardId ?? card.id ?? '');
  if (!id) return false;
  const resolved = getCardById(id);
  const setId = resolved?.set ?? card.set;
  if (!setId || !isSetRevealing(setId)) return false;
  return hiddenIds.has(id);
}

function maskedCardData(cardType: CardData['card_type']): CardData {
  return {
    id: '__UNREVEALED__',
    cardId: '__UNREVEALED__',
    set: '__',
    number: 0,
    name_fr: '',
    name_en: '',
    title_fr: '',
    title_en: '',
    rarity: 'C',
    card_type: cardType,
    has_visual: true,
    chakra: 0,
    power: 0,
    keywords: [],
    group: '',
    effects: [],
    image_file: MASK_IMAGE,
    is_rare_art: false,
    data_complete: false,
  } as CardData;
}

function maskList<T extends CardData>(cards: T[] | undefined, hiddenIds: Set<string>): T[] | undefined {
  if (!Array.isArray(cards)) return cards;
  return cards.map((c) => (needsMask(c, hiddenIds) ? (maskedCardData(c.card_type) as T) : c));
}

function maskCharacter(vc: VisibleCharacter, hiddenIds: Set<string>): VisibleCharacter {
  if (!needsMask(vc.topCard, hiddenIds) && !needsMask(vc.card, hiddenIds)) return vc;
  return {
    ...vc,
    card: undefined,
    topCard: undefined,
    isOwn: false,
    isHidden: true,
    wasRevealedAtLeastOnce: false,
    effectivePower: 0,
    powerTokens: 0,
    attachments: [],
  };
}

// Does the visible state contain any card the given revealed set would hide? Cheap pre-check.
export function stateHasUnrevealed(v: VisibleGameState, hiddenIds: Set<string>): boolean {
  for (const m of v.activeMissions) {
    if (needsMask(m.card, hiddenIds)) return true;
    for (const c of [...m.player1Characters, ...m.player2Characters]) {
      if (needsMask(c.card, hiddenIds) || needsMask(c.topCard, hiddenIds)) return true;
    }
  }
  for (const c of v.opponentState.discardPile ?? []) if (needsMask(c, hiddenIds)) return true;
  return false;
}

export function sanitizeUnrevealedForViewer(v: VisibleGameState, hiddenIds: Set<string>): VisibleGameState {
  return {
    ...v,
    myState: {
      ...v.myState,
      discardPile: maskList(v.myState.discardPile, hiddenIds) ?? v.myState.discardPile,
      missionCards: maskList(v.myState.missionCards, hiddenIds) ?? v.myState.missionCards,
    },
    opponentState: {
      ...v.opponentState,
      discardPile: maskList(v.opponentState.discardPile, hiddenIds) ?? v.opponentState.discardPile,
    },
    activeMissions: v.activeMissions.map((m) => ({
      ...m,
      card: needsMask(m.card, hiddenIds) ? (maskedCardData('mission') as typeof m.card) : m.card,
      player1Characters: m.player1Characters.map((c) => maskCharacter(c, hiddenIds)),
      player2Characters: m.player2Characters.map((c) => maskCharacter(c, hiddenIds)),
    })),
  };
}
