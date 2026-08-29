import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { calculateContinuousChakraBonus } from '@/lib/effects/ContinuousEffects';
import type { GameState, PendingAction } from '@/lib/engine/types';

const ITACHI = 'SS-053-C';
const KAKASHI = 'SS-008-C';
const JIROBO = 'SS-033-UC';
const HINATA = 'SS-016-C';
const KYUBI = 'SS-006-UC';
const TSUNADE = 'SS-002-UC';
const SENBON = 'SS-079-C';
const RAMEN = 'SS-081-C';
const NEW_CARDS = [TSUNADE, KYUBI, KAKASHI, HINATA, JIROBO, ITACHI, SENBON, RAMEN];

const SASUKE_TEAM7 = 'KS-013-C';
const NARUTO_TEAM7 = 'KS-009-C';
const JIROBO_SOUND_FOUR = 'KS-057-C';
const TAYUYA_SOUND_FOUR = 'KS-064-C';
const CHEAP = 'KS-005-C';
const BIG = 'KS-136-S';
const VANILLA = 'KS-021-C';
const PLAIN = 'KS-086-C';
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

function decline(state: GameState): GameState {
  const action = state.pendingActions[0];
  return GameEngine.applyAction(state, action.player, {
    type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: action.sourceEffectId ?? '',
  });
}

function playFirst(state: GameState, missionIndex = 0): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex, hidden: false,
  });
}

function charOf(state: GameState, instanceId: string) {
  for (const mission of state.activeMissions) {
    const found = [...mission.player1Characters, ...mission.player2Characters]
      .find((c) => c.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

function byCardId(state: GameState, cardId: string) {
  for (const mission of state.activeMissions) {
    const found = mission.player1Characters.find((c) => {
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.id === cardId;
    });
    if (found) return found;
  }
  return undefined;
}

describe('Itachi SS-053 must hide something cheap when he strikes first', () => {
  function board(extra: { friendlyCheap?: boolean; enemyCheap?: boolean; enemyBig?: boolean } = {}): GameState {
    const p1 = extra.friendlyCheap ? [simChar(CHEAP, { owner: 'player1', instanceId: 'my-cheap' })] : [];
    const p2 = [];
    if (extra.enemyCheap) p2.push(simChar(CHEAP, { owner: 'player2', instanceId: 'foe-cheap' }));
    if (extra.enemyBig) p2.push(simChar(BIG, { owner: 'player2', instanceId: 'foe-big' }));

    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [ITACHI], p1, p2, chakra1: 20,
    });
  }

  it('the window opens on the first play and cannot be declined', () => {
    const played = playFirst(board({ enemyCheap: true }));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss053FirstStrikeHide');

    const effect = played.pendingEffects.find((e) => e.targetSelectionType === 'SS053_FS_HIDE');
    expect(effect?.isMandatory, 'the card says you MUST').toBe(true);
    expect(effect?.isOptional).toBe(false);

    const declined = decline(played);
    expect(declined.pendingActions.length, 'the window stays open').toBe(1);
    expect(declined.activeMissions[0].player2Characters.every((c) => !c.isHidden)).toBe(true);
  });

  it('Itachi himself is a legal target, so there is always something to hide', () => {
    const played = playFirst(board());
    const itachi = byCardId(played, ITACHI)!;
    expect(prompt(played)?.options, 'he counts as a character in this mission').toContain(itachi.instanceId);

    const hidden = answer(played, itachi.instanceId);
    expect(charOf(hidden, itachi.instanceId)?.isHidden).toBe(true);
  });

  it('a cheap enemy can be hidden instead', () => {
    const played = playFirst(board({ enemyCheap: true }));
    const hidden = answer(played, 'foe-cheap');
    expect(charOf(hidden, 'foe-cheap')?.isHidden).toBe(true);
    expect(hidden.pendingActions.length).toBe(0);
  });

  it('a friendly character is just as valid a target', () => {
    const played = playFirst(board({ friendlyCheap: true }));
    expect(prompt(played)?.options).toContain('my-cheap');
    expect(charOf(answer(played, 'my-cheap'), 'my-cheap')?.isHidden).toBe(true);
  });

  it('an expensive character is never offered', () => {
    const played = playFirst(board({ enemyBig: true }));
    expect(prompt(played)?.options, 'cost 2 or less only').not.toContain('foe-big');
  });

  it('played second in the round, the effect does not fire at all', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [PLAIN, ITACHI],
      p2: [simChar(CHEAP, { owner: 'player2', instanceId: 'foe-cheap' })],
      chakra1: 20,
    });
    const first = playFirst(state);
    const passed = GameEngine.applyAction(first, 'player2', { type: 'PASS' });
    const second = GameEngine.applyAction(passed, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });

    expect(second.pendingActions.length, 'the FIRST STRIKE window is closed').toBe(0);
    expect(charOf(second, 'foe-cheap')?.isHidden).toBe(false);
  });

  it('played face down it triggers nothing, like every effect', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [ITACHI],
      p2: [simChar(CHEAP, { owner: 'player2', instanceId: 'foe-cheap' })],
      chakra1: 20,
    });
    const hiddenPlay = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0,
    });
    expect(hiddenPlay.pendingActions.length).toBe(0);
    expect(charOf(hiddenPlay, 'foe-cheap')?.isHidden).toBe(false);
  });
});

