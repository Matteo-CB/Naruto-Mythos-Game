'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

const SPEEDS = { slow: 1500, normal: 800, fast: 300 };

interface PlaybackControlsProps {
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
  /** Turn numbers where each turn starts (step index) */
  turnStarts: Array<{ turn: number; step: number }>;
  /** Label describing what happened at the current step */
  actionLabel?: string;
}

export function PlaybackControls({
  currentStep,
  totalSteps,
  onStepChange,
  turnStarts,
  actionLabel,
}: PlaybackControlsProps) {
  const t = useTranslations('replay');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPlay = useCallback(() => {
    if (currentStep >= totalSteps - 1) {
      // At the end, restart from beginning
      onStepChange(0);
    }
    setIsPlaying(true);
  }, [currentStep, totalSteps, onStepChange]);

  // Auto-advance effect
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onStepChange(-1); // -1 signals "advance by one"
      }, SPEEDS[speed]);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, onStepChange]);

  // Stop when reaching end
  useEffect(() => {
    if (isPlaying && currentStep >= totalSteps - 1) {
      stopPlay();
    }
  }, [currentStep, totalSteps, isPlaying, stopPlay]);

  const goToStart = () => { stopPlay(); onStepChange(0); };
  const goToEnd = () => { stopPlay(); onStepChange(totalSteps - 1); };
  const stepBack = () => { stopPlay(); onStepChange(Math.max(0, currentStep - 1)); };
  const stepForward = () => { stopPlay(); onStepChange(Math.min(totalSteps - 1, currentStep + 1)); };

  const progressPct = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 0;

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
    >
      {/* Action label */}
      {actionLabel && (
        <div className="text-center mb-2">
          <span className="text-[11px]" style={{ color: '#e0e0e0' }}>
            {actionLabel}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div
        className="relative w-full h-2 rounded-full mb-3 cursor-pointer"
        style={{ backgroundColor: '#0a0a0a' }}
        onClick={(e) => {
          stopPlay();
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onStepChange(Math.round(pct * (totalSteps - 1)));
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${progressPct}%`, backgroundColor: '#c4a35a' }}
        />
        {/* Scrubber dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
          style={{
            left: `calc(${progressPct}% - 6px)`,
            backgroundColor: '#c4a35a',
            border: '2px solid #0a0a0a',
          }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Turn jump buttons */}
        <div className="flex items-center gap-1">
          {turnStarts.map(({ turn, step }) => (
            <button
              key={turn}
              onClick={() => { stopPlay(); onStepChange(step); }}
              className="px-2 py-1 text-[9px] rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: currentStep >= step && (turn === turnStarts[turnStarts.length - 1]?.turn || currentStep < (turnStarts.find(ts => ts.turn === turn + 1)?.step ?? Infinity))
                  ? '#c4a35a'
                  : '#1a1a2e',
                color: currentStep >= step && (turn === turnStarts[turnStarts.length - 1]?.turn || currentStep < (turnStarts.find(ts => ts.turn === turn + 1)?.step ?? Infinity))
                  ? '#0a0a0a'
                  : '#888',
                border: '1px solid #333',
              }}
            >
              T{turn}
            </button>
          ))}
        </div>

        {/* Playback buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToStart}
            className="px-2 py-1 text-xs rounded cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888' }}
            title={t('start')}
          >
            |&lt;&lt;
          </button>
          <button
            onClick={stepBack}
            className="px-2 py-1 text-xs rounded cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888' }}
            title={t('stepBack')}
          >
            &lt;
          </button>
          <button
            onClick={isPlaying ? stopPlay : startPlay}
            className="px-3 py-1 text-xs rounded cursor-pointer font-bold"
            style={{
              backgroundColor: isPlaying ? '#2a1a1a' : '#1a2a1a',
              border: `1px solid ${isPlaying ? '#b33e3e' : '#3E8B3E'}`,
              color: isPlaying ? '#b33e3e' : '#4a9e4a',
            }}
          >
            {isPlaying ? t('pause') : t('autoPlay')}
          </button>
          <button
            onClick={stepForward}
            className="px-2 py-1 text-xs rounded cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888' }}
            title={t('stepForward')}
          >
            &gt;
          </button>
          <button
            onClick={goToEnd}
            className="px-2 py-1 text-xs rounded cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888' }}
            title={t('end')}
          >
            &gt;&gt;|
          </button>
        </div>

        {/* Speed + step counter */}
        <div className="flex items-center gap-2">
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value as 'slow' | 'normal' | 'fast')}
            className="text-[10px] rounded px-1.5 py-1 cursor-pointer"
            style={{ backgroundColor: '#1a1a2e', border: '1px solid #333', color: '#888' }}
          >
            <option value="slow">{t('slow')}</option>
            <option value="normal">{t('normal')}</option>
            <option value="fast">{t('fast')}</option>
          </select>
          <span className="text-[10px] tabular-nums" style={{ color: '#555' }}>
            {currentStep + 1} / {totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}
