import { QUESTS } from './questData';
import type { Quest } from './types';
import type { GameMode, QuestEventPayload } from './hooks';
import {
  CLES_SEUIL_GTE, CLES_SEUIL_LTE, CLE_DISTINCT, CLE_PAIRE,
  appartenanceSatisfaite, plusieursSourcesSatisfaites, paireReunie, compteAtteint,
  comparaisonDeFait,
} from './predicateKeys';

export interface MatchedQuest {
  quest: Quest;
  delta: number;
  distinctKey?: string;
}

function predicateMatches(
  predicate: Record<string, unknown> | undefined,
  payload: QuestEventPayload | undefined,
): boolean {
  if (!predicate) return true;
  if (!payload) return false;
  for (const [key, expected] of Object.entries(predicate)) {
    if (key === CLE_DISTINCT) continue;
    if (key === CLE_PAIRE) {
      if (!paireReunie(expected, payload)) return false;
      continue;
    }
    const fait = comparaisonDeFait(key, expected, payload);
    if (fait !== null) {
      if (!fait) return false;
      continue;
    }
    const appartenance = appartenanceSatisfaite(key, expected, payload);
    if (appartenance !== null) {
      if (!appartenance) return false;
      continue;
    }
    const plusieurs = plusieursSourcesSatisfaites(key, expected, payload);
    if (plusieurs !== null) {
      if (!plusieurs) return false;
      continue;
    }
    if (expected === false) {
      if (payload[key] !== false) return false;
      continue;
    }
    if (expected === true) {
      if (payload[key] === undefined || payload[key] === false) return false;
      continue;
    }
    const actual = payload[key];
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false;
      const aSet = new Set(actual.map((v) => String(v)));
      for (const e of expected) {
        if (!aSet.has(String(e))) return false;
      }
      continue;
    }
    if (CLES_SEUIL_GTE.has(key) && typeof expected === 'number' && typeof actual === 'number') {
      if (actual < expected) return false;
      continue;
    }
    if (CLES_SEUIL_LTE.has(key) && typeof expected === 'number' && typeof actual === 'number') {
      if (actual > expected) return false;
      continue;
    }
    if (String(actual) !== String(expected)) return false;
  }
  return true;
}

const SOLO_V_SELF_MODE: GameMode = 'solo_v_self';

export function isQuestAllowedInMode(quest: Quest, mode: GameMode | undefined): boolean {
  if (mode === SOLO_V_SELF_MODE) {
    return quest.allowSoloVSelf === true;
  }
  return true;
}

export function estQueteDistincte(quest: Quest): boolean {
  return quest.predicate?.[CLE_DISTINCT] === true;
}

// La cle qui identifie une source deja vue. Sans elle, une quete distincte ne peut pas
// compter, donc l evenement est ignore plutot que compte a tort comme un passage de plus.
export function cleDistincte(payload: QuestEventPayload | undefined): string | null {
  if (!payload) return null;
  const brut = payload.distinctKey ?? payload.sourceNumber ?? payload.missionNumber ?? payload.sourceName;
  if (brut === undefined || brut === null || brut === '') return null;
  return String(brut);
}

export function matchQuestsForEvent(
  hook: string,
  payload: QuestEventPayload | undefined,
): MatchedQuest[] {
  const mode = payload?.gameMode as GameMode | undefined;
  const deltaBrut = typeof payload?.delta === 'number' && payload.delta > 0 ? Math.floor(payload.delta) : 1;
  const matches: MatchedQuest[] = [];
  for (const quest of QUESTS) {
    if (quest.hook !== hook) continue;
    if (!isQuestAllowedInMode(quest, mode)) continue;
    if (!predicateMatches(quest.predicate, payload)) continue;

    if (estQueteDistincte(quest)) {
      const cle = cleDistincte(payload);
      if (!cle) continue;
      matches.push({ quest, delta: 1, distinctKey: cle });
      continue;
    }

    const atteint = quest.predicate ? compteAtteint(quest.predicate, payload ?? {}) : null;
    if (atteint !== null) {
      if (atteint < quest.target) continue;
      matches.push({ quest, delta: quest.target });
      continue;
    }

    matches.push({ quest, delta: deltaBrut });
  }
  return matches;
}