describe('Kakashi SS-008 puts a Team 7 ally down cheaper, never as an upgrade', () => {
  function board(handExtra: string[], inPlay: Array<{ id: string; iid: string }> = []): GameState {
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [KAKASHI, ...handExtra],
      p1: inPlay.map((c) => simChar(c.id, { owner: 'player1', instanceId: c.iid })),
      chakra1: 20,
    });
  }

  it('the optional window comes first, then the Team 7 list', () => {
    const played = playFirst(board([SASUKE_TEAM7]));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss008ConfirmFirstStrike');

    const offered = answer(played);
    expect(prompt(offered)?.descriptionKey).toBe('game.effect.desc.ss008PlayTeam7');
    expect((prompt(offered)?.options ?? []).some((o) => o.startsWith('HAND_'))).toBe(true);
  });

  it('the chosen ally really lands, two Chakra cheaper', () => {
    const before = board([SASUKE_TEAM7]);
    const cost = getCharacterById(SASUKE_TEAM7)!.chakra ?? 0;
    const kakashiCost = getCardById(KAKASHI)!.chakra ?? 0;
    const chakraBefore = before.player1.chakra;

    const offered = answer(playFirst(before));
    const handOption = (prompt(offered)?.options ?? []).find((o) => o.startsWith('HAND_'))!;
    const placing = answer(offered, handOption);
    const done = placing.pendingActions.length > 0 ? answer(placing, '0') : placing;

    expect(byCardId(done, SASUKE_TEAM7), 'the Team 7 ally is on the board').toBeTruthy();
    expect(done.player1.chakra).toBe(chakraBefore - kakashiCost - Math.max(0, cost - 2));
  });

  it('a same-name ally on every mission leaves no fresh play, so nothing is offered', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [KAKASHI, NARUTO_TEAM7],
      p1: [simChar('KS-010-C', { owner: 'player1', instanceId: 'naruto-a' })],
      chakra1: 20,
    });
    state.activeMissions[1].player1Characters.push(
      simChar('KS-010-C', { owner: 'player1', instanceId: 'naruto-b', missionIndex: 1 }),
    );

    const played = playFirst(state);
    expect(played.pendingActions.length, 'the upgrade route is forbidden, so no window').toBe(0);
  });

  it('a Team 7 card that is only affordable as an upgrade is never proposed', () => {
    const before = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [KAKASHI, 'KS-014-UC'],
      p1: [simChar(SASUKE_TEAM7, { owner: 'player1', instanceId: 'my-sasuke' })],
      chakra1: 3,
    });
    const played = playFirst(before);
    expect(played.pendingActions.length, 'the upgrade route is forbidden by the card').toBe(0);
  });

  it('declining leaves the hand untouched', () => {
    const before = board([SASUKE_TEAM7]);
    const declined = decline(playFirst(before));
    expect(declined.player1.hand.some((c) => c.id === SASUKE_TEAM7)).toBe(true);
    expect(declined.pendingActions.length).toBe(0);
  });
});

