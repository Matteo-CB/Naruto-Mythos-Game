import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerSet2Handlers } from '@/lib/effects/handlers/SS/set2';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

beforeAll(() => { registerSet2Handlers(); });

function m(p1: CharacterInPlay[], p2: CharacterInPlay[], id = 'm0') {
  return { card: mockMission({ id }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: p1, player2Characters: p2, wonBy: null };
}

function ss(id: string, number: number, effects: { type: string; description: string }[], extra: Partial<CharacterInPlay> = {}, cardExtra = {}) {
  return mockCharInPlay(
    { instanceId: id.toLowerCase(), missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1', ...extra },
    { id, number, set: 'SS', power: 6, name_fr: 'NARUTO UZUMAKI', effects: effects as never, ...cardExtra },
  );
}

describe('SS Set 2 DUEL handlers', () => {
  it('SS-147 DUEL: POWERUP self by number of non-hidden enemies in play (when Sasuke present)', () => {
    const src = ss('SS-147-POPV', 147, [
      { type: 'MAIN', description: '[⧗] Enemy characters cannot move out of this mission.' },
      { type: 'DUEL', description: '[↯] DUEL Sasuke Uchiha: POWERUP 1 for every non-hidden enemy character in play.' },
    ]);
    const sasuke = mockCharInPlay({ instanceId: 'sas', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'SASUKE UCHIHA', power: 5 });
    const e1 = mockCharInPlay({ instanceId: 'e1', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY A', power: 3 });
    const e2 = mockCharInPlay({ instanceId: 'e2', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY B', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([src, sasuke], [e1, e2])] }) as GameState;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', src, 0, false);
    const pending = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS147_CONFIRM_MAIN');
    expect(pending).toBeTruthy();
    const confirmed = EffectEngine.applyTargetedEffect(after, pending as never, [src.instanceId]);
    const srcAfter = confirmed.activeMissions[0].player1Characters.find((c) => c.instanceId === 'ss-147-popv');
    expect(srcAfter?.powerTokens).toBe(2);
  });

  it('SS-147 DUEL does nothing when Sasuke is absent', () => {
    const src = ss('SS-147-POPV', 147, [
      { type: 'DUEL', description: '[↯] DUEL Sasuke Uchiha: POWERUP 1 for every non-hidden enemy character in play.' },
    ]);
    const e1 = mockCharInPlay({ instanceId: 'e1', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY A', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([src], [e1])] }) as GameState;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', src, 0, false);
    const srcAfter = after.activeMissions[0].player1Characters.find((c) => c.instanceId === 'ss-147-popv');
    expect(srcAfter?.powerTokens).toBe(0);
  });

  it('SS-134 DUEL: defeats the strongest enemy in the mission when Power >= 6 and Itachi present', () => {
    const src = ss('SS-134-R', 134, [
      { type: 'DUEL', description: '[↯] DUEL Itachi Uchiha: Defeat the strongest enemy character in this mission if they have at least 6 Power.' },
    ], {}, { name_fr: 'KURENAI YUHI' });
    const itachi = mockCharInPlay({ instanceId: 'ita', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'ITACHI UCHIHA', power: 4 });
    const strong = mockCharInPlay({ instanceId: 'strong', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'BIG ENEMY', power: 7 });
    const weak = mockCharInPlay({ instanceId: 'weak', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'SMALL ENEMY', power: 2 });
    const state = createActionPhaseState({ activeMissions: [m([src, itachi], [strong, weak])] }) as GameState;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', src, 0, false);
    const pending = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS134_CONFIRM_MAIN');
    expect(pending).toBeTruthy();
    const confirmed = EffectEngine.applyTargetedEffect(after, pending as never, [src.instanceId]);
    const enemies = confirmed.activeMissions[0].player2Characters.map((c) => c.instanceId);
    expect(enemies).not.toContain('strong');
    expect(enemies).toContain('weak');
  });

  it('SS-134 DUEL: does NOT defeat when strongest enemy has less than 6 Power', () => {
    const src = ss('SS-134-R', 134, [
      { type: 'DUEL', description: '[↯] DUEL Itachi Uchiha: Defeat the strongest enemy character in this mission if they have at least 6 Power.' },
    ], {}, { name_fr: 'KURENAI YUHI' });
    const itachi = mockCharInPlay({ instanceId: 'ita', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'ITACHI UCHIHA', power: 4 });
    const mid = mockCharInPlay({ instanceId: 'mid', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'MID ENEMY', power: 5 });
    const state = createActionPhaseState({ activeMissions: [m([src, itachi], [mid])] }) as GameState;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', src, 0, false);
    expect(after.activeMissions[0].player2Characters.map((c) => c.instanceId)).toContain('mid');
  });

  it('SS-120 DUEL: emits a hide selection when Naruto present and eligible enemy exists', () => {
    const src = ss('SS-120-CHIBIV', 120, [
      { type: 'DUEL', description: '[↯] DUEL Naruto Uzumaki: Hide an enemy character with Power 4 or less in play.' },
    ], {}, { name_fr: 'KIBA INUZUKA' });
    const naruto = mockCharInPlay({ instanceId: 'nar', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'NARUTO UZUMAKI', power: 5 });
    const weak = mockCharInPlay({ instanceId: 'weak', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'WEAK', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([src, naruto], [weak])] }) as GameState;
    let after = EffectEngine.resolvePlayEffects(state, 'player1', src, 0, false);
    const confirm = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS120_CONFIRM_DUEL');
    expect(confirm).toBeTruthy();
    after = EffectEngine.applyTargetedEffect(after, confirm as never, confirm!.validTargets);
    const pending = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS120_HIDE');
    expect(pending).toBeTruthy();
    expect(pending?.validTargets).toContain('weak');
  });

  it('SS-121 stack split: moving the bottom card creates a new character on the destination mission', () => {
    const bottom = { id: 'KS-108-R', number: 108, set: 'KS', name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI', title_fr: '', rarity: 'R', card_type: 'character', has_visual: true, chakra: 5, power: 5, keywords: [], group: 'Leaf Village', effects: [] };
    const top = { id: 'SS-121-R', number: 121, set: 'SS', name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI', title_fr: '', rarity: 'R', card_type: 'character', has_visual: true, chakra: 6, power: 6, keywords: [], group: 'Leaf Village', effects: [] };
    const src = mockCharInPlay(
      { instanceId: 'src121', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1', stack: [bottom as never, top as never] },
      top as never,
    );
    const state = createActionPhaseState({ activeMissions: [m([src], []), m([], [], 'm1')] }) as GameState;
    const pendingEffect = {
      id: 'pe', sourceCardId: 'SS-121-R', sourceInstanceId: 'src121', sourceMissionIndex: 0,
      effectType: 'DUEL' as const, effectDescription: JSON.stringify({ sourceInstanceId: 'src121' }),
      targetSelectionType: 'SS121_MOVE_STACK', sourcePlayer: 'player1' as const,
      requiresTargetSelection: true, validTargets: ['1'], isOptional: true, resolved: false, isUpgrade: false,
    };
    const after = EffectEngine.applyTargetedEffect(state, pendingEffect as never, ['1']);
    expect(after.activeMissions[0].player1Characters[0].stack.length).toBe(1);
    expect(after.activeMissions[1].player1Characters.length).toBe(1);
    expect(after.activeMissions[1].player1Characters[0].stack[0].id).toBe('KS-108-R');
  });
});

describe('SS-112-SPV Neji Hyuga', () => {
  it('DUEL Hinata: hides a non-hidden enemy without Power tokens (when Hinata present)', () => {
    const neji = ss('SS-112-SPV', 112, [
      { type: 'UPGRADE', description: '[↯] Remove all Power tokens from an enemy character in this mission.' },
      { type: 'DUEL', description: '[↯] DUEL Hinata Hyuga: Hide an enemy character without Power tokens in this mission.' },
    ], {}, { name_fr: 'NEJI HYUGA', name_en: 'NEJI HYUGA' });
    const hinata = mockCharInPlay({ instanceId: 'hina', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'HINATA HYUGA', name_en: 'HINATA HYUGA', power: 4 });
    const noTokens = mockCharInPlay({ instanceId: 'e-clean', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY A', power: 3 });
    const withTokens = mockCharInPlay({ instanceId: 'e-tok', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2', powerTokens: 2 }, { name_fr: 'ENEMY B', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([neji, hinata], [noTokens, withTokens])] }) as GameState;
    let after = EffectEngine.resolvePlayEffects(state, 'player1', neji, 0, false);
    const confirm = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS112_CONFIRM_DUEL');
    expect(confirm).toBeTruthy();
    after = EffectEngine.applyTargetedEffect(after, confirm as never, confirm!.validTargets);
    const pending = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS120_HIDE');
    expect(pending).toBeTruthy();
    expect(pending!.validTargets).toContain('e-clean');
    expect(pending!.validTargets).not.toContain('e-tok');
    const done = EffectEngine.applyTargetedEffect(after, pending as never, ['e-clean']);
    const hidden = done.activeMissions[0].player2Characters.find((c) => c.instanceId === 'e-clean');
    expect(hidden?.isHidden).toBe(true);
  });

  it('DUEL Hinata does nothing when Hinata is absent', () => {
    const neji = ss('SS-112-SPV', 112, [
      { type: 'DUEL', description: '[↯] DUEL Hinata Hyuga: Hide an enemy character without Power tokens in this mission.' },
    ], {}, { name_fr: 'NEJI HYUGA', name_en: 'NEJI HYUGA' });
    const enemy = mockCharInPlay({ instanceId: 'e1', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY A', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([neji], [enemy])] }) as GameState;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', neji, 0, false);
    expect(after.pendingEffects?.some((e) => e.targetSelectionType === 'SS112_CONFIRM_DUEL' || e.targetSelectionType === 'SS120_HIDE')).toBe(false);
    expect(after.activeMissions[0].player2Characters[0].isHidden).toBe(false);
  });

  it('UPGRADE: removes all Power tokens from a chosen enemy with tokens', () => {
    const neji = ss('SS-112-SPV', 112, [
      { type: 'UPGRADE', description: '[↯] Remove all Power tokens from an enemy character in this mission.' },
      { type: 'DUEL', description: '[↯] DUEL Hinata Hyuga: Hide an enemy character without Power tokens in this mission.' },
    ], {}, { name_fr: 'NEJI HYUGA', name_en: 'NEJI HYUGA' });
    const withTokens = mockCharInPlay({ instanceId: 'e-tok', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2', powerTokens: 3 }, { name_fr: 'ENEMY B', power: 3 });
    const noTokens = mockCharInPlay({ instanceId: 'e-clean', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENEMY A', power: 3 });
    const state = createActionPhaseState({ activeMissions: [m([neji], [withTokens, noTokens])] }) as GameState;
    let after = EffectEngine.resolvePlayEffects(state, 'player1', neji, 0, true);
    const confirm = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS112_CONFIRM_UPGRADE');
    expect(confirm).toBeTruthy();
    after = EffectEngine.applyTargetedEffect(after, confirm as never, confirm!.validTargets);
    const pending = after.pendingEffects?.find((e) => e.targetSelectionType === 'SS112_REMOVE_TOKENS');
    expect(pending).toBeTruthy();
    expect(pending!.validTargets).toContain('e-tok');
    expect(pending!.validTargets).not.toContain('e-clean');
    const done = EffectEngine.applyTargetedEffect(after, pending as never, ['e-tok']);
    const cleared = done.activeMissions[0].player2Characters.find((c) => c.instanceId === 'e-tok');
    expect(cleared?.powerTokens).toBe(0);
  });
});
