import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { amplifiedPowerup, powerupAmplifierBonus } from '@/lib/effects/ContinuousEffects';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import type { CharacterInPlay, GameState, PendingAction } from '@/lib/engine/types';

const SAKURA = 'SS-123-MV';
const ITACHI = 'SS-137-MV';
const GAARA = 'SS-114-MV';
const SASUKE = 'SS-126-MV';
const NARUTO = 'SS-005-MV';
const REGIONALS = [SAKURA, ITACHI, GAARA, SASUKE, NARUTO];

const INO = 'KS-019-C';
const KURENAI = 'KS-034-C';
const TENTEN = 'KS-041-UC';
const VANILLA = 'KS-021-C';
const PLAIN = 'KS-086-C';
const OTHER = 'KS-009-C';
const ITACHI_BASE = 'KS-090-C';
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

function prompt(state: GameState): PendingAction | undefined {
  return state.pendingActions[0];
}

function answer(state: GameState, target?: string): GameState {
  const action = state.pendingActions[0];
  return GameEngine.applyAction(state, action.player, {
    type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [target ?? action.options[0]],
  });
}

function charOf(state: GameState, instanceId: string): CharacterInPlay | undefined {
  for (const mission of state.activeMissions) {
    const found = [...mission.player1Characters, ...mission.player2Characters]
      .find((c) => c.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

function sideOf(state: GameState, instanceId: string): 'player1' | 'player2' | null {
  for (const mission of state.activeMissions) {
    if (mission.player1Characters.some((c) => c.instanceId === instanceId)) return 'player1';
    if (mission.player2Characters.some((c) => c.instanceId === instanceId)) return 'player2';
  }
  return null;
}

function playFirst(state: GameState, missionIndex = 0): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex, hidden: false,
  });
}

