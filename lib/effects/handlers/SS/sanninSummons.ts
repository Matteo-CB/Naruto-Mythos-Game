import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';

export interface InvocationSannin {
  id: string;
  nom: string;
  maitre: string;
  gain: 'chakra' | 'draw' | 'powerup';
  montant: number;
}

export const INVOCATIONS: InvocationSannin[] = [
  { id: 'SS-142-S', nom: 'KATSUYU', maitre: 'TSUNADE', gain: 'chakra', montant: 1 },
  { id: 'SS-143-S', nom: 'GAMABUNTA', maitre: 'JIRAIYA', gain: 'draw', montant: 1 },
  { id: 'SS-146-S', nom: 'MANDA', maitre: 'OROCHIMARU', gain: 'powerup', montant: 2 },
];

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function porteLeNom(char: CharacterInPlay, nom: string): boolean {
  if (char.isHidden) return false;
  const top = topOf(char);
  return `${top.name_fr ?? ''} ${top.name_en ?? ''}`.toUpperCase().includes(nom);
}

export function maitresEnJeu(state: GameState, player: PlayerID, maitre: string): number {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  let total = 0;
  for (const mission of state.activeMissions) {
    for (const c of mission[side]) if (porteLeNom(c, maitre)) total += 1;
  }
  return total;
}

export function maitrePresentDansMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  maitre: string,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return mission[side].some((c) => porteLeNom(c, maitre));
}

function invocationHandler(invocation: InvocationSannin) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard } = ctx;
    const compte = maitresEnJeu(state, sourcePlayer, invocation.maitre);

    if (compte === 0) {
      return {
        state: {
          ...state,
          log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
            `${invocation.nom} (${invocation.id}): no friendly ${invocation.maitre} in play.`,
            'game.log.effect.noTarget', { card: invocation.nom, id: invocation.id }),
        },
      };
    }

    const total = compte * invocation.montant;

    if (invocation.gain === 'chakra') {
      return {
        state: {
          ...state,
          [sourcePlayer]: { ...state[sourcePlayer], chakra: state[sourcePlayer].chakra + total },
          log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_CHAKRA',
            `${invocation.nom} (${invocation.id}): ${total} Chakra gained.`,
            'game.log.effect.ssSummonChakra',
            { card: invocation.nom, id: invocation.id, amount: String(total) }),
        },
      };
    }

    if (invocation.gain === 'draw') {
      const deck = state[sourcePlayer].deck;
      const tirees = deck.slice(0, total);
      if (tirees.length === 0) {
        return {
          state: {
            ...state,
            log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
              `${invocation.nom} (${invocation.id}): the deck is empty.`,
              'game.log.effect.noTarget', { card: invocation.nom, id: invocation.id }),
          },
        };
      }
      return {
        state: {
          ...state,
          [sourcePlayer]: {
            ...state[sourcePlayer],
            deck: deck.slice(tirees.length),
            hand: [...state[sourcePlayer].hand, ...tirees],
          },
          log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_DRAW',
            `${invocation.nom} (${invocation.id}): ${tirees.length} card(s) drawn.`,
            'game.log.effect.draw',
            { card: invocation.nom, id: invocation.id, amount: String(tirees.length) }),
        },
      };
    }

    const missions = state.activeMissions.map((m) => ({
      ...m,
      player1Characters: m.player1Characters.map((c) => c.instanceId === sourceCard.instanceId
        ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(state, c.instanceId, total) } : c),
      player2Characters: m.player2Characters.map((c) => c.instanceId === sourceCard.instanceId
        ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(state, c.instanceId, total) } : c),
    }));
    return {
      state: {
        ...state,
        activeMissions: missions,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_POWERUP',
          `${invocation.nom} (${invocation.id}): POWERUP ${total}.`,
          'game.log.effect.powerup',
          { card: invocation.nom, id: invocation.id, amount: String(total), target: invocation.nom }),
      },
    };
  };
}

export function invocationDoitRentrer(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
  missionIndex: number,
): boolean {
  const top = topOf(char);
  const invocation = INVOCATIONS.find((i) => i.id === top.id
    || (String(top.set) === 'SS' && Number(top.number) === Number(i.id.split('-')[1])));
  if (!invocation) return true;
  return !maitrePresentDansMission(state, player, missionIndex, invocation.maitre);
}

export function registerSanninSummonHandlers(): void {
  for (const invocation of INVOCATIONS) {
    registerEffect(invocation.id, 'MAIN', invocationHandler(invocation));
  }
}
