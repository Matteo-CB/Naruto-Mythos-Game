import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import { aiSelectTarget } from '@/lib/ai/targetSelection';
import type { GameState, PendingAction } from '@/lib/engine/types';

const TSUNADE_GOLD = 'SS-999-L';
const JIRAIYA_GOLD = 'SS-998-L';
const GAARA_GOLD = 'SS-078-L';
const GAARA_BASE = 'SS-078-UC';
const TSUNADE_CHEAP = 'KS-104-R';
const JIRAIYA_CHEAP = 'KS-007-C';
const GAMAKICHI = 'KS-096-C';
const GAMATATSU = 'KS-097-C';
const KIMIMARO = 'KS-056-UC';
const VANILLA = 'KS-009-C';
const CHEAP_ENEMY = 'KS-005-C';
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

function charById(state: GameState, cardId: string) {
  for (const mission of state.activeMissions) {
    const found = mission.player1Characters.find((c) => {
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.id === cardId;
    });
    if (found) return found;
  }
  return undefined;
}

function charByInstance(state: GameState, instanceId: string) {
  for (const mission of state.activeMissions) {
    const found = mission.player1Characters.find((c) => c.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

describe('Tsunade SS-999-L shuffles her discard pile back for POWERUP', () => {
  function tsunadeBoard(discardSize: number, upgradeTarget = false): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [TSUNADE_GOLD],
      p1: upgradeTarget
        ? [simChar(TSUNADE_CHEAP, { owner: 'player1', instanceId: 'old-tsunade' }),
          simChar(VANILLA, { owner: 'player1', instanceId: 'my-ally' })]
        : [simChar(VANILLA, { owner: 'player1', instanceId: 'my-ally' })],
      chakra1: 30,
    });
    state.player1.discardPile = Array.from({ length: discardSize }, () => getCharacterById(VANILLA)!);
    state.player1.deck = Array.from({ length: 4 }, () => getCharacterById(VANILLA)!);
    return state;
  }

  function playFresh(state: GameState): GameState {
    return GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });
  }

  it('the optional MAIN asks first, then how many cards to take back', () => {
    const played = playFresh(tsunadeBoard(3));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss001ConfirmMain');

    const asked = answer(played);
    expect(prompt(asked)?.descriptionKey).toBe('game.effect.desc.ss001ChooseCount');
    expect(prompt(asked)?.options, 'one option per card, capped at the pile size').toEqual(['1', '2', '3']);
  });

  it('it never offers more than the printed five cards', () => {
    const asked = answer(playFresh(tsunadeBoard(9)));
    expect(prompt(asked)?.options).toEqual(['1', '2', '3', '4', '5']);
  });

  it('the chosen cards leave the discard pile, join the deck, and each one is a Power token', () => {
    const before = tsunadeBoard(4);
    const deckBefore = before.player1.deck.length;

    const resolved = answer(answer(playFresh(before)), '3');

    expect(resolved.player1.discardPile.length, 'three cards left the pile').toBe(1);
    expect(resolved.player1.deck.length, 'and joined the deck').toBe(deckBefore + 3);
    expect(charById(resolved, TSUNADE_GOLD)?.powerTokens, 'POWERUP 1 per card').toBe(3);
    expect(resolved.pendingActions.length, 'nothing left hanging').toBe(0);
  });

  it('the count window is a number picker, never a card picker', () => {
    const asked = answer(playFresh(tsunadeBoard(4)));
    const action = asked.pendingActions[0];
    const effect = asked.pendingEffects.find((e) => e.id === action.sourceEffectId);
    const popup = buildPendingTargetSelectionUI(
      action,
      effect,
      {
        playerHand: asked.player1.hand ?? [],
        playerDiscard: asked.player1.discardPile ?? [],
        playerDeckSize: asked.player1.deck?.length ?? 0,
        activeMissions: asked.activeMissions.map((m) => ({ rank: m.rank })),
      },
      'Player 1',
      () => {},
      () => {},
    );

    expect(popup.selectionType, 'picking a card is what made players shuffle only one').toBe('DECLARE_NUMBER');
    expect(popup.numberRange).toEqual({ min: 1, max: 4 });
    expect(popup.numberPreviewCards, 'the cards that would leave the pile are shown').toHaveLength(4);
    expect(popup.numberPreviewCards?.[0].position).toBe(1);
    expect(popup.handCards, 'no card list that could be mistaken for a card choice').toBeUndefined();
  });

  it('the POWERUP counts the cards shuffled, never the cost of a card', () => {
    const before = tsunadeBoard(5);
    before.player1.discardPile = before.player1.discardPile.map((c, i) =>
      i === before.player1.discardPile.length - 4 ? getCharacterById('KS-136-S')! : c);

    const resolved = answer(answer(playFresh(before)), '4');
    const tsunade = charById(resolved, TSUNADE_GOLD)!;
    const expensive = getCharacterById('KS-136-S')!.chakra ?? 0;

    expect(tsunade.powerTokens, 'four cards shuffled, four tokens').toBe(4);
    expect(tsunade.powerTokens, 'and not the cost of any card in the pile').not.toBe(expensive);
    expect(resolved.player1.discardPile.length).toBe(1);
  });

  it('the AI shuffles as many cards as it can', () => {
    const asked = answer(playFresh(tsunadeBoard(4)));
    const action = asked.pendingActions[0];
    expect(aiSelectTarget(action.options, action, asked, 'player1', 'hard')).toBe('4');
  });

  it('an empty discard pile opens no window at all', () => {
    const played = playFresh(tsunadeBoard(0));
    expect(played.pendingActions.length).toBe(0);
    expect(charById(played, TSUNADE_GOLD)?.powerTokens).toBe(0);
  });

  it('declining leaves the discard pile untouched', () => {
    const played = playFresh(tsunadeBoard(4));
    const declined = decline(played);
    expect(declined.player1.discardPile.length).toBe(4);
    expect(charById(declined, TSUNADE_GOLD)?.powerTokens).toBe(0);
  });

  it('played as an upgrade, a friendly character also gains one token per card', () => {
    const before = tsunadeBoard(4, true);
    const upgraded = GameEngine.applyAction(before, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'old-tsunade',
    });

    const counted = answer(answer(upgraded), '2');
    expect(prompt(counted)?.descriptionKey, 'the upgrade asks who gets the bonus')
      .toBe('game.effect.desc.ss001ChooseAlly');
    expect(prompt(counted)?.options, 'every friendly character is a legal target')
      .toContain('my-ally');

    const given = answer(counted, 'my-ally');
    expect(charByInstance(given, 'my-ally')?.powerTokens, 'same amount as cards shuffled').toBe(2);
    expect(charByInstance(given, 'old-tsunade')?.powerTokens, 'Tsunade keeps her own POWERUP').toBe(2);
    expect(given.pendingActions.length).toBe(0);
  });

  it('an upgrade that shuffled nothing hands out no bonus token', () => {
    const before = tsunadeBoard(4, true);
    const upgraded = GameEngine.applyAction(before, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'old-tsunade',
    });
    const declined = decline(upgraded);

    expect(declined.pendingActions.length, 'no ally picker after a decline').toBe(0);
    expect(charByInstance(declined, 'my-ally')?.powerTokens).toBe(0);
  });
});

