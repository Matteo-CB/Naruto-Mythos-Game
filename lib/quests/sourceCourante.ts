// La carte dont l effet est en train de se resoudre. Les utilitaires centraux (defaite,
// dissimulation, deplacement, retrait de jetons, copie) s en servent pour annoncer QUI a
// agi, sans que chaque carte ait a le declarer. Une carte ajoutee demain est donc couverte
// sans y penser.
//
// La pile est synchrone: un effet peut en resoudre un autre, le sommet est toujours l effet
// en cours. Rien ne traverse une frontiere asynchrone, le moteur etant purement synchrone.

export interface SourceDEffet {
  cardId: string;
  name?: string;
  // Le camp qui a joue la carte. Une carte qui force l adversaire a abattre un des siens
  // agit toujours au benefice de celui qui l a posee.
  player?: 'player1' | 'player2';
}

const pile: SourceDEffet[] = [];

export function avecSource<T>(source: SourceDEffet | null, action: () => T): T {
  if (!source?.cardId) return action();
  pile.push(source);
  try {
    return action();
  } finally {
    pile.pop();
  }
}

export function sourceCourante(): SourceDEffet | null {
  return pile.length > 0 ? pile[pile.length - 1] : null;
}

export function viderLesSources(): void {
  pile.length = 0;
}

// Les champs a joindre a un signal pour qu il nomme sa source. Vide quand aucun effet n est
// en cours, par exemple pour une defaite provoquee par une regle et non par une carte.
export function champsDeLaSource(): Record<string, unknown> {
  const s = sourceCourante();
  if (!s) return {};
  return {
    sourceCardId: s.cardId,
    ...(s.name ? { sourceName: s.name } : {}),
  };
}
