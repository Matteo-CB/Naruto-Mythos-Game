'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

// ---------------------
// Props
// ---------------------
interface QuizLauncherProps {
  onStart: (difficulty: number) => void;
  bestScores?: Record<number, number>;
}

// ---------------------
// Constants
// ---------------------
const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

const QUESTION_COUNTS: Record<number, number> = {
  1: 10,
  2: 15,
  3: 20,
  4: 25,
  5: 30,
};

const TIME_LIMITS: Record<number, number> = {
  1: 30,
  2: 25,
  3: 20,
  4: 15,
  5: 12,
};

const RANK_COLORS: Record<number, string> = {
  1: '#3e8b3e',
  2: '#5a8bbf',
  3: '#c4a35a',
  4: '#b33e3e',
  5: '#6a6abb',
};

// ---------------------
// Component
// ---------------------
export function QuizLauncher({ onStart, bestScores }: QuizLauncherProps) {
  const t = useTranslations('learn');
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div
      className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4 py-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Decorative card images */}
      <div
        className="fixed top-12 left-4 hidden lg:block"
        style={{ opacity: 0.15, pointerEvents: 'none' }}
      >
        <img
          src="/images/rare/108-130_NARUTO_UZUMAKI.webp"
          alt=""
          draggable={false}
          style={{
            width: '220px',
            borderRadius: '8px',
            transform: 'rotate(-8deg)',
          }}
        />
      </div>
      <div
        className="fixed top-12 right-4 hidden lg:block"
        style={{ opacity: 0.15, pointerEvents: 'none' }}
      >
        <img
          src="/images/secret/133-130_NARUTO_UZUMAKI.webp"
          alt=""
          draggable={false}
          style={{
            width: '220px',
            borderRadius: '8px',
            transform: 'rotate(8deg)',
          }}
        />
      </div>

      <div className="max-w-xl w-full">
        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-2xl font-bold tracking-wider uppercase text-center mb-2"
          style={{ color: '#c4a35a' }}
        >
          {t('quiz.title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-sm text-center mb-4"
          style={{ color: '#888888' }}
        >
          {t('quiz.selectDifficulty')}
        </motion.p>

        {/* Difficulty buttons */}
        <div className="flex flex-col gap-2 mb-4">
          {DIFFICULTIES.map((diff, index) => {
            const isSelected = selected === diff;
            const rankColor = RANK_COLORS[diff];

            return (
              <motion.button
                key={diff}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + index * 0.07 }}
                onClick={() => setSelected(diff)}
                className="w-full text-left px-5 py-3 transition-all"
                style={{
                  backgroundColor: isSelected ? 'rgba(196, 163, 90, 0.08)' : '#111111',
                  border: isSelected
                    ? '2px solid #c4a35a'
                    : '1px solid #262626',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Rank badge */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center text-xs font-bold uppercase"
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        border: `2px solid ${rankColor}`,
                        color: rankColor,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {diff}
                    </div>

                    <div>
                      {/* Rank name */}
                      <div
                        className="text-sm font-bold uppercase tracking-wide"
                        style={{ color: rankColor }}
                      >
                        {t(`quiz.difficulties.${diff}`)}
                      </div>
                      {/* Description */}
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: '#888888' }}
                      >
                        {t(`quiz.difficultyDesc.${diff}`)}
                      </div>
                    </div>
                  </div>

                  {/* Info: question count + time */}
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-xs" style={{ color: '#aaaaaa' }}>
                      {QUESTION_COUNTS[diff]} {t('quiz.questions')}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#888888' }}>
                      {TIME_LIMITS[diff]}s / {t('quiz.perQuestion')}
                    </div>
                    {/* Best score */}
                    {bestScores && bestScores[diff] !== undefined && (
                      <div
                        className="text-xs mt-1 font-bold"
                        style={{ color: '#c4a35a' }}
                      >
                        {t('quiz.bestScore', { score: String(bestScores[diff]) })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Start button */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="flex justify-center"
        >
          <motion.button
            whileHover={selected !== null ? { scale: 1.04 } : undefined}
            whileTap={selected !== null ? { scale: 0.97 } : undefined}
            disabled={selected === null}
            onClick={() => {
              if (selected !== null) onStart(selected);
            }}
            className="px-10 py-3 text-sm font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: selected !== null ? '#c4a35a' : '#262626',
              color: selected !== null ? '#0a0a0a' : '#555555',
              border: 'none',
              borderRadius: '6px',
              cursor: selected !== null ? 'pointer' : 'not-allowed',
              opacity: selected !== null ? 1 : 0.6,
            }}
          >
            {t('quiz.startQuiz')}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
