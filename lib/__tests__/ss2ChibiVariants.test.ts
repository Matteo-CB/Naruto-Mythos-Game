import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';
import type { CharacterInPlay, GameState, PendingAction } from '@/lib/engine/types';

const SHIKAMARU = 'SS-118-CHIBIV';
const SAKURA = 'SS-123-CHIBIV';
const CHIBI = [
  'SS-078-CHIBIV', 'SS-111-CHIBIV', 'SS-112-CHIBIV', 'SS-115-CHIBIV',
  SHIKAMARU, 'SS-121-CHIBIV', SAKURA, 'SS-126-CHIBIV',
];
const BASES: Record<string, string> = {
  'SS-078-CHIBIV': 'SS-078-UC',
  'SS-111-CHIBIV': 'SS-111-SHINOBIV',
  'SS-112-CHIBIV': 'SS-112-SHINOBIV',
  'SS-115-CHIBIV': 'SS-115-SHINOBIV',
  'SS-121-CHIBIV': 'SS-121-R',
  'SS-123-CHIBIV': 'SS-123-MV',
  'SS-126-CHIBIV': 'SS-126-R',
};
const TEMARI = 'SS-119-R';
const VANILLA = 'KS-021-C';
const OTHER = 'KS-009-C';
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

describe('a Chibi variant is the same card as the one it copies', () => {
  it('every printed value matches the base card, only the title may differ', () => {
    for (const [variant, base] of Object.entries(BASES)) {
      const v = getCardById(variant)!;
      const b = getCardById(base)!;
      expect(v, variant).toBeTruthy();
      expect(v.chakra, `${variant} cost`).toBe(b.chakra);
      expect(v.power, `${variant} power`).toBe(b.power);
      expect(v.group, `${variant} group`).toBe(b.group);
      expect(v.keywords, `${variant} keywords`).toEqual(b.keywords);
      expect(v.effects.map((e) => e.type), `${variant} effect types`).toEqual(b.effects.map((e) => e.type));
      expect(v.effects.map((e) => e.description), `${variant} effect text`)
        .toEqual(b.effects.map((e) => e.description));
      expect(v.title_en, `${variant} carries its own title`).not.toBe(b.title_en);
    }
  });

  it('each one is a Chibi variant of the right number, with its artwork', () => {
    for (const id of CHIBI) {
      const card = getCardById(id)!;
      expect(card.rarity).toBe('CHIBIV');
      expect(card.set).toBe('SS');
      expect(String(card.number)).toBe(String(Number(id.split('-')[1])));
      expect(card.image_file, `${id} art`).toContain(`images/cards/SS/chibi_v/${id}.webp`);
    }
  });

  it('the effects are described in all seven languages', () => {
    for (const locale of LOCALES) {
      for (const id of CHIBI) {
        const card = getCardById(id)!;
        const described = getCardEffectDescriptions(id, locale) ?? [];
        expect(described.length, `${id} in ${locale}`).toBe(card.effects.length);
        for (const text of described) expect(text.trim().length, `${id} in ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it('elles se gagnent, et sont jouables en classe', () => {
    for (const id of CHIBI) {
      expect(isForceUnlockedCard(id), `${id} se gagne, il n est offert a personne`).toBe(false);
      expect(isStaticRankedBanned(id), `${id} playable in ranked`).toBe(false);
    }
  });

  it('each interactive effect is wired to a handler', () => {
    registerAllSetHandlers();
    expect(getEffectHandler('SS-078-CHIBIV', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-111-CHIBIV', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-111-CHIBIV', 'MAIN')).toBeTruthy();
    expect(getEffectHandler('SS-112-CHIBIV', 'UPGRADE')).toBeTruthy();
    expect(getEffectHandler('SS-112-CHIBIV', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-121-CHIBIV', 'DUEL')).toBeTruthy();
    expect(getEffectHandler(SAKURA, 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-126-CHIBIV', 'DUEL')).toBeTruthy();
    expect(getEffectHandler(SHIKAMARU, 'AMBUSH')).toBeTruthy();
    expect(getEffectHandler(SHIKAMARU, 'DUEL')).toBeTruthy();
  });
});

describe('the Chibi Sakura amplifies POWERUPs like the Mythos one', () => {
  it('a friendly POWERUP in her mission gains 1', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [], chakra1: 20,
      p1: [simChar(SAKURA, { owner: 'player1', instanceId: 'sakura' }),
        simChar(VANILLA, { owner: 'player1', instanceId: 'ally' })],
      p2: [],
    });
    expect(amplifiedPowerup(state, 'ally', 2), 'the variant reads by number, not by id').toBe(3);
  });
});

describe('Shikamaru SS-118 drags a hidden ninja into the open', () => {
  function board(opts: { hidden?: boolean; temari?: boolean; twin?: boolean } = {}): GameState {
    const p2: CharacterInPlay[] = [];
    if (opts.hidden) p2.push(simChar(OTHER, { owner: 'player2', instanceId: 'ghost', hidden: true }));
    if (opts.twin) p2.push(simChar(OTHER, { owner: 'player2', instanceId: 'twin' }));
    if (opts.temari) p2.push(simChar(TEMARI, { owner: 'player2', instanceId: 'temari' }));

    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [], chakra1: 20, p1: [], p2,
    });
    state.activeMissions[0].player1Characters.push(
      simChar(SHIKAMARU, { owner: 'player1', instanceId: 'shika', hidden: true }),
    );
    return state;
  }

  function reveal(state: GameState): GameState {
    return GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'shika',
    });
  }

  it('the AMBUSH reveals then defeats the hidden enemy', () => {
    const revealed = reveal(board({ hidden: true }));
    expect(prompt(revealed)?.descriptionKey).toBe('game.effect.desc.ss118RevealDefeat');

    const confirmed = answer(revealed);
    expect(prompt(confirmed)?.options).toEqual(['ghost']);

    const done = answer(confirmed, 'ghost');
    expect(charOf(done, 'ghost'), 'it left the board').toBeUndefined();
    expect(done.player2.discardPile.length, 'it went to its owner discard').toBeGreaterThan(0);
    expect(done.log.some((l) => l.messageKey === 'game.log.effect.ss118Reveal')).toBe(true);
  });

  it('with no hidden enemy the window never opens', () => {
    const revealed = reveal(board({ hidden: false }));
    expect(revealed.pendingActions.length).toBe(0);
    expect(revealed.log.some((l) => l.messageKey === 'game.log.effect.noTarget')).toBe(true);
  });

  it('the DUEL hides the twin of the revealed name', () => {
    let state = reveal(board({ hidden: true, temari: true, twin: true }));
    let guard = 0;
    while (state.pendingActions.length > 0 && guard++ < 8) {
      const options = prompt(state)!.options;
      state = answer(state, options.includes('ghost') ? 'ghost' : options[0]);
    }
    expect(charOf(state, 'twin')?.isHidden, 'the namesake is hidden').toBe(true);
    expect(state.log.some((l) => l.messageKey === 'game.log.effect.ss118HideSameName')).toBe(true);
  });

  it('the DUEL does nothing without Temari on the board', () => {
    let state = reveal(board({ hidden: true, twin: true }));
    let guard = 0;
    while (state.pendingActions.length > 0 && guard++ < 8) state = answer(state);
    expect(charOf(state, 'twin')?.isHidden, 'no duel partner, no hide').toBe(false);
  });

  it('the revealed name is remembered on Shikamaru himself, not globally', () => {
    let state = reveal(board({ hidden: true, temari: true, twin: true }));
    state = answer(answer(state), 'ghost');
    expect(charOf(state, 'shika')?.ss118RevealedName, 'stored on the source card').toBeTruthy();
  });

  it('a second Shikamaru that revealed nothing cannot reuse the first name', () => {
    let state = reveal(board({ hidden: true, temari: true, twin: true }));
    state = answer(answer(state), 'ghost');

    const fresh = simChar(SHIKAMARU, { owner: 'player1', instanceId: 'shika2', missionIndex: 1 });
    state.activeMissions[1].player1Characters.push(fresh);
    expect(charOf(state, 'shika2')?.ss118RevealedName, 'each copy remembers only its own reveal')
      .toBeUndefined();
  });
});

describe('the new keys exist everywhere', () => {
  it('all seven languages carry the Shikamaru texts', () => {
    const keys = [
      'game.effect.desc.ss118RevealDefeat',
      'game.effect.desc.ss118HideSameName',
      'game.log.effect.ss118Reveal',
      'game.log.effect.ss118HideSameName',
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
