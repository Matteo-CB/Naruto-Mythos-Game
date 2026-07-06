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

const BTN: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  color: '#9a9a9a',
  cursor: 'pointer',
};

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

  useEffect(() => {
    if (isPlaying && currentStep >= totalSteps - 1) {
      stopPlay();
    }
  }, [currentStep, totalSteps, isPlaying, stopPlay]);

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
          const ts = turnStarts.find(x => x.turn === turnNum);
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

  const seekFromClientX = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onStepChange(Math.round(pct * (totalSteps - 1)));
  }, [onStepChange, totalSteps]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    stopPlay();
    seekFromClientX(e.clientX);
    const onMove = (ev: PointerEvent) => seekFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="pointer-events-auto flex flex-col overflow-hidden"
      style={{
        width: 'min(620px, calc(100vw - 16px))',
        backgroundColor: 'rgba(8, 8, 14, 0.92)',
        backdropFilter: 'blur(14px)',
        borderRadius: '10px',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        ref={progressBarRef}
        className="relative w-full cursor-pointer"
        style={{ height: '14px', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ height: '4px', backgroundColor: '#1c1c26' }}>
          {turnStarts.map(({ turn, step }) => {
            const pct = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0;
            return (
              <div
                key={turn}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${pct}%`, width: '2px', height: '8px', backgroundColor: 'rgba(255,255,255,0.18)' }}
              />
            );
          })}
          <div
            className="absolute left-0 top-0 h-full"
            style={{
              width: `${progressPct}%`,
              backgroundColor: '#c4a35a',
              transition: isPlaying ? 'none' : 'width 0.12s ease-out',
            }}
          />
        </div>
        <div
          className="absolute top-1/2"
          style={{
            left: `calc(${progressPct}% - 5px)`,
            width: '10px',
            height: '10px',
            backgroundColor: '#c4a35a',
            boxShadow: '0 0 8px rgba(196,163,90,0.5)',
            transform: 'translateY(-50%) rotate(45deg)',
          }}
        />
      </div>

      <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={goToStart} className="flex items-center justify-center w-7 h-7 text-[10px] rounded" style={BTN} title={t('start')}>
            |&lt;
          </button>
          <button onClick={stepBack} className="flex items-center justify-center w-7 h-7 text-xs rounded" style={BTN} title={t('stepBack')}>
            &lt;
          </button>
          <button
            onClick={isPlaying ? stopPlay : startPlay}
            className="flex items-center justify-center w-9 h-7 text-xs font-bold rounded"
            style={{
              backgroundColor: isPlaying ? 'rgba(179,62,62,0.18)' : 'rgba(62,139,62,0.18)',
              color: isPlaying ? '#d16a6a' : '#5cb85c',
              cursor: 'pointer',
            }}
          >
            {isPlaying ? '||' : '|>'}
          </button>
          <button onClick={stepForward} className="flex items-center justify-center w-7 h-7 text-xs rounded" style={BTN} title={t('stepForward')}>
            &gt;
          </button>
          <button onClick={goToEnd} className="flex items-center justify-center w-7 h-7 text-[10px] rounded" style={BTN} title={t('end')}>
            &gt;|
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {turnStarts.map(({ turn, step }) => (
            <button
              key={turn}
              onClick={() => { stopPlay(); onStepChange(step); }}
              className="flex items-center justify-center w-7 h-7 text-[10px] font-bold rounded"
              style={{
                backgroundColor: currentTurn === turn ? 'rgba(196, 163, 90, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: currentTurn === turn ? '#c4a35a' : '#666',
                cursor: 'pointer',
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              T{turn}
            </button>
          ))}
        </div>

        {actionLabel ? (
          <span className="flex-1 min-w-0 px-2 text-[11px] truncate" style={{ color: '#b9b9b9' }}>
            {actionLabel}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        <button
          onClick={cycleSpeed}
          className="flex items-center justify-center px-2 h-7 text-[10px] font-medium rounded shrink-0"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            color: speed === 'fast' ? '#c4a35a' : speed === 'slow' ? '#7a94cc' : '#888',
            cursor: 'pointer',
          }}
          title={`${t('speed')}: ${t(speed)}`}
        >
          {speed === 'slow' ? '0.5x' : speed === 'normal' ? '1x' : '2x'}
        </button>
        <span className="text-[10px] tabular-nums shrink-0 pr-1" style={{ color: '#555' }}>
          {currentStep + 1}/{totalSteps}
        </span>
      </div>
    </div>
  );
}
