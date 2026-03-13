'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';

const SPEEDS = { slow: 1500, normal: 800, fast: 300 };

interface PlaybackControlsProps {
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
  turnStarts: Array<{ turn: number; step: number }>;
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
  const progressBarRef = useRef<HTMLDivElement>(null);

  const stopPlay = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPlay = useCallback(() => {
    if (currentStep >= totalSteps - 1) {
      onStepChange(0);
    }
    setIsPlaying(true);
  }, [currentStep, totalSteps, onStepChange]);

  // Auto-advance
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onStepChange(-1);
      }, SPEEDS[speed]);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, onStepChange]);

  // Stop at end
  useEffect(() => {
    if (isPlaying && currentStep >= totalSteps - 1) {
      stopPlay();
    }
  }, [currentStep, totalSteps, isPlaying, stopPlay]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlaying) stopPlay();
          else startPlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stopPlay();
          onStepChange(Math.max(0, currentStep - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          stopPlay();
          onStepChange(Math.min(totalSteps - 1, currentStep + 1));
          break;
        case 'Home':
          e.preventDefault();
          stopPlay();
          onStepChange(0);
          break;
        case 'End':
          e.preventDefault();
          stopPlay();
          onStepChange(totalSteps - 1);
          break;
        case '1': case '2': case '3': case '4': {
          const turnNum = parseInt(e.key);
          const ts = turnStarts.find(ts => ts.turn === turnNum);
          if (ts) { stopPlay(); onStepChange(ts.step); }
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, currentStep, totalSteps, stopPlay, startPlay, onStepChange, turnStarts]);

  const goToStart = () => { stopPlay(); onStepChange(0); };
  const goToEnd = () => { stopPlay(); onStepChange(totalSteps - 1); };
  const stepBack = () => { stopPlay(); onStepChange(Math.max(0, currentStep - 1)); };
  const stepForward = () => { stopPlay(); onStepChange(Math.min(totalSteps - 1, currentStep + 1)); };

  const cycleSpeed = () => {
    const order: Array<'slow' | 'normal' | 'fast'> = ['slow', 'normal', 'fast'];
    const idx = order.indexOf(speed);
    setSpeed(order[(idx + 1) % order.length]);
  };

  const progressPct = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 0;

  const currentTurn = (() => {
    for (let i = turnStarts.length - 1; i >= 0; i--) {
      if (currentStep >= turnStarts[i].step) return turnStarts[i].turn;
    }
    return turnStarts[0]?.turn ?? 1;
  })();

  // Scrub via click or drag on progress bar
  const handleProgressClick = (e: React.MouseEvent) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    stopPlay();
    onStepChange(Math.round(pct * (totalSteps - 1)));
  };

  const isDraggingRef = useRef(false);
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    handleProgressClick(e);
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      onStepChange(Math.round(pct * (totalSteps - 1)));
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        backgroundColor: 'rgba(8, 8, 14, 0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Action label */}
      {actionLabel && (
        <div
          className="px-4 py-1"
          style={{ borderLeft: '3px solid rgba(196, 163, 90, 0.15)', margin: '0 16px' }}
        >
          <span className="text-[11px] leading-relaxed" style={{ color: '#c0c0c0' }}>
            {actionLabel}
          </span>
        </div>
      )}

      {/* Progress bar with turn markers */}
      <div className="px-4 pt-2 pb-0.5">
        <div
          ref={progressBarRef}
          className="relative w-full h-1.5 cursor-pointer group"
          style={{ backgroundColor: '#1a1a24' }}
          onMouseDown={handleMouseDown}
        >
          {turnStarts.map(({ turn, step }) => {
            const pct = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0;
            return (
              <div
                key={turn}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5"
                style={{
                  left: `${pct}%`,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  zIndex: 1,
                }}
              />
            );
          })}
          {/* Filled bar */}
          <div
            className="absolute left-0 top-0 h-full"
            style={{
              width: `${progressPct}%`,
              backgroundColor: '#c4a35a',
              transition: isPlaying ? 'none' : 'width 0.15s ease-out',
            }}
          />
          {/* Diamond handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-all group-hover:scale-125"
            style={{
              left: `calc(${progressPct}% - 5px)`,
              width: '10px',
              height: '10px',
              backgroundColor: '#c4a35a',
              border: '2px solid #0a0a0a',
              boxShadow: '0 0 6px rgba(196,163,90,0.4)',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 2,
            }}
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between px-4 py-1.5 gap-3">
        {/* Turn jump pills */}
        <div className="flex items-center gap-1">
          {turnStarts.map(({ turn, step }) => (
            <button
              key={turn}
              onClick={() => { stopPlay(); onStepChange(step); }}
              className="flex items-center justify-center px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors"
              style={{
                transform: 'skewX(-3deg)',
                backgroundColor: currentTurn === turn ? 'rgba(196, 163, 90, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: currentTurn === turn ? '#c4a35a' : '#666',
                borderLeft: currentTurn === turn ? '3px solid #c4a35a' : '3px solid rgba(255, 255, 255, 0.08)',
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>T{turn}</span>
            </button>
          ))}
        </div>

        {/* Main controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToStart}
            className="flex items-center justify-center w-7 h-7 text-[10px] cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.08)',
              color: '#777',
            }}
            title={t('start')}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>|&lt;</span>
          </button>
          <button
            onClick={stepBack}
            className="flex items-center justify-center w-7 h-7 text-xs cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.08)',
              color: '#777',
            }}
            title={t('stepBack')}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>&lt;</span>
          </button>
          <button
            onClick={isPlaying ? stopPlay : startPlay}
            className="flex items-center justify-center w-9 h-7 text-xs font-bold cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: isPlaying ? 'rgba(179,62,62,0.12)' : 'rgba(62,139,62,0.12)',
              borderLeft: isPlaying ? '3px solid rgba(179,62,62,0.6)' : '3px solid rgba(62,139,62,0.6)',
              color: isPlaying ? '#b33e3e' : '#4a9e4a',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
              {isPlaying ? '||' : '|>'}
            </span>
          </button>
          <button
            onClick={stepForward}
            className="flex items-center justify-center w-7 h-7 text-xs cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.08)',
              color: '#777',
            }}
            title={t('stepForward')}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>&gt;</span>
          </button>
          <button
            onClick={goToEnd}
            className="flex items-center justify-center w-7 h-7 text-[10px] cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(255, 255, 255, 0.08)',
              color: '#777',
            }}
            title={t('end')}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>&gt;|</span>
          </button>
        </div>

        {/* Speed + counter */}
        <div className="flex items-center gap-3">
          <button
            onClick={cycleSpeed}
            className="flex items-center justify-center px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors"
            style={{
              transform: 'skewX(-3deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: `2px solid ${speed === 'fast' ? 'rgba(196,163,90,0.5)' : speed === 'slow' ? 'rgba(90,122,187,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: speed === 'fast' ? '#c4a35a' : speed === 'slow' ? '#5A7ABB' : '#888',
            }}
            title={`${t('speed')}: ${t(speed)}`}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
              {speed === 'slow' ? '0.5x' : speed === 'normal' ? '1x' : '2x'}
            </span>
          </button>
          <span className="text-[10px] tabular-nums" style={{ color: '#555' }}>
            {currentStep + 1}/{totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}