describe('Sakura SS-123 makes every POWERUP land harder', () => {
  function withSakura(sakuraCount = 1): GameState {
    const p1: CharacterInPlay[] = [simChar(VANILLA, { owner: 'player1', instanceId: 'ally' })];
    for (let i = 0; i < sakuraCount; i++) {
      p1.push(simChar(SAKURA, { owner: 'player1', instanceId: `sakura-${i}` }));
    }
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [], p1, p2: [], chakra1: 20,
    });
    state.activeMissions[1].player1Characters.push(
      simChar(VANILLA, { owner: 'player1', instanceId: 'far-ally', missionIndex: 1 }),
    );
    state.activeMissions[0].player2Characters.push(
      simChar(VANILLA, { owner: 'player2', instanceId: 'foe', missionIndex: 0 }),
    );
    return state;
  }

  it('a friendly POWERUP in her mission is worth one more token', () => {
    const state = withSakura();
    expect(amplifiedPowerup(state, 'ally', 2)).toBe(3);
    const granted = EffectEngine.applyPowerupToTarget(state, 'ally', 2);
    expect(charOf(granted, 'ally')!.powerTokens).toBe(3);
  });

  it('she does not amplify a POWERUP on herself', () => {
    const state = withSakura();
    expect(amplifiedPowerup(state, 'sakura-0', 2)).toBe(2);
  });

  it('a second copy amplifies the first one, and they stack', () => {
    const state = withSakura(2);
    expect(amplifiedPowerup(state, 'sakura-0', 1), 'the other copy is a friend').toBe(2);
    expect(amplifiedPowerup(state, 'ally', 1), 'both copies apply').toBe(3);
  });

  it('another mission and the enemy side are untouched', () => {
    const state = withSakura();
    expect(amplifiedPowerup(state, 'far-ally', 2)).toBe(2);
    expect(amplifiedPowerup(state, 'foe', 2)).toBe(2);
  });

  it('a POWERUP of 0 stays 0, an unexecuted effect grants nothing', () => {
    const state = withSakura();
    expect(amplifiedPowerup(state, 'ally', 0)).toBe(0);
    expect(EffectEngine.applyPowerupToTarget(state, 'ally', 0)).toBeTruthy();
    expect(charOf(EffectEngine.applyPowerupToTarget(state, 'ally', 0), 'ally')!.powerTokens).toBe(0);
  });

  it('while she is hidden her text does nothing', () => {
    const state = withSakura();
    charOf(state, 'sakura-0')!.isHidden = true;
    expect(powerupAmplifierBonus(state, 0, 'player1')).toBe(0);
    expect(amplifiedPowerup(state, 'ally', 2)).toBe(2);
  });

  it('a card effect that hands out tokens goes through the amplifier', () => {
    const p1 = [
      simChar(SAKURA, { owner: 'player1', instanceId: 'sakura-0' }),
      simChar(VANILLA, { owner: 'player1', instanceId: 'ally' }),
    ];
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [TENTEN], p1, p2: [], chakra1: 20,
    });
    let played = playFirst(state);
    let guard = 0;
    while (played.pendingActions.length > 0 && guard++ < 6) {
      const options = prompt(played)!.options;
      played = answer(played, options.includes('ally') ? 'ally' : options[0]);
    }
    const ally = charOf(played, 'ally');
    if (ally && ally.powerTokens > 0) {
      expect(ally.powerTokens, 'Tenten POWERUP 1 becomes 2 next to Sakura').toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Sakura SS-123 DUEL takes her own soldier back', () => {
  function stolenBoard(hidden = false): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [SAKURA],
      p1: [],
      p2: [simChar(INO, { owner: 'player2', instanceId: 'ino' })],
      chakra1: 20,
    });
    const stolen = simChar(OTHER, { owner: 'player1', instanceId: 'stolen', missionIndex: 0, hidden });
    stolen.controlledBy = 'player2';
    stolen.controllerInstanceId = 'ino';
    state.activeMissions[0].player2Characters.push(stolen);
    return state;
  }

  it('the DUEL only opens with Ino Yamanaka on the board', () => {
    const withoutIno = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [SAKURA], p1: [], p2: [], chakra1: 20,
    });
    const played = playFirst(withoutIno);
    expect(played.pendingActions.length, 'no Ino, no duel').toBe(0);
  });

  it('the character comes back to its owner side', () => {
    const played = playFirst(stolenBoard());
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss123MvTakeBack');

    const confirmed = answer(played);
    const chooser = prompt(confirmed);
    expect(chooser?.options, 'only what she owns').toEqual(['stolen']);

    const back = answer(confirmed, 'stolen');
    expect(sideOf(back, 'stolen')).toBe('player1');
    expect(charOf(back, 'stolen')!.controlledBy).toBe('player1');
    expect(charOf(back, 'stolen')!.controllerInstanceId).toBeUndefined();
  });

  it('taking back a hidden character never prints its name in the log', () => {
    const played = playFirst(stolenBoard(true));
    const back = answer(answer(played), 'stolen');
    const entry = back.log.find((l) => l.messageKey === 'game.log.effect.ss123MvTakeBackHidden');
    expect(entry, 'a hidden card stays secret').toBeTruthy();
    expect(entry?.messageParams?.target).toBe('');
  });

  it('nothing of hers under enemy control means no prompt', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [SAKURA], p1: [],
      p2: [simChar(INO, { owner: 'player2', instanceId: 'ino' })],
      chakra1: 20,
    });
    const played = playFirst(state);
    expect(played.pendingActions.length).toBe(0);
    expect(played.log.some((l) => l.messageKey === 'game.log.effect.noTarget')).toBe(true);
  });
});

