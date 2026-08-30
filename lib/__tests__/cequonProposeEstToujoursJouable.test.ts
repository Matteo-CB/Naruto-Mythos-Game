import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { peutEtreJouee, missionsJouablesPour } from '@/lib/effects/EffectEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID } from '@/lib/engine/types';

function carte(ov: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999,
    name_fr: 'Test', title_fr: 'Test', rarity: 'C', card_type: 'character',
    has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [],
    ...ov,
  } as CharacterCard;
}

function enJeu(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return {
    card: ov.card ?? carte(),
    instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8),
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [],
    controlledBy: ov.controlledBy ?? 'player1',
    originalOwner: ov.originalOwner ?? 'player1',
    wasRevealedAtLeastOnce: false,
    ...ov,
  } as CharacterInPlay;
}

function mission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: { id: 'MSS 01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1,
    player1Characters: [], player2Characters: [], wonBy: null,
    ...ov,
  } as ActiveMission;
}

function joueur(ov: Partial<GameState['player1']> = {}) {
  return {
    id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false,
    deck: [], hand: [], discardPile: [], missionCards: [],
    chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0,
    unusedMission: null, hasMulliganed: false,
    ...ov,
  };
}

function etat(ov: Partial<GameState> = {}): GameState {
  return {
    turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: joueur(),
    player2: joueur({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [], activeMissions: [mission(), mission({ rank: 'C', rankBonus: 2 })],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}

const SAKURA_135 = carte({
  id: 'KS-135-S', number: 135, rarity: 'S',
  name_fr: 'SAKURA HARUNO', title_fr: 'The Leaf Medical Corps',
  chakra: 5, power: 4, keywords: ['Team 7'], group: 'Leaf Village',
  effects: [
    { type: 'MAIN', description: 'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 4 less.' },
  ],
});

function lanceSakura135(state: GameState): GameState {
  const effetId = 'sakura-confirm';
  const actionId = 'sakura-confirm-act';
  const prepare = {
    ...state,
    pendingEffects: [{
      id: effetId, sourceCardId: 'KS-135-S', sourceInstanceId: 'sakura-1', sourceMissionIndex: 0,
      effectType: 'MAIN', effectDescription: JSON.stringify({ costReduction: 0 }),
      targetSelectionType: 'SAKURA135_CONFIRM_MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['sakura-1'],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
    }],
    pendingActions: [{
      id: actionId, type: 'SELECT_TARGET', player: 'player1', description: 'Confirm',
      options: ['sakura-1'], minSelections: 1, maxSelections: 1, sourceEffectId: effetId,
    }],
  } as unknown as GameState;
  return GameEngine.applyAction(prepare, 'player1', {
    type: 'SELECT_TARGET', pendingActionId: actionId, selectedTargets: ['sakura-1'],
  } as never);
}

describe('SAKURA HARUNO 135 ne propose que des cartes reellement posables', () => {
  beforeAll(async () => { await initializeRegistry(); });

  function plateauAvecDoublons(chakra: number, dessus: CharacterCard[]): GameState {
    const sakura = enJeu({ instanceId: 'sakura-1', card: SAKURA_135, stack: [SAKURA_135] });
    const bloqueur = (suffixe: string) => enJeu({
      instanceId: 'bloqueur-' + suffixe,
      card: carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 9 }),
    });
    return etat({
      player1: joueur({ deck: dessus, chakra, charactersInPlay: 3 }),
      activeMissions: [
        mission({ player1Characters: [sakura, bloqueur('a')] }),
        mission({ rank: 'C', rankBonus: 2, player1Characters: [bloqueur('b')] }),
      ],
    });
  }

  it('une carte bloquee par la regle du meme nom partout n est jamais proposee', () => {
    const memeNom = carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 2 });
    const state = plateauAvecDoublons(10, [memeNom, memeNom, memeNom]);

    expect(peutEtreJouee(state, 'player1', memeNom as never, 0)).toBe(false);

    const apres = lanceSakura135(state);
    const choix = apres.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_CARD');
    expect(choix, 'aucune carte posable, donc aucune fenetre de choix').toBeUndefined();
    expect(
      apres.pendingEffects.some((e) => e.targetSelectionType === 'REORDER_DISCARD'),
      'le joueur passe directement au choix de l ordre de defausse',
    ).toBe(true);
  });

  it('une carte posable ailleurs reste proposee', () => {
    const ailleurs = carte({ id: 'KS-202-C', name_fr: 'LIBRE', chakra: 2 });
    const memeNom = carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 2 });
    const state = plateauAvecDoublons(10, [memeNom, ailleurs, memeNom]);

    expect(missionsJouablesPour(state, 'player1', ailleurs as never, 0).length).toBeGreaterThan(0);

    const apres = lanceSakura135(state);
    const choix = apres.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_CARD');
    expect(choix, 'la carte libre ouvre bien la fenetre').toBeDefined();
    expect(choix?.validTargets, 'seule la carte libre est proposee').toEqual(['1']);
  });

  it('une carte trop chere n est pas proposee, et le devient avec la reduction', () => {
    const chere = carte({ id: 'KS-203-C', name_fr: 'CHERE', chakra: 4 });
    const state = plateauAvecDoublons(1, [chere, chere, chere]);
    expect(peutEtreJouee(state, 'player1', chere as never, 0)).toBe(false);
    expect(peutEtreJouee(state, 'player1', chere as never, 4)).toBe(true);
  });

  it('une carte du meme nom moins chere ne peut pas ameliorer, donc reste refusee', () => {
    const moinsChere = carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 3 });
    const state = plateauAvecDoublons(30, [moinsChere, moinsChere, moinsChere]);
    expect(peutEtreJouee(state, 'player1', moinsChere as never, 0)).toBe(false);
  });

  it('une carte du meme nom plus chere ameliore, donc elle est acceptee', () => {
    const plusChere = carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 12 });
    const state = plateauAvecDoublons(30, [plusChere, plusChere, plusChere]);
    expect(peutEtreJouee(state, 'player1', plusChere as never, 0)).toBe(true);
  });

  it('ce qui est propose et ce qui est pose sortent de la meme source', () => {
    const memeNom = carte({ id: 'KS-201-C', name_fr: 'BLOQUEUR', chakra: 2 });
    const libre = carte({ id: 'KS-202-C', name_fr: 'LIBRE', chakra: 2 });
    for (const c of [memeNom, libre]) {
      const state = plateauAvecDoublons(10, [c, c, c]);
      expect(peutEtreJouee(state, 'player1', c as never, 0))
        .toBe(missionsJouablesPour(state, 'player1', c as never, 0).length > 0);
    }
  });
});
