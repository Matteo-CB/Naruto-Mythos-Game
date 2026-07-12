import { VFX_MANIFEST, type VfxName } from './vfxManifest';
import type { AnchorRect } from './boardRegistry';

const sheetCache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement | null>>();

function loadSheet(name: VfxName): Promise<HTMLImageElement | null> {
  const cached = sheetCache.get(name);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(name);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.src = `/images/vfx/${name}.webp`;
    img.decode()
      .then(() => { sheetCache.set(name, img); resolve(img); })
      .catch(() => resolve(null));
  });
  loading.set(name, promise);
  return promise;
}

export function preloadVfx(): void {
  if (typeof document === 'undefined') return;
  for (const name of Object.keys(VFX_MANIFEST) as VfxName[]) {
    void loadSheet(name);
  }
}

export function frameSource(sheet: { cols: number; size: number }, frame: number): { sx: number; sy: number } {
  return {
    sx: (frame % sheet.cols) * sheet.size,
    sy: Math.floor(frame / sheet.cols) * sheet.size,
  };
}

export interface LandingVfxInput {
  hidden?: boolean;
  rarity?: string;
  isSummon?: boolean;
}

const TOP_RARITIES = new Set(['S', 'SV', 'M', 'MV', 'L']);

export function vfxForLanding(input: LandingVfxInput): VfxName | null {
  if (input.hidden) return 'kawarimi';
  if (input.rarity && TOP_RARITIES.has(input.rarity)) return 'burst-legendary';
  if (input.isSummon) return 'seal-summon';
  return null;
}

export async function playVfx(
  name: VfxName,
  rect: AnchorRect,
  opts: { sizePx?: number; isMobile?: boolean } = {},
): Promise<void> {
  if (typeof document === 'undefined') return;
  const meta = VFX_MANIFEST[name];
  if (!meta) return;
  const sheet = await loadSheet(name);
  if (!sheet) return;

  const base = Math.max(rect.width, rect.height) * 1.5;
  const renderSize = Math.round(Math.min(opts.sizePx ?? (opts.isMobile ? 128 : 208), Math.max(96, base)));

  const canvas = document.createElement('canvas');
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  canvas.width = renderSize * dpr;
  canvas.height = renderSize * dpr;
  canvas.style.cssText = [
    'position:fixed', 'pointer-events:none', 'z-index:46',
    `left:${rect.left + rect.width / 2 - renderSize / 2}px`,
    `top:${rect.top + rect.height / 2 - renderSize / 2}px`,
    `width:${renderSize}px`, `height:${renderSize}px`,
  ].join(';');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  document.body.appendChild(canvas);

  const frameMs = 1000 / meta.fps;
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const step = (now: number) => {
      const frame = Math.floor((now - start) / frameMs);
      if (frame >= meta.frames) {
        canvas.remove();
        resolve();
        return;
      }
      const { sx, sy } = frameSource(meta, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sheet, sx, sy, meta.size, meta.size, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
