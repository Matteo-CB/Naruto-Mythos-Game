import type { QuestEventPayload } from './hooks';

interface Faits {
  duelsTriggered: number;
  firstStrikesUsed: number;
  attachmentsPlaced: number;
  missionsWonByRound: Map<number, number>;
}

const faits = new Map<string, Faits>();

function cle(matchKey: string, userId: string): string {
  return `${matchKey}|${userId}`;
}

function obtenir(matchKey: string, userId: string): Faits {
  const k = cle(matchKey, userId);
  let f = faits.get(k);
  if (!f) {
    f = { duelsTriggered: 0, firstStrikesUsed: 0, attachmentsPlaced: 0, missionsWonByRound: new Map() };
    faits.set(k, f);
  }
  return f;
}

export function reinitialiserFaitsDePartie(): void {
  faits.clear();
}

export function oublierLaPartie(matchKey: string): void {
  for (const k of [...faits.keys()]) {
    if (k.startsWith(`${matchKey}|`)) faits.delete(k);
  }
}

const FAITS_PONCTUELS: ReadonlyMap<string, keyof Faits> = new Map([
  ['duel.triggered.with.source', 'duelsTriggered'],
  ['first_strike.used.with.source', 'firstStrikesUsed'],
]);

export function noterLeFait(hook: string, userId: string, payload: QuestEventPayload | undefined): void {
  const matchKey = typeof payload?.matchKey === 'string' ? payload.matchKey : null;
  if (!matchKey || !userId) return;

  const champ = FAITS_PONCTUELS.get(hook);
  if (champ) {
    const f = obtenir(matchKey, userId);
    (f[champ] as number) += 1;
    return;
  }

  if (hook === 'attachment.attached.with.source' && payload?.simultaneous === undefined) {
    obtenir(matchKey, userId).attachmentsPlaced += 1;
    return;
  }

  if (hook === 'mission.won') {
    const manche = Number(payload?.round);
    if (!Number.isFinite(manche)) return;
    const f = obtenir(matchKey, userId);
    f.missionsWonByRound.set(manche, (f.missionsWonByRound.get(manche) ?? 0) + 1);
  }
}

export interface ResumeDeLaPartie {
  duelsTriggered: number;
  firstStrikesUsed: number;
  attachmentsPlaced: number;
  missionsWonLastRound: number;
}

export function resumerLaPartie(matchKey: string, userId: string): ResumeDeLaPartie {
  const f = faits.get(cle(matchKey, userId));
  if (!f) {
    return { duelsTriggered: 0, firstStrikesUsed: 0, attachmentsPlaced: 0, missionsWonLastRound: 0 };
  }
  const derniere = [...f.missionsWonByRound.keys()].sort((a, b) => b - a)[0];
  return {
    duelsTriggered: f.duelsTriggered,
    firstStrikesUsed: f.firstStrikesUsed,
    attachmentsPlaced: f.attachmentsPlaced,
    missionsWonLastRound: derniere === undefined ? 0 : (f.missionsWonByRound.get(derniere) ?? 0),
  };
}
