import type { GameState, PendingAction, PlayerID, GameAction } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { SimScenario } from '@/lib/cards/sim/scenarios';

function defaultChoice(pending: PendingAction): string[] {
  const options = pending.options ?? [];
  const min = Math.max(1, pending.minSelections ?? 1);
  const allNumeric = options.length > 0 && options.every((o) => /^\d+$/.test(o));
  if (allNumeric && min === 1) {
    const max = options.reduce((a, b) => (parseInt(b, 10) > parseInt(a, 10) ? b : a), options[0]);
    return [max];
  }
  return options.slice(0, min);
}

export function runScenario(scenario: SimScenario): GameState[] {
  let state = scenario.build();
  const states: GameState[] = [state];

  const applyAndResolve = (player: PlayerID, action: GameAction) => {
    state = GameEngine.applyAction(state, player, action);
    states.push(state);
    let guard = 0;
    while (state.pendingActions.length > 0 && guard++ < 40) {
      const pending = state.pendingActions[0];
      const targets = scenario.choose ? scenario.choose(state, pending) : defaultChoice(pending);
      if (!targets || targets.length === 0) break;
      state = GameEngine.applyAction(state, pending.player, {
        type: 'SELECT_TARGET',
        pendingActionId: pending.id,
        selectedTargets: targets,
      });
      states.push(state);
    }
  };

  applyAndResolve(scenario.play.player, scenario.play.action);
  for (const f of scenario.followups ?? []) applyAndResolve(f.player, f.action);

  return states;
}
