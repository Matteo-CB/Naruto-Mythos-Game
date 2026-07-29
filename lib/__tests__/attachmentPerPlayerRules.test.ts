import { describe, it, expect } from 'vitest';
import { attachCardToCharacter, getCharacterAttachTargets, attachesToEnemy, enforceAttachmentConditions } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CardData, GameState } from '@/lib/engine/types';

function friendlyAttachment(index = 0): CardData {
  const list = getPlayableAttachments().filter((a) => a.attach_to !== 'mission' && !attachesToEnemy(a as unknown as CardData));
  expect(list[index], 'the set ships friendly character attachments').toBeTruthy();
  return list[index] as unknown as CardData;
}

function boardWithHost(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'host', powerTokens: 3 })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function hostOf(state: GameState) {
  return state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'host')!;
}

describe('one attachment per character per player', () => {
  it('both players can attach to the same character', () => {
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', friendlyAttachment(), 'host');
    state = attachCardToCharacter(state, 'player2', friendlyAttachment(), 'host');

    const owners = (hostOf(state).attachments ?? []).map((a) => a.owner);
    expect(owners, 'an enemy attachment coexists with mine').toEqual(['player1', 'player2']);
  });

  it('a second attachment from the same player replaces only their own', () => {
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', friendlyAttachment(), 'host');
    state = attachCardToCharacter(state, 'player2', friendlyAttachment(), 'host');
    const discardBefore = state.player1.discardPile.length;

    state = attachCardToCharacter(state, 'player1', friendlyAttachment(), 'host');

    const held = hostOf(state).attachments ?? [];
    expect(held.filter((a) => a.owner === 'player1').length, 'one of mine').toBe(1);
    expect(held.filter((a) => a.owner === 'player2').length, 'the enemy one is untouched').toBe(1);
    expect(state.player1.discardPile.length, 'my replaced attachment is discarded').toBe(discardBefore + 1);
  });

  it('power tokens survive the replacement', () => {
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', friendlyAttachment(), 'host');
    state = attachCardToCharacter(state, 'player1', friendlyAttachment(), 'host');
    expect(hostOf(state).powerTokens, 'tokens are kept').toBe(3);
  });
});

describe('the hidden requirement is read from the ATTACH line, both ways', () => {
  const hiddenOnly = {
    id: 'TEST-HIDDEN-ATT',
    name_fr: 'ATTACHE FURTIVE',
    name_en: 'STEALTH ATTACHMENT',
    card_type: 'attachment',
    attach_to: 'character',
    power: 0,
    chakra: 1,
    effects: [{ type: 'ATTACH', description: 'Attach to a hidden friendly character.' }],
  } as unknown as CardData;

  function boardWithBothHosts(): GameState {
    const state = buildSimState({
      p1: [
        simChar('KS-001-C', { owner: 'player1', instanceId: 'visible' }),
        simChar('KS-003-C', { owner: 'player1', instanceId: 'concealed', hidden: true }),
      ],
      missions: 2,
      edgeHolder: 'player1',
    });
    state.phase = 'action';
    return state;
  }

  it('a non-hidden attachment only sees the face up host', () => {
    const targets = getCharacterAttachTargets(boardWithBothHosts(), 'player1', 0, friendlyAttachment());
    expect(targets.map((c) => c.instanceId)).toEqual(['visible']);
  });

  it('an attachment asking for a hidden host only sees the face down one', () => {
    const targets = getCharacterAttachTargets(boardWithBothHosts(), 'player1', 0, hiddenOnly);
    expect(targets.map((c) => c.instanceId), 'it must not match "non-hidden" by accident').toEqual(['concealed']);
  });

  it('revealing the host drops an attachment that required a hidden one', () => {
    let state = boardWithBothHosts();
    state = attachCardToCharacter(state, 'player1', hiddenOnly, 'concealed');
    expect(state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'concealed')!.attachments?.length).toBe(1);

    const mission = state.activeMissions[0];
    mission.player1Characters = mission.player1Characters.map((c) =>
      c.instanceId === 'concealed' ? { ...c, isHidden: false } : c,
    );
    const after = enforceAttachmentConditions(state);

    const host = after.activeMissions[0].player1Characters.find((c) => c.instanceId === 'concealed')!;
    expect(host.attachments ?? [], 'the condition is lost, so it is discarded').toEqual([]);
    expect(after.player1.discardPile.length).toBe(state.player1.discardPile.length + 1);
  });
});

describe('an attachment can target an enemy character when its text says so', () => {
  it('the enemy wording is detected', () => {
    const enemyAttachment = { effects: [{ type: 'ATTACH', description: 'Attach to an enemy character.' }] } as unknown as CardData;
    const friendly = { effects: [{ type: 'ATTACH', description: 'Attach to a friendly character.' }] } as unknown as CardData;
    expect(attachesToEnemy(enemyAttachment)).toBe(true);
    expect(attachesToEnemy(friendly)).toBe(false);
  });

  it('the target list switches to the opponent side', () => {
    const state = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'mine' })],
      p2: [simChar('KS-003-C', { owner: 'player2', instanceId: 'theirs' })],
      missions: 2,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const enemyAttachment = { effects: [{ type: 'ATTACH', description: 'Attach to an enemy character.' }] } as unknown as CardData;
    const targets = getCharacterAttachTargets(state, 'player1', 0, enemyAttachment);
    expect(targets.map((c) => c.instanceId)).toEqual(['theirs']);

    const friendlyTargets = getCharacterAttachTargets(state, 'player1', 0, friendlyAttachment());
    expect(friendlyTargets.map((c) => c.instanceId)).toEqual(['mine']);
  });
});
