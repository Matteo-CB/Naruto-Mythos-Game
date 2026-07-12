import type { AnchorRect } from './boardRegistry';

export type VfxKind = 'burst' | 'seal' | 'slash' | 'ring' | 'victory' | 'kawarimi' | 'aura';

export interface VfxColor {
  r: number;
  g: number;
  b: number;
}

export interface VfxOptions {
  color: VfxColor;
  secondary: VfxColor;
  intensity: number;
  scale: number;
  durationMs: number;
}

export const RARITY_TIERS: Record<string, number> = {
  C: 0, UC: 0,
  R: 1, RA: 1,
  S: 2, M: 2, SP: 2, POP: 2, CHIBI: 2,
  SV: 3, MV: 3, L: 3, SPV: 3, POPV: 3, CHIBIV: 3,
};

export interface RarityVfxProfile {
  tier: number;
  scale: number;
  intensity: number;
  durationMs: number;
  color: VfxColor;
  secondary: VfxColor;
}

const GOLD: VfxColor = { r: 0.93, g: 0.78, b: 0.42 };
const WHITE: VfxColor = { r: 0.98, g: 0.95, b: 0.88 };
const BLUE: VfxColor = { r: 0.42, g: 0.62, b: 0.98 };
const RED: VfxColor = { r: 0.88, g: 0.32, b: 0.26 };
const INK: VfxColor = { r: 0.16, g: 0.17, b: 0.22 };
const TEAL: VfxColor = { r: 0.35, g: 0.78, b: 0.75 };

const VIOLET: VfxColor = { r: 0.66, g: 0.48, b: 0.92 };
const PINK: VfxColor = { r: 0.94, g: 0.5, b: 0.66 };

const TIER_BASE: Array<Omit<RarityVfxProfile, 'color' | 'secondary' | 'tier'>> = [
  { scale: 0.45, intensity: 0.3, durationMs: 400 },
  { scale: 0.7, intensity: 0.45, durationMs: 500 },
  { scale: 1.1, intensity: 0.62, durationMs: 650 },
  { scale: 1.5, intensity: 0.78, durationMs: 850 },
];

const FAMILY_COLORS: Array<{ prefix: string; color: VfxColor; secondary: VfxColor }> = [
  { prefix: 'L', color: GOLD, secondary: WHITE },
  { prefix: 'SP', color: VIOLET, secondary: WHITE },
  { prefix: 'S', color: BLUE, secondary: WHITE },
  { prefix: 'M', color: RED, secondary: GOLD },
  { prefix: 'POP', color: TEAL, secondary: WHITE },
  { prefix: 'CHIBI', color: PINK, secondary: WHITE },
  { prefix: 'R', color: GOLD, secondary: WHITE },
];

function familyColors(rarity: string): { color: VfxColor; secondary: VfxColor } {
  const sorted = [...FAMILY_COLORS].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const fam of sorted) {
    if (rarity.startsWith(fam.prefix)) return { color: fam.color, secondary: fam.secondary };
  }
  return { color: WHITE, secondary: GOLD };
}

export function rarityTier(rarity: string | undefined): number {
  if (!rarity) return 1;
  const tier = RARITY_TIERS[rarity];
  if (typeof tier === 'number') return tier;
  if (rarity.endsWith('V')) return 3;
  return 1;
}

export function rarityVfxProfile(rarity: string | undefined): RarityVfxProfile {
  const tier = Math.min(rarityTier(rarity), TIER_BASE.length - 1);
  const base = TIER_BASE[tier];
  const colors = rarity ? familyColors(rarity) : { color: WHITE, secondary: GOLD };
  if (tier === 0) return { tier, ...base, color: WHITE, secondary: GOLD };
  return { tier, ...base, ...colors };
}

export const VFX_PRESETS = {
  slash: { color: RED, secondary: WHITE, intensity: 0.85, scale: 1.05, durationMs: 500 },
  ring: { color: GOLD, secondary: WHITE, intensity: 0.65, scale: 0.95, durationMs: 550 },
  victory: { color: GOLD, secondary: WHITE, intensity: 0.8, scale: 1.35, durationMs: 850 },
  kawarimi: { color: INK, secondary: TEAL, intensity: 0.7, scale: 0.85, durationMs: 550 },
  sealChakra: { color: TEAL, secondary: GOLD, intensity: 0.8, scale: 1.15, durationMs: 750 },
} as const;

