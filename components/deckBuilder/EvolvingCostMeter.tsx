'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { getEvolvingColorForPoints } from '@/lib/evolving/colors';
import { EvolvingRulesModal } from './EvolvingRulesModal';

const GOLD = '#c4a35a';
const PANEL_BG = '#0f0f0f';
const BORDER = '#262626';
const TEXT_LIGHT = '#e0e0e0';
const TEXT_DIM = '#888888';
const WARN = '#cc7a30';

interface Props {
  compact?: boolean;
}

export function EvolvingCostMeter({ compact = false }: Props) {
  const t = useTranslations('evolving');
  const [showRules, setShowRules] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const points = useDeckBuilderStore((s) => s.computeCurrentEvolvingPoints());
  const compatible = useDeckBuilderStore((s) => s.isCurrentDeckEvolvingCompatible());
  const evolvingMode = useDeckBuilderStore((s) => s.evolvingMode);
  const setEvolvingMode = useDeckBuilderStore((s) => s.setEvolvingMode);

  const color = getEvolvingColorForPoints(Math.min(points, EVOLVING_MAX_POINTS)) ?? WARN;
  const overBudget = points > EVOLVING_MAX_POINTS;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: 'rgba(0,0,0,0.4)',
            border: `1px solid ${overBudget ? WARN : color}`,
            borderRadius: '3px',
            color: overBudget ? WARN : color,
            cursor: 'pointer',
            outline: 'none',
          }}
          aria-expanded={expanded}
          aria-label={t('costLabel', { points, max: EVOLVING_MAX_POINTS })}
        >
          <span className="tabular-nums">{Math.min(points, 99)}/{EVOLVING_MAX_POINTS}</span>
          <span style={{ opacity: 0.6, fontSize: '8px' }}>EVO</span>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="fixed left-0 right-0 z-50 mx-auto max-w-[420px] p-3 sm:p-4 mt-2"
              style={{
                top: '50px',
                backgroundColor: PANEL_BG,
                border: `1px solid ${BORDER}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <FullMeter
                points={points}
                compatible={compatible}
                overBudget={overBudget}
                color={color}
                evolvingMode={evolvingMode}
                setEvolvingMode={setEvolvingMode}
                onRulesOpen={() => setShowRules(true)}
                onClose={() => setExpanded(false)}
                t={t}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <EvolvingRulesModal open={showRules} onClose={() => setShowRules(false)} />
      </>
    );
  }

  return (
    <>
      <FullMeter
        points={points}
        compatible={compatible}
        overBudget={overBudget}
        color={color}
        evolvingMode={evolvingMode}
        setEvolvingMode={setEvolvingMode}
        onRulesOpen={() => setShowRules(true)}
        onClose={null}
        t={t}
      />
      <EvolvingRulesModal open={showRules} onClose={() => setShowRules(false)} />
    </>
  );
}

interface FullMeterProps {
  points: number;
  compatible: boolean;
  overBudget: boolean;
  color: string;
  evolvingMode: boolean;
  setEvolvingMode: (on: boolean) => void;
  onRulesOpen: () => void;
  onClose: (() => void) | null;
  t: ReturnType<typeof useTranslations>;
}

function FullMeter({
  points,
  compatible,
  overBudget,
  color,
  evolvingMode,
  setEvolvingMode,
  onRulesOpen,
  onClose,
  t,
}: FullMeterProps) {
  const segments = [];
  const usedSegments = Math.min(Math.ceil(points), EVOLVING_MAX_POINTS);
  for (let i = 0; i < EVOLVING_MAX_POINTS; i++) {
    const filled = i < usedSegments;
    segments.push(
      <div
        key={i}
        className="flex-1 h-1.5"
        style={{
          backgroundColor: filled ? (overBudget ? WARN : color) : 'rgba(255,255,255,0.06)',
          transition: 'background-color 0.18s ease',
        }}
      />,
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em]" style={{ color: TEXT_DIM }}>
          {t('costLabel', { points, max: EVOLVING_MAX_POINTS })}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRulesOpen}
            aria-label={t('rules.title')}
            className="inline-flex items-center justify-center text-[10px] font-bold transition-colors"
            style={{
              color: GOLD,
              border: `1px solid ${GOLD}`,
              backgroundColor: 'rgba(196, 163, 90, 0.05)',
              width: '20px',
              height: '20px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            ?
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label={t('rules.close')}
              className="inline-flex items-center justify-center text-[10px] font-bold transition-colors"
              style={{
                color: TEXT_DIM,
                border: `1px solid ${BORDER}`,
                backgroundColor: 'transparent',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              x
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="text-2xl sm:text-3xl font-bold tabular-nums flex-shrink-0"
          style={{ color: overBudget ? WARN : color, lineHeight: 1 }}
        >
          {points}
          <span className="text-base sm:text-lg" style={{ color: TEXT_DIM }}>/{EVOLVING_MAX_POINTS}</span>
        </div>
        <div className="flex-1 flex gap-0.5 min-w-0">
          {segments}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5"
          style={{
            color: overBudget ? WARN : compatible ? '#7a9e4a' : TEXT_DIM,
            border: `1px solid ${overBudget ? WARN : compatible ? '#7a9e4a' : BORDER}`,
            borderRadius: '3px',
          }}
        >
          {overBudget ? t('overBudgetBadge') : compatible ? t('compatibleBadge') : t('notCompatibleBadge')}
        </span>
        <button
          onClick={() => setEvolvingMode(!evolvingMode)}
          className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 transition-colors"
          style={{
            color: evolvingMode ? '#0a0a0a' : GOLD,
            backgroundColor: evolvingMode ? GOLD : 'transparent',
            border: `1px solid ${GOLD}`,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {evolvingMode ? t('modeOn') : t('modeOff')}
        </button>
      </div>
    </div>
  );
}
