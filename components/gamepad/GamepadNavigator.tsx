'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from '@/lib/i18n/navigation';
import { useSettingsStore } from '@/stores/settingsStore';
import { readGamepads, GP, emptySnapshot, type InputSnapshot } from '@/lib/gamepad/mapping';
import { collectFocusables, isElementInViewport, type Focusable } from '@/lib/gamepad/focusables';
import { pickInDirection, pickNearest, type Direction, type FocusRect } from '@/lib/gamepad/spatial';
import { GamepadHelpOverlay } from './GamepadHelpOverlay';

const STICK_THRESHOLD = 0.5;
const INITIAL_REPEAT_MS = 340;
const REPEAT_MS = 120;
const SCROLL_SPEED = 14;
const IDLE_HIDE_MS = 6000;

function activate(el: HTMLElement) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    el.focus();
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type;
      if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit' || type === 'range') {
        el.click();
      }
    }
    return;
  }
  el.focus?.({ preventScroll: true });
  el.click();
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 4) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function scrollBy(container: HTMLElement | Window, dy: number) {
  if (container === window) {
    window.scrollBy({ top: dy, behavior: 'auto' });
  } else {
    (container as HTMLElement).scrollTop += dy;
  }
}

function ensureVisible(el: HTMLElement) {
  if (isElementInViewport(el)) return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

export function GamepadNavigator() {
  const enabled = useSettingsStore((s) => s.gamepadEnabled);
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [ringRect, setRingRect] = useState<FocusRect | null>(null);
  const [ringVisible, setRingVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  const focusedRef = useRef<HTMLElement | null>(null);
  const prevSnapRef = useRef<InputSnapshot>(emptySnapshot());
  const heldDirRef = useRef<{ dir: Direction | null; nextAt: number }>({ dir: null, nextAt: 0 });
  const lastActivityRef = useRef(0);
  const rafRef = useRef<number>(0);
  const helpOpenRef = useRef(false);
  helpOpenRef.current = helpOpen;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => { setMounted(true); }, []);

  const setFocused = useCallback((el: HTMLElement | null) => {
    focusedRef.current = el;
    if (el) {
      ensureVisible(el);
      const r = el.getBoundingClientRect();
      setRingRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    } else {
      setRingRect(null);
    }
  }, []);

  const focusablesNow = useCallback((): Focusable[] => collectFocusables(), []);

  const currentRect = useCallback((): FocusRect | null => {
    const el = focusedRef.current;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return null;
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, []);

  const focusInitial = useCallback(() => {
    const items = focusablesNow();
    if (items.length === 0) { setFocused(null); return; }
    const target = pickNearest({ x: window.innerWidth / 2, y: window.innerHeight * 0.28 }, items);
    setFocused(target ? target.el : items[0].el);
  }, [focusablesNow, setFocused]);

  const move = useCallback((dir: Direction) => {
    const items = focusablesNow();
    if (items.length === 0) return;
    const cur = currentRect();
    if (!cur) { focusInitial(); return; }
    const others = items.filter((f) => f.el !== focusedRef.current);
    const next = pickInDirection(cur, others, dir);
    if (next) setFocused(next.el);
  }, [focusablesNow, currentRect, focusInitial, setFocused]);

  const goBack = useCallback(() => {
    const layer = document.querySelector<HTMLElement>('[data-gp-layer],[role="dialog"],[aria-modal="true"]');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    if (layer) {
      const closeBtn = layer.querySelector<HTMLElement>('[data-gp-back],[aria-label="Close"],[aria-label="Fermer"]');
      if (closeBtn) closeBtn.click();
    }
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      setConnected(Array.from(pads).some((p) => p));
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    if (Array.from(pads).some((p) => p)) setConnected(true);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  useEffect(() => {
    setFocused(null);
    heldDirRef.current = { dir: null, nextAt: 0 };
  }, [pathname, setFocused]);

  useEffect(() => {
    const onPointer = () => { setRingVisible(false); };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('wheel', onPointer, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('wheel', onPointer);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const snap = readGamepads();
      const prev = prevSnapRef.current;
      if (snap.anyConnected && !connected) setConnected(true);

      if (!enabledRef.current || !snap.anyConnected) {
        prevSnapRef.current = snap;
        return;
      }

      const now = performance.now();
      const justPressed = (i: number) => snap.buttons[i] && !prev.buttons[i];

      const anyInput =
        snap.buttons.some(Boolean) ||
        Math.abs(snap.leftX) > STICK_THRESHOLD || Math.abs(snap.leftY) > STICK_THRESHOLD ||
        Math.abs(snap.rightY) > 0.2 || Math.abs(snap.rightX) > 0.2;
      if (anyInput) {
        lastActivityRef.current = now;
        if (!ringVisible) setRingVisible(true);
        if (!focusedRef.current || !focusedRef.current.isConnected) focusInitial();
      } else if (ringVisible && now - lastActivityRef.current > IDLE_HIDE_MS) {
        setRingVisible(false);
      }

      if (helpOpenRef.current) {
        if (justPressed(GP.B) || justPressed(GP.START)) setHelpOpen(false);
        prevSnapRef.current = snap;
        return;
      }

      let dir: Direction | null = null;
      let forced = false;
      if (justPressed(GP.DUP)) { dir = 'up'; forced = true; }
      else if (justPressed(GP.DDOWN)) { dir = 'down'; forced = true; }
      else if (justPressed(GP.DLEFT)) { dir = 'left'; forced = true; }
      else if (justPressed(GP.DRIGHT)) { dir = 'right'; forced = true; }
      else if (snap.buttons[GP.DUP]) dir = 'up';
      else if (snap.buttons[GP.DDOWN]) dir = 'down';
      else if (snap.buttons[GP.DLEFT]) dir = 'left';
      else if (snap.buttons[GP.DRIGHT]) dir = 'right';
      else if (Math.abs(snap.leftX) > STICK_THRESHOLD || Math.abs(snap.leftY) > STICK_THRESHOLD) {
        dir = Math.abs(snap.leftX) > Math.abs(snap.leftY) ? (snap.leftX > 0 ? 'right' : 'left') : (snap.leftY > 0 ? 'down' : 'up');
      }

      const held = heldDirRef.current;
      if (dir) {
        if (forced || dir !== held.dir) {
          move(dir);
          heldDirRef.current = { dir, nextAt: now + INITIAL_REPEAT_MS };
        } else if (now >= held.nextAt) {
          move(dir);
          held.nextAt = now + REPEAT_MS;
        }
      } else {
        heldDirRef.current = { dir: null, nextAt: 0 };
      }

      if (justPressed(GP.A)) {
        const el = focusedRef.current;
        if (el && el.isConnected) activate(el);
        else focusInitial();
      }
      if (justPressed(GP.B)) goBack();
      if (justPressed(GP.START)) setHelpOpen(true);

      const scrollContainer = findScrollContainer(focusedRef.current);
      if (snap.buttons[GP.RT]) scrollBy(scrollContainer, SCROLL_SPEED);
      if (snap.buttons[GP.LT]) scrollBy(scrollContainer, -SCROLL_SPEED);
      if (Math.abs(snap.rightY) > 0.2) scrollBy(scrollContainer, snap.rightY * SCROLL_SPEED * 1.6);
      if (justPressed(GP.RB)) scrollBy(scrollContainer, window.innerHeight * 0.8);
      if (justPressed(GP.LB)) scrollBy(scrollContainer, -window.innerHeight * 0.8);

      const el = focusedRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRingRect((prevRect) => {
          if (prevRect && Math.abs(prevRect.left - r.left) < 0.5 && Math.abs(prevRect.top - r.top) < 0.5 &&
            Math.abs(prevRect.right - r.right) < 0.5 && Math.abs(prevRect.bottom - r.bottom) < 0.5) {
            return prevRect;
          }
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
      } else if (focusedRef.current) {
        setFocused(null);
      }

      prevSnapRef.current = snap;
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mounted, connected, ringVisible, move, goBack, focusInitial, setFocused]);

  if (!mounted || !enabled) return null;

  const showRing = ringVisible && ringRect && connected;

  return createPortal(
    <>
      {showRing && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate(${ringRect.left - 4}px, ${ringRect.top - 4}px)`,
            width: ringRect.right - ringRect.left + 8,
            height: ringRect.bottom - ringRect.top + 8,
            border: '2px solid #c4a35a',
            borderRadius: 8,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 0 16px rgba(196,163,90,0.55)',
            pointerEvents: 'none',
            zIndex: 2147483000,
            transition: 'transform 0.11s cubic-bezier(0.22,1,0.36,1), width 0.11s ease, height 0.11s ease',
            willChange: 'transform,width,height',
          }}
        />
      )}
      {helpOpen && <GamepadHelpOverlay onClose={() => setHelpOpen(false)} />}
    </>,
    document.body,
  );
}