describe('Jiraiya SS-998-L pays for Summons and powers them up', () => {
  function jiraiyaBoard(options: { inPlay?: boolean; upgradeTarget?: boolean; summonInPlay?: boolean } = {}): GameState {
    const p1 = [];
    if (options.upgradeTarget) p1.push(simChar(JIRAIYA_CHEAP, { owner: 'player1', instanceId: 'old-jiraiya' }));
    else if (options.inPlay) p1.push(simChar(JIRAIYA_GOLD, { owner: 'player1', instanceId: 'my-jiraiya' }));
    if (options.summonInPlay) p1.push(simChar(GAMATATSU, { owner: 'player1', instanceId: 'my-toad' }));

    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [JIRAIYA_GOLD, GAMAKICHI, VANILLA],
      p1,
      chakra1: 30,
    });
    state.player1.deck = Array.from({ length: 4 }, () => getCharacterById(VANILLA)!);
    return state;
  }

  it('playing a Summon while he is in play gains 1 Chakra', () => {
    const before = jiraiyaBoard({ inPlay: true });
    const chakraBefore = before.player1.chakra;
    const summonCost = getCharacterById(GAMAKICHI)!.chakra ?? 0;

    const played = GameEngine.applyAction(before, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 1, missionIndex: 0, hidden: false,
    });

    expect(played.player1.chakra, 'cost paid, then 1 Chakra back').toBe(chakraBefore - summonCost + 1);
  });

  it('a Summon played face down triggers nothing, since a hidden card shows no keyword', () => {
    const before = jiraiyaBoard({ inPlay: true });
    const chakraBefore = before.player1.chakra;

    const played = GameEngine.applyAction(before, 'player1', {
      type: 'PLAY_HIDDEN', cardIndex: 1, missionIndex: 0,
    });

    expect(played.player1.chakra, 'one Chakra for the hidden play, nothing back').toBe(chakraBefore - 1);
  });

  it('a non-Summon character gains nothing', () => {
    const before = jiraiyaBoard({ inPlay: true });
    const chakraBefore = before.player1.chakra;
    const cost = getCharacterById(VANILLA)!.chakra ?? 0;

    const played = GameEngine.applyAction(before, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 2, missionIndex: 0, hidden: false,
    });

    expect(played.player1.chakra).toBe(chakraBefore - cost);
  });

  it('the UPGRADE plays a Summon three cheaper and powers up every friendly Summon', () => {
    const before = jiraiyaBoard({ upgradeTarget: true, summonInPlay: true });
    const upgradeCost = (getCharacterById(JIRAIYA_GOLD)!.chakra ?? 0) - (getCharacterById(JIRAIYA_CHEAP)!.chakra ?? 0);
    const summonCost = getCharacterById(GAMAKICHI)!.chakra ?? 0;
    const chakraBefore = before.player1.chakra;

    const upgraded = GameEngine.applyAction(before, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'old-jiraiya',
    });
    expect(prompt(upgraded)?.descriptionKey).toBe('game.effect.desc.ss002ConfirmUpgrade');

    const offered = answer(upgraded);
    expect(prompt(offered)?.descriptionKey).toBe('game.effect.desc.ss002PlaySummon');

    const handOption = (prompt(offered)?.options ?? []).find((o) => o.startsWith('HAND_'))!;
    const placing = answer(offered, handOption);
    expect(prompt(placing)?.descriptionKey, 'then he chooses where the Summon lands')
      .toBe('game.effect.desc.chooseMissionPlayReduced');
    const done = answer(placing, '0');

    const played = charById(done, GAMAKICHI);
    expect(played, 'the Summon reached the board').toBeTruthy();
    expect(played!.powerTokens, 'the fresh Summon is powered up too').toBe(2);
    expect(charByInstance(done, 'my-toad')?.powerTokens, 'and the one already in play').toBe(2);

    const reduced = Math.max(0, summonCost - 3);
    expect(done.player1.chakra, 'upgrade cost, reduced Summon cost, then 1 Chakra back from his own MAIN')
      .toBe(chakraBefore - upgradeCost - reduced + 1);
  });

  it('declining the Summon play still powers up the Summons already in play', () => {
    const before = jiraiyaBoard({ upgradeTarget: true, summonInPlay: true });
    const upgraded = GameEngine.applyAction(before, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'old-jiraiya',
    });

    const declined = decline(answer(upgraded));

    expect(charByInstance(declined, 'my-toad')?.powerTokens, 'the second sentence still resolves').toBe(2);
    expect(charById(declined, GAMAKICHI), 'no Summon was played').toBeFalsy();
    expect(declined.pendingActions.length).toBe(0);
  });
});

