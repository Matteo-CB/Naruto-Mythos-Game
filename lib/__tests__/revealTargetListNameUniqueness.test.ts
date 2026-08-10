import { describe, it, expect } from 'vitest';
import {
  effectiveRevealCost,
  findAffordableLeafInHand,
  findHiddenLeafOnBoard,
  findHiddenSummonsOnBoard,
  findRevealBlockedLeaf,
  findRevealBlockedSummon,
} from '@/lib/effects/handlers/KS/shared/summonSearch';
import { getAllAttachments, getAllCharacters } from '@/lib/data/cardLoader';
import type { CharacterInPlay, GameState } from '@/lib/engine/types';

function makeBaseState(): GameState {
  return {
    gameId: 'g1',
    gameMode: 'casual',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {
      userId: 'u1',
      isAI: false,
      aiDifficulty: null,
      hand: [],
      deck: [],
      discardPile: [],
      missionCards: [],
      missionPoints: 0,
      chakra: 20,
      unusedMission: null,
      cardsDrawnThisTurn: 0,
    } as never,
    player2: {
      userId: 'u2',
      isAI: false,
      aiDifficulty: null,
      hand: [],
      deck: [],
      discardPile: [],
      missionCards: [],
      missionPoints: 0,
      chakra: 20,
      unusedMission: null,
      cardsDrawnThisTurn: 0,
    } as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    actionHistory: [],
  } as never;
}

function makeChar(opts: {
  instanceId: string;
  name: string;
  chakra: number;
  isHidden: boolean;
  controlledBy?: 'player1' | 'player2';
  originalOwner?: 'player1' | 'player2';
}) {
  return {
    instanceId: opts.instanceId,
    isHidden: opts.isHidden,
    controlledBy: opts.controlledBy ?? 'player1',
    originalOwner: opts.originalOwner ?? 'player1',
    powerTokens: 0,
    stack: [],
    wasRevealedAtLeastOnce: false,
    card: {
      id: `card-${opts.instanceId}`,
      cardId: `card-${opts.instanceId}`,
      name_fr: opts.name,
      name_en: opts.name,
      title_fr: '',
      title_en: '',
      rarity: 'C' as const,
      number: '001',
      set: 'KS',
      card_type: 'character' as const,
      chakra: opts.chakra,
      power: 1,
      group: 'Independent',
      keywords: ['Summon'],
      effects: [],
      image_file: '',
      has_visual: false,
    },
  } as never;
}

function makeMission(p1Chars: ReturnType<typeof makeChar>[]) {
  return {
    card: {} as never,
    rank: 'D' as const,
    revealedAtTurn: 1,
    wonBy: null,
    player1Characters: p1Chars,
    player2Characters: [],
  };
}

function stateWith(chars: ReturnType<typeof makeChar>[]): GameState {
  const state = makeBaseState();
  state.activeMissions = [makeMission(chars)] as never;
  return state;
}

function hiddenCharOf(state: GameState, instanceId: string): CharacterInPlay {
  return state.activeMissions[0].player1Characters.find(
    (c: CharacterInPlay) => c.instanceId === instanceId,
  ) as CharacterInPlay;
}

describe('reveal target lists respect No Repetition', () => {
  it('offers a hidden character when no visible character shares its name', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda', name: 'MANDA', chakra: 5, isHidden: true }),
      makeChar({ instanceId: 'visible-katsuyu', name: 'KATSUYU', chakra: 3, isHidden: false }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0).map((t) => t.instanceId)).toEqual(['hidden-manda']);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBe(5);
    expect(findRevealBlockedSummon(state, 'player1')).toBeNull();
  });

  it('offers the reveal as an upgrade when the hidden card costs strictly more', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda', name: 'MANDA', chakra: 5, isHidden: true }),
      makeChar({ instanceId: 'visible-manda', name: 'MANDA', chakra: 3, isHidden: false }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0).map((t) => t.instanceId)).toEqual(['hidden-manda']);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBe(2);
    expect(findRevealBlockedSummon(state, 'player1')).toBeNull();
  });

  it('refuses the reveal when the hidden card does not cost strictly more than the same-name visible one', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda', name: 'MANDA', chakra: 4, isHidden: true }),
      makeChar({ instanceId: 'visible-manda', name: 'MANDA', chakra: 4, isHidden: false }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0)).toHaveLength(0);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBeNull();
    expect(findRevealBlockedSummon(state, 'player1')).toBe('MANDA');
  });

  it('refuses the reveal when the hidden card is controlled, since a controlled card cannot upgrade', () => {
    const state = stateWith([
      makeChar({
        instanceId: 'hidden-manda',
        name: 'MANDA',
        chakra: 5,
        isHidden: true,
        controlledBy: 'player1',
        originalOwner: 'player2',
      }),
      makeChar({ instanceId: 'visible-manda', name: 'MANDA', chakra: 3, isHidden: false }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0)).toHaveLength(0);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBeNull();
  });

  it('refuses the reveal when the same-name visible card is controlled, since it cannot be upgraded onto', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda', name: 'MANDA', chakra: 5, isHidden: true }),
      makeChar({
        instanceId: 'visible-manda',
        name: 'MANDA',
        chakra: 3,
        isHidden: false,
        controlledBy: 'player1',
        originalOwner: 'player2',
      }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0)).toHaveLength(0);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBeNull();
    expect(findRevealBlockedSummon(state, 'player1')).toBe('MANDA');
  });

  it('refuses the reveal when two visible characters already share the name', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda', name: 'MANDA', chakra: 6, isHidden: true }),
      makeChar({ instanceId: 'visible-manda-a', name: 'MANDA', chakra: 3, isHidden: false }),
      makeChar({ instanceId: 'visible-manda-b', name: 'MANDA', chakra: 4, isHidden: false }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0)).toHaveLength(0);
    expect(effectiveRevealCost(state, 'player1', hiddenCharOf(state, 'hidden-manda'), 0, 0)).toBeNull();
  });

  it('keeps two hidden characters sharing a name available, a face-down card has no visible name', () => {
    const state = stateWith([
      makeChar({ instanceId: 'hidden-manda-a', name: 'MANDA', chakra: 5, isHidden: true }),
      makeChar({ instanceId: 'hidden-manda-b', name: 'MANDA', chakra: 5, isHidden: true }),
    ]);
    expect(findHiddenSummonsOnBoard(state, 'player1', 0)).toHaveLength(2);
    expect(findRevealBlockedSummon(state, 'player1')).toBeNull();
  });
});

