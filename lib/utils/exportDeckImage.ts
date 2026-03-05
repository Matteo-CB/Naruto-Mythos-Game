import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from './imagePath';

const CARD_W = 120;
const CARD_H = 168;
const GAP = 8;
const COLS = 10;
const PADDING = 24;
const HEADER_H = 60;
const SECTION_GAP = 32;
const BG_COLOR = '#0a0a0a';
const BORDER_COLOR = '#262626';
const TEXT_COLOR = '#e0e0e0';
const GOLD_COLOR = '#c4a35a';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/**
 * Generate a deck image as a downloadable PNG.
 * Fully client-side — no DB storage.
 */
export async function exportDeckAsImage(
  deckName: string,
  characters: CharacterCard[],
  missions: MissionCard[],
): Promise<void> {
  const sorted = [...characters].sort((a, b) => {
    const costDiff = (a.chakra ?? 0) - (b.chakra ?? 0);
    if (costDiff !== 0) return costDiff;
    return a.name_fr.localeCompare(b.name_fr);
  });

  const charRows = Math.ceil(sorted.length / COLS);
  const missionRows = Math.ceil(missions.length / COLS);

  const contentW = COLS * (CARD_W + GAP) - GAP;
  const canvasW = contentW + PADDING * 2;
  const canvasH =
    PADDING +
    HEADER_H +
    charRows * (CARD_H + GAP) +
    SECTION_GAP +
    30 +
    missionRows * (CARD_H + GAP) +
    PADDING;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header
  ctx.fillStyle = GOLD_COLOR;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(deckName || 'Deck', PADDING, PADDING + 28);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '14px sans-serif';
  ctx.fillText(`${characters.length} characters | ${missions.length} missions`, PADDING, PADDING + 50);

  // Pre-load all images in parallel
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

  // Draw character cards
  const y = PADDING + HEADER_H;
  for (let i = 0; i < sorted.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (CARD_W + GAP);
    const cy = y + row * (CARD_H + GAP);

    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, cy, CARD_W, CARD_H);

    const img = charImgs[i];
    if (img) {
      ctx.drawImage(img, x, cy, CARD_W, CARD_H);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 1, cy + 1, CARD_W - 2, CARD_H - 2);
      ctx.fillStyle = '#555';
      ctx.font = '10px sans-serif';
      ctx.fillText(sorted[i].name_fr, x + 4, cy + CARD_H / 2);
    }

    // Cost badge (top-left)
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, cy, 22, 18);
    ctx.fillStyle = '#4fc3f7';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(String(sorted[i].chakra ?? 0), x + 5, cy + 13);

    // Power badge (bottom-right)
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x + CARD_W - 22, cy + CARD_H - 18, 22, 18);
    ctx.fillStyle = '#ff8a65';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(String(sorted[i].power ?? 0), x + CARD_W - 17, cy + CARD_H - 5);
  }

  // Mission section
  const missionY = y + charRows * (CARD_H + GAP) + SECTION_GAP;
  ctx.fillStyle = GOLD_COLOR;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Missions', PADDING, missionY - 8);

  for (let i = 0; i < missions.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (CARD_W + GAP);
    const my = missionY + row * (CARD_H + GAP);

    ctx.strokeStyle = GOLD_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, my, CARD_W, CARD_H);

    const img = missionImgs[i];
    if (img) {
      ctx.drawImage(img, x, my, CARD_W, CARD_H);
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 1, my + 1, CARD_W - 2, CARD_H - 2);
      ctx.fillStyle = '#c4a35a';
      ctx.font = '10px sans-serif';
      ctx.fillText(missions[i].name_fr, x + 4, my + CARD_H / 2);
    }
  }

  // Download
  const link = document.createElement('a');
  link.download = `${(deckName || 'deck').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