describe('Gaara SS-078-L is the very same card as the uncommon one', () => {
  const gold = getCardById(GAARA_GOLD)!;
  const base = getCardById(GAARA_BASE)!;

  it('cost, power, keywords, group and effects are identical', () => {
    expect(gold.chakra).toBe(base.chakra);
    expect(gold.power).toBe(base.power);
    expect(gold.keywords).toEqual(base.keywords);
    expect(gold.group).toBe(base.group);
    expect(gold.effects).toEqual(base.effects);
    expect(gold.number, 'same printed number, which is what the defeat trigger reads').toBe(base.number);
  });

  it('but it keeps its own printed title', () => {
    expect(gold.title_en).not.toBe(base.title_en);
    expect(gold.title_en).toContain('give up');
    for (const locale of ['fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      expect((gold as unknown as Record<string, unknown>)[`title_${locale}`], `${locale} title`).toBeTruthy();
    }
  });

  it('its DUEL defeats a cheap enemy exactly like the uncommon', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [GAARA_GOLD],
      p1: [simChar(KIMIMARO, { owner: 'player1', instanceId: 'my-kimimaro' })],
      p2: [simChar(CHEAP_ENEMY, { owner: 'player2', instanceId: 'cheap-enemy' })],
      chakra1: 30,
    });

    const played = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });
    const confirmed = answer(played);
    const defeated = answer(confirmed, 'cheap-enemy');

    expect(defeated.activeMissions.every((m) => !m.player2Characters.some((c) => c.instanceId === 'cheap-enemy')),
      'the enemy is gone').toBe(true);
  });
});

