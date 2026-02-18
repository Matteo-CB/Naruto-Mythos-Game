'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useQuizStore } from '@/stores/quizStore';
import { isAnswerCorrect, getPartialScore } from '@/lib/quiz/questionGenerator';

// =====================================================================
// CONSTANTS
// =====================================================================

const GOLD = '#c4a35a';
const DARK_BG = '#0a0a0a';
const PANEL_BG = '#111111';
const BORDER = '#262626';
const TEXT_LIGHT = '#cccccc';
const TEXT_DIM = '#888888';
const FEEDBACK_GREEN = '#3e8b3e';
const FEEDBACK_RED = '#b33e3e';

const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#3e8b3e',
  2: '#5a8bbf',
  3: '#c4a35a',
  4: '#b33e3e',
  5: '#6a6abb',
};

// =====================================================================
// PROPS
// =====================================================================

interface QuizResultsProps {
  onRetry: () => void;
  onChangeDifficulty: () => void;
  onSaveScore?: () => Promise<void>;
}

// =====================================================================
// ANIMATED COUNTER
// =====================================================================

function AnimatedCounter({
  target,
  duration = 1.5,
  color,
}: {
  target: number;
  duration?: number;
  color: string;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return (
    <span className="text-4xl font-bold" style={{ color }}>
      {current}
    </span>
  );
}

// =====================================================================
// STAT CARD
// =====================================================================

function StatCard({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex flex-col items-center px-3 py-2"
      style={{
        backgroundColor: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: '6px',
      }}
    >
      <span className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>
        {value}
      </span>
      <span
        className="text-xs uppercase tracking-wider mt-1"
        style={{ color: TEXT_DIM }}
      >
        {label}
      </span>
    </motion.div>
  );
}

// =====================================================================
// COMPONENT
// =====================================================================

export function QuizResults({
  onRetry,
  onChangeDifficulty,
  onSaveScore,
}: QuizResultsProps) {
  const t = useTranslations('learn');

  const score = useQuizStore((s) => s.score);
  const questions = useQuizStore((s) => s.questions);
  const answers = useQuizStore((s) => s.answers);
  const answerTimes = useQuizStore((s) => s.answerTimes);
  const bestStreak = useQuizStore((s) => s.bestStreak);
  const difficulty = useQuizStore((s) => s.difficulty);

  const [showBreakdown, setShowBreakdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Compute stats
  const total = questions.length;
  let correctCount = 0;
  let partialCount = 0;
  let timeoutCount = 0;
  let totalTimeMs = 0;

  for (let i = 0; i < total; i++) {
    const q = questions[i];
    const a = answers[i];
    if (a === null) {
      timeoutCount++;
    } else if (isAnswerCorrect(q, a)) {
      correctCount++;
    } else {
      const partial = getPartialScore(q, a);
      if (partial > 0 && partial < 1) {
        partialCount++;
      }
    }
    totalTimeMs += answerTimes[i] ?? 0;
  }

  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const avgTime = total > 0 ? (totalTimeMs / total / 1000).toFixed(1) : '0.0';
  const diffColor = DIFFICULTY_COLORS[difficulty ?? 1] ?? GOLD;

  const handleSave = useCallback(async () => {
    if (!onSaveScore || saving || saved) return;
    setSaving(true);
    try {
      await onSaveScore();
      setSaved(true);
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  }, [onSaveScore, saving, saved]);

  return (
    <div
      className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 py-4"
      style={{ backgroundColor: DARK_BG }}
    >
      <div className="max-w-md w-full">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-4"
        >
          <h2
            className="text-xl font-bold uppercase tracking-wider mb-2"
            style={{ color: GOLD }}
          >
            {t('quiz.resultsTitle')}
          </h2>

          {/* Difficulty badge */}
          <span
            className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: `1px solid ${diffColor}`,
              borderRadius: '4px',
              color: diffColor,
            }}
          >
            {t(`quiz.difficulties.${difficulty ?? 1}`)}
          </span>
        </motion.div>

        {/* Animated score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center mb-4"
        >
          <AnimatedCounter target={score} duration={1.8} color={GOLD} />
          <div className="text-xs mt-1" style={{ color: TEXT_DIM }}>
            {t('quiz.points')}
          </div>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatCard
            label={t('quiz.statCorrect')}
            value={`${correctCount}/${total}`}
            delay={0.4}
          />
          <StatCard
            label={t('quiz.statAccuracy')}
            value={`${accuracy}%`}
            delay={0.5}
          />
          <StatCard
            label={t('quiz.statBestStreak')}
            value={String(bestStreak)}
            delay={0.6}
          />
          <StatCard
            label={t('quiz.statAvgTime')}
            value={`${avgTime}s`}
            delay={0.7}
          />
        </div>

        {/* Breakdown toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mb-4"
        >
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: PANEL_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: '6px',
              color: TEXT_DIM,
              cursor: 'pointer',
            }}
          >
            {showBreakdown
              ? t('quiz.hideBreakdown')
              : t('quiz.showBreakdown')}
          </button>

          <AnimatePresence>
            {showBreakdown && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ overflow: 'hidden' }}
              >
                <div
                  className="mt-2 flex flex-col gap-1"
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                  }}
                >
                  {questions.map((q, i) => {
                    const a = answers[i];
                    const correct = a !== null && isAnswerCorrect(q, a);
                    const partial =
                      a !== null ? getPartialScore(q, a) : 0;
                    const timedOut = a === null;

                    let statusLabel: string;
                    let statusColor: string;
                    if (timedOut) {
                      statusLabel = t('quiz.statusTimeout');
                      statusColor = TEXT_DIM;
                    } else if (correct) {
                      statusLabel = t('quiz.statusCorrect');
                      statusColor = FEEDBACK_GREEN;
                    } else if (partial > 0 && partial < 1) {
                      statusLabel = t('quiz.statusPartial');
                      statusColor = '#cc7a30';
                    } else {
                      statusLabel = t('quiz.statusWrong');
                      statusColor = FEEDBACK_RED;
                    }

                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2"
                        style={{
                          backgroundColor: 'rgba(17, 17, 17, 0.6)',
                          border: `1px solid ${BORDER}`,
                          borderRadius: '4px',
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="text-xs flex-shrink-0 font-bold"
                            style={{
                              color: TEXT_DIM,
                              width: '24px',
                              textAlign: 'center',
                            }}
                          >
                            {i + 1}
                          </span>
                          <span
                            className="text-xs truncate"
                            style={{ color: TEXT_LIGHT }}
                          >
                            {t(
                              q.questionTextKey as Parameters<typeof t>[0],
                              q.questionParams as
                                | Record<string, string>
                                | undefined
                            )}
                          </span>
                        </div>
                        <span
                          className="text-xs font-bold flex-shrink-0 ml-2"
                          style={{ color: statusColor }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex flex-col gap-3"
        >
          {/* Save score */}
          {onSaveScore && (
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="w-full px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: saved ? FEEDBACK_GREEN : GOLD,
                color: DARK_BG,
                border: 'none',
                borderRadius: '6px',
                cursor: saving || saved ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saved
                ? t('quiz.scoreSaved')
                : saving
                  ? t('quiz.saving')
                  : t('quiz.saveScore')}
            </button>
          )}

          {/* Retry */}
          <button
            onClick={onRetry}
            className="w-full px-6 py-3 text-sm font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: PANEL_BG,
              border: `1px solid ${GOLD}`,
              borderRadius: '6px',
              color: GOLD,
              cursor: 'pointer',
            }}
          >
            {t('quiz.tryAgain')}
          </button>

          {/* Change difficulty */}
          <button
            onClick={onChangeDifficulty}
            className="w-full px-6 py-3 text-sm uppercase tracking-wider transition-all"
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${BORDER}`,
              borderRadius: '6px',
              color: TEXT_DIM,
              cursor: 'pointer',
            }}
          >
            {t('quiz.changeDifficulty')}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
