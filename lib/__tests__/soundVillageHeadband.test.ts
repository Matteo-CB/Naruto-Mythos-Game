import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { attachCardToCharacter, getCharacterAttachTargets } from '@/lib/effects/attachments';
import { characterHasGroup, effectiveGroupsOf } from '@/lib/effects/groupUtils';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, CharacterCard, CharacterInPlay, GameState } from '@/lib/engine/types';

const SOUND_HEADBAND = 'SS-093-C';
const SAND_HEADBAND = 'SS-092-C';
const SNAKE_SWORD = 'SS-101-UC';
const TAYUYA = 'KS-065-UC';
const SASUKE_SS126 = 'SS-126-R';
const HIDING_NARUTO = 'KS-108-R';
const SHIZUNE = 'KS-005-C';

function card(id: string): CardData {
  return getCardById(id) as CardData;
}

function hostOf(state: GameState, instanceId: string): CharacterInPlay {
  return state.activeMissions
    .flatMap((m) => [...m.player1Characters, ...m.player2Characters])
    .find((c) => c.instanceId === instanceId)!;
}

function resolvePrompts(state: GameState): GameState {
  let s = state;
  for (let guard = 0; guard < 10 && s.pendingActions.length > 0; guard += 1) {
    const pa = s.pendingActions[0];
    if (!pa.options || pa.options.length === 0) break;
    s = GameEngine.applyAction(s, pa.player, {
      type: 'SELECT_TARGET',
      pendingActionId: pa.id,
      selectedTargets: [pa.options[0]],
    });
  }
  return s;
}