describe('the gold Gaara still offers its draw when it defeats an enemy', () => {
  it('defeating a visible enemy opens the pay-1-Chakra-to-draw window', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [GAARA_GOLD],
      p1: [simChar(KIMIMARO, { owner: 'player1', instanceId: 'my-kimimaro' })],
      p2: [simChar(CHEAP_ENEMY, { owner: 'player2', instanceId: 'cheap-enemy' })],
      chakra1: 30,
    });
    state.player1.deck = Array.from({ length: 4 }, () => getCharacterById(VANILLA)!);

    const played = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });
    const defeated = answer(answer(played), 'cheap-enemy');

    expect(prompt(defeated)?.descriptionKey, 'the continuous MAIN of card 78 fired')
      .toBe('game.effect.desc.ss078ConfirmDraw');

    const handBefore = defeated.player1.hand.length;
    const chakraBefore = defeated.player1.chakra;
    const drawn = answer(defeated);

    expect(drawn.player1.hand.length).toBe(handBefore + 1);
    expect(drawn.player1.chakra).toBe(chakraBefore - 1);
  });
});

describe('the three gold cards are wired into the collection rules', () => {
  for (const id of [TSUNADE_GOLD, JIRAIYA_GOLD, GAARA_GOLD]) {
    it(`${id} se gagne et se joue en classe comme le reste du set 2`, () => {
      expect(isForceUnlockedCard(id), `${id} se gagne, il n est offert a personne`).toBe(false);
      expect(isStaticRankedBanned(id)).toBe(false);
    });

    it(`${id} carries its art, its Legendary rarity and a description in every language`, () => {
      const card = getCardById(id)!;
      expect(card.rarity).toBe('L');
      expect(card.set).toBe('SS');
      expect(card.image_file).toContain('legendary/');
      for (const locale of LOCALES) {
        const file = locale === 'fr'
          ? 'lib/data/sets/SS/translations-fr.ts'
          : `lib/data/sets/SS/descriptions-${locale}.ts`;
        expect(readFileSync(file, 'utf8'), `${id} in ${locale}`).toContain(`"${id}"`);
      }
    });
  }

  it('the continuous effect carries its hourglass and the instant ones their bolt', () => {
    const jiraiya = getCardById(JIRAIYA_GOLD)!;
    expect(jiraiya.effects[0].description).toContain('[⧗]');
    expect(jiraiya.effects[1].description).toContain('[↯]');

    const tsunade = getCardById(TSUNADE_GOLD)!;
    expect(tsunade.effects[0].description).toContain('[↯]');
    expect(tsunade.effects[1].description, 'an effect alteration carries no marker').not.toContain('[');
  });
});
