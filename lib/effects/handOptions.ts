import type { GameState, PendingAction, PendingEffect, PlayerID } from '@/lib/engine/types';

export type CampDeLaMain = 'source' | 'adversaire';

export const SELECTIONS_SUR_TOUTE_LA_MAIN: Record<string, CampDeLaMain> = {
  SS139_DISCARD: 'source',
  SAKURA_012_DISCARD: 'source',
  ASUMA_024_DISCARD_FOR_POWERUP: 'source',
  KABUTO053_CHOOSE_DISCARD: 'source',
  KIMIMARO_CHOOSE_DISCARD: 'source',
  KIMIMARO056_CHOOSE_DISCARD: 'source',
  KIN073_CHOOSE_DISCARD: 'source',
  CHOJI_CHOOSE_DISCARD: 'source',
  NARUTO141_CHOOSE_DISCARD: 'source',
  SASUKE142_CHOOSE_DISCARD: 'source',
  ASUMA113B_CHOOSE_DISCARD: 'source',
  GUY119B_CHOOSE_DISCARD: 'source',
  PUT_CARD_ON_DECK: 'source',
  SS113_CHOOSE_DISCARD: 'adversaire',
};

function campVise(effet: PendingEffect): PlayerID | null {
  const camp = SELECTIONS_SUR_TOUTE_LA_MAIN[effet.targetSelectionType ?? ''];
  if (!camp) return null;
  if (camp === 'source') return effet.sourcePlayer;
  return effet.sourcePlayer === 'player1' ? 'player2' : 'player1';
}

export function resynchroniserLesOptionsDeMain(state: GameState): GameState {
  if (state.pendingEffects.length === 0) return state;

  const attendues = new Map<string, string[]>();
  let change = false;

  const effets = state.pendingEffects.map((effet) => {
    const joueur = campVise(effet);
    if (!joueur) return effet;
    const main = state[joueur].hand;
    const options = main.map((_, index) => String(index));
    attendues.set(effet.id, options);
    if (effet.validTargets?.length === options.length) return effet;
    change = true;
    return { ...effet, validTargets: options };
  });

  if (!change) return state;

  const actions = state.pendingActions.map((action: PendingAction) => {
    const options = action.sourceEffectId ? attendues.get(action.sourceEffectId) : undefined;
    if (!options || action.options?.length === options.length) return action;
    return { ...action, options };
  });

  return { ...state, pendingEffects: effets, pendingActions: actions };
}
