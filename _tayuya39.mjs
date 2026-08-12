import sharp from 'sharp';

const SRC = 'InShot_20260812_191230166.jpg';
const SORTIE = 'public/images/cards/SS/common/SS-039-C.webp';
const ECHELLE = 4;
const W = 800;
const H = 1100;
const INSET = 0.011;

const meta = await sharp(SRC).metadata();
const w = Math.floor(meta.width / ECHELLE);
const h = Math.floor(meta.height / ECHELLE);
const { data } = await sharp(SRC).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

const estFondClair = (i) => {
  const r = data[i * 3];
  const g = data[i * 3 + 1];
  const b = data[i * 3 + 2];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx > 186 && mx - mn < 30;
};

const fond = new Uint8Array(w * h);
const pile = [];
for (let x = 0; x < w; x += 1) pile.push(x, x + (h - 1) * w);
for (let y = 0; y < h; y += 1) pile.push(y * w, y * w + w - 1);
while (pile.length) {
  const i = pile.pop();
  if (fond[i] || !estFondClair(i)) continue;
  fond[i] = 1;
  const x = i % w;
  const y = (i - x) / w;
  if (x > 0) pile.push(i - 1);
  if (x < w - 1) pile.push(i + 1);
  if (y > 0) pile.push(i - w);
  if (y < h - 1) pile.push(i + w);
}

const vu = new Uint8Array(w * h);
const blocs = [];
for (let depart = 0; depart < w * h; depart += 1) {
  if (fond[depart] || vu[depart]) continue;
  let minX = w; let maxX = 0; let minY = h; let maxY = 0;
  const file = [depart];
  vu[depart] = 1;
  while (file.length) {
    const i = file.pop();
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > 0 && !fond[i - 1] && !vu[i - 1]) { vu[i - 1] = 1; file.push(i - 1); }
    if (x < w - 1 && !fond[i + 1] && !vu[i + 1]) { vu[i + 1] = 1; file.push(i + 1); }
    if (y > 0 && !fond[i - w] && !vu[i - w]) { vu[i - w] = 1; file.push(i - w); }
    if (y < h - 1 && !fond[i + w] && !vu[i + w]) { vu[i + w] = 1; file.push(i + w); }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < 200 || bh < 300) continue;
  if (minX <= 1 || maxX >= w - 2) continue;
  blocs.push({ minX, minY, bw, bh, ratio: bw / bh });
}

blocs.sort((a, b) => a.minY - b.minY);
for (const b of blocs) console.log(`bloc y${b.minY * ECHELLE} ${b.bw * ECHELLE}x${b.bh * ECHELLE} ratio ${b.ratio.toFixed(3)}`);

const carte = blocs.find((b) => b.minY * ECHELLE < 1200 && Math.abs(b.ratio - 0.717) < 0.25);
if (!carte) throw new Error('Tayuya introuvable');

const L = carte.minX * ECHELLE;
const T = carte.minY * ECHELLE;
const LARGEUR = carte.bw * ECHELLE;
const HAUTEUR = Math.round(LARGEUR / 0.717);

console.log(`decoupe retenue: x${L} y${T} ${LARGEUR}x${HAUTEUR}`);

const brut = await sharp(SRC).extract({ left: L, top: T, width: LARGEUR, height: Math.min(HAUTEUR, meta.height - T) }).png().toBuffer();
const m2 = await sharp(brut).metadata();
const dx = Math.round(m2.width * INSET);
const dy = Math.round(m2.height * INSET);

const rayon = Math.round(W * 0.052);
const masque = Buffer.from(
  `<svg width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" rx="${rayon}" ry="${rayon}" fill="#fff"/></svg>`,
);

await sharp(brut)
  .extract({ left: dx, top: dy, width: m2.width - dx * 2, height: m2.height - dy * 2 })
  .resize(W, H, { fit: 'fill', kernel: 'lanczos3' })
  .sharpen({ sigma: 0.7, m1: 0.5, m2: 0.9 })
  .median(1)
  .composite([{ input: masque, blend: 'dest-in' }])
  .webp({ quality: 82, effort: 6 })
  .toFile(SORTIE);

const fin = await sharp(SORTIE).metadata();
console.log(`${SORTIE} ${fin.width}x${fin.height}`);
