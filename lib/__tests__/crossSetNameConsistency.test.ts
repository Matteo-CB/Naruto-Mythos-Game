import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getAllCards } from '@/lib/data/cardLoader';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';

describe('cross-set character name consistency', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('every character sharing a name_en has exactly one name_fr spelling across all sets', () => {
    const byEn = new Map<string, Set<string>>();
    for (const c of getAllCards()) {
      if (c.card_type !== 'character') continue;
      const en = (c.name_en ?? c.name_fr ?? '').toUpperCase().trim();
      if (!en) continue;
      const set = byEn.get(en) ?? new Set<string>();
      set.add((c.name_fr ?? '').toUpperCase().trim());
      byEn.set(en, set);
    }
    const conflicts = [...byEn.entries()].filter(([, frs]) => frs.size > 1);
    expect(conflicts.map(([en, frs]) => `${en}: ${[...frs].join(' / ')}`)).toEqual([]);
  });

  it('every character sharing a name_en has one spelling per locale across all sets', () => {
    const locales = ['fr', 'es', 'ja', 'pt', 'it', 'pl'] as const;
    const conflicts: string[] = [];
    for (const locale of locales) {
      const byEn = new Map<string, Set<string>>();
      for (const c of getAllCards()) {
        if (c.card_type !== 'character') continue;
        const en = (c.name_en ?? c.name_fr ?? '').toUpperCase().trim();
        const traduit = ((c as unknown as Record<string, string>)[`name_${locale}`] ?? '').trim();
        if (!en || !traduit) continue;
        const set = byEn.get(en) ?? new Set<string>();
        set.add(traduit.toUpperCase());
        byEn.set(en, set);
      }
      for (const [en, noms] of byEn.entries()) {
        if (noms.size > 1) conflicts.push(`${locale} ${en}: ${[...noms].join(' / ')}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('SS-126-SPV Sasuke upgrades over a KS Sasuke (cross-set same name)', () => {
    const st = buildSimState({
      hand1: ['SS-126-SPV'],
      p1: [simChar('KS-013-C', { owner: 'player1', instanceId: 'sasuke-base' })],
      p2: [],
      missions: 2,
      chakra1: 10,
    });
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'sasuke-base',
    });
    const char = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'sasuke-base');
    expect(char).toBeTruthy();
    expect(char!.stack.length).toBe(2);
    expect(char!.stack[char!.stack.length - 1].id).toBe('SS-126-SPV');
  });

  it('SS-112-SPV Neji upgrades over a KS Neji (accent-aligned name)', () => {
    const st = buildSimState({
      hand1: ['SS-112-SPV'],
      p1: [simChar('KS-036-C', { owner: 'player1', instanceId: 'neji-base' })],
      p2: [],
      missions: 2,
      chakra1: 10,
    });
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'neji-base',
    });
    const char = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'neji-base');
    expect(char).toBeTruthy();
    expect(char!.stack.length).toBe(2);
    expect(char!.stack[char!.stack.length - 1].id).toBe('SS-112-SPV');
  });

  it('playing SS-126-SPV onto a mission with a visible KS Sasuke merges as an upgrade, never a duplicate', () => {
    const st = buildSimState({
      hand1: ['SS-126-SPV'],
      p1: [simChar('KS-013-C', { owner: 'player1', instanceId: 'sasuke-base' })],
      p2: [],
      missions: 2,
      chakra1: 10,
    });
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });
    expect(s.activeMissions[0].player1Characters.length).toBe(1);
    const char = s.activeMissions[0].player1Characters[0];
    expect(char.stack.length).toBe(2);
    expect(char.stack[char.stack.length - 1].id).toBe('SS-126-SPV');
  });

  it('No Repetition still blocks a same-name play that cannot upgrade (cost not strictly higher)', () => {
    const st = buildSimState({
      hand1: ['KS-013-C'],
      p1: [simChar('SS-126-SPV', { owner: 'player1', instanceId: 'sasuke-top' })],
      p2: [],
      missions: 2,
      chakra1: 10,
    });
    const s = GameEngine.applyAction(st, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });
    expect(s.activeMissions[0].player1Characters.length).toBe(1);
    expect(s.activeMissions[0].player1Characters[0].stack.length).toBeLessThanOrEqual(1);
    expect(s.player1.hand.length).toBe(1);
  });
});
