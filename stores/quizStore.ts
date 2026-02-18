'use client';

import { create } from 'zustand';
import type { QuizQuestion, QuizAnswer } from '@/lib/quiz/questionGenerator';
import { isAnswerCorrect, getPartialScore } from '@/lib/quiz/questionGenerator';

const TIME_LIMITS = [30, 25, 20, 15, 12] as const;
const DIFFICULTY_MULTIPLIERS = [1, 1.5, 2, 3, 5] as const;

function getTimeLimit(difficulty: number): number {
  return TIME_LIMITS[difficulty - 1] ?? TIME_LIMITS[0];
}

function getDifficultyMultiplier(difficulty: number): number {
  return DIFFICULTY_MULTIPLIERS[difficulty - 1] ?? DIFFICULTY_MULTIPLIERS[0];
}

interface QuizState {
  // Config
  difficulty: number | null;
  questions: QuizQuestion[];

  // Progress
  currentIndex: number;
  answers: (QuizAnswer | null)[];
  answerTimes: number[];

  // Timer
  timeRemaining: number;
  timerActive: boolean;

  // Score tracking
  score: number;
  streak: number;
  bestStreak: number;

  // Status
  isComplete: boolean;
  showingAnswer: boolean;

  // Actions
  startQuiz: (difficulty: number, questions: QuizQuestion[]) => void;
  submitAnswer: (answer: QuizAnswer, timeSpent: number) => void;
  nextQuestion: () => void;
  tickTimer: () => void;
  timeOut: () => void;
  resetQuiz: () => void;
}

const initialState = {
  difficulty: null as number | null,
  questions: [] as QuizQuestion[],
  currentIndex: 0,
  answers: [] as (QuizAnswer | null)[],
  answerTimes: [] as number[],
  timeRemaining: 0,
  timerActive: false,
  score: 0,
  streak: 0,
  bestStreak: 0,
  isComplete: false,
  showingAnswer: false,
};

export const useQuizStore = create<QuizState>((set, get) => ({
  ...initialState,

  startQuiz: (difficulty, questions) => {
    const timeLimit = getTimeLimit(difficulty);
    set({
      difficulty,
      questions,
      currentIndex: 0,
      answers: new Array(questions.length).fill(null),
      answerTimes: new Array(questions.length).fill(0),
      timeRemaining: timeLimit,
      timerActive: true,
      score: 0,
      streak: 0,
      bestStreak: 0,
      isComplete: false,
      showingAnswer: false,
    });
  },

  submitAnswer: (answer, timeSpent) => {
    const state = get();
    if (state.showingAnswer || state.isComplete || state.difficulty === null) return;

    const question = state.questions[state.currentIndex];
    if (!question) return;

    const correct = isAnswerCorrect(question, answer);
    const partial = getPartialScore(question, answer);

    const newAnswers = [...state.answers];
    newAnswers[state.currentIndex] = answer;
    const newAnswerTimes = [...state.answerTimes];
    newAnswerTimes[state.currentIndex] = timeSpent;

    let newScore = state.score;
    let newStreak = state.streak;

    if (correct) {
      newStreak += 1;
      const base = 100;
      const timeLimit = getTimeLimit(state.difficulty);
      const timeBonus = timeSpent < timeLimit * 500 ? 50 : 0;
      const streakMultiplier =
        newStreak >= 10 ? 3 : newStreak >= 5 ? 2 : newStreak >= 3 ? 1.5 : 1;
      const difficultyMultiplier = getDifficultyMultiplier(state.difficulty);
      const questionScore = Math.round(
        (base + timeBonus) * streakMultiplier * difficultyMultiplier
      );
      newScore += questionScore;
    } else if (partial > 0) {
      // Partial credit for drag & drop types (doesn't count as streak)
      newStreak = 0;
      const base = Math.round(100 * partial);
      const difficultyMultiplier = getDifficultyMultiplier(state.difficulty);
      newScore += Math.round(base * difficultyMultiplier);
    } else {
      newStreak = 0;
    }

    const newBestStreak = Math.max(state.bestStreak, newStreak);

    set({
      answers: newAnswers,
      answerTimes: newAnswerTimes,
      score: newScore,
      streak: newStreak,
      bestStreak: newBestStreak,
      showingAnswer: true,
      timerActive: false,
    });
  },

  nextQuestion: () => {
    const state = get();
    if (state.difficulty === null) return;

    if (state.currentIndex + 1 >= state.questions.length) {
      set({
        isComplete: true,
        timerActive: false,
      });
    } else {
      const timeLimit = getTimeLimit(state.difficulty);
      set({
        currentIndex: state.currentIndex + 1,
        showingAnswer: false,
        timeRemaining: timeLimit,
        timerActive: true,
      });
    }
  },

  tickTimer: () => {
    const state = get();
    if (!state.timerActive) return;

    if (state.timeRemaining > 0) {
      const newTime = state.timeRemaining - 1;
      set({ timeRemaining: newTime });

      if (newTime <= 0) {
        get().timeOut();
      }
    } else {
      get().timeOut();
    }
  },

  timeOut: () => {
    const state = get();
    if (state.difficulty === null) return;

    const timeLimit = getTimeLimit(state.difficulty);
    const newAnswers = [...state.answers];
    newAnswers[state.currentIndex] = null;
    const newAnswerTimes = [...state.answerTimes];
    newAnswerTimes[state.currentIndex] = timeLimit * 1000;

    set({
      timerActive: false,
      answers: newAnswers,
      answerTimes: newAnswerTimes,
      streak: 0,
      showingAnswer: true,
    });
  },

  resetQuiz: () => {
    set({ ...initialState });
  },
}));
