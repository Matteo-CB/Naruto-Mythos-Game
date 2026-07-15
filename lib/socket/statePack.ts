import type {
  VisibleGameState,
  VisibleMission,
  VisibleCharacter,
  PlayerState,
  VisibleOpponentState,
  CardData,
  CharacterCard,
  MissionCard,
  AttachedCard,
} from '@/lib/engine/types';
import { getCardById } from '@/lib/data/cardIndex';

interface CardRef {
  __c: string;
  h?: 1;
  i?: string;
  w?: 1;
}

type MaybePacked<T> = T | CardRef;

interface InstanceFields {
  instanceId?: string;
  wasHiddenBeforeDefeat?: boolean;
}

function isCardRef(v: unknown): v is CardRef {
  return !!v && typeof v === 'object' && typeof (v as CardRef).__c === 'string';
}

function packCard<T extends CardData>(card: T | undefined | null): MaybePacked<T> | undefined | null {
  if (!card) return card;
  const id = card.cardId ?? card.id;
  if (!id || !getCardById(id)) return card;
  const ref: CardRef = { __c: id };
  if (card.isHolo) ref.h = 1;
  const inst = card as InstanceFields;
  if (typeof inst.instanceId === 'string' && inst.instanceId) ref.i = inst.instanceId;
  if (inst.wasHiddenBeforeDefeat) ref.w = 1;
  return ref;
}

function unpackCard<T extends CardData>(value: MaybePacked<T> | undefined | null): T | undefined | null {
  if (!isCardRef(value)) return value as T | undefined | null;
  const card = getCardById(value.__c) as T | undefined;
  if (!card) return value as unknown as T;
  if (!value.h && !value.i && !value.w) return card;
  const out = { ...card } as T & InstanceFields;
  if (value.h) out.isHolo = true;
  if (value.i) out.instanceId = value.i;
  if (value.w) out.wasHiddenBeforeDefeat = true;
  return out;
}

function packCards<T extends CardData>(cards: T[] | undefined): Array<MaybePacked<T>> | undefined {
  if (!Array.isArray(cards)) return cards;
  return cards.map((c) => packCard(c) as MaybePacked<T>);
}

function unpackCards<T extends CardData>(cards: Array<MaybePacked<T>> | undefined): T[] | undefined {
  if (!Array.isArray(cards)) return cards;
  return cards.map((c) => unpackCard(c) as T);
}

function packAttachments(list: AttachedCard[] | undefined): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((a) => ({ ...a, card: packCard(a.card) }));
}

function unpackAttachments(list: unknown): AttachedCard[] | undefined {
  if (!Array.isArray(list)) return list as undefined;
  return list.map((a: AttachedCard & { card: MaybePacked<CardData> }) => ({
    ...a,
    card: unpackCard(a.card) as CardData,
  }));
}

function packVisibleCharacter(vc: VisibleCharacter): unknown {
  return {
    ...vc,
    card: packCard(vc.card),
    topCard: packCard(vc.topCard),
    attachments: packAttachments(vc.attachments),
  };
}

function unpackVisibleCharacter(vc: VisibleCharacter & { card: MaybePacked<CharacterCard>; topCard: MaybePacked<CharacterCard> }): VisibleCharacter {
  return {
    ...vc,
    card: unpackCard(vc.card) as CharacterCard | undefined,
    topCard: unpackCard(vc.topCard) as CharacterCard | undefined,
    attachments: unpackAttachments(vc.attachments),
  };
}

export interface PackedVisibleState {
  __packed: 1;
  state: unknown;
}

export function packVisibleState(v: VisibleGameState): PackedVisibleState {
  const myState: PlayerState = v.myState;
  const packed = {
    ...v,
    myState: {
      ...myState,
      deck: packCards(myState.deck),
      hand: packCards(myState.hand),
      discardPile: packCards(myState.discardPile),
      missionCards: packCards(myState.missionCards),
      unusedMission: packCard(myState.unusedMission),
    },
    opponentState: {
      ...v.opponentState,
      discardPile: packCards(v.opponentState.discardPile),
    },
    activeMissions: v.activeMissions.map((m) => ({
      ...m,
      card: packCard(m.card),
      attachments: packAttachments(m.attachments),
      player1Characters: m.player1Characters.map(packVisibleCharacter),
      player2Characters: m.player2Characters.map(packVisibleCharacter),
    })),
  };
  return { __packed: 1, state: packed };
}

export function unpackVisibleState(input: VisibleGameState | PackedVisibleState): VisibleGameState {
  if (!input || (input as PackedVisibleState).__packed !== 1) {
    return input as VisibleGameState;
  }
  const v = (input as PackedVisibleState).state as VisibleGameState & {
    myState: PlayerState & {
      deck: Array<MaybePacked<CharacterCard>>;
      hand: Array<MaybePacked<CharacterCard>>;
      discardPile: Array<MaybePacked<CharacterCard>>;
      missionCards: Array<MaybePacked<MissionCard>>;
      unusedMission: MaybePacked<MissionCard> | null;
    };
    opponentState: VisibleOpponentState & { discardPile: Array<MaybePacked<CardData>> };
    activeMissions: Array<VisibleMission & { card: MaybePacked<MissionCard> }>;
  };
  return {
    ...v,
    myState: {
      ...v.myState,
      deck: unpackCards(v.myState.deck) as CharacterCard[],
      hand: unpackCards(v.myState.hand) as CharacterCard[],
      discardPile: unpackCards(v.myState.discardPile) as CharacterCard[],
      missionCards: unpackCards(v.myState.missionCards) as MissionCard[],
      unusedMission: unpackCard(v.myState.unusedMission) as MissionCard | null,
    },
    opponentState: {
      ...v.opponentState,
      discardPile: unpackCards(v.opponentState.discardPile) as CardData[],
    },
    activeMissions: v.activeMissions.map((m) => ({
      ...m,
      card: unpackCard(m.card) as MissionCard,
      attachments: unpackAttachments(m.attachments),
      player1Characters: m.player1Characters.map((c) => unpackVisibleCharacter(c as never)),
      player2Characters: m.player2Characters.map((c) => unpackVisibleCharacter(c as never)),
    })),
  };
}
