import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

const INO = 'SS-124-SHINOBIV';

const inoEffects = [
  { type: 'DUEL' as const, description: "[↯] DUEL Sakura Haruno: Take control of an enemy character of Power lower than the Sakura Haruno's Power." },
  { type: 'UPGRADE' as const, description: '[↯] Move a controlled character from this mission.' },
];

function twoMissionState(): GameState {
  const s = createActionPhaseState();
  s.activeMissions = [
    { card: mockMission({ basePoints: 3 }), rank: 'D', basePoints: 3, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null },
    { card: mockMission({ basePoints: 4 }), rank: 'C', basePoints: 4, rankBonus: 2, player1Characters: [], player2Characters: [], wonBy: null },
  ];
  return s;
}

function ino(instanceId: string): CharacterInPlay {
  return mockCharInPlay({ instanceId, controlledBy: 'player1', originalOwner: 'player1' },
    { id: INO, set: 'SS', number: 124, name_fr: 'INO YAMANAKA', name_en: 'INO YAMANAKA', chakra: 6, power: 2, effects: inoEffects });
}

beforeAll(() => registerAllSetHandlers());

describe('Ino 124 DUEL', () => {
  it('targets every enemy weaker than the strongest Sakura, including hidden ones', () => {
    const s = twoMissionState();
    const source = ino('ino');
    const sakuraWeak = mockCharInPlay({ instanceId: 'sk1' }, { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power: 2 });
    const sakuraStrong = mockCharInPlay({ instanceId: 'sk2', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power: 5 });
    const weakEnemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'FAIBLE', power: 4 });
    const strongEnemy = mockCharInPlay({ instanceId: 'e2', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'FORT', power: 6 });
    const hiddenEnemy = mockCharInPlay({ instanceId: 'e3', isHidden: true, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'CACHE', power: 9 });
    const sameName = mockCharInPlay({ instanceId: 'e4', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power: 1 });
    s.activeMissions[0].player1Characters = [source, sakuraWeak];
    s.activeMissions[0].player2Characters = [sakuraStrong, weakEnemy, strongEnemy, hiddenEnemy, sameName];

    const handler = getEffectHandler(INO, 'DUEL')!;
    expect(handler).toBeDefined();
    const res = handler({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, triggerType: 'DUEL', isUpgrade: false });
    expect(res.targetSelectionType).toBe('SS124_CONFIRM_DUEL');
    const relay = JSON.parse(res.description as string);
    expect(relay.nextType).toBe('SS124_TAKE_CONTROL');
    expect(relay.nextKey).toBe('game.effect.desc.ss124TakeControl');
    expect(new Set(relay.targets)).toEqual(new Set(['e1', 'e3', 'e4']));
    expect(res.state.log.length).toBe(0);
  });

  it('refuses with a log line when no enemy is weak enough', () => {
    const s = twoMissionState();
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, mockCharInPlay({ instanceId: 'sk' }, { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power: 1 })];
    s.activeMissions[0].player2Characters = [mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'FORT', power: 6 })];
    const res = getEffectHandler(INO, 'DUEL')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, triggerType: 'DUEL', isUpgrade: false });
    expect(res.requiresTargetSelection).toBeFalsy();
    expect(res.state.log.at(-1)?.messageKey).toBe('game.log.effect.noTarget');
    expect(res.state.log.at(-1)?.messageParams?.id).toBe(INO);
  });

  it('takes control through the central executor and logs the right card id', () => {
    const s = twoMissionState();
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, mockCharInPlay({ instanceId: 'sk' }, { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power: 5 })];
    s.activeMissions[0].player2Characters = [mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'FAIBLE', power: 1 })];
    const pending = {
      id: 'p', sourceCardId: INO, sourceInstanceId: 'ino', sourceMissionIndex: 0,
      effectType: 'DUEL' as const, effectDescription: '', targetSelectionType: 'SS124_TAKE_CONTROL',
      sourcePlayer: 'player1' as const, requiresTargetSelection: true, validTargets: ['e1'],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
    };
    s.pendingEffects = [pending];
    const out = EffectEngine.applyTargetedEffect(s, pending, ['e1']);
    const stolen = out.activeMissions[0].player1Characters.find((c) => c.instanceId === 'e1');
    expect(stolen).toBeDefined();
    expect(stolen!.controlledBy).toBe('player1');
    expect(stolen!.originalOwner).toBe('player2');
    expect(stolen!.controllerInstanceId).toBe('ino');
    const line = out.log.find((l) => l.messageKey === 'game.log.effect.takeControl');
    expect(line?.messageParams?.id).toBe(INO);
  });
});

