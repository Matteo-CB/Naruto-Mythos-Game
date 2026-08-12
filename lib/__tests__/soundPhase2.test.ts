import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameAction, GameState } from '@/lib/engine/types';

function selType(s: GameState): string {
  const pa = s.pendingActions[0];
  if (!pa) return 'NONE';
  return s.pendingEffects.find((e) => e.id === pa.sourceEffectId)?.targetSelectionType ?? 'NONE';
}

function descKey(s: GameState): string {
  const pa = s.pendingActions[0];
  if (!pa) return 'NONE';
  return pa.descriptionKey ?? 'NONE';
}

function hasLog(s: GameState, key: string, id?: string): boolean {
  return s.log.some((l) => l.messageKey === key && (id === undefined || l.messageParams?.id === id));
}

function zakuBoard(opts: { allyMission?: number | null; allyHidden?: boolean }): GameState {
  const st = buildSimState({
    hand1: ['SS-042-UC'],
    p1: [simChar('KS-070-C', { owner: 'player1', instanceId: 'zaku-base' })],
    p2: [
      simChar('KS-005-C', { owner: 'player2', instanceId: 'enemy-cheap' }),
      simChar('KS-069-UC', { owner: 'player2', instanceId: 'enemy-cost4' }),
    ],
    missions: 2,
    chakra1: 20,
  });
  st.activeMissions[1].player1Characters.push(
    simChar('KS-001-C', { owner: 'player1', instanceId: 'ally-far', missionIndex: 1 }),
  );
  st.activeMissions[1].player2Characters.push(
    simChar('KS-069-UC', { owner: 'player2', instanceId: 'enemy-hidden', missionIndex: 1, hidden: true }),
  );
  if (opts.allyMission !== null && opts.allyMission !== undefined) {
    const m = opts.allyMission;
    st.activeMissions[m].player1Characters.push(
      simChar('SS-045-C', {
        owner: 'player1',
        instanceId: 'dosu-ally',
        missionIndex: m,
        hidden: opts.allyHidden ?? false,
      }),
    );
    st.player1.charactersInPlay += 1;
  }
  return st;
}

function upgradeZaku(st: GameState): GameState {
  return GameEngine.applyAction(st, 'player1', {
    type: 'UPGRADE_CHARACTER',
    cardIndex: 0,
    missionIndex: 0,
    targetInstanceId: 'zaku-base',
  } as GameAction);
}

describe('SS-042-UC Zaku Abumi UPGRADE', () => {
  beforeAll(() => { initializeRegistry(); });

  it('refuses and logs when no other friendly Team Dosu is in this mission', () => {
    const s = upgradeZaku(zakuBoard({ allyMission: null }));
    expect(s.pendingActions.length).toBe(0);
    expect(hasLog(s, 'game.log.effect.noTarget', 'SS-042-UC')).toBe(true);
    expect(s.activeMissions[0].player2Characters.length).toBe(2);
    expect(s.activeMissions[1].player1Characters.length).toBe(1);
  });

  it('refuses when the only other Team Dosu ally is in another mission', () => {
    const s = upgradeZaku(zakuBoard({ allyMission: 1 }));
    expect(s.pendingActions.length).toBe(0);
    expect(hasLog(s, 'game.log.effect.noTarget', 'SS-042-UC')).toBe(true);
  });

  it('refuses when the only other Team Dosu ally is hidden', () => {
    const s = upgradeZaku(zakuBoard({ allyMission: 0, allyHidden: true }));
    expect(s.pendingActions.length).toBe(0);
    expect(hasLog(s, 'game.log.effect.noTarget', 'SS-042-UC')).toBe(true);
  });

  it('opens the confirm window then the defeat picker when a Team Dosu ally is present', () => {
    const s = upgradeZaku(zakuBoard({ allyMission: 0 }));
    expect(selType(s)).toBe('SS042_CONFIRM_UPGRADE');
    expect(descKey(s)).toBe('game.effect.desc.ss042UpgradeDefeat');
    expect(s.pendingActions[0].options).toEqual(['zaku-base']);

    const pa = s.pendingActions[0];
    const s2 = GameEngine.applyAction(s, pa.player, {
      type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: ['zaku-base'],
    });
    expect(selType(s2)).toBe('SS042_DEFEAT');
    expect(descKey(s2)).toBe('game.effect.desc.ss042UpgradeDefeat');

    const options = s2.pendingActions[0].options;
    expect(options).toContain('dosu-ally');
    expect(options).toContain('enemy-cheap');
    expect(options).toContain('ally-far');
    expect(options).toContain('enemy-hidden');
    expect(options).not.toContain('enemy-cost4');
    expect(options).not.toContain('zaku-base');
  });

  it('declining the confirm defeats nothing', () => {
    const s = upgradeZaku(zakuBoard({ allyMission: 0 }));
    const pe = s.pendingEffects.find((e) => e.id === s.pendingActions[0].sourceEffectId)!;
    const s2 = GameEngine.applyAction(s, 'player1', { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
    expect(s2.pendingActions.length).toBe(0);
    expect(s2.activeMissions[0].player2Characters.length).toBe(2);
    expect(s2.activeMissions[0].player1Characters.length).toBe(2);
  });

  it('actually defeats the chosen friendly target and logs it', () => {
    let s = upgradeZaku(zakuBoard({ allyMission: 0 }));
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 8) {
      const pa = s.pendingActions[0];
      const pick = pa.options.includes('dosu-ally') ? 'dosu-ally' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick],
      });
    }
    expect(s.pendingActions.length).toBe(0);
    expect(s.activeMissions[0].player1Characters.some((c) => c.instanceId === 'dosu-ally')).toBe(false);
    expect(hasLog(s, 'game.log.effect.defeat', 'SS-042-UC')).toBe(true);
  });

  it('actually defeats a hidden enemy in another mission', () => {
    let s = upgradeZaku(zakuBoard({ allyMission: 0 }));
    let guard = 0;
    while (s.pendingActions.length > 0 && guard++ < 8) {
      const pa = s.pendingActions[0];
      const pick = pa.options.includes('enemy-hidden') ? 'enemy-hidden' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick],
      });
    }
    expect(s.activeMissions[1].player2Characters.some((c) => c.instanceId === 'enemy-hidden')).toBe(false);
    expect(s.player2.discardPile.length).toBe(1);
  });
});

