import type { CharacterInPlay, GameState, PlayerID } from '../types';

export function marquerCoutReduit<T extends CharacterInPlay>(
  char: T,
  coutEffectif: number,
  coutImprime: number,
): T {
  return { ...char, playedBelowPrintedCost: coutEffectif < coutImprime };
}

export function avecJoueCeTour(ids: string[] | undefined, instanceId: string): string[] {
  const liste = ids ?? [];
  return liste.includes(instanceId) ? liste : [...liste, instanceId];
}

export function idsJouesAuTourPrecedent(state: GameState, player: PlayerID): string[] {
  return state.lastTurnPlayedIds?.[player] ?? [];
}

export function archiverTourPrecedent(state: GameState, joueur: PlayerID): GameState {
  const precedent = state.lastActionPlayer;
  const archive = state.lastTurnPlayedIds ?? { player1: [], player2: [] };
  return {
    ...state,
    lastTurnPlayedIds: precedent
      ? { ...archive, [precedent]: state.turnPlayedIds ?? [] }
      : archive,
    lastActionPlayer: joueur,
  };
}

function etatDesPersonnages(state: GameState): Map<string, boolean> {
  const carte = new Map<string, boolean>();
  for (const mission of state.activeMissions ?? []) {
    for (const c of mission.player1Characters ?? []) carte.set(c.instanceId, c.isHidden);
    for (const c of mission.player2Characters ?? []) carte.set(c.instanceId, c.isHidden);
  }
  return carte;
}

export function suivreEntreesEnJeu(avant: GameState, apres: GameState): GameState {
  const etatAvant = etatDesPersonnages(avant);
  let ids = apres.turnPlayedIds;
  let modifie = false;

  for (const mission of apres.activeMissions ?? []) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side] ?? []) {
        const etaitLa = etatAvant.get(c.instanceId);
        const vientDArriver = etaitLa === undefined;
        const vientDEtreRevele = etaitLa === true && !c.isHidden;
        if (!vientDArriver && !vientDEtreRevele) continue;
        const suivant = avecJoueCeTour(ids, c.instanceId);
        if (suivant !== ids) { ids = suivant; modifie = true; }
      }
    }
  }

  return modifie ? { ...apres, turnPlayedIds: ids } : apres;
}

export function reparerPilesVides(state: GameState): GameState {
  let modifie = false;
  const missions = (state.activeMissions ?? []).map((mission) => {
    const reparerCote = (liste: CharacterInPlay[] | undefined) => {
      if (!liste) return liste;
      return liste.map((c) => {
        if ((c.stack?.length ?? 0) > 0 || !c.card) return c;
        modifie = true;
        return { ...c, stack: [c.card] };
      });
    };
    return {
      ...mission,
      player1Characters: reparerCote(mission.player1Characters) as CharacterInPlay[],
      player2Characters: reparerCote(mission.player2Characters) as CharacterInPlay[],
    };
  });
  return modifie ? { ...state, activeMissions: missions } : state;
}
