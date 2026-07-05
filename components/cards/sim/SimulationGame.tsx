'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import GameBoard from '@/components/game/GameBoard';
import { GameScaleProvider } from '@/components/game/GameScaleContext';
import { ScaledGameRoot } from '@/components/game/ScaledGameRoot';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { GameEngine } from '@/lib/engine/GameEngine';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getScenario } from '@/lib/cards/sim/scenarios';
import type { PendingAction } from '@/lib/engine/types';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

const MOUNT_MS = 800;
const READ_MS = 2000;
const POPUP_GRACE = 1400;
const END_PAUSE = 2200;
const TICK_MS = 150;
const CLICK_MS = 500;
const FOLLOWUP_DELAY = 1500;

function clickPos(): { x: number; y: number } {
  try {
    const el = document.querySelector('[data-game-popup]') as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 };
    }
  } catch { /* ignore */ }
  const w = typeof window !== 'undefined' ? window.innerWidth : 800;
  const h = typeof window !== 'undefined' ? window.innerHeight : 600;
  return { x: w / 2, y: h / 2 };
}

function defaultChoice(pending: PendingAction): string[] {
  const options = pending.options ?? [];
  const min = Math.max(1, pending.minSelections ?? 1);
  const allNumeric = options.length > 0 && options.every((o) => /^\d+$/.test(o));
  if (allNumeric && min === 1) {
    const max = options.reduce((a, b) => (parseInt(b, 10) > parseInt(a, 10) ? b : a), options[0]);
    return [max];
  }
  return options.slice(0, min);
}

