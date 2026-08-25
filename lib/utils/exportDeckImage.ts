import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from './imagePath';


const CARD_W = 130;
const CARD_H = 182;
const MISSION_W = 182; // Landscape
const MISSION_H = 130;
const GAP = 10;
const COLS = 10;
const PADDING = 40;
const HEADER_H = 90;
const SECTION_GAP = 40;


const BG_DARK = '#0a0a0a';
const SEIGAIHA_PATTERN = '/images/bgmenu/seigaiha.webp';
const FOOTER_CURLS = '/images/footer-curls-gold.svg';
const PATTERN_ALPHA = 0.5;
const PATTERN_VEIL = 'rgba(6, 6, 10, 0.55)';
const CURLS_ALPHA = 0.85;
const CURLS_VISIBLE_RATIO = 82 / 144;
const GOLD = '#c4a35a';
const GOLD_LINE = 'rgba(196, 163, 90, 0.3)';
const TEXT_MUTED = '#888888';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}



type ArtlessCard = CharacterCard | MissionCard;

function localizedField(card: ArtlessCard, base: 'name' | 'title', locale: string): string {
  const champs = card as unknown as Record<string, unknown>;
  const l = champs[`${base}_${locale}`];
  if (typeof l === 'string' && l) return l;
  const en = champs[`${base}_en`];
  if (typeof en === 'string' && en) return en;
  const fr = champs[`${base}_fr`];
  return typeof fr === 'string' ? fr : '';
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const mots = text.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (ctx.measureText(essai).width <= maxWidth || !courante) {
      courante = essai;
    } else {
      lignes.push(courante);
      courante = mot;
      if (lignes.length === maxLines) break;
    }
  }
  if (courante && lignes.length < maxLines) lignes.push(courante);
  return lignes.slice(0, maxLines);
}

function drawMissingArt(
  ctx: CanvasRenderingContext2D,
  card: ArtlessCard,
  x: number,
  y: number,
  w: number,
  h: number,
  locale: string,
): void {
  const nom = localizedField(card, 'name', locale);
  const titre = localizedField(card, 'title', locale);
  const numero = card.number === undefined ? '' : String(card.number).replace(/^(\d+)/, (d) => d.padStart(3, '0'));

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.fillStyle = '#f2f0ea';
  ctx.font = 'bold 13px "Nevanta", sans-serif';
  const lignesNom = wrapText(ctx, nom.toUpperCase(), w, 3);
  let curseur = y;
  for (const ligne of lignesNom) {
    ctx.fillText(ligne, x, curseur);
    curseur += 15;
  }

  if (titre) {
    ctx.fillStyle = '#a8a29a';
    ctx.font = 'italic 10px "Nevanta", sans-serif';
    for (const ligne of wrapText(ctx, titre, w, 2)) {
      ctx.fillText(ligne, x, curseur + 2);
      curseur += 12;
    }
  }

  ctx.fillStyle = GOLD;
  ctx.font = 'bold 11px "Nevanta", sans-serif';
  ctx.fillText([numero, card.rarity].filter(Boolean).join('  '), x, y + h - 12, w);
}