describe('Ino 124 UPGRADE', () => {
  function controlledSetup() {
    const s = twoMissionState();
    const source = ino('ino');
    const controlled = mockCharInPlay({ instanceId: 'ctl', controlledBy: 'player1', originalOwner: 'player2' }, { name_fr: 'VOLE', power: 3 });
    const owned = mockCharInPlay({ instanceId: 'own' }, { name_fr: 'ALLIE', power: 3 });
    s.activeMissions[0].player1Characters = [source, controlled, owned];
    return { s, source };
  }

  it('offers only controlled characters of this mission', () => {
    const { s, source } = controlledSetup();
    const res = getEffectHandler(INO, 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, triggerType: 'UPGRADE', isUpgrade: true });
    expect(res.targetSelectionType).toBe('SS124_CONFIRM_UPGRADE');
    const relay = JSON.parse(res.description as string);
    expect(relay.nextType).toBe('SS124_MOVE_CONTROLLED');
    expect(relay.targets).toEqual(['ctl']);
  });

  it('refuses when the only destination would duplicate a name on my side', () => {
    const { s, source } = controlledSetup();
    s.activeMissions[1].player1Characters = [mockCharInPlay({ instanceId: 'dup', missionIndex: 1 }, { name_fr: 'VOLE', power: 1 })];
    const res = getEffectHandler(INO, 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, triggerType: 'UPGRADE', isUpgrade: true });
    expect(res.requiresTargetSelection).toBeFalsy();
    expect(res.state.log.at(-1)?.messageKey).toBe('game.log.effect.noTarget');
  });

  it('auto-resolves the move when a single destination is legal', () => {
    const { s } = controlledSetup();
    const pending = {
      id: 'p', sourceCardId: INO, sourceInstanceId: 'ino', sourceMissionIndex: 0,
      effectType: 'UPGRADE' as const, effectDescription: '', targetSelectionType: 'SS124_MOVE_CONTROLLED',
      sourcePlayer: 'player1' as const, requiresTargetSelection: true, validTargets: ['ctl'],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: true,
    };
    s.pendingEffects = [pending];
    const out = EffectEngine.applyTargetedEffect(s, pending, ['ctl']);
    expect(out.activeMissions[0].player1Characters.map((c) => c.instanceId)).not.toContain('ctl');
    const moved = out.activeMissions[1].player1Characters.find((c) => c.instanceId === 'ctl');
    expect(moved).toBeDefined();
    expect(moved!.controlledBy).toBe('player1');
    expect(moved!.originalOwner).toBe('player2');
    const line = out.log.find((l) => l.messageKey === 'game.log.effect.move');
    expect(line?.messageParams?.id).toBe(INO);
  });

  it('asks for a destination when several missions are legal', () => {
    const { s } = controlledSetup();
    s.activeMissions.push({ card: mockMission({ basePoints: 2 }), rank: 'B', basePoints: 2, rankBonus: 3, player1Characters: [], player2Characters: [], wonBy: null });
    const pending = {
      id: 'p', sourceCardId: INO, sourceInstanceId: 'ino', sourceMissionIndex: 0,
      effectType: 'UPGRADE' as const, effectDescription: '', targetSelectionType: 'SS124_MOVE_CONTROLLED',
      sourcePlayer: 'player1' as const, requiresTargetSelection: true, validTargets: ['ctl'],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: true,
    };
    s.pendingEffects = [pending];
    const out = EffectEngine.applyTargetedEffect(s, pending, ['ctl']);
    const next = out.pendingEffects.find((e) => e.targetSelectionType === 'SS_MOVE_DEST');
    expect(next).toBeDefined();
    expect(next!.validTargets).toEqual(['1', '2']);
    expect(JSON.parse(next!.effectDescription).srcId).toBe(INO);
    const out2 = EffectEngine.applyTargetedEffect(out, next!, ['2']);
    expect(out2.activeMissions[2].player1Characters.map((c) => c.instanceId)).toContain('ctl');
  });
});
