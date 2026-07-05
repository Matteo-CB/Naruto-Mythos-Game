import type { GameState } from '@/lib/engine/types';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import type { SimScenario } from '@/lib/cards/sim/scenarios';

function safeRun(scenario: SimScenario): GameState[] | null {
  try {
    const states = runScenario(scenario);
    if (states.length < 2) return null;
    if (states[states.length - 1].pendingActions.length > 0) return null;
    return states;
  } catch { return null; }
}

function affectedCount(state: GameState): number {
  let n = 0;
  for (const m of state.activeMissions) {
    for (const c of m.player1Characters) {
      const core = (c.card.power ?? 0) + c.powerTokens;
      if (!c.isHidden && calculateCharacterPower(state, c, 'player1') !== core) n++;
    }
    for (const c of m.player2Characters) {
      const core = (c.card.power ?? 0) + c.powerTokens;
      if (!c.isHidden && calculateCharacterPower(state, c, 'player2') !== core) n++;
    }
  }
  return n;
}

function signature(states: GameState[]): string {
  const first = states[0];
  const last = states[states.length - 1];
  const logs = last.log.slice(first.log.length)
    .filter((l) => !!l.messageKey)
    .map((l) => l.action ?? '')
    .sort()
    .join(',');
  const affected = affectedCount(last) > 0 ? '1' : '0';
  const res = [
    last.player1.chakra, last.player2.chakra,
    last.player1.missionPoints, last.player2.missionPoints,
    last.player1.hand.length, last.player1.deck.length, last.player1.discardPile.length,
    last.player2.hand.length, last.player2.deck.length, last.player2.discardPile.length,
  ].join(':');
  return `${logs}|${affected}|${res}`;
}

function boardCharIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const m of state.activeMissions) {
    for (const c of m.player1Characters) ids.push(c.instanceId);
    for (const c of m.player2Characters) ids.push(c.instanceId);
  }
  return ids;
}

function stripChars(state: GameState, removeIds: Set<string>): GameState {
  for (const m of state.activeMissions) {
    m.player1Characters = m.player1Characters.filter((c) => !removeIds.has(c.instanceId));
    m.player2Characters = m.player2Characters.filter((c) => !removeIds.has(c.instanceId));
  }
  state.player1.charactersInPlay = state.activeMissions.reduce((n, m) => n + m.player1Characters.length, 0);
  state.player2.charactersInPlay = state.activeMissions.reduce((n, m) => n + m.player2Characters.length, 0);
  return state;
}

export function minimizeScenario(scenario: SimScenario): SimScenario {
  const original = safeRun(scenario);
  if (!original) return scenario;
  const target = signature(original);

  const ids = boardCharIds(scenario.build());
  if (ids.length <= 2) return scenario;

  const removed = new Set<string>();
  for (const id of ids) {
    const trial = new Set(removed);
    trial.add(id);
    const trialScenario: SimScenario = { ...scenario, build: () => stripChars(scenario.build(), trial) };
    const res = safeRun(trialScenario);
    if (res && signature(res) === target) removed.add(id);
  }

  if (removed.size === 0) return scenario;
  return { ...scenario, build: () => stripChars(scenario.build(), removed) };
}
