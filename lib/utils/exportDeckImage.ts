import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from './imagePath';

// ── Layout constants ──
const CARD_W = 130;
const CARD_H = 182;
const MISSION_W = 182; // Landscape
const MISSION_H = 130;
const GAP = 10;
const COLS = 10;
const PADDING = 40;
const HEADER_H = 90;
const SECTION_GAP = 40;

// ── Colors ──
const BG_DARK = '#080810';
const BG_PANEL = '#0e0e16';
const GOLD = '#c4a35a';
const GOLD_DIM = 'rgba(196, 163, 90, 0.15)';
const GOLD_LINE = 'rgba(196, 163, 90, 0.3)';
const TEXT_PRIMARY = '#e0e0e0';
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

function drawCornerBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  // Top-left
  ctx.beginPath(); ctx.moveTo(x, y + size); ctx.lineTo(x, y); ctx.lineTo(x + size, y); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(x + w - size, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + size); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(x, y + h - size); ctx.lineTo(x, y + h); ctx.lineTo(x + size, y + h); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(x + w - size, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - size); ctx.stroke();
}

/**
 * Generate a beautiful deck export image as a downloadable PNG.
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

  // ── Background ──
  ctx.fillStyle = BG_DARK;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Subtle pattern overlay
  for (let py = 0; py < canvasH; py += 4) {
    for (let px = 0; px < canvasW; px += 4) {
      if ((px + py) % 8 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.008)';
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }

  // ── Load decoration images ──
  const [shurikenImg, kunaiImg, spiralImg] = await Promise.all([
    loadImage('/images/icons/shuriken.png').catch(() => null),
    loadImage('/images/icons/kunai.png').catch(() => null),
    loadImage('/images/icons/uzumaki-spiral.png').catch(() => null),
  ]);

  // ── Corner decorations ──
  if (shurikenImg) {
    ctx.globalAlpha = 0.06;
    ctx.drawImage(shurikenImg, -30, -30, 180, 180);
    ctx.drawImage(shurikenImg, canvasW - 150, canvasH - 150, 180, 180);
    ctx.globalAlpha = 1;
  }
  if (spiralImg) {
    ctx.globalAlpha = 0.04;
    ctx.drawImage(spiralImg, canvasW - 160, -20, 140, 140);
    ctx.globalAlpha = 1;
  }

  // ── Outer frame ──
  drawCornerBrackets(ctx, 12, 12, canvasW - 24, canvasH - 24, 30, GOLD_LINE);

  // ── Header panel ──
  ctx.fillStyle = BG_PANEL;
  drawRoundedRect(ctx, PADDING, PADDING, contentW, HEADER_H, 4);
  ctx.fill();
  ctx.strokeStyle = GOLD_LINE;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, PADDING, PADDING, contentW, HEADER_H, 4);
  ctx.stroke();

  // Left gold accent line
  ctx.fillStyle = GOLD;
  ctx.fillRect(PADDING, PADDING, 4, HEADER_H);

  // Deck name (NJNaruto font fallback — canvas uses loaded fonts or system)
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 28px "NJNaruto", "Arial Black", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(deckName || 'Deck', PADDING + 20, PADDING + HEADER_H / 2 - 12);

  // Stats line
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = '13px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(
    `${characters.length} characters  |  ${missions.length} missions`,
    PADDING + 20,
    PADDING + HEADER_H / 2 + 16,
  );

  // Kunai decoration in header
  if (kunaiImg) {
    ctx.globalAlpha = 0.08;
    ctx.drawImage(kunaiImg, PADDING + contentW - 100, PADDING + 10, 80, 80);
    ctx.globalAlpha = 1;
  }

  // ── Gold separator line ──
  const sepY = PADDING + HEADER_H + 12;
  ctx.strokeStyle = GOLD_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING + 20, sepY);
  ctx.lineTo(PADDING + contentW - 20, sepY);
  ctx.stroke();
  // Diamond in center of separator
  const diamX = PADDING + contentW / 2;
  ctx.fillStyle = GOLD;
  ctx.save();
  ctx.translate(diamX, sepY);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();

  // ── Pre-load all card images ──
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

  // ── Draw character cards ──
  const charStartY = sepY + 16;
  for (let i = 0; i < sorted.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (CARD_W + GAP);
    const cy = charStartY + row * (CARD_H + GAP);

    // Card shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    drawRoundedRect(ctx, x + 2, cy + 2, CARD_W, CARD_H, 3);
    ctx.fill();

    // Card background
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
      ctx.fillStyle = '#1a1a1a';
      drawRoundedRect(ctx, x + 1, cy + 1, CARD_W - 2, CARD_H - 2, 3);
      ctx.fill();
      ctx.fillStyle = '#555';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(sorted[i].name_fr, x + 6, cy + CARD_H / 2, CARD_W - 12);
    }

    // Subtle border
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, cy, CARD_W, CARD_H, 3);
    ctx.stroke();
  }

  // ── Mission section ──
  const missionLabelY = charStartY + charRows * (CARD_H + GAP) - GAP + SECTION_GAP;

  // Mission label
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 18px "NJNaruto", "Arial Black", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('MISSIONS', PADDING + 20, missionLabelY);

  // Mission separator
  const mSepY = missionLabelY + 8;
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING + 20, mSepY);
  ctx.lineTo(PADDING + 200, mSepY);
  ctx.stroke();

  // Draw mission cards in landscape
  const missionStartY = mSepY + 16;
  const totalMissionW = missionCols * (MISSION_W + GAP) - GAP;
  const missionOffsetX = PADDING + (contentW - totalMissionW) / 2; // Center missions

  for (let i = 0; i < missions.length; i++) {
    const col = i % missionCols;
    const row = Math.floor(i / missionCols);
    const x = missionOffsetX + col * (MISSION_W + GAP);
    const my = missionStartY + row * (MISSION_H + GAP);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    drawRoundedRect(ctx, x + 2, my + 2, MISSION_W, MISSION_H, 3);
    ctx.fill();

    // Background
    ctx.fillStyle = '#111';
    drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
    ctx.fill();

    const img = missionImgs[i];
    if (img) {
      ctx.save();
      drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
      ctx.clip();
      // Draw mission image in landscape (rotate/fit)
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
      ctx.fillStyle = '#1a1a1a';
      drawRoundedRect(ctx, x + 1, my + 1, MISSION_W - 2, MISSION_H - 2, 3);
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = '11px "Inter", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(missions[i].name_fr, x + 8, my + MISSION_H / 2, MISSION_W - 16);
    }

    // Gold border for missions
    ctx.strokeStyle = GOLD_LINE;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, my, MISSION_W, MISSION_H, 3);
    ctx.stroke();
  }

  // ── Footer ──
  const footerY = canvasH - PADDING - 10;
  ctx.fillStyle = 'rgba(136,136,136,0.4)';
  ctx.font = '11px "Inter", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('narutomythosgame.com', canvasW / 2, footerY);
  ctx.textAlign = 'left';

  // ── Download ──
  const link = document.createElement('a');
  link.download = `${(deckName || 'deck').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