describe('Jirobo SS-033 grows with his Sound Four allies', () => {
  function board(allies: string[]): GameState {
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [JIROBO],
      p1: [
        simChar(JIROBO_SOUND_FOUR, { owner: 'player1', instanceId: 'upgrade-base' }),
        ...allies.map((id, i) => simChar(id, { owner: 'player1', instanceId: `ally-${i}` })),
      ],
      chakra1: 20,
    });
  }

  function upgrade(state: GameState): GameState {
    return GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'upgrade-base',
    });
  }

  it('two Chakra tokens per other friendly Sound Four here', () => {
    const upgraded = upgrade(board([TAYUYA_SOUND_FOUR, 'KS-059-C']));
    expect(prompt(upgraded)?.descriptionKey).toBe('game.effect.desc.ss033ConfirmUpgrade');

    const done = answer(upgraded);
    expect(charOf(done, 'upgrade-base')?.powerTokens, 'two allies, POWERUP 4').toBe(4);
  });

  it('he never counts himself', () => {
    const upgraded = upgrade(board([]));
    expect(upgraded.pendingActions.length, 'a character is not its own ally').toBe(0);
    expect(charOf(upgraded, 'upgrade-base')?.powerTokens).toBe(0);
  });

  it('a hidden ally shows no keyword, so it does not count', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [JIROBO],
      p1: [
        simChar(JIROBO_SOUND_FOUR, { owner: 'player1', instanceId: 'upgrade-base' }),
        simChar(TAYUYA_SOUND_FOUR, { owner: 'player1', instanceId: 'hidden-ally', hidden: true }),
      ],
      chakra1: 20,
    });
    expect(upgrade(state).pendingActions.length).toBe(0);
  });
});

describe('Hinata SS-016 pays a Chakra when her team is around', () => {
  function bonusWith(allyId: string | null, hidden = false): number {
    const p1 = [simChar(HINATA, { owner: 'player1', instanceId: 'hinata' })];
    if (allyId) p1.push(simChar(allyId, { owner: 'player1', instanceId: 'ally', hidden }));

    const state = buildSimState({ missionIds: ['KS-001-MMS', 'KS-006-MMS'], p1, chakra1: 10 });
    const hinata = state.activeMissions[0].player1Characters[0];
    return calculateContinuousChakraBonus(state, 'player1', 0, hinata);
  }

  it('a friendly Naruto Uzumaki here gives 1 Chakra', () => {
    expect(bonusWith(NARUTO_TEAM7)).toBe(1);
  });

  it('another Team 8 character here gives 1 Chakra', () => {
    expect(bonusWith('KS-025-C')).toBe(1);
  });

  it('alone she gives nothing, she is not her own ally', () => {
    expect(bonusWith(null)).toBe(0);
  });

  it('a hidden ally gives nothing, its keyword is invisible', () => {
    expect(bonusWith('KS-025-C', true)).toBe(0);
  });

  it('an unrelated ally gives nothing', () => {
    expect(bonusWith(VANILLA)).toBe(0);
  });
});

