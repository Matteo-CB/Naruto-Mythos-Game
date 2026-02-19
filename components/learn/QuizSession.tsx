'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useQuizStore } from '@/stores/quizStore';
import type {
  QuizQuestion,
  QuizAnswer,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  MatchPairsQuestion,
  SortOrderQuestion,
  FillNumberQuestion,
  CategorySortQuestion,
  SpotErrorQuestion,
} from '@/lib/quiz/questionGenerator';

// =====================================================================
// CONSTANTS
// =====================================================================

const TIME_LIMITS: Record<number, number> = {
  1: 30,
  2: 25,
  3: 20,
  4: 15,
  5: 12,
};

const FEEDBACK_GREEN = '#3e8b3e';
const FEEDBACK_RED = '#b33e3e';
const GOLD = '#c4a35a';
const DARK_BG = '#0a0a0a';
const PANEL_BG = '#111111';
const BORDER = '#262626';
const TEXT_LIGHT = '#cccccc';
const TEXT_DIM = '#888888';

// =====================================================================
// UTILITY: extract card number and name from image path
// =====================================================================

function extractCardInfoFromPath(imagePath: string): { number: string; name: string } {
  // Normalize slashes
  const path = imagePath.replace(/\\/g, '/');
  // Get filename without extension, e.g. "108-130_NARUTO_UZUMAKI"
  const filename = path.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
  // Match pattern like "108-130_NAME" or "108-130 A_NAME" or "MSS 01_NAME"
  const missionMatch = filename.match(/^(MSS[\s_]\d+)[\s_](.+)$/i);
  if (missionMatch) {
    const num = missionMatch[1].replace('_', ' ');
    const name = missionMatch[2].replace(/_/g, ' ');
    return { number: num, name };
  }
  const match = filename.match(/^(\d+)-(\d+)(?:\s*[A-Z])?[_\s](.+)$/);
  if (match) {
    const number = `${match[1]}/${match[2]}`;
    const name = match[3].replace(/_/g, ' ');
    return { number, name };
  }
  // Fallback
  return { number: '', name: filename.replace(/_/g, ' ') };
}

// =====================================================================
// UTILITY: determine if a question should have its card image blurred
// =====================================================================

const NO_BLUR_QUESTION_KEYS = new Set([
  'quiz.q.identifyCard',
  'quiz.q.identifyMission',
  'quiz.q.matchImage',
]);

function shouldBlurImage(questionTextKey: string, hasImage: boolean): boolean {
  return hasImage && !NO_BLUR_QUESTION_KEYS.has(questionTextKey);
}

// =====================================================================
// UTILITY: seeded shuffle for initial order of drag items
// =====================================================================

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = (s * 31 + seed.charCodeAt(i)) | 0;
  }
  const rng = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =====================================================================
// SMALL CARD THUMBNAIL
// =====================================================================

function CardThumbnail({
  src,
  size = 52,
  blurred = false,
}: {
  src?: string;
  size?: number;
  blurred?: boolean;
}) {
  if (!src) return null;
  const path = src.replace(/\\/g, '/');
  const fullPath = path.startsWith('/') ? path : `/${path}`;
  return (
    <img
      src={fullPath}
      alt=""
      draggable={false}
      style={{
        width: `${size}px`,
        height: `${Math.round(size * 1.4)}px`,
        borderRadius: '6px',
        objectFit: 'cover',
        flexShrink: 0,
        filter: blurred ? 'blur(8px)' : 'none',
      }}
    />
  );
}

// =====================================================================
// TIMER BAR
// =====================================================================

function TimerBar({
  timeRemaining,
  timeLimit,
}: {
  timeRemaining: number;
  timeLimit: number;
}) {
  const pct = Math.max(0, (timeRemaining / timeLimit) * 100);
  let color = GOLD;
  if (pct <= 25) color = FEEDBACK_RED;
  else if (pct <= 50) color = '#cc7a30';

  return (
    <div
      style={{
        width: '100%',
        height: '6px',
        backgroundColor: '#1a1a1a',
        borderRadius: '3px',
        overflow: 'hidden',
      }}
    >
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.3, ease: 'linear' }}
        style={{
          height: '100%',
          backgroundColor: color,
          borderRadius: '2px',
        }}
      />
    </div>
  );
}

// =====================================================================
// TOP BAR
// =====================================================================