describe('reveal and upgrade target lists only offer legal characters', () => {
  it('never offers a face-down attachment as a character to reveal', () => {
    const attachment = getAllAttachments().find((c) => c.group === 'Leaf Village');
    expect(attachment).toBeTruthy();

    const state = makeBaseState();
    state.activeMissions = [
      {
        card: {} as never,
        rank: 'D' as const,
        revealedAtTurn: 1,
        wonBy: null,
        player1Characters: [
          {
            instanceId: 'hidden-attachment',
            card: attachment,
            stack: [attachment],
            isHidden: true,
            wasRevealedAtLeastOnce: false,
            powerTokens: 0,
            controlledBy: 'player1',
            originalOwner: 'player1',
            missionIndex: 0,
          },
        ],
        player2Characters: [],
      },
    ] as never;

    expect(findHiddenLeafOnBoard(state, 'player1', 1)).toHaveLength(0);
    expect(findRevealBlockedLeaf(state, 'player1')).toBeNull();
  });

  it('never offers a hand card whose only upgrade target is a controlled character', () => {
    const leaf = getAllCharacters().filter((c) => c.group === 'Leaf Village');
    const handCard = leaf.find(
      (a) => leaf.some((b) => b.name_fr.toUpperCase() === a.name_fr.toUpperCase() && a.chakra > b.chakra),
    );
    expect(handCard).toBeTruthy();
    const boardCard = leaf.find(
      (b) => b.name_fr.toUpperCase() === handCard!.name_fr.toUpperCase() && handCard!.chakra > b.chakra,
    )!;

    const state = makeBaseState();
    state.player1.hand = [handCard!] as never;
    state.player1.chakra = handCard!.chakra - boardCard.chakra;
    state.activeMissions = [
      {
        card: {} as never,
        rank: 'D' as const,
        revealedAtTurn: 1,
        wonBy: null,
        player1Characters: [
          {
            instanceId: 'controlled-same-name',
            card: boardCard,
            stack: [boardCard],
            isHidden: false,
            wasRevealedAtLeastOnce: true,
            powerTokens: 0,
            controlledBy: 'player1',
            originalOwner: 'player2',
            missionIndex: 0,
          },
        ],
        player2Characters: [],
      },
    ] as never;

    expect(findAffordableLeafInHand(state, 'player1', 0)).toHaveLength(0);
  });

  it('still offers a hand card when the same-name character on the board is genuinely upgradable', () => {
    const leaf = getAllCharacters().filter((c) => c.group === 'Leaf Village');
    const handCard = leaf.find(
      (a) => leaf.some((b) => b.name_fr.toUpperCase() === a.name_fr.toUpperCase() && a.chakra > b.chakra),
    );
    const boardCard = leaf.find(
      (b) => b.name_fr.toUpperCase() === handCard!.name_fr.toUpperCase() && handCard!.chakra > b.chakra,
    )!;

    const state = makeBaseState();
    state.player1.hand = [handCard!] as never;
    state.player1.chakra = handCard!.chakra - boardCard.chakra;
    state.activeMissions = [
      {
        card: {} as never,
        rank: 'D' as const,
        revealedAtTurn: 1,
        wonBy: null,
        player1Characters: [
          {
            instanceId: 'owned-same-name',
            card: boardCard,
            stack: [boardCard],
            isHidden: false,
            wasRevealedAtLeastOnce: true,
            powerTokens: 0,
            controlledBy: 'player1',
            originalOwner: 'player1',
            missionIndex: 0,
          },
        ],
        player2Characters: [],
      },
    ] as never;

    expect(findAffordableLeafInHand(state, 'player1', 0)).toEqual([0]);
  });
});
