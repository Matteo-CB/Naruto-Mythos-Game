'use client';

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { subscribeFx, setFxEnabled, type FxRequest } from '@/lib/fx/fxBus';

interface Particle {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  r: number; g: number; b: number;
  gravity: number;
  drag: number;
  mode: 0 | 1;
  spin: number;
  angle: number;
  orbit: number;
}

const MAX_PARTICLES = 480;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function makeSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function FXLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  useEffect(() => {
    setFxEnabled(animationsEnabled);
  }, [animationsEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sprite = makeSprite();
    const pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 4, r: 255, g: 255, b: 255, gravity: 0, drag: 1, mode: 0, spin: 0, angle: 0, orbit: 0,
    }));
    let alive = 0;
    let raf = 0;
    let running = false;
    let lastTs = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (n: number, init: (p: Particle) => void) => {
      for (let i = 0; i < pool.length && n > 0; i++) {
        const p = pool[i];
        if (p.active) continue;
        p.active = true;
        p.gravity = 0; p.drag = 1; p.mode = 0; p.spin = 0; p.angle = 0; p.orbit = 0;
        init(p);
        alive++;
        n--;
      }
      if (alive > 0 && !running) {
        running = true;
        lastTs = performance.now();
        raf = requestAnimationFrame(step);
      }
    };

    const step = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of pool) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; alive--; continue; }
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity * dt;
        if (p.orbit !== 0) {
          p.angle += p.spin * dt;
          p.x += Math.cos(p.angle) * p.orbit * dt + p.vx * dt;
          p.y += Math.sin(p.angle) * p.orbit * dt + p.vy * dt;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }

        const t = p.life / p.maxLife;
        const alpha = p.mode === 1 ? t * 0.35 : (t < 0.7 ? t / 0.7 : 1) * 0.9;
        const size = p.mode === 1 ? p.size * (1.6 - t * 0.6) : p.size * (0.4 + t * 0.6);
        ctx.globalCompositeOperation = p.mode === 1 ? 'source-over' : 'lighter';
        ctx.globalAlpha = alpha;
        const px = p.x * dpr, py = p.y * dpr, ps = size * dpr;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(ps / 32, ps / 32);
        ctx.filter = 'none';
        drawTinted(ctx, sprite, p.r, p.g, p.b);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (alive > 0) {
        raf = requestAnimationFrame(step);
      } else {
        running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const tintCache = new Map<string, HTMLCanvasElement>();
    function drawTinted(target: CanvasRenderingContext2D, base: HTMLCanvasElement, r: number, g: number, b: number) {
      const key = r + ',' + g + ',' + b;
      let tinted = tintCache.get(key);
      if (!tinted) {
        tinted = document.createElement('canvas');
        tinted.width = 64; tinted.height = 64;
        const tg = tinted.getContext('2d')!;
        tg.drawImage(base, 0, 0);
        tg.globalCompositeOperation = 'multiply';
        tg.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        tg.fillRect(0, 0, 64, 64);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(base, 0, 0);
        tintCache.set(key, tinted);
      }
      target.drawImage(tinted, -32, -32);
    }

    const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    const handle = (req: FxRequest) => {
      const { x, y } = { x: req.x ?? center().x, y: req.y ?? center().y };
      const [r, g, b] = hexToRgb(req.color ?? '#c4a35a');
      const scale = req.scale ?? 1;
      const rand = (a: number, s: number) => a + Math.random() * s;

      switch (req.kind) {
        case 'burst': {
          const n = req.count ?? 26;
          spawn(n, (p) => {
            const ang = Math.random() * Math.PI * 2;
            const sp = rand(120, 260) * scale;
            p.x = x; p.y = y;
            p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
            p.maxLife = p.life = rand(0.4, 0.5);
            p.size = rand(3, 6) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.94; p.gravity = 220;
          });
          break;
        }
        case 'ring': {
          const n = req.count ?? 34;
          spawn(n, (p) => {
            const ang = (Math.PI * 2 * Math.random());
            const sp = rand(240, 60) * scale;
            p.x = x; p.y = y;
            p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp * 0.45;
            p.maxLife = p.life = rand(0.35, 0.3);
            p.size = rand(2.5, 4) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.9;
          });
          break;
        }
        case 'sparksUp': {
          const n = req.count ?? 20;
          spawn(n, (p) => {
            p.x = x + rand(-40, 80) * scale; p.y = y + rand(-8, 16);
            p.vx = rand(-25, 50); p.vy = rand(-190, -80) * scale;
            p.maxLife = p.life = rand(0.6, 0.6);
            p.size = rand(2.5, 4.5) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.985; p.gravity = 60;
          });
          break;
        }
        case 'smoke': {
          const n = req.count ?? 14;
          spawn(n, (p) => {
            const ang = Math.random() * Math.PI * 2;
            const sp = rand(25, 70);
            p.x = x + rand(-18, 36); p.y = y + rand(-14, 28);
            p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 35;
            p.maxLife = p.life = rand(0.7, 0.7);
            p.size = rand(16, 22) * scale;
            p.r = r; p.g = g; p.b = b;
            p.mode = 1; p.drag = 0.96;
          });
          break;
        }
        case 'embers': {
          const n = req.count ?? 30;
          spawn(n, (p) => {
            const ang = Math.random() * Math.PI * 2;
            const sp = rand(60, 200) * scale;
            p.x = x + rand(-30, 60); p.y = y + rand(-40, 80);
            p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 60;
            p.maxLife = p.life = rand(0.55, 0.75);
            p.size = rand(2, 4.5) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.965; p.gravity = 190;
          });
          break;
        }
        case 'spiral': {
          const n = req.count ?? 22;
          spawn(n, (p) => {
            p.x = x + rand(-10, 20); p.y = y + rand(-10, 20);
            p.angle = Math.random() * Math.PI * 2;
            p.spin = rand(5, 5) * (Math.random() < 0.5 ? -1 : 1);
            p.orbit = rand(60, 90) * scale;
            p.vy = rand(-70, -20);
            p.maxLife = p.life = rand(0.6, 0.55);
            p.size = rand(2.5, 4) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.99;
          });
          break;
        }
        case 'flash': {
          spawn(1, (p) => {
            p.x = x; p.y = y;
            p.vx = 0; p.vy = 0;
            p.maxLife = p.life = 0.28;
            p.size = 120 * scale;
            p.r = r; p.g = g; p.b = b;
          });
          spawn(req.count ?? 16, (p) => {
            const ang = Math.random() * Math.PI * 2;
            const sp = rand(180, 300) * scale;
            p.x = x; p.y = y;
            p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
            p.maxLife = p.life = rand(0.3, 0.3);
            p.size = rand(2.5, 5) * scale;
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.9;
          });
          break;
        }
        case 'storm': {
          const n = req.count ?? 90;
          spawn(n, (p) => {
            p.x = Math.random() * window.innerWidth;
            p.y = window.innerHeight + rand(0, 60);
            p.vx = rand(-40, 80); p.vy = rand(-420, -180);
            p.maxLife = p.life = rand(1.1, 0.9);
            p.size = rand(2.5, 5);
            p.r = r; p.g = g; p.b = b;
            p.drag = 0.99; p.gravity = 140;
          });
          break;
        }
      }
    };

    const unsub = subscribeFx(handle);
    return () => {
      unsub();
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 45, width: '100vw', height: '100vh' }}
      aria-hidden="true"
    />
  );
}
