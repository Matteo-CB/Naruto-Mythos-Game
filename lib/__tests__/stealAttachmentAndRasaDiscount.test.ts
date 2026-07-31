import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { attachCardToCharacter, rescueOrphanedAttachments } from '@/lib/effects/attachments';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, CharacterCard, GameState, PendingEffect } from '@/lib/engine/types';

const RASA = 'SS-051-UC';
const HEADBAND = 'SS-092-C';
const GIANT_FAN = 'SS-085-UC';

describe('taking control of a character takes its attachments with it', () => {
  function boardWithEquippedEnemy(): GameState {
    let state = buildSimState({
      p1: [simChar('KS-020-UC', { owner: 'player1', instanceId: 'ino' })],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'victim' })],
      missions: 2,
      chakra1: 30,
    });
    state = attachCardToCharacter(state, 'player2', getCardById(HEADBAND) as CardData, 'victim');
    return state;
  }

  function steal(state: GameState): GameState {
    const pending: PendingEffect = {
      id: 'p1',
      sourceCardId: 'KS-020-UC',
      sourceInstanceId: 'ino',
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: '',
      targetSelectionType: 'INO020_TAKE_CONTROL',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: ['victim'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    };
    return EffectEngine.takeControlOfEnemy(state, pending, 'victim');
  }

  it('the enemy really is equipped before the steal', () => {
    const state = boardWithEquippedEnemy();
    const victim = state.activeMissions[0].player2Characters.find((c) => c.instanceId === 'victim');
    expect(victim?.attachments?.length).toBe(1);
  });

  it('the stolen character arrives on your side still carrying the attachment', () => {
    const stolen = steal(boardWithEquippedEnemy());
    const mine = stolen.activeMissions[0].player1Characters.find((c) => c.instanceId === 'victim');
    expect(mine, 'the character must have changed side').toBeDefined();
    expect(mine?.attachments?.length, 'the attachment travels with its host').toBe(1);
    expect(mine?.attachments?.[0].card.id).toBe(HEADBAND);
    expect(mine?.attachments?.[0].owner, 'the attachment still belongs to its original owner').toBe('player2');
    expect(stolen.activeMissions[0].player2Characters.some((c) => c.instanceId === 'victim')).toBe(false);
  });

  it('the attachment reaches its owner discard pile when the stolen card is discarded on a name conflict', () => {
    let state = buildSimState({
      p1: [
        simChar('KS-020-UC', { owner: 'player1', instanceId: 'ino' }),
        simChar('KS-005-C', { owner: 'player1', instanceId: 'twin' }),
      ],
      p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'victim' })],
      missions: 2,
      chakra1: 30,
    });
    state = attachCardToCharacter(state, 'player2', getCardById(HEADBAND) as CardData, 'victim');

    const stolen = steal(state);
    const onBoard = stolen.activeMissions
      .flatMap((m) => [...m.player1Characters, ...m.player2Characters])
      .some((c) => c.instanceId === 'victim');
    expect(onBoard, 'the same name already stood on that side, so the stolen card is discarded').toBe(false);
    expect(stolen.player2.discardPile.some((c) => c.id === HEADBAND)).toBe(true);
    expect(rescueOrphanedAttachments(state, stolen).player2.discardPile.filter((c) => c.id === HEADBAND).length,
      'the safety net must not file it a second time').toBe(1);
  });

  it('Ino reads the character cost, never the attachment', () => {
    const state = boardWithEquippedEnemy();
    const victim = state.activeMissions[0].player2Characters.find((c) => c.instanceId === 'victim')!;
    const printed = getCardById('KS-005-C') as CharacterCard;
    const fan = getCardById(GIANT_FAN) as CharacterCard;
    expect(victim.card.chakra).toBe(printed.chakra);
    expect(fan.chakra, 'the fixture attachment has a cost of its own').toBeGreaterThan(0);
  });
});

describe('Rasa discounts every friendly Sand Village character, including another Rasa', () => {
  beforeAll(() => { initializeRegistry(); });

  function boardWithRasa(): GameState {
    const state = buildSimState({
      p1: [simChar(RASA, { owner: 'player1', instanceId: 'rasa1' })],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    state.player1.hand = [getCardById(RASA) as CharacterCard];
    return state;
  }

  it('a friendly Sand Village character costs 1 less', () => {
    const state = boardWithRasa();
    const sandCard = getCardById('SS-047-UC') as CharacterCard;
    expect(sandCard.group).toBe('Sand Village');
    const cost = calculateEffectiveCost(state, 'player1', sandCard, 1, false);
    expect(cost).toBe((sandCard.chakra ?? 0) - 1);
  });

  it('a second Rasa played on another mission gets the same discount', () => {
    const state = boardWithRasa();
    const rasa = getCardById(RASA) as CharacterCard;
    const cost = calculateEffectiveCost(state, 'player1', rasa, 1, false);
    expect(cost, 'the Rasa in play is a different friendly character').toBe((rasa.chakra ?? 0) - 1);
  });

  it('two Rasa in play stack their discount', () => {
    const state = buildSimState({
      p1: [
        simChar(RASA, { owner: 'player1', instanceId: 'rasa1' }),
        simChar(RASA, { owner: 'player1', instanceId: 'rasa2' }),
      ],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    const sandCard = getCardById('SS-047-UC') as CharacterCard;
    const cost = calculateEffectiveCost(state, 'player1', sandCard, 1, false);
    expect(cost).toBe(Math.max(0, (sandCard.chakra ?? 0) - 2));
  });

  it('a hidden Rasa grants nothing', () => {
    const state = buildSimState({
      p1: [simChar(RASA, { owner: 'player1', instanceId: 'rasa1', hidden: true })],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    const rasa = getCardById(RASA) as CharacterCard;
    const cost = calculateEffectiveCost(state, 'player1', rasa, 1, false);
    expect(cost).toBe(rasa.chakra ?? 0);
  });

  it('an enemy Rasa grants nothing', () => {
    const state = buildSimState({
      p1: [],
      p2: [simChar(RASA, { owner: 'player2', instanceId: 'rasa-enemy' })],
      missions: 2,
      chakra1: 30,
    });
    const rasa = getCardById(RASA) as CharacterCard;
    const cost = calculateEffectiveCost(state, 'player1', rasa, 1, false);
    expect(cost).toBe(rasa.chakra ?? 0);
  });

  it('Rasa does not discount an attachment, which is not a character', () => {
    const state = boardWithRasa();
    const headband = getCardById(HEADBAND) as CharacterCard;
    expect(headband.group).toBe('Sand Village');
    const cost = calculateEffectiveCost(state, 'player1', headband, 1, false);
    expect(cost).toBe(headband.chakra ?? 0);
  });
});