function TopBar({ timeLimit }: { timeLimit: number }) {
  const t = useTranslations('learn');
  const currentIndex = useQuizStore((s) => s.currentIndex);
  const questions = useQuizStore((s) => s.questions);
  const timeRemaining = useQuizStore((s) => s.timeRemaining);
  const score = useQuizStore((s) => s.score);
  const streak = useQuizStore((s) => s.streak);

  return (
    <div className="mb-6">
      {/* Row: question counter, score, streak */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-bold" style={{ color: TEXT_LIGHT }}>
          {t('quiz.questionCounter', {
            current: currentIndex + 1,
            total: questions.length,
          })}
        </span>
        <div className="flex items-center gap-4">
          {streak >= 3 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-sm font-bold px-3 py-1"
              style={{
                color: GOLD,
                backgroundColor: 'rgba(196, 163, 90, 0.12)',
                borderRadius: '4px',
              }}
            >
              {t('quiz.streakCount', { count: streak.toString() })}
            </motion.span>
          )}
          <span className="text-base font-bold" style={{ color: GOLD }}>
            {score}
          </span>
        </div>
      </div>

      {/* Timer */}
      <TimerBar timeRemaining={timeRemaining} timeLimit={timeLimit} />
      <div className="text-right mt-1">
        <span className="text-xs" style={{ color: TEXT_DIM }}>
          {timeRemaining}s
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// QUESTION IMAGE
// =====================================================================

function QuestionImage({
  src,
  blurred = false,
}: {
  src?: string;
  blurred?: boolean;
}) {
  if (!src) return null;
  const path = src.replace(/\\/g, '/');
  const fullPath = path.startsWith('/') ? path : `/${path}`;
  const cardInfo = blurred ? extractCardInfoFromPath(src) : null;

  return (
    <div className="flex justify-center mb-4">
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img
          src={fullPath}
          alt=""
          draggable={false}
          style={{
            maxHeight: '360px',
            borderRadius: '10px',
            objectFit: 'contain',
            filter: blurred ? 'blur(20px)' : 'none',
            transition: 'filter 0.3s ease',
          }}
        />
        {blurred && cardInfo && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                padding: '8px 16px',
                borderRadius: '6px',
                textAlign: 'center',
              }}
            >
              {cardInfo.number && (
                <div
                  style={{
                    color: GOLD,
                    fontSize: '20px',
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  {cardInfo.number}
                </div>
              )}
              <div
                style={{
                  color: GOLD,
                  fontSize: '16px',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  textTransform: 'capitalize',
                }}
              >
                {cardInfo.name.toLowerCase()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// EXPLANATION PANEL (shown after answering)
// =====================================================================

function ExplanationPanel({
  question,
  isCorrect,
  partialMsg,
}: {
  question: QuizQuestion;
  isCorrect: boolean;
  partialMsg?: string;
}) {
  const t = useTranslations('learn');
  const nextQuestion = useQuizStore((s) => s.nextQuestion);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-4 p-4"
      style={{
        backgroundColor: isCorrect
          ? 'rgba(62, 139, 62, 0.1)'
          : 'rgba(179, 62, 62, 0.1)',
        border: `1px solid ${isCorrect ? FEEDBACK_GREEN : FEEDBACK_RED}`,
        borderRadius: '6px',
      }}
    >
      <div
        className="text-base font-bold mb-1"
        style={{ color: isCorrect ? FEEDBACK_GREEN : FEEDBACK_RED }}
      >
        {isCorrect ? t('quiz.correct') : t('quiz.incorrect')}
        {partialMsg && !isCorrect && (
          <span className="ml-2 font-normal" style={{ color: TEXT_DIM }}>
            {partialMsg}
          </span>
        )}
      </div>
      <div className="font-body text-sm mb-3" style={{ color: TEXT_LIGHT, lineHeight: 1.6 }}>
        {t(
          question.explanationKey as Parameters<typeof t>[0],
          question.explanationParams as Record<string, string> | undefined
        )}
      </div>
      <button
        onClick={nextQuestion}
        className="px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all"
        style={{
          backgroundColor: GOLD,
          color: DARK_BG,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        {t('quiz.next')}
      </button>
    </motion.div>
  );
}

// =====================================================================
// 1. MULTIPLE CHOICE RENDERER
// =====================================================================

function MultipleChoiceRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
}: {
  question: MultipleChoiceQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
}) {
  const t = useTranslations('learn');
  const selectedIndex =
    userAnswer && userAnswer.type === 'multipleChoice'
      ? userAnswer.selectedIndex
      : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {question.options.map((option, i) => {
        const isCorrect = i === question.correctIndex;
        const isSelected = selectedIndex === i;
        let borderColor = BORDER;
        let bgColor = PANEL_BG;

        if (showingAnswer) {
          if (isCorrect) {
            borderColor = FEEDBACK_GREEN;
            bgColor = 'rgba(62, 139, 62, 0.1)';
          } else if (isSelected && !isCorrect) {
            borderColor = FEEDBACK_RED;
            bgColor = 'rgba(179, 62, 62, 0.1)';
          }
        }

        const label = question.optionsAreKeys
          ? t(option as Parameters<typeof t>[0])
          : option;

        return (
          <motion.button
            key={i}
            whileHover={!showingAnswer ? { scale: 1.02 } : undefined}
            whileTap={!showingAnswer ? { scale: 0.97 } : undefined}
            disabled={showingAnswer}
            onClick={() => {
              if (!showingAnswer) {
                onSubmit({ type: 'multipleChoice', selectedIndex: i });
              }
            }}
            className="px-5 py-4 text-left text-base transition-all"
            style={{
              backgroundColor: bgColor,
              border: `2px solid ${borderColor}`,
              borderRadius: '8px',
              color: TEXT_LIGHT,
              cursor: showingAnswer ? 'default' : 'pointer',
              outline: 'none',
              lineHeight: 1.5,
            }}
          >
            <span
              className="inline-block w-6 text-sm font-bold mr-2"
              style={{ color: TEXT_DIM }}
            >
              {String.fromCharCode(65 + i)}.
            </span>
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}

// =====================================================================
// 2. TRUE / FALSE RENDERER
// =====================================================================

function TrueFalseRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
}: {
  question: TrueFalseQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
}) {
  const t = useTranslations('learn');
  const userBool =
    userAnswer && userAnswer.type === 'trueFalse' ? userAnswer.answer : null;

  const buttons = [
    { value: true, label: t('quiz.true') },
    { value: false, label: t('quiz.false') },
  ];

  return (
    <div className="flex gap-4 justify-center">
      {buttons.map(({ value, label }) => {
        const isCorrect = value === question.correctAnswer;
        const isSelected = userBool === value;
        let borderColor = BORDER;
        let bgColor = PANEL_BG;

        if (showingAnswer) {
          if (isCorrect) {
            borderColor = FEEDBACK_GREEN;
            bgColor = 'rgba(62, 139, 62, 0.1)';
          } else if (isSelected && !isCorrect) {
            borderColor = FEEDBACK_RED;
            bgColor = 'rgba(179, 62, 62, 0.1)';
          }
        }

        return (
          <motion.button
            key={String(value)}
            whileHover={!showingAnswer ? { scale: 1.04 } : undefined}
            whileTap={!showingAnswer ? { scale: 0.96 } : undefined}
            disabled={showingAnswer}
            onClick={() => {
              if (!showingAnswer) {
                onSubmit({ type: 'trueFalse', answer: value });
              }
            }}
            className="px-10 py-5 text-lg font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: bgColor,
              border: `2px solid ${borderColor}`,
              borderRadius: '8px',
              color: TEXT_LIGHT,
              cursor: showingAnswer ? 'default' : 'pointer',
              outline: 'none',
              minWidth: '150px',
            }}
          >
            {label}
          </motion.button>
        );
      })}
    </div>
  );
}

// =====================================================================
// 3. MATCH PAIRS RENDERER (drag & drop + click fallback)
// =====================================================================

function MatchPairsRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
  blurThumbnails = false,
}: {
  question: MatchPairsQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
  blurThumbnails?: boolean;
}) {
  const t = useTranslations('learn');
  const pairs = question.pairs;
  const pairCount = pairs.length;

  // mapping: leftIndex -> rightIndex
  const [mapping, setMapping] = useState<Record<number, number>>({});
  // For click-to-assign: which pool item is "selected"
  const [clickSelected, setClickSelected] = useState<number | null>(null);
  // Which drop zone is being dragged over
  const [dragOverZone, setDragOverZone] = useState<number | null>(null);

  // Pool of right-side items (shuffled). Index in pool = original pair index.
  const shuffledRight = useMemo(
    () =>
      seededShuffle(
        pairs.map((_, i) => i),
        question.id
      ),
    [pairs, question.id]
  );

  // Items still in pool (not yet placed)
  const placedRight = new Set(Object.values(mapping));
  const poolItems = shuffledRight.filter((i) => !placedRight.has(i));

  const allPlaced = Object.keys(mapping).length === pairCount;

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, rightIdx: number) => {
      e.dataTransfer.setData('text/plain', String(rightIdx));
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, leftIdx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverZone(leftIdx);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverZone(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, leftIdx: number) => {
      e.preventDefault();
      setDragOverZone(null);
      const rightIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(rightIdx)) return;
      setMapping((prev) => {
        // If this right item was already placed elsewhere, remove it
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[Number(key)] === rightIdx) {
            delete next[Number(key)];
          }
        }
        next[leftIdx] = rightIdx;
        return next;
      });
    },
    []
  );

  // Click-to-assign: click pool item then click drop zone
  const handlePoolClick = useCallback(
    (rightIdx: number) => {
      if (showingAnswer) return;
      setClickSelected((prev) => (prev === rightIdx ? null : rightIdx));
    },
    [showingAnswer]
  );

  const handleZoneClick = useCallback(
    (leftIdx: number) => {
      if (showingAnswer) return;
      if (clickSelected !== null) {
        setMapping((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[Number(key)] === clickSelected) {
              delete next[Number(key)];
            }
          }
          next[leftIdx] = clickSelected;
          return next;
        });
        setClickSelected(null);
      } else {
        // If zone has a placed item, return it to pool
        if (mapping[leftIdx] !== undefined) {
          setMapping((prev) => {
            const next = { ...prev };
            delete next[leftIdx];
            return next;
          });
        }
      }
    },
    [showingAnswer, clickSelected, mapping]
  );

  // Submit
  const handleSubmit = useCallback(() => {
    if (!allPlaced || showingAnswer) return;
    onSubmit({ type: 'matchPairs', mapping });
  }, [allPlaced, showingAnswer, mapping, onSubmit]);

  // Feedback colors after answer
  const userMapping =
    userAnswer && userAnswer.type === 'matchPairs' ? userAnswer.mapping : null;

  return (
    <div>
      {/* Left items with drop zones */}
      <div className="flex flex-col gap-2 mb-4">
        {pairs.map((pair, leftIdx) => {
          const placedRightIdx = showingAnswer
            ? userMapping?.[leftIdx]
            : mapping[leftIdx];
          const hasPlaced = placedRightIdx !== undefined;
          const isOver = dragOverZone === leftIdx;

          // Feedback
          let zoneBorder = BORDER;
          if (showingAnswer && userMapping) {
            // Correct match: leftIdx -> leftIdx (the pairs array is the correct order)
            const isCorrectMatch = userMapping[leftIdx] === leftIdx;
            zoneBorder = isCorrectMatch ? FEEDBACK_GREEN : FEEDBACK_RED;
          } else if (isOver) {
            zoneBorder = GOLD;
          }

          return (
            <div
              key={leftIdx}
              className="flex items-center gap-3"
              style={{ minHeight: '48px' }}
            >
              {/* Left side: label + image */}
              <div
                className="flex items-center gap-3 flex-1 px-4 py-3"
                style={{
                  backgroundColor: PANEL_BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: '6px',
                  minWidth: 0,
                }}
              >
                <CardThumbnail src={pair.leftImage} size={44} blurred={blurThumbnails} />
                <span className="text-sm truncate" style={{ color: TEXT_LIGHT }}>
                  {pair.left}
                </span>
              </div>

              {/* Arrow indicator */}
              <span
                className="text-xs flex-shrink-0"
                style={{ color: TEXT_DIM }}
              >
                --&gt;
              </span>

              {/* Drop zone */}
              <div
                onDragOver={(e) => handleDragOver(e, leftIdx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, leftIdx)}
                onClick={() => handleZoneClick(leftIdx)}
                className="flex items-center gap-3 flex-1 px-4 py-3 transition-all"
                style={{
                  backgroundColor: hasPlaced
                    ? 'rgba(196, 163, 90, 0.06)'
                    : 'rgba(20, 20, 20, 0.6)',
                  border: `2px dashed ${zoneBorder}`,
                  borderRadius: '6px',
                  minHeight: '52px',
                  cursor: showingAnswer ? 'default' : 'pointer',
                }}
              >
                {hasPlaced && placedRightIdx !== undefined ? (
                  <>
                    <CardThumbnail
                      src={pairs[placedRightIdx]?.rightImage}
                      size={36}
                      blurred={blurThumbnails}
                    />
                    <span
                      className="text-sm truncate"
                      style={{ color: TEXT_LIGHT }}
                    >
                      {pairs[placedRightIdx]?.right}
                    </span>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: TEXT_DIM }}>
                    {t('quiz.dropHere')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pool of right-side items */}
      {!showingAnswer && poolItems.length > 0 && (
        <div className="mb-4">
          <div className="text-sm mb-2" style={{ color: TEXT_DIM }}>
            {t('quiz.dragItems')}
          </div>
          <div className="flex flex-wrap gap-3">
            {poolItems.map((rightIdx) => (
              <div
                key={rightIdx}
                draggable
                onDragStart={(e) => handleDragStart(e, rightIdx)}
                onClick={() => handlePoolClick(rightIdx)}
                className="flex items-center gap-3 px-4 py-3 transition-all"
                style={{
                  backgroundColor:
                    clickSelected === rightIdx
                      ? 'rgba(196, 163, 90, 0.15)'
                      : PANEL_BG,
                  border: `1px solid ${
                    clickSelected === rightIdx ? GOLD : BORDER
                  }`,
                  borderRadius: '6px',
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <CardThumbnail
                  src={pairs[rightIdx]?.rightImage}
                  size={36}
                  blurred={blurThumbnails}
                />
                <span className="text-sm" style={{ color: TEXT_LIGHT }}>
                  {pairs[rightIdx]?.right}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit button */}
      {!showingAnswer && (
        <div className="flex justify-center">
          <button
            disabled={!allPlaced}
            onClick={handleSubmit}
            className="px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: allPlaced ? GOLD : '#262626',
              color: allPlaced ? DARK_BG : '#555555',
              border: 'none',
              borderRadius: '4px',
              cursor: allPlaced ? 'pointer' : 'not-allowed',
              opacity: allPlaced ? 1 : 0.6,
            }}
          >
            {t('quiz.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 4. SORT ORDER RENDERER (drag & drop reorder)
// =====================================================================

function SortOrderRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
  blurThumbnails = false,
}: {
  question: SortOrderQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
  blurThumbnails?: boolean;
}) {
  const t = useTranslations('learn');
  const items = question.items;

  // Initial shuffled order: array of item indices
  const initialOrder = useMemo(
    () =>
      seededShuffle(
        items.map((_, i) => i),
        question.id
      ),
    [items, question.id]
  );

  const [order, setOrder] = useState<number[]>(initialOrder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, posIdx: number) => {
      e.dataTransfer.setData('text/plain', String(posIdx));
      e.dataTransfer.effectAllowed = 'move';
      setDragIndex(posIdx);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, posIdx: number) => {
      e.preventDefault();
      setDragOverIndex(posIdx);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetPos: number) => {
      e.preventDefault();
      const sourcePos = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(sourcePos) || sourcePos === targetPos) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      setOrder((prev) => {
        const next = [...prev];
        const [removed] = next.splice(sourcePos, 1);
        next.splice(targetPos, 0, removed);
        return next;
      });
      setDragIndex(null);
      setDragOverIndex(null);
    },
    []
  );

  // Move up/down buttons (mobile-friendly)
  const moveItem = useCallback((posIdx: number, direction: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev];
      const target = posIdx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[posIdx], next[target]] = [next[target], next[posIdx]];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (showingAnswer) return;
    onSubmit({ type: 'sortOrder', order });
  }, [order, showingAnswer, onSubmit]);

  // Feedback
  const userOrder =
    userAnswer && userAnswer.type === 'sortOrder' ? userAnswer.order : null;

  const displayOrder = showingAnswer && userOrder ? userOrder : order;

  return (
    <div>
      <div className="flex flex-col gap-2 mb-4">
        {displayOrder.map((itemIdx, posIdx) => {
          const item = items[itemIdx];
          const isDragging = dragIndex === posIdx;
          const isOver = dragOverIndex === posIdx;

          let borderColor = BORDER;
          if (showingAnswer && userOrder) {
            const correctAtPos = question.correctOrder[posIdx];
            borderColor =
              userOrder[posIdx] === correctAtPos ? FEEDBACK_GREEN : FEEDBACK_RED;
          } else if (isOver) {
            borderColor = GOLD;
          }

          return (
            <div
              key={`${question.id}-${posIdx}`}
              draggable={!showingAnswer}
              onDragStart={(e) => handleDragStart(e, posIdx)}
              onDragOver={(e) => handleDragOver(e, posIdx)}
              onDrop={(e) => handleDrop(e, posIdx)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-3 px-4 py-3 transition-all"
              style={{
                backgroundColor: PANEL_BG,
                border: `2px solid ${borderColor}`,
                borderRadius: '6px',
                opacity: isDragging ? 0.5 : 1,
                cursor: showingAnswer ? 'default' : 'grab',
                userSelect: 'none',
              }}
            >
              {/* Position number */}
              <span
                className="text-sm font-bold flex-shrink-0"
                style={{ color: TEXT_DIM, width: '24px', textAlign: 'center' }}
              >
                {posIdx + 1}
              </span>

              {/* Drag handle indicator */}
              {!showingAnswer && (
                <span
                  className="text-sm flex-shrink-0"
                  style={{ color: TEXT_DIM, userSelect: 'none' }}
                >
                  ::
                </span>
              )}

              <CardThumbnail src={item?.image} size={44} blurred={blurThumbnails} />
              <span
                className="text-sm flex-1 truncate"
                style={{ color: TEXT_LIGHT }}
              >
                {item?.label}
              </span>

              {/* Up/Down buttons for mobile */}
              {!showingAnswer && (
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveItem(posIdx, -1);
                    }}
                    disabled={posIdx === 0}
                    className="text-xs px-1"
                    style={{
                      color: posIdx === 0 ? '#333333' : TEXT_DIM,
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: posIdx === 0 ? 'default' : 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveItem(posIdx, 1);
                    }}
                    disabled={posIdx === displayOrder.length - 1}
                    className="text-xs px-1"
                    style={{
                      color:
                        posIdx === displayOrder.length - 1
                          ? '#333333'
                          : TEXT_DIM,
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor:
                        posIdx === displayOrder.length - 1
                          ? 'default'
                          : 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    &#9660;
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showingAnswer && (
        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            className="px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: GOLD,
              color: DARK_BG,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {t('quiz.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 5. FILL NUMBER RENDERER
// =====================================================================

function FillNumberRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
}: {
  question: FillNumberQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
}) {
  const t = useTranslations('learn');
  const [value, setValue] = useState<number>(0);

  const userVal =
    userAnswer && userAnswer.type === 'fillNumber' ? userAnswer.answer : null;
  const displayValue = showingAnswer && userVal !== null ? userVal : value;

  const handleSubmit = useCallback(() => {
    if (showingAnswer) return;
    onSubmit({ type: 'fillNumber', answer: value });
  }, [value, showingAnswer, onSubmit]);

  const unit = question.unitKey
    ? t(question.unitKey as Parameters<typeof t>[0])
    : '';

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-4">
        {/* Minus button */}
        {!showingAnswer && (
          <button
            onClick={() => setValue((v) => Math.max(0, v - 1))}
            className="flex items-center justify-center text-lg font-bold"
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: PANEL_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: '4px',
              color: TEXT_LIGHT,
              cursor: 'pointer',
            }}
          >
            -
          </button>
        )}

        {/* Number input */}
        <div className="flex items-center gap-2">
          {showingAnswer ? (
            <div
              className="text-2xl font-bold text-center"
              style={{
                color:
                  userVal === question.correctAnswer
                    ? FEEDBACK_GREEN
                    : FEEDBACK_RED,
                minWidth: '60px',
              }}
            >
              {displayValue}
            </div>
          ) : (
            <input
              type="number"
              min={0}
              max={99}
              value={value}
              onChange={(e) => setValue(Math.max(0, parseInt(e.target.value) || 0))}
              className="text-center text-2xl font-bold"
              style={{
                width: '80px',
                backgroundColor: PANEL_BG,
                border: `2px solid ${BORDER}`,
                borderRadius: '4px',
                color: TEXT_LIGHT,
                padding: '8px',
                outline: 'none',
              }}
            />
          )}
          {unit && (
            <span className="text-sm" style={{ color: TEXT_DIM }}>
              {unit}
            </span>
          )}
        </div>

        {/* Plus button */}
        {!showingAnswer && (
          <button
            onClick={() => setValue((v) => v + 1)}
            className="flex items-center justify-center text-lg font-bold"
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: PANEL_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: '4px',
              color: TEXT_LIGHT,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Correct answer display */}
      {showingAnswer && userVal !== question.correctAnswer && (
        <div className="text-center text-xs mb-3" style={{ color: FEEDBACK_GREEN }}>
          {t('quiz.correctAnswer')}: {question.correctAnswer}
          {unit ? ` ${unit}` : ''}
        </div>
      )}

      {!showingAnswer && (
        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            className="px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: GOLD,
              color: DARK_BG,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {t('quiz.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 6. CATEGORY SORT RENDERER (drag & drop)
// =====================================================================

function CategorySortRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
  blurThumbnails = false,
}: {
  question: CategorySortQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
  blurThumbnails?: boolean;
}) {
  const t = useTranslations('learn');
  const { categories, items } = question;

  // mapping: itemIndex -> categoryIndex
  const [mapping, setMapping] = useState<Record<number, number>>({});
  const [clickSelected, setClickSelected] = useState<number | null>(null);
  const [dragOverCat, setDragOverCat] = useState<number | null>(null);

  const allPlaced = Object.keys(mapping).length === items.length;

  // Drag from pool
  const handleDragStart = useCallback(
    (e: React.DragEvent, itemIdx: number) => {
      e.dataTransfer.setData('text/plain', String(itemIdx));
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleDragOverCat = useCallback(
    (e: React.DragEvent, catIdx: number) => {
      e.preventDefault();
      setDragOverCat(catIdx);
    },
    []
  );

  const handleDragLeaveCat = useCallback(() => {
    setDragOverCat(null);
  }, []);

  const handleDropOnCat = useCallback(
    (e: React.DragEvent, catIdx: number) => {
      e.preventDefault();
      setDragOverCat(null);
      const itemIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(itemIdx)) return;
      setMapping((prev) => ({ ...prev, [itemIdx]: catIdx }));
    },
    []
  );

  // Click fallback
  const handlePoolItemClick = useCallback(
    (itemIdx: number) => {
      if (showingAnswer) return;
      setClickSelected((prev) => (prev === itemIdx ? null : itemIdx));
    },
    [showingAnswer]
  );

  const handleCatClick = useCallback(
    (catIdx: number) => {
      if (showingAnswer || clickSelected === null) return;
      setMapping((prev) => ({ ...prev, [clickSelected]: catIdx }));
      setClickSelected(null);
    },
    [showingAnswer, clickSelected]
  );

  // Remove item from category (click to return to pool)
  const handleRemoveFromCat = useCallback(
    (itemIdx: number) => {
      if (showingAnswer) return;
      setMapping((prev) => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
      });
    },
    [showingAnswer]
  );

  const handleSubmit = useCallback(() => {
    if (!allPlaced || showingAnswer) return;
    onSubmit({ type: 'categorySort', mapping });
  }, [allPlaced, showingAnswer, mapping, onSubmit]);

  // Feedback
  const userMapping =
    userAnswer && userAnswer.type === 'categorySort'
      ? userAnswer.mapping
      : null;
  const displayMapping = showingAnswer && userMapping ? userMapping : mapping;

  // Pool: items not yet placed
  const placedSet = new Set(
    Object.keys(displayMapping).map(Number)
  );
  const poolItems = items
    .map((_, i) => i)
    .filter((i) => !placedSet.has(i));

  return (
    <div>
      {/* Category zones */}
      <div
        className="grid gap-3 mb-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(categories.length, 3)}, 1fr)`,
        }}
      >
        {categories.map((cat, catIdx) => {
          const isOver = dragOverCat === catIdx;
          const catItems = Object.entries(displayMapping)
            .filter(([, c]) => c === catIdx)
            .map(([i]) => Number(i));

          return (
            <div
              key={catIdx}
              onDragOver={(e) => handleDragOverCat(e, catIdx)}
              onDragLeave={handleDragLeaveCat}
              onDrop={(e) => handleDropOnCat(e, catIdx)}
              onClick={() => handleCatClick(catIdx)}
              className="flex flex-col transition-all"
              style={{
                backgroundColor: isOver
                  ? 'rgba(196, 163, 90, 0.08)'
                  : 'rgba(17, 17, 17, 0.8)',
                border: `2px solid ${isOver ? GOLD : BORDER}`,
                borderRadius: '6px',
                minHeight: '120px',
                cursor: showingAnswer ? 'default' : 'pointer',
              }}
            >
              {/* Category header */}
              <div
                className="px-3 py-3 text-sm font-bold uppercase tracking-wider text-center"
                style={{
                  color: GOLD,
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                {t(cat as Parameters<typeof t>[0])}
              </div>

              {/* Items in this category */}
              <div className="flex flex-col gap-2 p-3">
                {catItems.map((itemIdx) => {
                  const item = items[itemIdx];
                  let itemBorder = 'transparent';
                  if (showingAnswer && userMapping) {
                    const isCorrect =
                      userMapping[itemIdx] === item.correctCategory;
                    itemBorder = isCorrect ? FEEDBACK_GREEN : FEEDBACK_RED;
                  }

                  return (
                    <div
                      key={itemIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromCat(itemIdx);
                      }}
                      className="flex items-center gap-2 px-3 py-2 transition-all"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        border: `1px solid ${itemBorder}`,
                        borderRadius: '4px',
                        cursor: showingAnswer ? 'default' : 'pointer',
                      }}
                    >
                      <CardThumbnail src={item?.image} size={32} blurred={blurThumbnails} />
                      <span
                        className="text-sm truncate"
                        style={{ color: TEXT_LIGHT }}
                      >
                        {item?.label}
                      </span>
                      {/* Show correct category arrow if wrong */}
                      {showingAnswer &&
                        userMapping &&
                        userMapping[itemIdx] !== item.correctCategory && (
                          <span
                            className="text-sm ml-auto flex-shrink-0"
                            style={{ color: FEEDBACK_GREEN }}
                          >
                            -&gt;{' '}
                            {t(
                              categories[item.correctCategory] as Parameters<
                                typeof t
                              >[0]
                            )}
                          </span>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pool */}
      {!showingAnswer && poolItems.length > 0 && (
        <div className="mb-4">
          <div className="text-sm mb-2" style={{ color: TEXT_DIM }}>
            {t('quiz.dragItems')}
          </div>
          <div className="flex flex-wrap gap-3">
            {poolItems.map((itemIdx) => {
              const item = items[itemIdx];
              return (
                <div
                  key={itemIdx}
                  draggable
                  onDragStart={(e) => handleDragStart(e, itemIdx)}
                  onClick={() => handlePoolItemClick(itemIdx)}
                  className="flex items-center gap-3 px-4 py-3 transition-all"
                  style={{
                    backgroundColor:
                      clickSelected === itemIdx
                        ? 'rgba(196, 163, 90, 0.15)'
                        : PANEL_BG,
                    border: `1px solid ${
                      clickSelected === itemIdx ? GOLD : BORDER
                    }`,
                    borderRadius: '6px',
                    cursor: 'grab',
                    userSelect: 'none',
                  }}
                >
                  <CardThumbnail src={item?.image} size={36} blurred={blurThumbnails} />
                  <span className="text-sm" style={{ color: TEXT_LIGHT }}>
                    {item?.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit */}
      {!showingAnswer && (
        <div className="flex justify-center">
          <button
            disabled={!allPlaced}
            onClick={handleSubmit}
            className="px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: allPlaced ? GOLD : '#262626',
              color: allPlaced ? DARK_BG : '#555555',
              border: 'none',
              borderRadius: '4px',
              cursor: allPlaced ? 'pointer' : 'not-allowed',
              opacity: allPlaced ? 1 : 0.6,
            }}
          >
            {t('quiz.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 7. SPOT ERROR RENDERER
// =====================================================================

function SpotErrorRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
}: {
  question: SpotErrorQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
}) {
  const t = useTranslations('learn');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const userSelected =
    userAnswer && userAnswer.type === 'spotError'
      ? new Set(userAnswer.selectedIndices)
      : null;

  const displaySelected = showingAnswer && userSelected ? userSelected : selected;

  const toggleStatement = useCallback(
    (idx: number) => {
      if (showingAnswer) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        return next;
      });
    },
    [showingAnswer]
  );

  const handleSubmit = useCallback(() => {
    if (showingAnswer) return;
    onSubmit({ type: 'spotError', selectedIndices: [...selected] });
  }, [selected, showingAnswer, onSubmit]);

  return (
    <div>
      <div className="text-sm mb-3" style={{ color: TEXT_DIM }}>
        {t('quiz.selectErrors')}
      </div>

      <div className="flex flex-col gap-3 mb-4">
        {question.statements.map((stmt, idx) => {
          const isChecked = displaySelected.has(idx);
          let borderColor = BORDER;
          let bgColor = PANEL_BG;

          if (showingAnswer) {
            if (stmt.isError && userSelected?.has(idx)) {
              // Correctly identified error
              borderColor = FEEDBACK_GREEN;
              bgColor = 'rgba(62, 139, 62, 0.1)';
            } else if (stmt.isError && !userSelected?.has(idx)) {
              // Missed error
              borderColor = FEEDBACK_RED;
              bgColor = 'rgba(179, 62, 62, 0.05)';
            } else if (!stmt.isError && userSelected?.has(idx)) {
              // Incorrectly flagged as error
              borderColor = FEEDBACK_RED;
              bgColor = 'rgba(179, 62, 62, 0.1)';
            } else {
              // Correctly not flagged
              borderColor = 'rgba(62, 139, 62, 0.3)';
            }
          }

          return (
            <button
              key={idx}
              onClick={() => toggleStatement(idx)}
              disabled={showingAnswer}
              className="flex items-center gap-4 w-full text-left px-5 py-4 transition-all"
              style={{
                backgroundColor: bgColor,
                border: `2px solid ${borderColor}`,
                borderRadius: '6px',
                cursor: showingAnswer ? 'default' : 'pointer',
                outline: 'none',
              }}
            >
              {/* Checkbox indicator */}
              <div
                className="flex-shrink-0 flex items-center justify-center text-sm"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  backgroundColor: isChecked
                    ? 'rgba(196, 163, 90, 0.2)'
                    : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${isChecked ? GOLD : BORDER}`,
                  color: isChecked ? GOLD : 'transparent',
                }}
              >
                {isChecked ? 'X' : ''}
              </div>

              <span className="font-body text-sm" style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}>
                {t(
                  stmt.textKey as Parameters<typeof t>[0],
                  stmt.textParams as Record<string, string> | undefined
                )}
              </span>

              {/* After answer: show if this IS an error */}
              {showingAnswer && stmt.isError && (
                <span
                  className="text-sm ml-auto flex-shrink-0 font-bold"
                  style={{ color: FEEDBACK_RED }}
                >
                  {t('quiz.isError')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!showingAnswer && (
        <div className="flex justify-center">
          <button
            onClick={handleSubmit}
            className="px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              backgroundColor: GOLD,
              color: DARK_BG,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {t('quiz.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// QUESTION ROUTER
// =====================================================================

function QuestionRenderer({
  question,
  onSubmit,
  showingAnswer,
  userAnswer,
  blurThumbnails,
}: {
  question: QuizQuestion;
  onSubmit: (answer: QuizAnswer) => void;
  showingAnswer: boolean;
  userAnswer: QuizAnswer | null;
  blurThumbnails: boolean;
}) {
  switch (question.type) {
    case 'multipleChoice':
      return (
        <MultipleChoiceRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
        />
      );
    case 'trueFalse':
      return (
        <TrueFalseRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
        />
      );
    case 'matchPairs':
      return (
        <MatchPairsRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
          blurThumbnails={blurThumbnails}
        />
      );
    case 'sortOrder':
      return (
        <SortOrderRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
          blurThumbnails={blurThumbnails}
        />
      );
    case 'fillNumber':
      return (
        <FillNumberRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
        />
      );
    case 'categorySort':
      return (
        <CategorySortRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
          blurThumbnails={blurThumbnails}
        />
      );
    case 'spotError':
      return (
        <SpotErrorRenderer
          question={question}
          onSubmit={onSubmit}
          showingAnswer={showingAnswer}
          userAnswer={userAnswer}
        />
      );
    default:
      return null;
  }
}

// =====================================================================
// MAIN QUIZ SESSION COMPONENT
// =====================================================================

export function QuizSession() {
  const t = useTranslations('learn');

  // Store selectors
  const difficulty = useQuizStore((s) => s.difficulty);
  const questions = useQuizStore((s) => s.questions);
  const currentIndex = useQuizStore((s) => s.currentIndex);
  const answers = useQuizStore((s) => s.answers);
  const showingAnswer = useQuizStore((s) => s.showingAnswer);
  const timerActive = useQuizStore((s) => s.timerActive);
  const tickTimer = useQuizStore((s) => s.tickTimer);
  const timeOut = useQuizStore((s) => s.timeOut);
  const submitAnswer = useQuizStore((s) => s.submitAnswer);

  const question = questions[currentIndex] ?? null;
  const userAnswer = answers[currentIndex] ?? null;
  const timeLimit = TIME_LIMITS[difficulty ?? 1] ?? 30;

  // Track when question started for timeSpent
  const questionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [currentIndex]);

  // Timer tick
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, tickTimer]);

  // Handle submit from child renderers
  const handleSubmit = useCallback(
    (answer: QuizAnswer) => {
      if (showingAnswer) return;
      const timeSpent = Date.now() - questionStartRef.current;
      submitAnswer(answer, timeSpent);
    },
    [showingAnswer, submitAnswer]
  );

  // Check correctness for explanation panel
  const isCorrect = useMemo(() => {
    if (!showingAnswer || !question || !userAnswer) return false;
    // Import inline check from store logic
    switch (question.type) {
      case 'multipleChoice':
        return (
          userAnswer.type === 'multipleChoice' &&
          userAnswer.selectedIndex === question.correctIndex
        );
      case 'trueFalse':
        return (
          userAnswer.type === 'trueFalse' &&
          userAnswer.answer === question.correctAnswer
        );
      case 'matchPairs':
        if (userAnswer.type !== 'matchPairs') return false;
        return question.pairs.every(
          (_, i) => userAnswer.mapping[i] === i
        );
      case 'sortOrder':
        if (userAnswer.type !== 'sortOrder') return false;
        return question.correctOrder.every(
          (v, i) => userAnswer.order[i] === v
        );
      case 'fillNumber':
        return (
          userAnswer.type === 'fillNumber' &&
          userAnswer.answer === question.correctAnswer
        );
      case 'categorySort':
        if (userAnswer.type !== 'categorySort') return false;
        return question.items.every(
          (item, i) => userAnswer.mapping[i] === item.correctCategory
        );
      case 'spotError': {
        if (userAnswer.type !== 'spotError') return false;
        const errors = question.statements
          .map((s, i) => (s.isError ? i : -1))
          .filter((i) => i >= 0);
        const a = [...userAnswer.selectedIndices].sort();
        const e = [...errors].sort();
        return (
          a.length === e.length && a.every((v, i) => v === e[i])
        );
      }
      default:
        return false;
    }
  }, [showingAnswer, question, userAnswer]);

  // Partial score message for drag types
  const partialMsg = useMemo(() => {
    if (!showingAnswer || !question || !userAnswer || isCorrect) return undefined;
    let partial = 0;
    let total = 0;
    switch (question.type) {
      case 'matchPairs':
        if (userAnswer.type === 'matchPairs') {
          total = question.pairs.length;
          partial = question.pairs.filter(
            (_, i) => userAnswer.mapping[i] === i
          ).length;
        }
        break;
      case 'sortOrder':
        if (userAnswer.type === 'sortOrder') {
          total = question.correctOrder.length;
          partial = question.correctOrder.filter(
            (v, i) => userAnswer.order[i] === v
          ).length;
        }
        break;
      case 'categorySort':
        if (userAnswer.type === 'categorySort') {
          total = question.items.length;
          partial = question.items.filter(
            (item, i) => userAnswer.mapping[i] === item.correctCategory
          ).length;
        }
        break;
      case 'spotError':
        if (userAnswer.type === 'spotError') {
          const errSet = new Set(
            question.statements
              .map((s, i) => (s.isError ? i : -1))
              .filter((i) => i >= 0)
          );
          total = question.statements.length;
          for (let i = 0; i < total; i++) {
            if (userAnswer.selectedIndices.includes(i) === errSet.has(i)) {
              partial++;
            }
          }
        }
        break;
    }
    if (total > 0 && partial > 0 && partial < total) {
      return `${partial}/${total}`;
    }
    return undefined;
  }, [showingAnswer, question, userAnswer, isCorrect]);

  if (!question) return null;

  return (
    <div
      className="min-h-[calc(100vh-80px)] flex items-start justify-center px-4 py-4"
      style={{ backgroundColor: DARK_BG }}
    >
      <div className="max-w-2xl w-full">
        {/* Top bar */}
        <TopBar timeLimit={timeLimit} />

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`question-${currentIndex}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
          >
            {/* Question image — blurred when it would reveal the answer */}
            <QuestionImage
              src={question.questionImage}
              blurred={
                !showingAnswer &&
                shouldBlurImage(
                  question.questionTextKey,
                  !!question.questionImage
                )
              }
            />

            {/* Question text */}
            <div
              className="text-lg font-bold mb-5 text-center"
              style={{ color: TEXT_LIGHT, lineHeight: 1.5 }}
            >
              {t(
                question.questionTextKey as Parameters<typeof t>[0],
                question.questionParams as Record<string, string> | undefined
              )}
            </div>

            {/* Question type renderer */}
            <QuestionRenderer
              question={question}
              onSubmit={handleSubmit}
              showingAnswer={showingAnswer}
              userAnswer={userAnswer}
              blurThumbnails={
                !showingAnswer &&
                shouldBlurImage(
                  question.questionTextKey,
                  !!question.questionImage
                )
              }
            />

            {/* Timeout indicator */}
            {showingAnswer && userAnswer === null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center mt-4 text-sm font-bold"
                style={{ color: FEEDBACK_RED }}
              >
                {t('quiz.timeUp')}
              </motion.div>
            )}

            {/* Explanation panel */}
            {showingAnswer && (
              <ExplanationPanel
                question={question}
                isCorrect={userAnswer !== null && isCorrect}
                partialMsg={partialMsg}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
