export interface VfxSheet {
  frames: number;
  cols: number;
  size: number;
  fps: number;
}

export const VFX_MANIFEST: Record<string, VfxSheet> = {
  "seal-summon": {
    frames: 30,
    cols: 6,
    size: 192,
    fps: 30
  },
  "burst-legendary": {
    frames: 30,
    cols: 6,
    size: 192,
    fps: 30
  },
  "slash-defeat": {
    frames: 24,
    cols: 6,
    size: 192,
    fps: 30
  },
  "ring-powerup": {
    frames: 24,
    cols: 6,
    size: 192,
    fps: 30
  },
  "victory-mission": {
    frames: 30,
    cols: 6,
    size: 192,
    fps: 30
  },
  kawarimi: {
    frames: 24,
    cols: 6,
    size: 192,
    fps: 30
  }
};

export type VfxName = keyof typeof VFX_MANIFEST;
