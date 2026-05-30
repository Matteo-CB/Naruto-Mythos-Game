import { QUESTS, type Quest } from './questData';
import type { GameMode, QuestEventPayload } from './hooks';

export interface MatchedQuest {
  quest: Quest;
  delta: number;
}

const THRESHOLD_KEYS_GTE: ReadonlySet<string> = new Set(['streak', 'threshold', 'minPrinted', 'depth', 'tier']);
const THRESHOLD_KEYS_LTE: ReadonlySet<string> = new Set(['maxRound']);

function predicateMatches(predicate: Record<string, unknown> | undefined, payload: QuestEventPayload | undefined): boolean {
  if (!predicate) return true;
  if (!payload) return false;
  for (const [key, expected] of Object.entries(predicate)) {
    const actual = payload[key];
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false;
      const aSet = new Set(actual.map((v) => String(v)));
      for (const e of expected) {
        if (!aSet.has(String(e))) return false;
      }
      continue;
    }
    if (THRESHOLD_KEYS_GTE.has(key) && typeof expected === 'number' && typeof actual === 'number') {
      if (actual < expected) return false;
      continue;
    }
    if (THRESHOLD_KEYS_LTE.has(key) && typeof expected === 'number' && typeof actual === 'number') {
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

export function matchQuestsForEvent(
  hook: string,
  payload: QuestEventPayload | undefined,
): MatchedQuest[] {
  const mode = payload?.gameMode as GameMode | undefined;
  const delta = typeof payload?.delta === 'number' && payload.delta > 0 ? Math.floor(payload.delta) : 1;
  const matches: MatchedQuest[] = [];
  for (const quest of QUESTS) {
    if (quest.hook !== hook) continue;
    if (!isQuestAllowedInMode(quest, mode)) continue;
    if (!predicateMatches(quest.predicate, payload)) continue;
    matches.push({ quest, delta });
  }
  return matches;
}