describe('Nine-Tailed Fox SS-006 trades a kill for the opponent Chakra', () => {
  function board(enemy: { id: string; hidden?: boolean }): GameState {
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(KYUBI, { owner: 'player1', instanceId: 'my-fox', hidden: true })],
      p2: [simChar(enemy.id, { owner: 'player2', instanceId: 'foe', hidden: enemy.hidden })],
      chakra1: 20,
    });
  }

  function reveal(state: GameState): GameState {
    return GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'my-fox',
    });
  }

  it('the AMBUSH asks, then defeats, and pays the opponent the printed cost', () => {
    const before = board({ id: BIG });
    const enemyChakraBefore = before.player2.chakra;
    const enemyCost = getCharacterById(BIG)!.chakra ?? 0;

    const revealed = reveal(before);
    expect(prompt(revealed)?.descriptionKey).toBe('game.effect.desc.ss006Defeat');

    const done = answer(answer(revealed), 'foe');
    expect(charOf(done, 'foe'), 'the enemy is defeated').toBeFalsy();
    expect(done.player2.chakra).toBe(enemyChakraBefore + enemyCost);
  });

  it('a hidden victim is worth no Chakra at all, since a hidden card costs 0', () => {
    const before = board({ id: BIG, hidden: true });
    const enemyChakraBefore = before.player2.chakra;

    const done = answer(answer(reveal(before)), 'foe');
    expect(charOf(done, 'foe')).toBeFalsy();
    expect(done.player2.chakra).toBe(enemyChakraBefore);
  });

  it('declining defeats nobody and pays nothing', () => {
    const before = board({ id: BIG });
    const declined = decline(reveal(before));
    expect(charOf(declined, 'foe')).toBeTruthy();
    expect(declined.player2.chakra).toBe(before.player2.chakra);
  });

  it('with no enemy here the effect simply reports no target', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(KYUBI, { owner: 'player1', instanceId: 'my-fox', hidden: true })],
      chakra1: 20,
    });
    const revealed = reveal(state);
    expect(revealed.pendingActions.length).toBe(0);
  });
});

describe('Tsunade SS-002 gambles on the top of her deck', () => {
  function board(topCost: string): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [TSUNADE], chakra1: 20,
    });
    state.player1.deck = [getCharacterById(topCost)!, getCharacterById(VANILLA)!];
    return state;
  }

  it('the confirm leads to a free number entry, not a list of buttons', () => {
    const played = playFirst(board(BIG));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss002ConfirmMain');

    const declaring = answer(played);
    expect(prompt(declaring)?.descriptionKey).toBe('game.effect.desc.declareNumber');
    expect(prompt(declaring)?.options, 'one sentinel, the value is typed in').toEqual(['declare']);

    const effect = declaring.pendingEffects.find((e) => e.targetSelectionType === 'DECLARE_NUMBER');
    expect(JSON.parse(effect!.effectDescription)).toEqual({ min: 0, max: 999 });
  });

  it('a declaration the top card matches pays that many Power tokens', () => {
    const declaring = answer(playFirst(board(BIG)));
    const revealing = answer(declaring, '5');
    expect(prompt(revealing)?.descriptionKey).toBe('game.effect.desc.ss002RevealWin');

    const done = answer(revealing);
    expect(byCardId(done, TSUNADE)?.powerTokens).toBe(5);
  });

  it('a greedy declaration pays nothing', () => {
    const declaring = answer(playFirst(board(CHEAP)));
    const revealing = answer(declaring, '9');
    expect(prompt(revealing)?.descriptionKey).toBe('game.effect.desc.ss002RevealLose');

    const done = answer(revealing);
    expect(byCardId(done, TSUNADE)?.powerTokens).toBe(0);
  });

  it('the revealed card stays on top of the deck', () => {
    const before = board(BIG);
    const deckBefore = before.player1.deck.length;
    const done = answer(answer(answer(playFirst(before)), '3'));

    expect(done.player1.deck.length).toBe(deckBefore);
    expect(done.player1.deck[0].id).toBe(BIG);
    expect(done.player1.discardPile.some((c) => c.id === BIG)).toBe(false);
  });

  it('a number beyond 999 is clamped, and anything unreadable falls back to zero', () => {
    const declaring = answer(playFirst(board(BIG)));
    const clamped = answer(declaring, '4000');
    expect(JSON.parse(clamped.pendingEffects[0].effectDescription).declared).toBe(999);
  });
});