describe('Sound Village headband SS-093-C grants its group to its host', () => {
  beforeAll(() => { initializeRegistry(); });

  it('the printed data is the exact twin of the Sand Village headband', () => {
    const sound = card(SOUND_HEADBAND);
    const sand = card(SAND_HEADBAND);
    expect(sound.card_type).toBe('attachment');
    expect(sound.attach_to).toBe('character');
    expect(sound.chakra).toBe(1);
    expect(sound.power).toBe(2);
    expect(sound.keywords).toEqual(['Armor']);
    expect(sound.group).toBe('Sound Village');
    expect(sound.effects?.[0].type).toBe('ATTACH');
    expect(sound.effects?.[0].description).toBe(
      'Attach to a friendly non-hidden character. This character is also considered a Sound Village character.',
    );
    expect(sound.effects?.length, 'the headband carries the ATTACH line only').toBe(1);
    expect(sound.effects?.[0].description.replace(/Sound/g, 'Sand')).toBe(sand.effects?.[0].description);
  });

  function leafHostWearingTheSoundHeadband(): GameState {
    const state = buildSimState({
      p1: [simChar(SHIZUNE, { owner: 'player1', instanceId: 'host' })],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    return attachCardToCharacter(state, 'player1', card(SOUND_HEADBAND), 'host');
  }

  it('the host keeps its printed group and gains Sound Village', () => {
    const state = leafHostWearingTheSoundHeadband();
    const host = hostOf(state, 'host');
    expect(host.attachments?.length).toBe(1);
    expect(effectiveGroupsOf(host)).toEqual(['Leaf Village', 'Sound Village']);
    expect(characterHasGroup(host, 'Sound Village')).toBe(true);
    expect(characterHasGroup(host, 'Leaf Village')).toBe(true);
    expect(characterHasGroup(host, 'Sand Village')).toBe(false);
  });

  it('a hidden host shows no group at all, so the grant disappears with it', () => {
    const state = leafHostWearingTheSoundHeadband();
    const hidden = { ...hostOf(state, 'host'), isHidden: true };
    expect(effectiveGroupsOf(hidden)).toEqual([]);
    expect(characterHasGroup(hidden, 'Sound Village')).toBe(false);
  });

  it('an ATTACH line asking for a friendly Sound Village host accepts the headbanded character', () => {
    const state = leafHostWearingTheSoundHeadband();
    const targets = getCharacterAttachTargets(state, 'player1', 0, card(SNAKE_SWORD));
    expect(card(SNAKE_SWORD).effects?.[0].description).toBe('Attach to a friendly Sound Village character.');
    expect(targets.map((c) => c.instanceId)).toEqual(['host']);
  });

  it('a Sound Village character search sees the headbanded character as a POWERUP target', () => {
    let state = buildSimState({
      p1: [
        simChar(TAYUYA, { owner: 'player1', instanceId: 'tayuya' }),
        simChar(SHIZUNE, { owner: 'player1', instanceId: 'host' }),
      ],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    state = attachCardToCharacter(state, 'player1', card(SOUND_HEADBAND), 'host');

    const handler = getEffectHandler(TAYUYA, 'AMBUSH')!;
    const result = handler({
      state,
      sourcePlayer: 'player1',
      sourceCard: hostOf(state, 'tayuya'),
      sourceMissionIndex: 0,
      triggerType: 'AMBUSH',
      isUpgrade: false,
    });

    expect(
      result.requiresTargetSelection,
      'Tayuya 065 powers up a friendly Sound Village character, and the headband makes one',
    ).toBe(true);
  });

  it('a per-mission Sound Village count includes the headbanded character', () => {
    let state = buildSimState({
      p1: [
        simChar(SASUKE_SS126, { owner: 'player1', instanceId: 'sasuke' }),
        simChar(SHIZUNE, { owner: 'player1', instanceId: 'host' }),
      ],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    const bare = getEffectivePower(state, hostOf(state, 'sasuke'), 'player1');
    state = attachCardToCharacter(state, 'player1', card(SOUND_HEADBAND), 'host');
    const withHeadband = getEffectivePower(state, hostOf(state, 'sasuke'), 'player1');
    expect(withHeadband, 'Sasuke SS-126 gains +1 Power per Sound Village character in this mission').toBe(bare + 1);
  });
});

describe('Sound Village headband SS-093-C only attaches to a friendly non-hidden character', () => {
  beforeAll(() => { initializeRegistry(); });

  function crowdedBoard(): GameState {
    const state = buildSimState({
      p1: [
        simChar(SHIZUNE, { owner: 'player1', instanceId: 'visible' }),
        simChar('KS-003-C', { owner: 'player1', instanceId: 'concealed', hidden: true }),
      ],
      p2: [simChar('KS-009-C', { owner: 'player2', instanceId: 'enemy' })],
      missions: 2,
      chakra1: 30,
    });
    state.phase = 'action';
    return state;
  }

  it('the host list holds no hidden character and no enemy character', () => {
    const targets = getCharacterAttachTargets(crowdedBoard(), 'player1', 0, card(SOUND_HEADBAND));
    expect(targets.map((c) => c.instanceId)).toEqual(['visible']);
  });

  it('playing it with only a hidden friendly on the mission is refused and costs nothing', () => {
    const state = buildSimState({
      p1: [simChar('KS-003-C', { owner: 'player1', instanceId: 'concealed', hidden: true })],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    state.phase = 'action';
    state.player1.hand = [card(SOUND_HEADBAND) as unknown as CharacterCard];
    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });
    expect(after.player1.hand.length, 'the card stays in hand').toBe(1);
    expect(after.player1.chakra, 'nothing is paid for a refused action').toBe(30);
  });

  it('the headband is discarded to its owner when an enemy effect hides its host', () => {
    let state = buildSimState({
      p1: [simChar(SHIZUNE, { owner: 'player1', instanceId: 'host' })],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    state.phase = 'action';
    state = attachCardToCharacter(state, 'player1', card(SOUND_HEADBAND), 'host');
    expect(hostOf(state, 'host').attachments?.length).toBe(1);

    state.activePlayer = 'player2';
    state.player2.hand = [card(HIDING_NARUTO) as unknown as CharacterCard];
    let after = GameEngine.applyAction(state, 'player2', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });
    after = resolvePrompts(after);

    const host = hostOf(after, 'host');
    expect(host.isHidden, 'the enemy hid the host').toBe(true);
    expect(host.attachments ?? [], 'the attach condition is lost').toEqual([]);
    expect(after.player1.discardPile.some((c) => c.id === SOUND_HEADBAND)).toBe(true);
  });
});
