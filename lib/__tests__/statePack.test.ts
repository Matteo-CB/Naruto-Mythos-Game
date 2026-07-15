import { describe, it, expect } from 'vitest';
import { packVisibleState, unpackVisibleState, type PackedVisibleState } from '@/lib/socket/statePack';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import type { VisibleGameState, VisibleCharacter, CharacterCard, MissionCard } from '@/lib/engine/types';

function card(id: string): CharacterCard {
  const c = getCharacterById(id);
  if (!c) throw new Error(`missing card ${id}`);
  return c;
}

function missionCard(id: string): MissionCard {
  const m = getMissionById(id);
  if (!m) throw new Error(`missing mission ${id}`);
  return m;
}

function visibleChar(id: string, over: Partial<VisibleCharacter> = {}): VisibleCharacter {
  return {
    instanceId: `inst-${id}`,
    isHidden: false,
    wasRevealedAtLeastOnce: true,
    isOwn: true,
    card: card(id),
    topCard: card(id),
    powerTokens: 0,
    controlledBy: 'player1',
    originalOwner: 'player1',
    missionIndex: 0,
    stackSize: 1,
    effectivePower: 3,
    isLastPlayed: false,
    ...over,
  };
}

function buildState(): VisibleGameState {
  const holoNaruto = { ...card('KS-001-C'), isHolo: true };
  return {
    gameId: 'g1',
    gameMode: 'ranked',
    turn: 2,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player2',
    firstPasser: null,
    myPlayer: 'player1',
    myState: {
      id: 'player1',
      userId: 'u1',
      isAI: false,
      deck: [card('KS-007-C'), holoNaruto, card('KS-056-UC')],
      hand: [holoNaruto, card('KS-104-R')],
      discardPile: [card('KS-003-C')],
      missionCards: [missionCard('KS-001-MMS')],
      chakra: 5,
      missionPoints: 3,
      hasPassed: false,
      hasMulliganed: true,
      charactersInPlay: 2,
      unusedMission: missionCard('KS-002-MMS'),
    },
    opponentState: {
      id: 'player2',
      handSize: 4,
      deckSize: 20,
      discardPileSize: 2,
      discardPile: [card('KS-005-C'), card('KS-009-C')],
      chakra: 3,
      missionPoints: 1,
      hasPassed: false,
      charactersInPlay: 1,
    },
    activeMissions: [
      {
        card: missionCard('KS-001-MMS'),
        rank: 'D',
        basePoints: 2,
        rankBonus: 1,
        wonBy: null,
        player1Characters: [
          visibleChar('KS-007-C'),
          visibleChar('KS-104-R', { card: { ...card('KS-104-R'), isHolo: undefined }, topCard: card('KS-108-R'), stackSize: 2 }),
        ],
        player2Characters: [
          visibleChar('KS-005-C', { isOwn: false, isHidden: true, wasRevealedAtLeastOnce: false, card: undefined, topCard: undefined, controlledBy: 'player2', originalOwner: 'player2' }),
        ],
      },
    ],
    missionDeckSize: 2,
    log: [{ turn: 1, phase: 'action', player: 'player1', action: 'PLAY', message: 'x', timestamp: 1 } as never],
    pendingEffects: [],
    pendingActions: [],
  } as VisibleGameState;
}

describe('statePack round-trip', () => {
  it('restores an identical state after pack + JSON transport + unpack', () => {
    const original = buildState();
    const packed = packVisibleState(original);
    const wire = JSON.parse(JSON.stringify(packed)) as PackedVisibleState;
    const restored = unpackVisibleState(wire);

    expect(restored.myState.hand[0].isHolo).toBe(true);
    expect(restored.myState.hand[0].name_fr).toBe(original.myState.hand[0].name_fr);
    expect(restored.myState.deck.map((c) => c.id)).toEqual(original.myState.deck.map((c) => c.id));
    expect(restored.myState.deck[1].isHolo).toBe(true);
    expect(restored.myState.unusedMission?.id).toBe(original.myState.unusedMission?.id);
    expect(restored.opponentState.discardPile.map((c) => c.id)).toEqual(['KS-005-C', 'KS-009-C']);
    expect(restored.activeMissions[0].card.id).toBe(original.activeMissions[0].card.id);
    const upgraded = restored.activeMissions[0].player1Characters[1];
    expect(upgraded.card?.id).toBe('KS-104-R');
    expect(upgraded.topCard?.id).toBe('KS-108-R');
    const hidden = restored.activeMissions[0].player2Characters[0];
    expect(hidden.card).toBeUndefined();
    expect(hidden.isHidden).toBe(true);
    expect(restored.log).toEqual(original.log);
    expect(restored.turn).toBe(2);
  });

  it('preserves per-instance discard fields through the round-trip', () => {
    const original = buildState();
    original.myState.discardPile = [
      { ...card('KS-003-C'), instanceId: 'KS-003-C-discard-0' } as CharacterCard,
      { ...card('KS-003-C'), instanceId: 'KS-003-C-discard-1' } as CharacterCard,
    ];
    original.opponentState.discardPile = [
      { ...card('KS-005-C'), instanceId: 'abc-stack-1', wasHiddenBeforeDefeat: true } as CharacterCard,
    ];
    const restored = unpackVisibleState(JSON.parse(JSON.stringify(packVisibleState(original))) as PackedVisibleState);

    expect(restored.myState.discardPile.map((c) => (c as { instanceId?: string }).instanceId)).toEqual([
      'KS-003-C-discard-0',
      'KS-003-C-discard-1',
    ]);
    const oppCard = restored.opponentState.discardPile[0] as { instanceId?: string; wasHiddenBeforeDefeat?: boolean; name_fr?: string };
    expect(oppCard.instanceId).toBe('abc-stack-1');
    expect(oppCard.wasHiddenBeforeDefeat).toBe(true);
    expect(oppCard.name_fr).toBe(card('KS-005-C').name_fr);
  });

  it('shrinks the wire payload massively', () => {
    const original = buildState();
    const rawSize = JSON.stringify(original).length;
    const packedSize = JSON.stringify(packVisibleState(original)).length;
    expect(packedSize).toBeLessThan(rawSize * 0.35);
  });

  it('passes through unpacked legacy states untouched', () => {
    const original = buildState();
    expect(unpackVisibleState(original)).toBe(original);
  });
});
