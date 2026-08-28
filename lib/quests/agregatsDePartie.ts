import type { QuestEventPayload } from './hooks';

// Le moteur annonce un fait brut avec sa manche. Les quetes qui parlent de « deux DUELS
// dans la meme manche », « un DUEL a chacune des quatre manches » ou « cinq DUELS
// differents dans la partie » se deduisent ici, pour que le moteur ignore tout des quetes.

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

// Rend le signal enrichi, ou null si le fait ne se prete pas a un agregat de partie.
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
  };
}
