import { describe, it, expect } from 'vitest';
import { generateQuizQuestions, isAnswerCorrect } from '@/lib/quiz/questionGenerator';

describe('quiz questionGenerator', () => {
  it('every multipleChoice question has a valid correctIndex within options', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const qs = generateQuizQuestions(5, 30, seed);
      for (const q of qs) {
        if (q.type === 'multipleChoice') {
          expect(q.correctIndex).toBeGreaterThanOrEqual(0);
          expect(q.correctIndex).toBeLessThan(q.options.length);
        }
      }
    }
  });

  it('multipleChoice options are all distinct', () => {
    for (let seed = 100; seed <= 130; seed++) {
      const qs = generateQuizQuestions(5, 30, seed);
      for (const q of qs) {
        if (q.type === 'multipleChoice') {
          const set = new Set(q.options);
          expect(set.size).toBe(q.options.length);
        }
      }
    }
  });

  it('isAnswerCorrect returns true when the correct option index is selected', () => {
    const qs = generateQuizQuestions(5, 20, 42);
    for (const q of qs) {
      if (q.type === 'multipleChoice') {
        const ok = isAnswerCorrect(q, { type: 'multipleChoice', selectedIndex: q.correctIndex });
        expect(ok).toBe(true);
      }
    }
  });

  it('matchPairs left labels are all unique (no ambiguous "Naruto" duplicates)', () => {
    for (let seed = 200; seed <= 220; seed++) {
      const qs = generateQuizQuestions(5, 30, seed);
      for (const q of qs) {
        if (q.type === 'matchPairs') {
          const labels = q.pairs.map((p) => p.left);
          const set = new Set(labels);
          expect(set.size).toBe(labels.length);
        }
      }
    }
  });

  it('sortOrder items are all unique', () => {
    for (let seed = 300; seed <= 320; seed++) {
      const qs = generateQuizQuestions(5, 30, seed);
      for (const q of qs) {
        if (q.type === 'sortOrder') {
          const labels = q.items.map((it) => it.label);
          const set = new Set(labels);
          expect(set.size).toBe(labels.length);
        }
      }
    }
  });

  it('categorySort items are all unique', () => {
    for (let seed = 400; seed <= 420; seed++) {
      const qs = generateQuizQuestions(5, 30, seed);
      for (const q of qs) {
        if (q.type === 'categorySort') {
          const labels = q.items.map((it) => it.label);
          const set = new Set(labels);
          expect(set.size).toBe(labels.length);
        }
      }
    }
  });
});
