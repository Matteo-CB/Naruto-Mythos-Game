import type { MultipleChoiceQuestion } from './questionGenerator';

/**
 * Pre-written rules questions for the Naruto Mythos TCG quiz.
 * 40 questions across 5 difficulty tiers (8 per tier).
 * All text uses i18n keys under learn.quiz.rules.
 */

interface RawRulesQ {
  id: string;
  category: string;
  difficulty: number;
  questionTextKey: string;
  options: string[];
  correctIndex: number;
  explanationKey: string;
}

const raw: RawRulesQ[] = [
  // DIFFICULTY 1 — Basic (q1-q8)
  { id: 'rules-1', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q1.text', options: ['quiz.rules.q1.oA', 'quiz.rules.q1.oB', 'quiz.rules.q1.oC', 'quiz.rules.q1.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q1.exp' },
  { id: 'rules-2', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q2.text', options: ['quiz.rules.q2.oA', 'quiz.rules.q2.oB', 'quiz.rules.q2.oC', 'quiz.rules.q2.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q2.exp' },
  { id: 'rules-3', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q3.text', options: ['quiz.rules.q3.oA', 'quiz.rules.q3.oB', 'quiz.rules.q3.oC', 'quiz.rules.q3.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q3.exp' },
  { id: 'rules-4', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q4.text', options: ['quiz.rules.q4.oA', 'quiz.rules.q4.oB', 'quiz.rules.q4.oC', 'quiz.rules.q4.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q4.exp' },
  { id: 'rules-5', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q5.text', options: ['quiz.rules.q5.oA', 'quiz.rules.q5.oB', 'quiz.rules.q5.oC', 'quiz.rules.q5.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q5.exp' },
  { id: 'rules-6', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q6.text', options: ['quiz.rules.q6.oA', 'quiz.rules.q6.oB', 'quiz.rules.q6.oC', 'quiz.rules.q6.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q6.exp' },
  { id: 'rules-7', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q7.text', options: ['quiz.rules.q7.oA', 'quiz.rules.q7.oB', 'quiz.rules.q7.oC', 'quiz.rules.q7.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q7.exp' },
  { id: 'rules-8', category: 'rules', difficulty: 1, questionTextKey: 'quiz.rules.q8.text', options: ['quiz.rules.q8.oA', 'quiz.rules.q8.oB', 'quiz.rules.q8.oC', 'quiz.rules.q8.oD'], correctIndex: 3, explanationKey: 'quiz.rules.q8.exp' },

  // DIFFICULTY 2 — Intermediate (q9-q16)
  { id: 'rules-9', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q9.text', options: ['quiz.rules.q9.oA', 'quiz.rules.q9.oB', 'quiz.rules.q9.oC', 'quiz.rules.q9.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q9.exp' },
  { id: 'rules-10', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q10.text', options: ['quiz.rules.q10.oA', 'quiz.rules.q10.oB', 'quiz.rules.q10.oC', 'quiz.rules.q10.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q10.exp' },
  { id: 'rules-11', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q11.text', options: ['quiz.rules.q11.oA', 'quiz.rules.q11.oB', 'quiz.rules.q11.oC', 'quiz.rules.q11.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q11.exp' },
  { id: 'rules-12', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q12.text', options: ['quiz.rules.q12.oA', 'quiz.rules.q12.oB', 'quiz.rules.q12.oC', 'quiz.rules.q12.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q12.exp' },
  { id: 'rules-13', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q13.text', options: ['quiz.rules.q13.oA', 'quiz.rules.q13.oB', 'quiz.rules.q13.oC', 'quiz.rules.q13.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q13.exp' },
  { id: 'rules-14', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q14.text', options: ['quiz.rules.q14.oA', 'quiz.rules.q14.oB', 'quiz.rules.q14.oC', 'quiz.rules.q14.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q14.exp' },
  { id: 'rules-15', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q15.text', options: ['quiz.rules.q15.oA', 'quiz.rules.q15.oB', 'quiz.rules.q15.oC', 'quiz.rules.q15.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q15.exp' },
  { id: 'rules-16', category: 'rules', difficulty: 2, questionTextKey: 'quiz.rules.q16.text', options: ['quiz.rules.q16.oA', 'quiz.rules.q16.oB', 'quiz.rules.q16.oC', 'quiz.rules.q16.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q16.exp' },

  // DIFFICULTY 3 — Advanced (q17-q24)
  { id: 'rules-17', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q17.text', options: ['quiz.rules.q17.oA', 'quiz.rules.q17.oB', 'quiz.rules.q17.oC', 'quiz.rules.q17.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q17.exp' },
  { id: 'rules-18', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q18.text', options: ['quiz.rules.q18.oA', 'quiz.rules.q18.oB', 'quiz.rules.q18.oC', 'quiz.rules.q18.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q18.exp' },
  { id: 'rules-19', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q19.text', options: ['quiz.rules.q19.oA', 'quiz.rules.q19.oB', 'quiz.rules.q19.oC', 'quiz.rules.q19.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q19.exp' },
  { id: 'rules-20', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q20.text', options: ['quiz.rules.q20.oA', 'quiz.rules.q20.oB', 'quiz.rules.q20.oC', 'quiz.rules.q20.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q20.exp' },
  { id: 'rules-21', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q21.text', options: ['quiz.rules.q21.oA', 'quiz.rules.q21.oB', 'quiz.rules.q21.oC', 'quiz.rules.q21.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q21.exp' },
  { id: 'rules-22', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q22.text', options: ['quiz.rules.q22.oA', 'quiz.rules.q22.oB', 'quiz.rules.q22.oC', 'quiz.rules.q22.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q22.exp' },
  { id: 'rules-23', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q23.text', options: ['quiz.rules.q23.oA', 'quiz.rules.q23.oB', 'quiz.rules.q23.oC', 'quiz.rules.q23.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q23.exp' },
  { id: 'rules-24', category: 'rules', difficulty: 3, questionTextKey: 'quiz.rules.q24.text', options: ['quiz.rules.q24.oA', 'quiz.rules.q24.oB', 'quiz.rules.q24.oC', 'quiz.rules.q24.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q24.exp' },

  // DIFFICULTY 4 — Expert (q25-q32)
  { id: 'rules-25', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q25.text', options: ['quiz.rules.q25.oA', 'quiz.rules.q25.oB', 'quiz.rules.q25.oC', 'quiz.rules.q25.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q25.exp' },
  { id: 'rules-26', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q26.text', options: ['quiz.rules.q26.oA', 'quiz.rules.q26.oB', 'quiz.rules.q26.oC', 'quiz.rules.q26.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q26.exp' },
  { id: 'rules-27', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q27.text', options: ['quiz.rules.q27.oA', 'quiz.rules.q27.oB', 'quiz.rules.q27.oC', 'quiz.rules.q27.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q27.exp' },
  { id: 'rules-28', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q28.text', options: ['quiz.rules.q28.oA', 'quiz.rules.q28.oB', 'quiz.rules.q28.oC', 'quiz.rules.q28.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q28.exp' },
  { id: 'rules-29', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q29.text', options: ['quiz.rules.q29.oA', 'quiz.rules.q29.oB', 'quiz.rules.q29.oC', 'quiz.rules.q29.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q29.exp' },
  { id: 'rules-30', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q30.text', options: ['quiz.rules.q30.oA', 'quiz.rules.q30.oB', 'quiz.rules.q30.oC', 'quiz.rules.q30.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q30.exp' },
  { id: 'rules-31', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q31.text', options: ['quiz.rules.q31.oA', 'quiz.rules.q31.oB', 'quiz.rules.q31.oC', 'quiz.rules.q31.oD'], correctIndex: 2, explanationKey: 'quiz.rules.q31.exp' },
  { id: 'rules-32', category: 'rules', difficulty: 4, questionTextKey: 'quiz.rules.q32.text', options: ['quiz.rules.q32.oA', 'quiz.rules.q32.oB', 'quiz.rules.q32.oC', 'quiz.rules.q32.oD'], correctIndex: 3, explanationKey: 'quiz.rules.q32.exp' },

  // DIFFICULTY 5 — Kage (q33-q40)
  { id: 'rules-33', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q33.text', options: ['quiz.rules.q33.oA', 'quiz.rules.q33.oB', 'quiz.rules.q33.oC', 'quiz.rules.q33.oD'], correctIndex: 0, explanationKey: 'quiz.rules.q33.exp' },
  { id: 'rules-34', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q34.text', options: ['quiz.rules.q34.oA', 'quiz.rules.q34.oB', 'quiz.rules.q34.oC', 'quiz.rules.q34.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q34.exp' },
  { id: 'rules-35', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q35.text', options: ['quiz.rules.q35.oA', 'quiz.rules.q35.oB', 'quiz.rules.q35.oC', 'quiz.rules.q35.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q35.exp' },
  { id: 'rules-36', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q36.text', options: ['quiz.rules.q36.oA', 'quiz.rules.q36.oB', 'quiz.rules.q36.oC', 'quiz.rules.q36.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q36.exp' },
  { id: 'rules-37', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q37.text', options: ['quiz.rules.q37.oA', 'quiz.rules.q37.oB', 'quiz.rules.q37.oC', 'quiz.rules.q37.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q37.exp' },
  { id: 'rules-38', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q38.text', options: ['quiz.rules.q38.oA', 'quiz.rules.q38.oB', 'quiz.rules.q38.oC', 'quiz.rules.q38.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q38.exp' },
  { id: 'rules-39', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q39.text', options: ['quiz.rules.q39.oA', 'quiz.rules.q39.oB', 'quiz.rules.q39.oC', 'quiz.rules.q39.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q39.exp' },
  { id: 'rules-40', category: 'rules', difficulty: 5, questionTextKey: 'quiz.rules.q40.text', options: ['quiz.rules.q40.oA', 'quiz.rules.q40.oB', 'quiz.rules.q40.oC', 'quiz.rules.q40.oD'], correctIndex: 1, explanationKey: 'quiz.rules.q40.exp' },
];

const allRulesQuestions: MultipleChoiceQuestion[] = raw.map((q) => ({
  ...q,
  type: 'multipleChoice' as const,
  optionsAreKeys: true,
}));

export function getRulesQuestions(difficulty: 1 | 2 | 3 | 4 | 5): MultipleChoiceQuestion[] {
  return allRulesQuestions.filter((q) => q.difficulty <= difficulty);
}
