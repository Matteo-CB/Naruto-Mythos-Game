export type FxKind =
  | 'burst'
  | 'ring'
  | 'sparksUp'
  | 'smoke'
  | 'embers'
  | 'spiral'
  | 'flash'
  | 'storm';

export interface FxRequest {
  kind: FxKind;
  x?: number;
  y?: number;
  color?: string;
  count?: number;
  scale?: number;
}

type FxListener = (req: FxRequest) => void;

let listener: FxListener | null = null;
let enabled = true;

export function setFxEnabled(v: boolean): void {
  enabled = v;
}

export function isFxEnabled(): boolean {
  return enabled;
}

export function subscribeFx(fn: FxListener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function emitFx(req: FxRequest): void {
  if (!enabled || typeof window === 'undefined') return;
  listener?.(req);
}

let shakeTimer: ReturnType<typeof setTimeout> | null = null;

export function shakeScreen(strength: 'soft' | 'hard' = 'soft'): void {
  if (!enabled || typeof window === 'undefined') return;
  const el = document.getElementById('game-board-root') ?? document.body;
  el.classList.remove('fx-shake-soft', 'fx-shake-hard');
  void el.offsetWidth;
  el.classList.add(strength === 'hard' ? 'fx-shake-hard' : 'fx-shake-soft');
  if (shakeTimer) clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    el.classList.remove('fx-shake-soft', 'fx-shake-hard');
  }, 450);
}

export const FX_GOLD = '#c4a35a';
export const FX_RED = '#c05038';
export const FX_BLUE = '#5A7ABB';
export const FX_WHITE = '#f5ecd8';
export const FX_SMOKE = '#3a3a42';
export const FX_GREEN = '#3e8b3e';
