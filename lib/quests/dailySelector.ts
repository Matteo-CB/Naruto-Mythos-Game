import { QUESTS, SAISON_COURANTE, type Quest } from './questData';
import { hashStringToSeed, mulberry32 } from '@/lib/variants/rng';

export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAILY_EXCLUDED_HOOKS = new Set([
  'daily_quest.completed',
  'battlepass.tier.reached',
  'elo.tier.reached',
]);

const DAILY_EXCLUDED_IDS = new Set([
  'ranked-wins-50',
  'ranked-wins-with-ino-shika-cho-20',
  'ranked-mono-sound-wins-10',
  'ranked-win-no-effects-3',
  'ranked-streak-10',
  'tournament-swiss-won-5',
  'tournament-single-won-5',
  'tournament-mono-village-won',
  'defeat-100-cumulative',
  'hide-100-cumulative',
  'tokens-added-100',
  'discard-200',
  'discard-100',
  'evolving-wins-30',
  'sealed-wins-10',
  'defeat-50-cumulative',
  'boosters-opened-25',
  'reveal-25-cumulative',
  'trade-complete-1',
  'trade-complete-5',
  'trade-cards-10',
]);

const CIBLE_MAXIMALE_DU_JOUR = 25;

function isDailyEligible(q: Quest): boolean {
  if (DAILY_EXCLUDED_HOOKS.has(q.hook)) return false;
  if (DAILY_EXCLUDED_IDS.has(q.id)) return false;
  if ((q.season ?? SAISON_COURANTE) !== SAISON_COURANTE) return false;
  if (q.target > CIBLE_MAXIMALE_DU_JOUR) return false;
  if (q.hook.startsWith('tournament.')) return false;
  if (q.hook.startsWith('ranked.win.streak')) return false;
  return true;
}

const DAILY_POOL = QUESTS.filter(isDailyEligible);

export function pickDailyQuest(date: string, recentQuestIds: ReadonlyArray<string> = []): Quest {
  const pool = DAILY_POOL.length > 0 ? DAILY_POOL : QUESTS;
  const recentSet = new Set(recentQuestIds);
  const eligible = pool.filter((q) => !recentSet.has(q.id));
  const finalPool = eligible.length > 0 ? eligible : pool;
  const rng = mulberry32(hashStringToSeed(`daily:${date}`));
  const idx = Math.floor(rng.next() * finalPool.length);
  return finalPool[idx];
}

export function pickDailyQuestForToday(now: Date = new Date(), recentQuestIds: ReadonlyArray<string> = []): {
  date: string;
  quest: Quest;
} {
  const date = formatDateUTC(now);
  return { date, quest: pickDailyQuest(date, recentQuestIds) };
}
