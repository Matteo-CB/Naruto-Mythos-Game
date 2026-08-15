import sharp from 'sharp';

const CELL = 192;
const COLS = 8;
const ROWS = 4;
const FRAMES = COLS * ROWS;
const PUFFS = 46;

function melange(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function bruitValeur(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  let total = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const poids = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        total += poids * melange(xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return total;
}

function bruitFractal(x, y, z) {
  let somme = 0, amplitude = 0.5, frequence = 1;
  for (let o = 0; o < 4; o++) {
    somme += amplitude * bruitValeur(x * frequence, y * frequence, z * frequence);
    amplitude *= 0.5;
    frequence *= 2.07;
  }
  return somme;
}

const puffs = [];
for (let i = 0; i < PUFFS; i++) {
  const r = melange(i * 1.37, 5.2, 9.1);
  const r2 = melange(i * 2.11, 1.7, 3.3);
  const r3 = melange(i * 3.53, 8.9, 2.4);
  const r4 = melange(i * 4.79, 2.2, 6.6);
  puffs.push({
    phase: i / PUFFS,
    x0: 0.16 + r * 0.68,
    y0: 0.72 + r2 * 0.30,
    monte: 0.55 + r3 * 0.45,
    derive: (r4 - 0.5) * 0.42,
    rayonDebut: 0.06 + r2 * 0.06,
    rayonFin: 0.17 + r * 0.16,
    force: 0.22 + r3 * 0.34,
    tourbillon: 0.6 + r4 * 1.5,
  });
}

const feuille = Buffer.alloc(CELL * COLS * CELL * ROWS * 4, 0);
const largeurFeuille = CELL * COLS;

for (let f = 0; f < FRAMES; f++) {
  const t = f / FRAMES;
  const colonne = f % COLS;
  const ligne = Math.floor(f / COLS);

  const densite = new Float32Array(CELL * CELL);

  for (const p of puffs) {
    let vie = (t - p.phase) % 1;
    if (vie < 0) vie += 1;

    const fondu = Math.sin(Math.PI * vie);
    if (fondu <= 0.01) continue;

    const cx = p.x0 + p.derive * vie + Math.sin((vie + p.phase) * Math.PI * 2 * p.tourbillon) * 0.05;
    const cy = p.y0 - p.monte * vie;
    const rayon = p.rayonDebut + (p.rayonFin - p.rayonDebut) * vie;
    const intensite = p.force * fondu;

    const rp = rayon * CELL;
    const cpx = cx * CELL;
    const cpy = cy * CELL;
    const x0 = Math.max(0, Math.floor(cpx - rp));
    const x1 = Math.min(CELL - 1, Math.ceil(cpx + rp));
    const y0 = Math.max(0, Math.floor(cpy - rp));
    const y1 = Math.min(CELL - 1, Math.ceil(cpy + rp));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cpx) / rp;
        const dy = (y - cpy) / rp;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const chute = (1 - d2) * (1 - d2);
        densite[y * CELL + x] += chute * intensite;
      }
    }
  }

  const angle = t * Math.PI * 2;
  const sortie = new Float32Array(CELL * CELL);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const nx = x / CELL * 3.4;
      const ny = y / CELL * 3.4;
      const bx = bruitFractal(nx, ny, 2.5 + Math.cos(angle) * 0.9);
      const by = bruitFractal(nx + 5.2, ny + 1.3, 2.5 + Math.sin(angle) * 0.9);
      const sx = Math.min(CELL - 1, Math.max(0, Math.round(x + (bx - 0.5) * 26)));
      const sy = Math.min(CELL - 1, Math.max(0, Math.round(y + (by - 0.5) * 26)));
      sortie[y * CELL + x] = densite[sy * CELL + sx];
    }
  }

  const lisse = (bord0, bord1, v) => {
    const u = Math.min(1, Math.max(0, (v - bord0) / (bord1 - bord0)));
    return u * u * (3 - 2 * u);
  };
  const densiteEn = (x, y) => sortie[Math.min(CELL - 1, Math.max(0, y)) * CELL + Math.min(CELL - 1, Math.max(0, x))];

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      let d = sortie[y * CELL + x];
      const grain = bruitFractal(x / CELL * 9, y / CELL * 9, 4 + t * 3);
      d *= 0.68 + grain * 0.64;

      const a = lisse(0.12, 0.62, d);
      if (a <= 0.004) continue;

      const gx = densiteEn(x + 2, y) - densiteEn(x - 2, y);
      const gy = densiteEn(x, y + 2) - densiteEn(x, y - 2);
      const eclairage = Math.max(-1, Math.min(1, (-gx * 0.55 - gy * 0.85) * 3.4));
      const epaisseur = lisse(0.2, 1.1, d);

      const base = 96 + epaisseur * 74;
      const clarte = Math.max(38, Math.min(246, Math.round(base + eclairage * 68)));

      const dest = ((ligne * CELL + y) * largeurFeuille + (colonne * CELL + x)) * 4;
      feuille[dest] = clarte;
      feuille[dest + 1] = clarte;
      feuille[dest + 2] = Math.min(255, clarte + 8);
      feuille[dest + 3] = Math.round(a * 236);
    }
  }
}

await sharp(feuille, { raw: { width: largeurFeuille, height: CELL * ROWS, channels: 4 } })
  .webp({ quality: 82, alphaQuality: 92, effort: 6 })
  .toFile('public/images/vfx/smoke-sheet.webp');

console.log('planche generee', largeurFeuille, 'x', CELL * ROWS, FRAMES, 'images');
