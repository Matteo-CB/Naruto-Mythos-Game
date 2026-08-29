import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';
import { buildPromptTag } from '@/lib/effects/promptTag';
import {
  isUpgraded, printedPowerOf, sasuke148DefeatTargets, strongestEnemyIn, zabuza150Amount,
} from '@/lib/effects/handlers/SS/secretVariants';
import type { CharacterInPlay, GameState, PendingAction } from '@/lib/engine/types';

const NARUTO = 'SS-147-SV';
const SASUKE = 'SS-148-SV';
const KAKASHI = 'SS-149-SV';
const ZABUZA = 'SS-150-SV';
const SECRETS = [NARUTO, SASUKE, KAKASHI, ZABUZA];
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

const NARUTO_PARTNER = 'KS-009-C';
const KAKASHI_PARTNER = 'KS-015-C';
const WEAK = 'KS-005-C';
const VANILLA = 'KS-021-C';
const BIG = 'KS-136-S';

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

function missionOf(state: GameState, instanceId: string): number {
  for (let i = 0; i < state.activeMissions.length; i++) {
    const m = state.activeMissions[i];
    if ([...m.player1Characters, ...m.player2Characters].some((c) => c.instanceId === instanceId)) return i;
  }
  return -1;
}

function upgradedEnemy(base: string, top: string, instanceId: string, missionIndex = 0): CharacterInPlay {
  const stack = [getCardById(base)!, getCardById(top)!];
  return {
    instanceId, card: stack[1] as never, stack: stack as never,
    isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 0,
    controlledBy: 'player2', originalOwner: 'player2', missionIndex,
  } as CharacterInPlay;
}

function playFirst(state: GameState, missionIndex = 0): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex, hidden: false,
  });
}