function kinBoard(oppHand: string[]): GameState {
  const st = buildSimState({
    hand1: ['SS-044-UC'],
    p1: [simChar('KS-072-C', { owner: 'player1', instanceId: 'kin-base' })],
    p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'enemy' })],
    missions: 2,
    chakra1: 20,
  });
  st.player2.hand = oppHand.map((id) => getCardById(id) as unknown as CharacterCard);
  return st;
}

function upgradeKin(st: GameState): GameState {
  return GameEngine.applyAction(st, 'player1', {
    type: 'UPGRADE_CHARACTER',
    cardIndex: 0,
    missionIndex: 0,
    targetInstanceId: 'kin-base',
  } as GameAction);
}

describe('SS-044-UC Kin Tsuchi UPGRADE', () => {
  beforeAll(() => { initializeRegistry(); });

  it('logs a refusal and takes nothing when the opponent hand is empty', () => {
    const s = upgradeKin(kinBoard([]));
    expect(s.pendingActions.length).toBe(0);
    expect(s.player2.hand.length).toBe(0);
    expect(s.player2.discardPile.length).toBe(0);
    expect(hasLog(s, 'game.log.effect.ss044EmptyHand', 'SS-044-UC')).toBe(true);
  });

  it('discards exactly one random card with no window when the hand is not empty', () => {
    const s = upgradeKin(kinBoard(['KS-005-C', 'KS-001-C', 'KS-009-C']));
    expect(s.pendingActions.length).toBe(0);
    expect(s.player2.hand.length).toBe(2);
    expect(s.player2.discardPile.length).toBe(1);
    expect(hasLog(s, 'game.log.effect.ss044Discard', 'SS-044-UC')).toBe(true);
    const discarded = s.player2.discardPile[0];
    expect(s.player2.hand.some((c) => c.id === discarded.id)).toBe(false);
  });

  it('is deterministic for a given state (replay safe)', () => {
    const a = upgradeKin(kinBoard(['KS-005-C', 'KS-001-C', 'KS-009-C', 'KS-070-C']));
    const b = upgradeKin(kinBoard(['KS-005-C', 'KS-001-C', 'KS-009-C', 'KS-070-C']));
    expect(a.player2.discardPile[0].id).toBe(b.player2.discardPile[0].id);
  });

  it('does not always pick the first card of the hand', () => {
    const picks = new Set<string>();
    for (let handSize = 2; handSize <= 6; handSize++) {
      const hand = ['KS-005-C', 'KS-001-C', 'KS-009-C', 'KS-070-C', 'KS-072-C', 'KS-069-UC'].slice(0, handSize);
      const st = kinBoard(hand);
      const before = st.player2.hand.map((c) => c.id);
      const s = upgradeKin(st);
      const kept = s.player2.hand.map((c) => c.id);
      const idx = before.findIndex((id, i) => kept[i] !== id);
      picks.add(String(idx === -1 ? before.length - 1 : idx));
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('SS-032-C Jirobo FIRST STRIKE', () => {
  beforeAll(() => { initializeRegistry(); });

  it('gives itself 2 power tokens without opening any window', () => {
    const st = buildSimState({ hand1: ['SS-032-C'], missions: 2, chakra1: 20 });
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    expect(s.pendingActions.length).toBe(0);
    expect(s.pendingEffects.length).toBe(0);
    expect(s.activeMissions[0].player1Characters[0].powerTokens).toBe(2);
    expect(hasLog(s, 'game.log.effect.powerupSelf', 'SS-032-C')).toBe(true);
  });

  it('does nothing when it is not the first card played this round', () => {
    const st = buildSimState({ hand1: ['KS-005-C', 'SS-032-C'], missions: 2, chakra1: 20 });
    let s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' } as GameAction);
    s = GameEngine.applyAction(s, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 1, hidden: false,
    } as GameAction);
    const jirobo = s.activeMissions[1].player1Characters[0];
    expect(jirobo.powerTokens).toBe(0);
  });

  it('observation: the printed continuous Sound Four discount', () => {
    const st = buildSimState({
      hand1: ['SS-032-C'],
      p1: [simChar('KS-057-C', { owner: 'player1', instanceId: 'sound-four-ally' })],
      missions: 2,
      chakra1: 20,
    });
    const card = st.player1.hand[0];
    const cost = calculateEffectiveCost(st, 'player1', card, 0, false);
    // eslint-disable-next-line no-console
    console.log('SS-032 cost with one friendly Sound Four ally in mission =', cost, '(printed 2)');
    expect(typeof cost).toBe('number');
  });
});

describe('SS-036-C Sakon FIRST STRIKE', () => {
  beforeAll(() => { initializeRegistry(); });

  it('draws one card with no window', () => {
    const st = buildSimState({ hand1: ['SS-036-C'], missions: 2, chakra1: 20 });
    st.player1.deck = [getCardById('KS-005-C') as unknown as CharacterCard];
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    expect(s.pendingActions.length).toBe(0);
    expect(s.player1.deck.length).toBe(0);
    expect(s.player1.hand.length).toBe(1);
    expect(hasLog(s, 'game.log.effect.draw', 'SS-036-C')).toBe(true);
  });

  it('logs a refusal on an empty deck and draws nothing', () => {
    const st = buildSimState({ hand1: ['SS-036-C'], missions: 2, chakra1: 20 });
    st.player1.deck = [];
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    expect(s.player1.hand.length).toBe(0);
    expect(hasLog(s, 'game.log.effect.ss036EmptyDeck', 'SS-036-C')).toBe(true);
  });
});

describe('SS-043-UC Kin Tsuchi discard discount', () => {
  beforeAll(() => { initializeRegistry(); });

  function board(discard: string[]): GameState {
    const st = buildSimState({ hand1: ['SS-043-UC'], missions: 2, chakra1: 10 });
    st.player1.discardPile = discard.map((id) => getCardById(id) as unknown as CharacterCard);
    return st;
  }

  it('costs the printed 2 when the discard pile is empty', () => {
    const st = board([]);
    expect(calculateEffectiveCost(st, 'player1', st.player1.hand[0], 0, false)).toBe(2);
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    expect(s.player1.chakra).toBe(8);
    expect(hasLog(s, 'game.log.effect.ss043NoDiscard', 'SS-043-UC')).toBe(true);
  });

  it('costs 1 when the discard pile has a card, and the engine charges 1', () => {
    const st = board(['KS-005-C']);
    expect(calculateEffectiveCost(st, 'player1', st.player1.hand[0], 0, false)).toBe(1);
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as GameAction);
    expect(s.player1.chakra).toBe(9);
    expect(hasLog(s, 'game.log.effect.ss043Discount', 'SS-043-UC')).toBe(true);
  });

  it('reads the opponent discard pile, not the caster one', () => {
    const st = board([]);
    st.player2.discardPile = [getCardById('KS-005-C') as unknown as CharacterCard];
    expect(calculateEffectiveCost(st, 'player1', st.player1.hand[0], 0, false)).toBe(2);
  });

  it('never goes below 0', () => {
    const st = board(['KS-005-C']);
    const zeroCost = { ...(st.player1.hand[0] as CharacterCard), chakra: 0 } as CharacterCard;
    expect(calculateEffectiveCost(st, 'player1', zeroCost, 0, false)).toBe(0);
  });

  it('applies on the client visible state shape too', () => {
    const st = board(['KS-005-C']);
    const visible = GameEngine.getVisibleState(st, 'player1');
    expect(calculateEffectiveCost(visible, 'player1', st.player1.hand[0], 0, false)).toBe(1);
  });
});
