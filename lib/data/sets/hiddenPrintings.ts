export const HIDDEN_PRINTING_IDS: readonly string[] = [
  'SS-122-CHIBIV',
  'SS-140-CHIBIV',
];

const HIDDEN = new Set(HIDDEN_PRINTING_IDS);

export function isHiddenPrinting(cardId: string | null | undefined): boolean {
  return !!cardId && HIDDEN.has(cardId);
}

export function stripHiddenPrintings<T>(entries: Record<string, T>): Record<string, T> {
  const sortie: Record<string, T> = {};
  for (const [id, valeur] of Object.entries(entries)) {
    if (HIDDEN.has(id)) continue;
    sortie[id] = valeur;
  }
  return sortie;
}
