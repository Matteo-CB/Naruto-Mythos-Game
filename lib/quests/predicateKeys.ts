import type { QuestEventPayload } from './hooks';

export const CLES_SEUIL_GTE: ReadonlySet<string> = new Set(['streak', 'threshold', 'minPrinted', 'depth', 'tier', 'power', 'tokens']);
export const CLES_SEUIL_LTE: ReadonlySet<string> = new Set(['maxRound']);

export const CLES_AU_MOINS: ReadonlyMap<string, string> = new Map([
  ['deckSetCountAtLeast', 'deckSetCount'],
  ['attachmentsPlacedAtLeast', 'attachmentsPlaced'],
  ['duelsTriggeredAtLeast', 'duelsTriggered'],
  ['firstStrikesUsedAtLeast', 'firstStrikesUsed'],
]);

export const CLES_AU_PLUS: ReadonlyMap<string, string> = new Map([
  ['attachmentsPlacedAtMost', 'attachmentsPlaced'],
]);

export const CLES_APPARTENANCE_DANS_LE_SIGNAL: ReadonlyMap<string, string> = new Map([
  ['attachmentNumber', 'missionAttachments'],
]);

export const CLES_PLUSIEURS_SOURCES: ReadonlyMap<string, string> = new Map([
  ['sourceNumbers', 'sourceNumber'],
]);

export const CLES_ATTEINTES: ReadonlySet<string> = new Set(['sameRound', 'everyRound', 'simultaneous', 'threshold']);

export const CLE_DISTINCT = 'distinct';

export const CLE_PAIRE = 'pairNumbers';

export const TOUTES_LES_CLES: ReadonlySet<string> = new Set([
  ...CLES_SEUIL_GTE, ...CLES_SEUIL_LTE,
  ...CLES_APPARTENANCE_DANS_LE_SIGNAL.keys(),
  ...CLES_PLUSIEURS_SOURCES.keys(),
  ...CLES_ATTEINTES,
  CLE_DISTINCT, CLE_PAIRE,
  ...CLES_AU_MOINS.keys(), ...CLES_AU_PLUS.keys(),
  'set', 'sourceNumber', 'sourceName', 'keyword', 'group', 'missionNumber',
  'attachTo', 'stolen', 'power', 'tokens', 'difficulty', 'name', 'count',
  'deckSet', 'deckHasAttachment', 'monoGroup', 'missionsWonLastRound',
  'deckNumbers', 'tournamentUndefeated', 'names', 'rank', 'rarity', 'friendly',
]);

function nombres(valeur: unknown): number[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

export function appartenanceSatisfaite(
  cle: string,
  attendu: unknown,
  payload: QuestEventPayload,
): boolean | null {
  const champ = CLES_APPARTENANCE_DANS_LE_SIGNAL.get(cle);
  if (!champ) return null;
  return nombres(payload[champ]).includes(Number(attendu));
}

export function plusieursSourcesSatisfaites(
  cle: string,
  attendu: unknown,
  payload: QuestEventPayload,
): boolean | null {
  const champ = CLES_PLUSIEURS_SOURCES.get(cle);
  if (!champ) return null;
  return nombres(attendu).includes(Number(payload[champ]));
}

export function comparaisonDeFait(
  cle: string,
  attendu: unknown,
  payload: QuestEventPayload,
): boolean | null {
  const auMoins = CLES_AU_MOINS.get(cle);
  if (auMoins) {
    const reel = Number(payload[auMoins]);
    return Number.isFinite(reel) && reel >= Number(attendu);
  }
  const auPlus = CLES_AU_PLUS.get(cle);
  if (auPlus) {
    const reel = Number(payload[auPlus]);
    return Number.isFinite(reel) && reel <= Number(attendu);
  }
  return null;
}

export function paireReunie(attendu: unknown, payload: QuestEventPayload): boolean {
  const demandes = nombres(attendu);
  if (demandes.length === 0) return false;
  const presents = new Set(nombres(payload.pairNumbers ?? payload.numbers));
  return demandes.every((n) => presents.has(n));
}

export function compteAtteint(
  predicate: Record<string, unknown>,
  payload: QuestEventPayload,
): number | null {
  for (const cle of CLES_ATTEINTES) {
    if (predicate[cle] !== true) continue;
    const valeur = Number(payload[cle]);
    if (!Number.isFinite(valeur)) return 0;
    return valeur;
  }
  return null;
}
