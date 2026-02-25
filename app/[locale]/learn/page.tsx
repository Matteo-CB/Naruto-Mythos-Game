'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LessonViewer } from '@/components/learn/LessonViewer';
import { Footer } from '@/components/Footer';
import { QuizLauncher } from '@/components/learn/QuizLauncher';
import { QuizSession } from '@/components/learn/QuizSession';
import { QuizResults } from '@/components/learn/QuizResults';
import { QuizLeaderboard } from '@/components/learn/QuizLeaderboard';
import { useQuizStore } from '@/stores/quizStore';
import { generateQuizQuestions, isAnswerCorrect } from '@/lib/quiz/questionGenerator';
import { useSession } from 'next-auth/react';

type Tab = 'rules' | 'quiz';
type QuizView = 'launcher' | 'session' | 'results' | 'leaderboard';

export default function LearnPage() {
  const t = useTranslations('learn');
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>('rules');

  // Quiz state
  const [quizView, setQuizView] = useState<QuizView>('launcher');
  const [bestScores, setBestScores] = useState<Record<number, number>>({});
  const quizDiffRef = useRef<number>(1);
  const { isComplete, startQuiz, resetQuiz } = useQuizStore();

  useEffect(() => {
    if (session?.user) {
      fetch('/api/quiz/leaderboard?limit=100')
        .then((r) => r.json())
        .then((data) => {
          if (data.entries) {
            const scores: Record<number, number> = {};
            for (const entry of data.entries) {
              if (
                entry.username === (session.user as { name?: string })?.name &&
                (!scores[entry.difficulty] || entry.score > scores[entry.difficulty])
              ) {
                scores[entry.difficulty] = entry.score;
              }
            }
            setBestScores(scores);
          }
        })
        .catch(() => {});
    }
  }, [session]);

  useEffect(() => {
    if (isComplete && quizView === 'session') {
      setQuizView('results');
    }
  }, [isComplete, quizView]);

  const handleStartQuiz = useCallback(
    (difficulty: number) => {
      quizDiffRef.current = difficulty;
      const questions = generateQuizQuestions(difficulty);
      startQuiz(difficulty, questions);
      setQuizView('session');
    },
    [startQuiz]
  );

  const handleRetry = useCallback(() => {
    const questions = generateQuizQuestions(quizDiffRef.current);
    startQuiz(quizDiffRef.current, questions);
    setQuizView('session');
  }, [startQuiz]);

  const handleChangeDifficulty = useCallback(() => {
    resetQuiz();
    setQuizView('launcher');
  }, [resetQuiz]);

  const handleSaveScore = useCallback(async () => {
    const state = useQuizStore.getState();
    if (!session?.user || state.difficulty === null) return;

    const total = state.questions.length;
    let correctCount = 0;
    for (let i = 0; i < total; i++) {
      const q = state.questions[i];
      const a = state.answers[i];
      if (q && a && isAnswerCorrect(q, a)) {
        correctCount++;
      }
    }

    await fetch('/api/quiz/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        difficulty: state.difficulty,
        score: state.score,
        correct: correctCount,
        total,
        accuracy: total > 0 ? correctCount / total : 0,
        bestStreak: state.bestStreak,
      }),
    });
  }, [session]);

  const handleShowLeaderboard = useCallback(() => {
    setQuizView('leaderboard');
  }, []);

  return (
    <div
      id="main-content"
      className="min-h-screen relative flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="learn" />

      <header
        className="relative z-20 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid rgba(196, 163, 90, 0.15)' }}
      >
        <Link
          href="/"
          className="text-sm px-3 py-1.5 rounded"
          style={{
            color: '#c4a35a',
            border: '1px solid rgba(196, 163, 90, 0.3)',
            backgroundColor: 'rgba(196, 163, 90, 0.05)',
          }}
        >
          ← {t('title')}
        </Link>

        <h1
          className="text-xl font-bold tracking-wider"
          style={{ color: '#c4a35a' }}
        >
          {t('title')}
        </h1>

        <LanguageSwitcher />
      </header>

      {/* Tabs */}
      <div
        className="relative z-20 flex justify-center gap-1 px-4 py-2"
        style={{ borderBottom: '1px solid rgba(196, 163, 90, 0.1)' }}
      >
        <button
          onClick={() => setActiveTab('rules')}
          className="px-5 py-2 text-sm font-medium rounded-t transition-colors"
          style={{
            color: activeTab === 'rules' ? '#0a0a0a' : '#c4a35a',
            backgroundColor: activeTab === 'rules' ? '#c4a35a' : 'transparent',
            border: activeTab === 'rules' ? '1px solid #c4a35a' : '1px solid rgba(196, 163, 90, 0.3)',
            borderBottom: 'none',
          }}
        >
          {t('rulesTab')}
        </button>
        <button
          onClick={() => setActiveTab('quiz')}
          className="px-5 py-2 text-sm font-medium rounded-t transition-colors"
          style={{
            color: activeTab === 'quiz' ? '#0a0a0a' : '#c4a35a',
            backgroundColor: activeTab === 'quiz' ? '#c4a35a' : 'transparent',
            border: activeTab === 'quiz' ? '1px solid #c4a35a' : '1px solid rgba(196, 163, 90, 0.3)',
            borderBottom: 'none',
          }}
        >
          {t('quiz.title')}
        </button>
      </div>

      <main className="relative z-10 px-4 py-2 flex-1">
        {activeTab === 'rules' && <LessonViewer />}

        {activeTab === 'quiz' && (
          <>
            {quizView === 'launcher' && (
              <div>
                <QuizLauncher onStart={handleStartQuiz} bestScores={bestScores} />
                <div className="mt-4 text-center">
                  <button
                    onClick={handleShowLeaderboard}
                    className="text-sm px-4 py-2 rounded transition-colors"
                    style={{
                      color: '#c4a35a',
                      border: '1px solid rgba(196, 163, 90, 0.3)',
                      backgroundColor: 'rgba(196, 163, 90, 0.05)',
                    }}
                  >
                    {t('quiz.leaderboard.title')}
                  </button>
                </div>
              </div>
            )}

            {quizView === 'session' && <QuizSession />}

            {quizView === 'results' && (
              <QuizResults
                onRetry={handleRetry}
                onChangeDifficulty={handleChangeDifficulty}
                onSaveScore={session?.user ? handleSaveScore : undefined}
              />
            )}

            {quizView === 'leaderboard' && (
              <div className="max-w-3xl mx-auto">
                <button
                  onClick={() => setQuizView('launcher')}
                  className="mb-3 text-sm px-3 py-1 rounded"
                  style={{
                    color: '#c4a35a',
                    border: '1px solid rgba(196, 163, 90, 0.3)',
                  }}
                >
                  ← {t('quiz.selectDifficulty')}
                </button>
                <QuizLeaderboard />
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
