export type QuestLevel = 1 | 2 | 3 | 4;

export type QuestScope = 'match' | 'session' | 'cumulative';

export type QuestSeason = 'KS' | 'SS';

export interface Quest {
  id: string;
  level: QuestLevel;
  target: number;
  hook: string;
  predicate?: Record<string, unknown>;
  scope: QuestScope;
  season?: QuestSeason;
  text_fr: string;
  text_en: string;
  text_es?: string;
  text_ja?: string;
  text_pt?: string;
  text_it?: string;
  text_pl?: string;
  allowSoloVSelf?: boolean;
}
