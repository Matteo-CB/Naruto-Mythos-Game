
export interface SourceDEffet {
  cardId: string;
  name?: string;
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

export function champsDeLaSource(): Record<string, unknown> {
  const s = sourceCourante();
  if (!s) return {};
  return {
    sourceCardId: s.cardId,
    ...(s.name ? { sourceName: s.name } : {}),
  };
}