export function SimulationGame({ cardId, effectIndex, onClose }: { cardId: string; effectIndex: number; onClose: () => void }) {
  const t = useTranslations();
  const tRef = useRef(t);
  tRef.current = t;

  const [portrait, setPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [done, setDone] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const [clickFx, setClickFx] = useState<{ x: number; y: number; key: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mqP = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const mqM = window.matchMedia('(max-width: 900px), (pointer: coarse)');
    const update = () => { setPortrait(mqP.matches); setIsMobile(mqM.matches); };
    update();
    mqP.addEventListener('change', update);
    mqM.addEventListener('change', update);
    return () => { mqP.removeEventListener('change', update); mqM.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    const scenario = getScenario(cardId, effectIndex);
    if (!scenario) { setUnavailable(true); return; }
    initializeRegistry();
    setDone(false);
    setUnavailable(false);

    let finished = false;
    let played = false;
    const answered = new Set<string>();
    const popupSince = new Map<string, number>();
    const pendingSeen = new Map<string, number>();
    const clickingSince = new Map<string, number>();
    let endAt: number | null = null;
    let followupPhase = 0;
    let followupAt: number | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let playTimer: ReturnType<typeof setTimeout> | null = null;

    const finishNow = () => {
      if (finished) return;
      finished = true;
      if (interval) { clearInterval(interval); interval = null; }
      const gs = useGameStore.getState().gameState;
      if (gs) {
        useGameStore.setState({
          humanPlayer: 'player1',
          visibleState: GameEngine.getVisibleState(gs, 'player1'),
          hotseatNextPlayer: null,
          hotseatSwitchPending: false,
          pendingTargetSelection: null,
          isProcessing: true,
        });
      }
      setDone(true);
    };

    const state = scenario.build();
    useUIStore.getState().setCoinFlipComplete(true);
    useUIStore.getState().setMissionDeckIntroComplete(true);
    useUIStore.setState({ showGameLog: true });
    useGameStore.setState({
      gameState: state,
      visibleState: GameEngine.getVisibleState(state, 'player1'),
      humanPlayer: 'player1',
      aiPlayer: null,
      isAIGame: false,
      isHotseatGame: true,
      isSandboxMode: false,
      isSimMode: true,
      isOnlineGame: false,
      hotseatSwitchPending: false,
      hotseatNextPlayer: null,
      isProcessing: false,
      gameOver: false,
      winner: null,
      isAnimating: false,
      animationQueue: [],
      pendingTargetSelection: null,
      replayInitialState: null,
      actionError: null,
      actionErrorKey: null,
      actionErrorParams: null,
      playerDisplayNames: { player1: tRef.current('cardPage.demoYou'), player2: tRef.current('cardPage.demoOpponent') },
    });

    const unsub = useGameStore.subscribe((s) => {
      if (finished || !played) return;
      if (s.hotseatNextPlayer != null) {
        const followups = scenario.followups ?? [];
        if (followupPhase >= followups.length) { finishNow(); return; }
        const g = s.gameState;
        useGameStore.setState({
          hotseatNextPlayer: null,
          hotseatSwitchPending: false,
          humanPlayer: 'player1',
          visibleState: g ? GameEngine.getVisibleState(g, 'player1') : s.visibleState,
        });
      }
    });

    playTimer = setTimeout(() => {
      played = true;
      useGameStore.getState().performAction(scenario.play.action);
    }, MOUNT_MS);

    interval = setInterval(() => {
      if (finished || !played) return;
      const s = useGameStore.getState();
      if (s.isProcessing) return;
      const gs = s.gameState;
      if (!gs) return;

      const pending = gs.pendingActions;
      if (pending.length === 0) {
        const followups = scenario.followups ?? [];
        if (followupPhase < followups.length) {
          if (followupAt == null) { followupAt = Date.now() + FOLLOWUP_DELAY; return; }
          if (Date.now() < followupAt) return;
          const f = followups[followupPhase];
          let st = gs;
          try {
            st = GameEngine.applyAction(st, f.player, f.action);
            let guard = 0;
            while (st.pendingActions.length > 0 && guard++ < 40) {
              const p = st.pendingActions[0];
              const targets = (scenario.choose && scenario.choose(st, p)) || defaultChoice(p);
              if (!targets.length) break;
              st = GameEngine.applyAction(st, p.player, { type: 'SELECT_TARGET', pendingActionId: p.id, selectedTargets: targets });
            }
          } catch { /* ignore */ }
          useGameStore.setState({
            gameState: st,
            visibleState: GameEngine.getVisibleState(st, 'player1'),
            humanPlayer: 'player1',
            hotseatNextPlayer: null,
            hotseatSwitchPending: false,
            isProcessing: false,
          });
          followupPhase++;
          followupAt = null;
          endAt = null;
          return;
        }
        if (endAt == null) endAt = Date.now() + END_PAUSE;
        else if (Date.now() >= endAt) finishNow();
        return;
      }
      endAt = null;

      const pa = pending.find((p) => p.player === s.humanPlayer) ?? pending[0];
      if (answered.has(pa.id)) return;

      if (s.pendingTargetSelection != null) {
        const since = popupSince.get(pa.id);
        if (since == null) { popupSince.set(pa.id, Date.now()); return; }
        if (Date.now() - since < READ_MS) return;
      } else {
        const seen = pendingSeen.get(pa.id);
        if (seen == null) { pendingSeen.set(pa.id, Date.now()); return; }
        if (Date.now() - seen < POPUP_GRACE) return;
      }

      const clickStart = clickingSince.get(pa.id);
      if (clickStart == null) {
        clickingSince.set(pa.id, Date.now());
        setClickFx({ ...clickPos(), key: Date.now() });
        return;
      }
      if (Date.now() - clickStart < CLICK_MS) return;

      answered.add(pa.id);
      setClickFx(null);
      const targets = (scenario.choose && scenario.choose(gs, pa)) || defaultChoice(pa);
      if (!targets || targets.length === 0) { finishNow(); return; }
      useGameStore.getState().performAction({ type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: targets });
    }, TICK_MS);

    return () => {
      finished = true;
      if (playTimer) clearTimeout(playTimer);
      if (interval) clearInterval(interval);
      unsub();
      useUIStore.setState({ showGameLog: false });
      useGameStore.getState().resetGame();
    };
  }, [cardId, effectIndex, runToken]);

  const replay = useCallback(() => { setDone(false); setRunToken((x) => x + 1); }, []);

  const closeBtn = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('common.close')}
      className="flex items-center justify-center w-9 h-9 rounded-full"
      style={{ backgroundColor: 'rgba(10,10,10,0.72)', color: '#e8e8e8', backdropFilter: 'blur(4px)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );

  if (unavailable) {
    return (
      <div className="fixed inset-0 bg-[#050505] text-[#e8e8e8] flex flex-col items-center justify-center gap-4" style={{ zIndex: Z_APP_MODAL }}>
        <p className="text-sm text-[#9a9a9a]">{t('cardPage.simulationSoon')}</p>
        {closeBtn}
      </div>
    );
  }

  if (portrait) {
    return (
      <div className="fixed inset-0 bg-[#050505] text-[#e8e8e8]" style={{ zIndex: Z_APP_MODAL }}>
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 gap-5">
          <motion.div
            className="rounded-md"
            style={{ width: 48, height: 80, border: '2px solid #c4a35a' }}
            animate={{ rotate: [0, 0, 90, 90], opacity: [0.5, 1, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <p className="text-lg font-bold">{t('cardPage.rotateDeviceTitle')}</p>
          <p className="text-sm text-[#9a9a9a] max-w-xs">{t('cardPage.rotateDeviceDesc')}</p>
          <div className="mt-2">{closeBtn}</div>
        </div>
      </div>
    );
  }

  if (typeof document === 'undefined') return null;

  const board = <GameBoard />;

  const layers = (
    <>
      <div className="fixed inset-0 bg-[#050505]" style={{ zIndex: 45 }}>
        <div className="absolute inset-0">
          {isMobile ? <ScaledGameRoot>{board}</ScaledGameRoot> : <GameScaleProvider>{board}</GameScaleProvider>}
        </div>
      </div>

      <div className="fixed inset-0" style={{ zIndex: 99998, pointerEvents: 'auto' }} aria-hidden="true" />

      {clickFx && (
        <div key={clickFx.key} className="fixed" style={{ left: clickFx.x, top: clickFx.y, zIndex: 99999, pointerEvents: 'none', transform: 'translate(-50%, -50%)' }}>
          <motion.div
            initial={{ scale: 0.25, opacity: 0.85 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ position: 'absolute', left: -30, top: -30, width: 60, height: 60, borderRadius: '50%', border: '2px solid #c4a35a' }}
          />
          <motion.div
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: [1.2, 0.8, 1], opacity: 1 }}
            transition={{ duration: 0.4 }}
            style={{ position: 'absolute', left: -3, top: -3, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#c4a35a" stroke="#0a0a0a" strokeWidth="1" aria-hidden="true">
              <path d="M5 3l14 8-6 1.5L10 20 5 3z" />
            </svg>
          </motion.div>
        </div>
      )}

      <div className="fixed inset-0" style={{ zIndex: 100000, pointerEvents: 'none' }}>
        <div className="absolute top-2 left-2 flex items-center gap-2" style={{ pointerEvents: 'auto' }}>
          {closeBtn}
          {done && (
            <button
              type="button"
              onClick={replay}
              className="px-3 h-9 rounded-full text-xs uppercase tracking-wider font-semibold"
              style={{ backgroundColor: '#c4a35a1f', color: '#c4a35a', backdropFilter: 'blur(4px)' }}
            >
              {t('cardPage.replaySim')}
            </button>
          )}
          <span
            className="px-3 h-7 flex items-center rounded-full text-[10px] uppercase tracking-[0.16em] font-semibold"
            style={{ backgroundColor: 'rgba(10,10,10,0.6)', color: '#c4a35a', backdropFilter: 'blur(4px)' }}
          >
            {done ? t('cardPage.simDone') : t('cardPage.simSpectatorHint')}
          </span>
        </div>
      </div>
    </>
  );

  return createPortal(layers, document.body);
}
