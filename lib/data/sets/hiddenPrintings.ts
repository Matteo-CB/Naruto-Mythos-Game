export const HIDDEN_PRINTING_IDS: readonly string[] = [
  'SS-111-RA',
  'SS-112-RA',
  'SS-113-RA',
  'SS-114-RA',
  'SS-114-SPV',
  'SS-115-RA',
  'SS-115-SPV',
  'SS-116-RA',
  'SS-117-RA',
  'SS-118-RA',
  'SS-118-SHINOBIV',
  'SS-119-RA',
  'SS-119-SHINOBIV',
  'SS-120-RA',
  'SS-120-SHINOBIV',
  'SS-121-RA',
  'SS-121-SHINOBIV',
  'SS-121_2-SPV',
  'SS-122-CHIBIV',
  'SS-122-RA',
  'SS-123-POPV',
  'SS-123-RA',
  'SS-124-RA',
  'SS-125-RA',
  'SS-126-POPV',
  'SS-126-RA',
  'SS-128-RA',
  'SS-129-RA',
  'SS-130-RA',
  'SS-131-RA',
  'SS-133-RA',
  'SS-134-RA',
  'SS-135-RA',
  'SS-136-RA',
  'SS-137-RA',
  'SS-137-SPV',
  'SS-140-RA',
  'SS-141-SPV',
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