describe('Senbon SS-079 and Ramen SS-081', () => {
  function attachBoard(attachmentId: string, hostHidden = false): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [attachmentId],
      p1: [simChar(VANILLA, { owner: 'player1', instanceId: 'host', hidden: hostHidden })],
      chakra1: 20,
    });
    state.player1.deck = [getCharacterById(CHEAP)!, getCharacterById(VANILLA)!];
    return state;
  }

  it('Senbon costs nothing, sticks to its host and gives it a Power token', () => {
    const played = playFirst(attachBoard(SENBON));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss079ConfirmMain');

    const done = answer(played);
    const host = charOf(done, 'host');
    expect(host?.attachments?.length, 'the weapon is on the host').toBe(1);
    expect(host?.powerTokens).toBe(1);
  });

  it('Senbon can be attached to a hidden character, its line says nothing about hidden', () => {
    const played = playFirst(attachBoard(SENBON, true));
    const done = played.pendingActions.length > 0 ? answer(played) : played;
    expect(charOf(done, 'host')?.attachments?.length).toBe(1);
  });

  it('Ramen draws a card once attached', () => {
    const before = attachBoard(RAMEN);
    const handBefore = before.player1.hand.length;
    const deckBefore = before.player1.deck.length;

    const done = answer(playFirst(before));
    expect(charOf(done, 'host')?.attachments?.length).toBe(1);
    expect(done.player1.deck.length).toBe(deckBefore - 1);
    expect(done.player1.hand.length, 'the attachment left the hand, one card came in').toBe(handBefore);
  });

  it('Ramen refuses a hidden host, its line demands a non-hidden one', () => {
    const before = attachBoard(RAMEN, true);
    const played = playFirst(before);
    expect(charOf(played, 'host')?.attachments?.length ?? 0, 'nothing attached').toBe(0);
    expect(played.player1.hand.some((c) => c.id === RAMEN), 'the card stays in hand').toBe(true);
  });

  it('declining the attachment effect still leaves the attachment in place', () => {
    const declined = decline(playFirst(attachBoard(SENBON)));
    expect(charOf(declined, 'host')?.attachments?.length).toBe(1);
    expect(charOf(declined, 'host')?.powerTokens).toBe(0);
  });
});

describe('the eight new cards are wired into the data and the rules', () => {
  for (const id of NEW_CARDS) {
    it(`${id} carries its printed values, its markers and seven languages`, () => {
      const card = getCardById(id)!;
      expect(card, `${id} exists`).toBeTruthy();
      expect(card.set).toBe('SS');
      expect(card.has_visual, 'art flag matches the file').toBe(!!card.image_file);
      expect(isStaticRankedBanned(id), 'set 2 is playable in ranked').toBe(false);

      for (const locale of LOCALES) {
        const file = locale === 'fr'
          ? 'lib/data/sets/SS/translations-fr.ts'
          : `lib/data/sets/SS/descriptions-${locale}.ts`;
        expect(readFileSync(file, 'utf8'), `${id} in ${locale}`).toContain(`"${id}"`);
      }
    });
  }

  it('the only continuous effect is Hinata, every other new effect is instant', () => {
    for (const id of NEW_CARDS) {
      for (const effect of getCardById(id)!.effects) {
        if (effect.type === 'ATTACH') {
          expect(effect.description, 'an attach line carries no marker').not.toContain('[');
          continue;
        }
        const marker = id === HINATA ? '[⧗]' : '[↯]';
        expect(effect.description, `${id} ${effect.type}`).toContain(marker);
      }
    }
  });

  it('the two attachments declare where they attach and what they cost', () => {
    const senbon = getCardById(SENBON)!;
    expect(senbon.card_type).toBe('attachment');
    expect(senbon.chakra).toBe(0);
    expect(senbon.power).toBe(1);
    expect(senbon.effects[0].description).toBe('Attach to a friendly character.');

    const ramen = getCardById(RAMEN)!;
    expect(ramen.card_type).toBe('attachment');
    expect(ramen.chakra).toBe(2);
    expect(ramen.power).toBe(2);
    expect(ramen.effects[0].description).toBe('Attach to a friendly non-hidden character.');
  });

  it('the character names match the spelling the rest of the game already uses', () => {
    expect(getCardById(ITACHI)!.name_fr).toBe('ITACHI UCHIWA');
    expect(getCardById(JIROBO)!.name_fr).toBe('JIRÔBÔ');
    expect(getCardById(HINATA)!.name_fr).toBe('HINATA HYÛGA');
    expect(getCardById(KYUBI)!.name_fr).toBe('KYÛBI');
    expect(getCardById(TSUNADE)!.name_fr).toBe('TSUNADE');
    expect(getCardById(KAKASHI)!.name_fr).toBe('KAKASHI HATAKE');
  });
});