export async function exportDeckAsImage(
  deckName: string,
  characters: CharacterCard[],
  missions: MissionCard[],
  locale: string = 'fr',
): Promise<void> {
  const sorted = [...characters].sort((a, b) => {
    const costDiff = (a.chakra ?? 0) - (b.chakra ?? 0);
    if (costDiff !== 0) return costDiff;
    return a.name_fr.localeCompare(b.name_fr);
  });

  const charRows = Math.ceil(sorted.length / COLS);
  const missionCols = Math.min(missions.length, 5);
  const missionRows = Math.ceil(missions.length / missionCols);

  const contentW = COLS * (CARD_W + GAP) - GAP;
  const canvasW = contentW + PADDING * 2;
  const missionSectionH = missionRows * (MISSION_H + GAP) - GAP;
  const canvasH =
    PADDING +
    HEADER_H +
    16 + // Separator
    charRows * (CARD_H + GAP) - GAP +
    SECTION_GAP +
    24 + // Mission label
    16 +
    missionSectionH +
    PADDING + 30; // Footer

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  
  ctx.fillStyle = BG_DARK;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const [motifFond, volutesBas] = await Promise.all([
    loadImage(SEIGAIHA_PATTERN).catch(() => null),
    loadImage(FOOTER_CURLS).catch(() => null),
  ]);

  if (motifFond) {
    const echelle = canvasW / motifFond.width;
    const tuileH = motifFond.height * echelle;
    ctx.globalAlpha = PATTERN_ALPHA;
    for (let y = 0; y < canvasH; y += tuileH) {
      ctx.drawImage(motifFond, 0, y, canvasW, tuileH);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PATTERN_VEIL;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  if (volutesBas) {
    const hauteur = canvasW * (volutesBas.height / volutesBas.width);
    ctx.globalAlpha = CURLS_ALPHA;
    ctx.drawImage(volutesBas, 0, canvasH - hauteur * CURLS_VISIBLE_RATIO, canvasW, hauteur);
    ctx.globalAlpha = 1;
  }

  
  const centreX = canvasW / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 28px "NJNaruto", "Arial Black", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(deckName || 'Deck', centreX, PADDING + HEADER_H / 2 - 12);

  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '13px "Nevanta", "Segoe UI", sans-serif';
  ctx.fillText(
    `${characters.length} characters  |  ${missions.length} missions`,
    centreX,
    PADDING + HEADER_H / 2 + 16,
  );
  ctx.textAlign = 'left';

  const sepY = PADDING + HEADER_H + 12;

  
  const charImgs = await Promise.all(
    sorted.map((card) => {
      const src = normalizeImagePath(card.image_file);
      return src ? loadImage(src).catch(() => null) : Promise.resolve(null);
    }),
  );
  const missionImgs = await Promise.all(
    missions.map((card) => {
      const src = normalizeImagePath(card.image_file);
      return src ? loadImage(src).catch(() => null) : Promise.resolve(null);
    }),
  );

  
  const charStartY = sepY + 16;
  for (let i = 0; i < sorted.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (CARD_W + GAP);
    const cy = charStartY + row * (CARD_H + GAP);

    
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    drawRoundedRect(ctx, x + 2, cy + 2, CARD_W, CARD_H, 3);
    ctx.fill();

    
    ctx.fillStyle = '#111';
    drawRoundedRect(ctx, x, cy, CARD_W, CARD_H, 3);
    ctx.fill();

    const img = charImgs[i];
    if (img) {
      ctx.save();
      drawRoundedRect(ctx, x, cy, CARD_W, CARD_H, 3);
      ctx.clip();
      ctx.drawImage(img, x, cy, CARD_W, CARD_H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#16161a';
      drawRoundedRect(ctx, x + 1, cy + 1, CARD_W - 2, CARD_H - 2, 3);
      ctx.fill();
      drawMissingArt(ctx, sorted[i], x + 8, cy + 10, CARD_W - 16, CARD_H - 20, locale);
    }

    
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, cy, CARD_W, CARD_H, 3);
    ctx.stroke();
  }

  
  const missionLabelY = charStartY + charRows * (CARD_H + GAP) - GAP + SECTION_GAP;

  
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 18px "NJNaruto", "Arial Black", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('MISSIONS', canvasW / 2, missionLabelY);
  ctx.textAlign = 'left';

  const mSepY = missionLabelY + 8;

  
  const missionStartY = mSepY + 16;
  const totalMissionW = missionCols * (MISSION_W + GAP) - GAP;
  const missionOffsetX = PADDING + (contentW - totalMissionW) / 2; // Center missions

  for (let i = 0; i < missions.length; i++) {
    const col = i % missionCols;
    const row = Math.floor(i / missionCols);
    const x = missionOffsetX + col * (MISSION_W + GAP);
    const my = missionStartY + row * (MISSION_H + GAP);

    
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    drawRoundedRect(ctx, x + 2, my + 2, MISSION_W, MISSION_H, 3);
    ctx.fill();

    
    ctx.fillStyle = '#111';
    drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
    ctx.fill();

    const img = missionImgs[i];
    if (img) {
      ctx.save();
      drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
      ctx.clip();
      
      const imgAspect = img.width / img.height;
      const targetAspect = MISSION_W / MISSION_H;
      let drawW = MISSION_W;
      let drawH = MISSION_H;
      let drawX = x;
      let drawY = my;
      if (imgAspect > targetAspect) {
        drawH = MISSION_W / imgAspect;
        drawY = my + (MISSION_H - drawH) / 2;
      } else {
        drawW = MISSION_H * imgAspect;
        drawX = x + (MISSION_W - drawW) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#16161a';
      drawRoundedRect(ctx, x + 1, my + 1, MISSION_W - 2, MISSION_H - 2, 3);
      ctx.fill();
      drawMissingArt(ctx, missions[i], x + 10, my + 12, MISSION_W - 20, MISSION_H - 24, locale);
    }

    
    ctx.strokeStyle = GOLD_LINE;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
    ctx.stroke();
  }

  
  const footerY = canvasH - PADDING - 10;
  ctx.fillStyle = 'rgba(136,136,136,0.4)';
  ctx.font = '11px "Nevanta", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('narutomythosgame.com', canvasW / 2, footerY);
  ctx.textAlign = 'left';

  
  const link = document.createElement('a');
  link.download = `${(deckName || 'deck').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