const VERT = `
attribute vec2 a_pos;
uniform vec2 u_center;
uniform vec2 u_size;
uniform vec2 u_resolution;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 2.0;
  vec2 px = u_center + a_pos * u_size;
  vec2 ndc = (px / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

const COMMON = `
precision mediump float;
varying vec2 v_uv;
uniform float u_t;
uniform vec3 u_color;
uniform vec3 u_color2;
uniform float u_intensity;
uniform float u_seed;
uniform vec2 u_card;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 17.0) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    v += amp * noise(p);
    p *= 2.1;
    amp *= 0.5;
  }
  return v;
}
float easeOut(float t) { return 1.0 - pow(1.0 - t, 3.0); }
`;

const FRAG_BURST = COMMON + `
float roundBox(vec2 p, vec2 b, float rad) {
  vec2 q = abs(p) - b + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
void main() {
  float r = length(v_uv);
  float a = atan(v_uv.y, v_uv.x);

  float flash = exp(-u_t * 16.0);
  float core = exp(-r * r * 20.0) * flash * 2.2;
  float streak = exp(-pow(v_uv.y * 26.0, 2.0)) * exp(-pow(v_uv.x * 2.4, 2.0)) * exp(-u_t * 9.0) * 1.6;

  float grow = 1.0 - pow(1.0 - min(u_t * 1.35, 1.0), 2.6);
  float wobble = (fbm(vec2(a * 1.6 + u_seed * 8.0, u_seed * 3.0)) - 0.5) * 0.16;
  float ringR = grow * 0.68 + wobble;
  float ringSoft = exp(-pow((r - ringR) * 15.0, 2.0));
  float ringBreak = 0.55 + 0.45 * fbm(vec2(a * 2.4 - u_seed * 5.0, r * 3.0));
  float ring = ringSoft * ringBreak * (1.0 - grow * 0.75);

  float ground = exp(-pow((v_uv.y - u_card.y * 0.92) * 9.0, 2.0)) * exp(-pow(v_uv.x * 2.0, 2.0)) * exp(-u_t * 6.5) * 0.9;

  float ember = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float h1 = hash(vec2(fi * 3.7, u_seed * 11.0));
    float h2 = hash(vec2(u_seed * 7.0, fi * 5.1));
    float et = clamp((u_t - 0.12 - h1 * 0.2) * 1.4, 0.0, 1.0);
    if (et <= 0.0) continue;
    vec2 pos = vec2((h1 - 0.5) * 0.9 + sin(u_t * 4.0 + fi) * 0.05, 0.25 - et * (0.7 + h2 * 0.5));
    float d = length(v_uv - pos);
    ember += exp(-d * d * 320.0) * (1.0 - et) * 1.2;
  }

  float envelope = 1.0 - smoothstep(0.62, 1.0, u_t);
  vec3 hot = vec3(1.0, 0.98, 0.92);
  vec3 col = hot * (core + streak) + u_color * (ring * 1.15 + ground) + mix(u_color, u_color2, 0.4) * ember;
  float alpha = clamp((core + streak * 0.8 + ring + ground * 0.7 + ember) * u_intensity * envelope, 0.0, 0.9);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const FRAG_SEAL = COMMON + `
void main() {
  float r = length(v_uv);
  float a = atan(v_uv.y, v_uv.x);
  float grow = easeOut(min(u_t * 1.5, 1.0));
  float fade = 1.0 - smoothstep(0.62, 1.0, u_t);
  float rot = u_t * 2.4 + u_seed;

  float ring1 = exp(-pow((r - 0.78 * grow) * 26.0, 2.0));
  float ring2 = exp(-pow((r - 0.52 * grow) * 30.0, 2.0));
  float drawMask = smoothstep(0.0, 0.15, fract((a + 3.14159) / 6.28318 - u_t * 1.6) < u_t * 1.8 ? 1.0 : 0.0);

  float runeBand = smoothstep(0.60 * grow, 0.62 * grow, r) * smoothstep(0.74 * grow, 0.72 * grow, r);
  float runes = runeBand * step(0.5, fract((a + rot) * 2.86)) * step(fract((a + rot) * 8.59), 0.62);

  float spokesAngle = fract((a - rot * 0.7) * 0.955);
  float spokes = smoothstep(0.03, 0.0, abs(spokesAngle - 0.5) - 0.012) * smoothstep(0.52 * grow, 0.2 * grow, abs(r - 0.36 * grow));

  float glow = exp(-r * 2.2) * 0.35 * (0.6 + 0.4 * sin(u_t * 9.0));
  float energy = fbm(v_uv * 3.0 + vec2(0.0, -u_t * 2.2)) * exp(-r * 2.6) * smoothstep(0.0, 0.35, u_t) * 0.8;

  vec3 col = u_color * (ring1 + ring2 + energy) * 1.25 + u_color2 * (runes * 1.35 + spokes + glow);
  float alpha = clamp((ring1 + ring2 + runes + spokes + glow + energy) * u_intensity * fade * max(drawMask, 0.35), 0.0, 1.0);
  gl_FragColor = vec4(col * alpha * u_intensity, alpha);
}
`;

const FRAG_SLASH = COMMON + `
float blade(vec2 uv, float angle, float progress, float width) {
  float s = sin(angle);
  float c = cos(angle);
  vec2 p = vec2(c * uv.x + s * uv.y, -s * uv.x + c * uv.y);
  float head = mix(-1.4, 1.4, progress);
  float along = smoothstep(head, head - 1.1, p.x);
  float trail = smoothstep(head - 1.3, head - 0.35, p.x);
  float curve = p.y - 0.16 * sin(p.x * 2.4 + u_seed);
  float line = exp(-pow(curve / width, 2.0));
  return line * along * trail;
}
void main() {
  float fade = 1.0 - smoothstep(0.6, 1.0, u_t);
  float p1 = easeOut(min(u_t * 1.9, 1.0));
  float p2 = easeOut(clamp((u_t - 0.18) * 1.9, 0.0, 1.0));

  float b1 = blade(v_uv, 0.45, p1, 0.05);
  float b1core = blade(v_uv, 0.45, p1, 0.014);
  float b2 = blade(v_uv, -0.62, p2, 0.038);
  float b2core = blade(v_uv, -0.62, p2, 0.011);

  float r = length(v_uv);
  float shock = exp(-pow((r - p1 * 0.9) * 7.0, 2.0)) * 0.5 * (1.0 - p1 * 0.6);

  vec3 col = u_color * (b1 + b2 + shock) * 1.35 + u_color2 * (b1core + b2core) * 1.9;
  float alpha = clamp((b1 + b2 + b1core + b2core + shock) * u_intensity * fade, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha * u_intensity, alpha);
}
`;

const FRAG_RING = COMMON + `
float torus(vec2 uv, float y, float radius, float thickness) {
  vec2 p = vec2(uv.x, (uv.y - y) * 2.6);
  float d = abs(length(p) - radius);
  return exp(-pow(d / thickness, 2.0));
}
void main() {
  float fade = 1.0 - smoothstep(0.55, 1.0, u_t);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float local = clamp((u_t - fi * 0.16) * 1.6, 0.0, 1.0);
    if (local <= 0.0) continue;
    float e = easeOut(local);
    float y = mix(0.55, -0.75, e);
    float radius = 0.42 + 0.22 * e - fi * 0.07;
    float ring = torus(v_uv, y, radius, 0.045) * (1.0 - e * 0.5);
    col += mix(u_color, u_color2, fi * 0.4) * ring * 1.3;
    alpha += ring;
  }
  alpha = clamp(alpha * u_intensity * fade, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha * u_intensity, alpha);
}
`;

const FRAG_VICTORY = COMMON + `
void main() {
  float r = length(v_uv);
  float a = atan(v_uv.y, v_uv.x);
  float grow = easeOut(min(u_t * 1.7, 1.0));
  float fade = 1.0 - smoothstep(0.66, 1.0, u_t);
  float rot = u_t * 0.9;

  float rays = pow(abs(sin((a + rot) * 5.0)), 7.0) * smoothstep(grow, grow * 0.15, r) * 0.85;
  float rays2 = pow(abs(sin((a - rot * 1.4) * 7.0 + 1.3)), 14.0) * smoothstep(grow * 0.85, grow * 0.1, r);

  float cross1 = exp(-pow(v_uv.x * 9.0, 2.0)) * exp(-pow(v_uv.y * 1.6, 2.0));
  float cross2 = exp(-pow(v_uv.y * 9.0, 2.0)) * exp(-pow(v_uv.x * 1.6, 2.0));
  float star = (cross1 + cross2) * (0.7 + 0.3 * sin(u_t * 12.0)) * smoothstep(0.0, 0.2, u_t);

  float core = exp(-r * r * 10.0) * 1.1;
  float ring = exp(-pow((r - grow * 0.8) * 10.0, 2.0)) * 0.7;
  float sparkleField = step(0.982, noise(v_uv * 11.0 + u_t * 3.0)) * smoothstep(grow, grow * 0.3, r);

  vec3 col = u_color * (rays + rays2 + ring) * 1.3 + u_color2 * (star * 1.5 + core + sparkleField * 1.3);
  float alpha = clamp((rays + rays2 + star + core + ring + sparkleField) * u_intensity * fade, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha * u_intensity, alpha);
}
`;

const FRAG_AURA = COMMON + `
float roundBox(vec2 p, vec2 b, float rad) {
  vec2 q = abs(p) - b + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
void main() {
  float appear = 1.0 - pow(1.0 - min(u_t * 2.2, 1.0), 3.0);
  float envelope = smoothstep(0.0, 0.1, u_t) * (1.0 - smoothstep(0.6, 1.0, u_t));

  float sdf = roundBox(v_uv, u_card * appear, 0.07);
  float breath = 1.0 + 0.25 * sin(u_t * 6.0 + u_seed * 6.28);
  float rim = exp(-pow(sdf * 16.0, 2.0)) * 0.9;
  float rimWide = exp(-pow(max(sdf, 0.0) * 5.0 / breath, 1.4)) * 0.32;

  float rayMask = smoothstep(0.1, -0.5, v_uv.y) * step(abs(v_uv.x), u_card.x * 1.05);
  float rays = pow(fbm(vec2(v_uv.x * 5.0 + u_seed * 9.0, u_t * 0.7)), 2.2) * rayMask * smoothstep(-1.1, -0.2, v_uv.y) * 1.1;

  float motes = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float h1 = hash(vec2(fi * 2.3, u_seed * 13.0));
    float h2 = hash(vec2(u_seed * 5.0, fi * 7.7));
    float mt = fract(u_t * (0.5 + h2 * 0.4) + h1);
    vec2 pos = vec2((h1 - 0.5) * 1.5 * u_card.x, u_card.y * 0.8 - mt * 1.3);
    float d = length((v_uv - pos) * vec2(1.0, 0.9));
    motes += exp(-d * d * 480.0) * smoothstep(1.0, 0.75, mt) * smoothstep(0.0, 0.15, mt);
  }

  vec3 col = u_color * (rim + rays * 0.85) + u_color2 * (rimWide + motes * 1.3);
  float alpha = clamp((rim + rimWide + rays * 0.7 + motes) * u_intensity * envelope, 0.0, 0.62);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const FRAG_KAWARIMI = COMMON + `
vec2 swirl(vec2 uv, float strength) {
  float r = length(uv);
  float a = atan(uv.y, uv.x) + strength * (1.0 - r);
  return vec2(cos(a), sin(a)) * r;
}
void main() {
  float fade = 1.0 - smoothstep(0.5, 1.0, u_t);
  float grow = easeOut(min(u_t * 1.6, 1.0));
  vec2 uv = swirl(v_uv, 3.4 * (1.0 - u_t * 0.4) + u_seed * 0.5);
  float r = length(v_uv);

  float body = fbm(uv * 2.6 + vec2(u_seed * 5.0, -u_t * 1.4));
  float cloud = smoothstep(0.9 * grow, 0.25 * grow, r) * smoothstep(0.28, 0.75, body);
  float rim = exp(-pow((r - grow * 0.72) * 6.0, 2.0)) * smoothstep(0.4, 0.8, body) * 0.8;
  float flash = exp(-r * r * 9.0) * (1.0 - min(u_t * 2.4, 1.0)) * 0.8;

  vec3 col = u_color * cloud * 0.95 + u_color2 * (rim * 1.1) + vec3(0.95, 0.93, 0.85) * flash;
  float alpha = clamp((cloud * 0.9 + rim + flash) * u_intensity * fade, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const FRAGS: Record<VfxKind, string> = {
  burst: FRAG_BURST,
  seal: FRAG_SEAL,
  slash: FRAG_SLASH,
  ring: FRAG_RING,
  victory: FRAG_VICTORY,
  kawarimi: FRAG_KAWARIMI,
  aura: FRAG_AURA,
};

interface EffectInstance {
  kind: VfxKind;
  centerX: number;
  centerY: number;
  sizePx: number;
  cardHalfX: number;
  cardHalfY: number;
  start: number;
  durationMs: number;
  color: VfxColor;
  secondary: VfxColor;
  intensity: number;
  seed: number;
  resolve: () => void;
}

interface GlState {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  programs: Map<VfxKind, WebGLProgram>;
  buffer: WebGLBuffer;
  dpr: number;
}

let glState: GlState | null = null;
const instances: EffectInstance[] = [];
let rafId = 0;
let running = false;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(gl: WebGLRenderingContext, frag: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function ensureGl(): GlState | null {
  if (typeof document === 'undefined') return null;
  if (glState && document.body.contains(glState.canvas)) return glState;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:45;';
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  document.body.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.75);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  const buffer = gl.createBuffer();
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const programs = new Map<VfxKind, WebGLProgram>();
  for (const [kind, frag] of Object.entries(FRAGS) as Array<[VfxKind, string]>) {
    const program = link(gl, frag);
    if (program) programs.set(kind, program);
  }

  glState = { canvas, gl, programs, buffer, dpr };

  const onResize = () => {
    if (!glState) return;
    glState.canvas.width = Math.floor(window.innerWidth * glState.dpr);
    glState.canvas.height = Math.floor(window.innerHeight * glState.dpr);
  };
  window.addEventListener('resize', onResize);
  return glState;
}

function frame(now: number): void {
  const state = glState;
  if (!state) { running = false; return; }
  const { gl } = state;

  for (let i = instances.length - 1; i >= 0; i--) {
    if (now - instances[i].start >= instances[i].durationMs) {
      instances[i].resolve();
      instances.splice(i, 1);
    }
  }

  gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (instances.length === 0) {
    running = false;
    return;
  }

  for (const inst of instances) {
    const program = state.programs.get(inst.kind);
    if (!program) continue;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const t = Math.min((now - inst.start) / inst.durationMs, 1);
    gl.uniform2f(gl.getUniformLocation(program, 'u_center'), inst.centerX * state.dpr, inst.centerY * state.dpr);
    gl.uniform2f(gl.getUniformLocation(program, 'u_size'), inst.sizePx * state.dpr, inst.sizePx * state.dpr);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), state.canvas.width, state.canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_t'), t);
    gl.uniform3f(gl.getUniformLocation(program, 'u_color'), inst.color.r, inst.color.g, inst.color.b);
    gl.uniform3f(gl.getUniformLocation(program, 'u_color2'), inst.secondary.r, inst.secondary.g, inst.secondary.b);
    gl.uniform1f(gl.getUniformLocation(program, 'u_intensity'), inst.intensity);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), inst.seed);
    gl.uniform2f(gl.getUniformLocation(program, 'u_card'), inst.cardHalfX, inst.cardHalfY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  rafId = requestAnimationFrame(frame);
}

export function warmupVfxGl(): void {
  ensureGl();
}

export function playGlVfx(kind: VfxKind, rect: AnchorRect, opts: VfxOptions): Promise<void> {
  return new Promise((resolve) => {
    const state = ensureGl();
    if (!state || opts.durationMs <= 0) { resolve(); return; }
    const base = Math.max(rect.width, rect.height);
    const sizePx = Math.max(60, base * 1.7 * opts.scale);
    instances.push({
      kind,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      sizePx,
      cardHalfX: Math.min(rect.width / sizePx, 0.95),
      cardHalfY: Math.min(rect.height / sizePx, 0.95),
      start: performance.now(),
      durationMs: opts.durationMs,
      color: opts.color,
      secondary: opts.secondary,
      intensity: opts.intensity,
      seed: Math.random(),
      resolve,
    });
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(frame);
    }
  });
}

export function stopAllGlVfx(): void {
  for (const inst of instances) inst.resolve();
  instances.length = 0;
  if (rafId) cancelAnimationFrame(rafId);
  running = false;
}