describe('Itachi SS-137 sends an ally home and thins the enemy line', () => {
  function itachiBoard(opts: { hidden?: boolean; enemies?: number; kurenai?: boolean } = {}): GameState {
    const p1: CharacterInPlay[] = [simChar(ITACHI_BASE, { owner: 'player1', instanceId: 'base' })];
    if (opts.hidden) p1.push(simChar(PLAIN, { owner: 'player1', instanceId: 'ghost', hidden: true }));
    const p2: CharacterInPlay[] = [];
    for (let i = 0; i < (opts.enemies ?? 0); i++) {
      p2.push(simChar(VANILLA, { owner: 'player2', instanceId: `foe-${i}` }));
    }
    if (opts.kurenai) p2.push(simChar(KURENAI, { owner: 'player2', instanceId: 'kurenai' }));
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [ITACHI], p1, p2, chakra1: 20,
    });
  }

  it('the UPGRADE returns a friendly hidden character to hand', () => {
    const state = itachiBoard({ hidden: true });
    const handBefore = state.player1.hand.length;
    const played = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'base',
    });
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss137MvReturnHidden');

    const confirmed = answer(played);
    expect(prompt(confirmed)?.options).toEqual(['ghost']);

    const returned = answer(confirmed, 'ghost');
    expect(charOf(returned, 'ghost'), 'it left the board').toBeUndefined();
    expect(returned.player1.hand.length).toBe(handBefore);
    expect(returned.log.some((l) => l.messageKey === 'game.log.effect.ss137MvReturnHidden')).toBe(true);
  });

  it('the returned hidden card is never named in the log', () => {
    const played = GameEngine.applyAction(itachiBoard({ hidden: true }), 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'base',
    });
    const returned = answer(answer(played), 'ghost');
    const entry = returned.log.find((l) => l.messageKey === 'game.log.effect.ss137MvReturnHidden');
    expect(entry?.messageParams?.target).toBeUndefined();
  });

  it('the DUEL makes the opponent cut down to your own count', () => {
    const played = playFirst(itachiBoard({ enemies: 3, kurenai: true }));
    let state = played;
    let guard = 0;
    while (state.pendingActions.length > 0 && guard++ < 10) {
      state = answer(state);
    }
    const mission = state.activeMissions[0];
    expect(mission.player2Characters.length, 'down to parity').toBe(mission.player1Characters.length);
    expect(state.player2.discardPile.length, 'the defeated cards go to their owner').toBeGreaterThan(0);
  });

  it('the opponent is the one who chooses, and cannot refuse', () => {
    const played = playFirst(itachiBoard({ enemies: 3, kurenai: true }));
    const confirmed = answer(played);
    const forced = prompt(confirmed);
    expect(forced?.player, 'their characters, their choice').toBe('player2');
    const effect = confirmed.pendingEffects.find((e) => e.targetSelectionType === 'SS137MV_OPPONENT_CHOOSE_DEFEAT');
    expect(effect?.isMandatory).toBe(true);
    expect(effect?.isOptional).toBe(false);
  });

  it('nothing happens when the opponent does not outnumber you', () => {
    const played = playFirst(itachiBoard({ enemies: 1, kurenai: false }));
    expect(played.pendingActions.length).toBe(0);
  });
});

describe('the regional variants are wired like the cards they copy', () => {
  it('Gaara and Sasuke reuse the handlers of their base card', () => {
    registerAllSetHandlers();
    expect(getEffectHandler(GAARA, 'MAIN'), 'Gaara MAIN').toBeTruthy();
    expect(getEffectHandler(SASUKE, 'DUEL'), 'Sasuke DUEL').toBeTruthy();
    expect(getEffectHandler(SAKURA, 'DUEL'), 'Sakura DUEL').toBeTruthy();
    expect(getEffectHandler(ITACHI, 'UPGRADE'), 'Itachi UPGRADE').toBeTruthy();
    expect(getEffectHandler(ITACHI, 'DUEL'), 'Itachi DUEL').toBeTruthy();
    expect(getEffectHandler(NARUTO, 'MAIN'), 'Naruto MAIN').toBeTruthy();
  });

  it('every regional card is playable data with its art and its effects', () => {
    for (const id of REGIONALS) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(card!.effects.length, `${id} has printed effects`).toBeGreaterThan(0);
      expect(card!.set).toBe('SS');
    }
  });

  it('les promos se gagnent, et se jouent en classe', () => {
    for (const id of [SAKURA, ITACHI, GAARA, SASUKE]) {
      expect(isForceUnlockedCard(id), `${id} se gagne, il n est offert a personne`).toBe(false);
      expect(isStaticRankedBanned(id), `${id} playable in ranked`).toBe(false);
    }
    expect(isStaticRankedBanned(NARUTO)).toBe(false);
  });

  it('every new message key exists in all seven languages', () => {
    const keys = [
      'game.effect.desc.ss123MvTakeBack',
      'game.effect.desc.ss137MvReturnHidden',
      'game.effect.desc.ss137MvConfirmDuel',
      'game.effect.desc.ss137MvOpponentChooseDefeat',
      'game.effect.desc.ss005ConfirmMain',
      'game.effect.desc.ss005ConfirmAmbush',
      'game.log.effect.ss123MvTakeBack',
      'game.log.effect.ss123MvTakeBackHidden',
      'game.log.effect.ss137MvReturnHidden',
      'game.log.effect.ss137MvDuelDefeat',
    ];
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>(
          (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
          messages,
        );
        expect(typeof value, `${locale} ${key}`).toBe('string');
      }
    }
  });
});
