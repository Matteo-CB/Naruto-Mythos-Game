import { describe, it, expect } from 'vitest';
import {
  parseSurveyQuestions,
  validateSurveyAnswers,
  aggregateResults,
  SURVEY_LIMITS,
  type SurveyQuestion,
} from '@/lib/surveys/validation';

const QUESTIONS: SurveyQuestion[] = [
  { id: 'q1', type: 'single', text: 'Best mode?', options: [{ id: 'o1', label: 'Ranked' }, { id: 'o2', label: 'Sealed' }] },
  { id: 'q2', type: 'multiple', text: 'What do you play?', options: [{ id: 'o1', label: 'AI' }, { id: 'o2', label: 'Online' }, { id: 'o3', label: 'Hotseat' }] },
  { id: 'q3', type: 'text', text: 'Anything else?', options: [] },
];

describe('parseSurveyQuestions', () => {
  it('parses valid questions and assigns ids', () => {
    const parsed = parseSurveyQuestions([
      { type: 'single', text: 'A?', options: [{ label: 'x' }, { label: 'y' }] },
      { type: 'text', text: 'B?' },
    ]);
    expect(parsed).not.toBeNull();
    expect(parsed![0].id).toBe('q1');
    expect(parsed![0].options.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(parsed![1].type).toBe('text');
    expect(parsed![1].options).toEqual([]);
  });

  it('rejects empty lists, bad types, missing text and single-option questions', () => {
    expect(parseSurveyQuestions([])).toBeNull();
    expect(parseSurveyQuestions('nope')).toBeNull();
    expect(parseSurveyQuestions([{ type: 'ranking', text: 'A?', options: [] }])).toBeNull();
    expect(parseSurveyQuestions([{ type: 'single', text: '', options: [{ label: 'x' }, { label: 'y' }] }])).toBeNull();
    expect(parseSurveyQuestions([{ type: 'single', text: 'A?', options: [{ label: 'x' }] }])).toBeNull();
  });

  it('enforces the question cap', () => {
    const many = Array.from({ length: SURVEY_LIMITS.maxQuestions + 1 }, (_, i) => ({ type: 'text', text: `Q${i}` }));
    expect(parseSurveyQuestions(many)).toBeNull();
  });
});

describe('validateSurveyAnswers', () => {
  it('accepts a full valid answer set and trims text', () => {
    const out = validateSurveyAnswers(QUESTIONS, {
      q1: ['o2'],
      q2: ['o1', 'o3'],
      q3: '  great game  ',
    });
    expect(out).toEqual({ q1: ['o2'], q2: ['o1', 'o3'], q3: 'great game' });
  });

  it('text questions are optional, choice questions are not', () => {
    expect(validateSurveyAnswers(QUESTIONS, { q1: ['o1'], q2: ['o2'] })).toEqual({ q1: ['o1'], q2: ['o2'] });
    expect(validateSurveyAnswers(QUESTIONS, { q2: ['o2'], q3: 'hi' })).toBeNull();
  });

  it('rejects multiple picks on single, unknown options and unknown question keys', () => {
    expect(validateSurveyAnswers(QUESTIONS, { q1: ['o1', 'o2'], q2: ['o1'] })).toBeNull();
    expect(validateSurveyAnswers(QUESTIONS, { q1: ['zz'], q2: ['o1'] })).toBeNull();
    expect(validateSurveyAnswers(QUESTIONS, { q1: ['o1'], q2: ['o1'], hack: ['x'] })).toBeNull();
  });

  it('rejects empty submissions and over-long text', () => {
    const textOnly: SurveyQuestion[] = [QUESTIONS[2]];
    expect(validateSurveyAnswers(textOnly, {})).toBeNull();
    expect(validateSurveyAnswers(textOnly, { q3: '' })).toBeNull();
    expect(validateSurveyAnswers(textOnly, { q3: 'a'.repeat(SURVEY_LIMITS.textAnswerMax + 1) })).toBeNull();
  });

  it('deduplicates repeated picks on multiple choice', () => {
    const out = validateSurveyAnswers(QUESTIONS, { q1: ['o1'], q2: ['o1', 'o1', 'o2'] });
    expect(out).toEqual({ q1: ['o1'], q2: ['o1', 'o2'] });
  });
});

describe('aggregateResults', () => {
  it('counts picks per option and skips text questions', () => {
    const results = aggregateResults(QUESTIONS, [
      { q1: ['o1'], q2: ['o1', 'o2'], q3: 'hello' },
      { q1: ['o1'], q2: ['o2'] },
      { q1: ['o2'], q2: ['o3'] },
    ]);
    expect(results.q1).toEqual({ o1: 2, o2: 1 });
    expect(results.q2).toEqual({ o1: 1, o2: 2, o3: 1 });
    expect(results.q3).toBeUndefined();
  });
});
