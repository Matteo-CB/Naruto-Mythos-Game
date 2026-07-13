export type SurveyQuestionType = 'single' | 'multiple' | 'text';

export interface SurveyOption {
  id: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: SurveyOption[];
}

export type SurveyAnswers = Record<string, string[] | string>;

export const SURVEY_LIMITS = {
  titleMax: 120,
  descriptionMax: 600,
  questionTextMax: 300,
  optionLabelMax: 120,
  maxQuestions: 10,
  maxOptions: 12,
  minOptions: 2,
  textAnswerMax: 1000,
} as const;

export function parseSurveyQuestions(raw: unknown): SurveyQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SURVEY_LIMITS.maxQuestions) return null;
  const out: SurveyQuestion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown>;
    if (!q || typeof q !== 'object') return null;
    const type = q.type;
    if (type !== 'single' && type !== 'multiple' && type !== 'text') return null;
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text || text.length > SURVEY_LIMITS.questionTextMax) return null;
    const id = typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`;
    if (seenIds.has(id)) return null;
    seenIds.add(id);

    let options: SurveyOption[] = [];
    if (type === 'single' || type === 'multiple') {
      if (!Array.isArray(q.options)) return null;
      if (q.options.length < SURVEY_LIMITS.minOptions || q.options.length > SURVEY_LIMITS.maxOptions) return null;
      const seenOpt = new Set<string>();
      options = [];
      for (let j = 0; j < q.options.length; j++) {
        const o = q.options[j] as Record<string, unknown>;
        const label = typeof o?.label === 'string' ? o.label.trim() : '';
        if (!label || label.length > SURVEY_LIMITS.optionLabelMax) return null;
        const oid = typeof o?.id === 'string' && o.id ? o.id : `o${j + 1}`;
        if (seenOpt.has(oid)) return null;
        seenOpt.add(oid);
        options.push({ id: oid, label });
      }
    }
    out.push({ id, type, text, options });
  }
  return out;
}

export function validateSurveyAnswers(
  questions: SurveyQuestion[],
  raw: unknown,
): SurveyAnswers | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: SurveyAnswers = {};
  let answeredAny = false;

  for (const q of questions) {
    const val = input[q.id];
    if (val === undefined || val === null) {
      if (q.type === 'text') continue;
      return null;
    }
    if (q.type === 'text') {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      if (trimmed.length > SURVEY_LIMITS.textAnswerMax) return null;
      if (trimmed.length > 0) {
        out[q.id] = trimmed;
        answeredAny = true;
      }
      continue;
    }
    if (!Array.isArray(val) || val.some((v) => typeof v !== 'string')) return null;
    const picks = Array.from(new Set(val as string[]));
    const validIds = new Set(q.options.map((o) => o.id));
    if (picks.length === 0) return null;
    if (q.type === 'single' && picks.length !== 1) return null;
    if (picks.some((p) => !validIds.has(p))) return null;
    out[q.id] = picks;
    answeredAny = true;
  }

  const knownIds = new Set(questions.map((q) => q.id));
  for (const key of Object.keys(input)) {
    if (!knownIds.has(key)) return null;
  }

  if (!answeredAny) return null;
  return out;
}

export function aggregateResults(
  questions: SurveyQuestion[],
  answersList: SurveyAnswers[],
): Record<string, Record<string, number>> {
  const results: Record<string, Record<string, number>> = {};
  for (const q of questions) {
    if (q.type === 'text') continue;
    const counts: Record<string, number> = {};
    for (const o of q.options) counts[o.id] = 0;
    for (const answers of answersList) {
      const picks = answers[q.id];
      if (!Array.isArray(picks)) continue;
      for (const p of picks) {
        if (counts[p] !== undefined) counts[p] += 1;
      }
    }
    results[q.id] = counts;
  }
  return results;
}
