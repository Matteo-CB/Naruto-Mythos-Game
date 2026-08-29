import type { QuestEventPayload } from './hooks';

const MANCHES_PAR_PARTIE = 4;

interface Suivi {
  parManche: Map<number, Set<string>>;
  vusDansLaPartie: Set<string>;
}

const suivis = new Map<string, Suivi>();

function cle(hook: string, userId: string, matchKey: string): string {
  return `${hook}|${userId}|${matchKey}`;
}

export function reinitialiserAgregats(): void {
  suivis.clear();
}

export function enrichirDesAgregats(
  hook: string,
  userId: string,
  payload: QuestEventPayload | undefined,
): QuestEventPayload | undefined {
  if (!payload) return payload;
  const matchKey = typeof payload.matchKey === 'string' ? payload.matchKey : null;
  const manche = Number(payload.round);
  const source = payload.sourceNumber ?? payload.distinctKey ?? payload.sourceName;
  if (!matchKey || !Number.isFinite(manche) || source === undefined || source === null) return payload;

  const identifiant = String(source);
  const k = cle(hook, userId, matchKey);
  let suivi = suivis.get(k);
  if (!suivi) {
    suivi = { parManche: new Map(), vusDansLaPartie: new Set() };
    suivis.set(k, suivi);
  }

  const deLaManche = suivi.parManche.get(manche) ?? new Set<string>();
  deLaManche.add(identifiant);
  suivi.parManche.set(manche, deLaManche);
  suivi.vusDansLaPartie.add(identifiant);

  const manchesServies = [...suivi.parManche.values()].filter((s) => s.size > 0).length;

  return {
    ...payload,
    sameRound: deLaManche.size,
    everyRound: Math.min(manchesServies, MANCHES_PAR_PARTIE),
    pairNumbers: payload.pairNumbers ?? [...suivi.vusDansLaPartie],
  };
}