describe('the four Secret variants are complete cards', () => {
  it('each one carries its printed values and its artwork', () => {
    const expected: Record<string, { chakra: number; power: number; group: string }> = {
      [NARUTO]: { chakra: 7, power: 7, group: 'Leaf Village' },
      [SASUKE]: { chakra: 7, power: 7, group: 'Leaf Village' },
      [KAKASHI]: { chakra: 6, power: 6, group: 'Leaf Village' },
      [ZABUZA]: { chakra: 6, power: 7, group: 'Independent' },
    };
    for (const id of SECRETS) {
      const card = getCardById(id)!;
      expect(card, id).toBeTruthy();
      expect(card.rarity).toBe('SV');
      expect(card.chakra, `${id} cost`).toBe(expected[id].chakra);
      expect(card.power, `${id} power`).toBe(expected[id].power);
      expect(card.group, `${id} group`).toBe(expected[id].group);
      expect(card.effects.length, `${id} effects`).toBe(2);
      expect(card.image_file, `${id} art`).toContain(`images/cards/SS/secret_v/${id}.webp`);
    }
  });

  it('the two that copy an existing card match it effect for effect', () => {
    for (const [variant, base] of [[NARUTO, 'SS-147-POPV'], [KAKASHI, 'SS-149-L']]) {
      const v = getCardById(variant)!;
      const b = getCardById(base)!;
      expect(v.effects.map((e) => e.description), `${variant} vs ${base}`)
        .toEqual(b.effects.map((e) => e.description));
      expect(v.title_en, `${variant} has its own title`).not.toBe(b.title_en);
    }
  });

  it('the Kakashi legendary now carries its real number', () => {
    const legendary = getCardById('SS-149-L')!;
    expect(legendary, 'renumbered from the placeholder').toBeTruthy();
    expect(String(legendary.number)).toBe('149');
    expect(getCardById('SS-000-L'), 'the placeholder id is gone').toBeFalsy();
  });

  it('every effect is described in all seven languages', () => {
    for (const locale of LOCALES) {
      for (const id of SECRETS) {
        const described = getCardEffectDescriptions(id, locale) ?? [];
        expect(described.length, `${id} in ${locale}`).toBe(2);
        for (const text of described) expect(text.trim().length, `${id} in ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it('each interactive effect is wired, and they stay out of ranked', () => {
    registerAllSetHandlers();
    expect(getEffectHandler(NARUTO, 'DUEL')).toBeTruthy();
    expect(getEffectHandler(SASUKE, 'MAIN')).toBeTruthy();
    expect(getEffectHandler(SASUKE, 'DUEL')).toBeTruthy();
    expect(getEffectHandler(KAKASHI, 'MAIN')).toBeTruthy();
    expect(getEffectHandler(KAKASHI, 'DUEL')).toBeTruthy();
    expect(getEffectHandler(ZABUZA, 'DUEL')).toBeTruthy();
    expect(getEffectHandler(ZABUZA, 'UPGRADE')).toBeTruthy();
    for (const id of SECRETS) {
      expect(isForceUnlockedCard(id), `${id} se gagne, il n est offert a personne`).toBe(false);
      expect(isStaticRankedBanned(id), `${id} playable in ranked`).toBe(false);
    }
  });

  it('the popup tag names the duel partner printed on each card', () => {
    expect(buildPromptTag('DUEL', 'SS148_CONFIRM_DUEL', getCardById(SASUKE))?.duelPartner)
      .toBe('Naruto Uzumaki');
    expect(buildPromptTag('DUEL', 'SS150_CONFIRM_DUEL', getCardById(ZABUZA))?.duelPartner)
      .toBe('Kakashi Hatake');
  });
});

describe('Sasuke SS-148 cuts down an evolved enemy then repositions', () => {
  function board(opts: { upgraded?: boolean; weakTop?: boolean; naruto?: boolean } = {}): GameState {
    const p2: CharacterInPlay[] = [];
    if (opts.upgraded) {
      p2.push(upgradedEnemy(WEAK, opts.weakTop ? WEAK : BIG, 'foe-stack'));
    }
    if (opts.naruto) p2.push(simChar(NARUTO_PARTNER, { owner: 'player2', instanceId: 'naruto' }));
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [SASUKE], p1: [], p2, chakra1: 20,
    });
  }

  it('a plain enemy is never a target, only an upgraded one', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [SASUKE], p1: [],
      p2: [simChar(VANILLA, { owner: 'player2', instanceId: 'plain' })], chakra1: 20,
    });
    const played = playFirst(state);
    expect(played.pendingActions.length, 'nothing upgraded to cut down').toBe(0);
  });

  it('an upgraded enemy with less printed Power is defeated, then Sasuke moves', () => {
    const played = playFirst(board({ upgraded: true, weakTop: true }));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss148DefeatUpgraded');

    let state = answer(played);
    state = answer(state, 'foe-stack');
    expect(charOf(state, 'foe-stack'), 'the evolved enemy is gone').toBeUndefined();

    const sasuke = [...state.activeMissions[0].player1Characters, ...state.activeMissions[1].player1Characters]
      .find((c) => (c.stack?.[c.stack.length - 1] ?? c.card).id === SASUKE);
    expect(sasuke, 'Sasuke is still on the board').toBeTruthy();
    if (state.pendingActions.length > 0) state = answer(state);
    expect(missionOf(state, sasuke!.instanceId), 'he had to move away').toBe(1);
  });

  it('an upgraded enemy stronger on print is out of reach', () => {
    const state = board({ upgraded: true, weakTop: false });
    const targets = sasuke148DefeatTargets(state, 'player1', 0, 'nobody');
    expect(targets, 'no source in play yet, so nothing is reachable').toEqual([]);
  });

  it('printed Power is read from the top of the stack, not the base', () => {
    const stack = upgradedEnemy(WEAK, BIG, 'x');
    expect(isUpgraded(stack)).toBe(true);
    expect(printedPowerOf(stack)).toBe(getCardById(BIG)!.power);
  });

  it('the duel with Naruto grants exactly 3 tokens', () => {
    let state = playFirst(board({ naruto: true }));
    let guard = 0;
    while (state.pendingActions.length > 0 && guard++ < 6) state = answer(state);
    const sasuke = state.activeMissions[0].player1Characters
      .find((c) => (c.stack?.[c.stack.length - 1] ?? c.card).id === SASUKE);
    expect(sasuke?.powerTokens).toBe(3);
  });
});

describe('Zabuza SS-150 drags the strongest enemy to him', () => {
  function board(withKakashi: boolean): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [ZABUZA], p1: [],
      p2: withKakashi ? [simChar(KAKASHI_PARTNER, { owner: 'player2', instanceId: 'kakashi' })] : [],
      chakra1: 20,
    });
    state.activeMissions[1].player2Characters.push(
      simChar(BIG, { owner: 'player2', instanceId: 'strong', missionIndex: 1 }),
    );
    return state;
  }

  it('the strongest enemy in play is the one that gets pulled', () => {
    const state = board(true);
    expect(strongestEnemyIn(state, 'player1')?.instanceId).toBe('strong');
  });

  it('with Kakashi on the board the duel moves that enemy here', () => {
    let state = playFirst(board(true));
    expect(prompt(state)?.descriptionKey).toBe('game.effect.desc.ss150PullStrongest');
    state = answer(state);
    state = answer(state, 'strong');
    expect(missionOf(state, 'strong'), 'dragged into Zabuza mission').toBe(0);
  });

  it('without Kakashi nothing is pulled', () => {
    const state = playFirst(board(false));
    expect(missionOf(state, 'strong')).toBe(1);
  });

  it('the upgrade powerup equals the cost of the strongest enemy here', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [ZABUZA], p1: [],
      p2: [simChar(BIG, { owner: 'player2', instanceId: 'strong' })], chakra1: 20,
    });
    expect(zabuza150Amount(state, 'player1', 0)).toBe(getCardById(BIG)!.chakra);
    expect(zabuza150Amount(state, 'player1', 1), 'an empty mission measures nothing').toBe(0);
  });

  it('a hidden enemy is never the strongest, it has no visible power', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [], p1: [],
      p2: [simChar(BIG, { owner: 'player2', instanceId: 'ghost', hidden: true })], chakra1: 20,
    });
    expect(strongestEnemyIn(state, 'player1')).toBeNull();
  });
});

describe('the new keys exist everywhere', () => {
  it('all seven languages carry the new prompts', () => {
    const keys = [
      'game.effect.desc.ss148DuelPowerup',
      'game.effect.desc.ss148DefeatUpgraded',
      'game.effect.desc.ss148MoveSelf',
      'game.effect.desc.ss150PullStrongest',
      'game.effect.desc.ss150PowerupByCost',
      'game.log.effect.ss148DuelPowerup',
      'game.log.effect.ss150PowerupByCost',
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
