import { describe, it } from 'vitest';
import { getAllCards } from '@/lib/data/cardLoader';
import { getScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import type { GameState } from '@/lib/engine/types';

const HANDLED = ['MAIN', 'AMBUSH', 'UPGRADE', 'SCORE', 'DUEL', 'FIRST_STRIKE'];

function realLogCount(state: GameState): number {
  return state.log.filter((l) => {
    const a = String((l as { action?: string }).action ?? '');
    return a.startsWith('EFFECT') && a !== 'EFFECT_NO_TARGET' && a !== 'EFFECT_CONTINUOUS'
      && a !== 'EFFECT_SKIP' && a !== 'EFFECT_BLOCKED';
  }).length;
}

function powerMap(state: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const owner = side === 'player1Characters' ? 'player1' : 'player2';
      for (const c of mission[side]) {
        let p = 0;
        try { p = calculateCharacterPower(state, c, owner); } catch { p = 0; }
        m.set(c.instanceId, p);
      }
    }
  }
  return m;
}

function powerChanged(first: GameState, last: GameState): boolean {
  const before = powerMap(first);
  const after = powerMap(last);
  for (const [id, value] of after) {
    if (before.has(id) && before.get(id) !== value) return true;
  }
  return false;
}

function visibleFingerprint(state: GameState): string {
  const parts: string[] = [state.edgeHolder ?? '', String(state.phase), String(state.turn)];
  for (const side of ['player1', 'player2'] as const) {
    const p = state[side];
    parts.push(`${p.chakra}/${p.hand.length}/${p.deck.length}/${p.discardPile.length}/${p.missionPoints}`);
  }
  for (const mission of state.activeMissions) {
    parts.push(String(mission.wonBy ?? '-'));
    for (const key of ['player1Characters', 'player2Characters'] as const) {
      const owner = key === 'player1Characters' ? 'player1' : 'player2';
      for (const c of mission[key]) {
        let power = 0;
        try { power = calculateCharacterPower(state, c, owner); } catch { power = 0; }
        parts.push([
          c.instanceId, c.card.id, power, c.powerTokens, c.isHidden ? 'h' : 'v',
          c.controlledBy, (c.stack ?? []).length, (c.attachments ?? []).length,
        ].join(':'));
      }
    }
  }
  return parts.join('|');
}

function boardChanged(first: GameState, last: GameState): boolean {
  return visibleFingerprint(first) !== visibleFingerprint(last);
}

interface Row { total: number; scenario: number; fires: number; pending: number }

describe('audit: how much of each card effect the simulation actually shows', () => {
  it('reports coverage per effect, not per card', () => {
    const stats = new Map<string, Row>();
    const missing: string[] = [];
    const silent: string[] = [];

    for (const card of getAllCards()) {
      const effects = card.effects ?? [];

      effects.forEach((effect, index) => {
        if (!HANDLED.includes(effect.type)) return;

        let fired = false;
        let leftPending = false;
        let hasScenario = false;
        try {
          const scenario = getScenario(card.id, index);
          hasScenario = !!scenario;
          if (scenario) {
            const states = runScenario(scenario);
            const last = states[states.length - 1];
            leftPending = last.pendingActions.length > 0;
            fired = realLogCount(last) > realLogCount(states[0]) || powerChanged(states[0], last) || boardChanged(states[0], last);
          }
        } catch {}

        const continuous = effect.description.includes('[⧗]');
        const key = continuous ? `${effect.type} [continu]` : effect.type;
        const entry = stats.get(key) ?? { total: 0, scenario: 0, fires: 0, pending: 0 };
        entry.total += 1;
        if (hasScenario) entry.scenario += 1;
        if (fired) entry.fires += 1;
        if (leftPending) entry.pending += 1;
        stats.set(key, entry);
        if (!hasScenario) missing.push(`${card.id}#${index} ${effect.type}`);
        else if (!fired) silent.push(`${card.id}#${index} ${effect.type}`);
      });
    }

    const rows = [...stats.entries()].sort((a, b) => b[1].total - a[1].total);
    console.log('\n  type                     total  scenario  demontre  bloque');
    for (const [key, s] of rows) {
      console.log(`  ${key.padEnd(22)} ${String(s.total).padStart(5)} ${String(s.scenario).padStart(9)} ${String(s.fires).padStart(9)} ${String(s.pending).padStart(7)}`);
    }
    console.log(`\n  sans scenario du tout : ${missing.length}`);
    for (const m of missing) console.log(`    ${m}`);
    console.log(`\n  scenario mais rien de visible : ${silent.length}`);
    for (const m of silent) console.log(`    ${m}`);
  }, 180000);
});
