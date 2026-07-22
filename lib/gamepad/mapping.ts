export const GP = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DUP: 12,
  DDOWN: 13,
  DLEFT: 14,
  DRIGHT: 15,
  HOME: 16,
} as const;

export const BUTTON_COUNT = 17;

export interface InputSnapshot {
  buttons: boolean[];
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  anyConnected: boolean;
}

export function emptySnapshot(): InputSnapshot {
  return { buttons: new Array(BUTTON_COUNT).fill(false), leftX: 0, leftY: 0, rightX: 0, rightY: 0, anyConnected: false };
}

function applyDeadzone(v: number, dz: number): number {
  if (Math.abs(v) < dz) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * ((Math.abs(v) - dz) / (1 - dz));
}

export function readGamepads(deadzone = 0.28): InputSnapshot {
  const snap = emptySnapshot();
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    snap.anyConnected = true;

    for (let i = 0; i < BUTTON_COUNT; i++) {
      const b = pad.buttons[i];
      if (b && (b.pressed || b.value > 0.5)) snap.buttons[i] = true;
    }

    const ax = pad.axes;
    if (ax.length >= 2) {
      snap.leftX += applyDeadzone(ax[0] ?? 0, deadzone);
      snap.leftY += applyDeadzone(ax[1] ?? 0, deadzone);
    }
    if (ax.length >= 4) {
      snap.rightX += applyDeadzone(ax[2] ?? 0, deadzone);
      snap.rightY += applyDeadzone(ax[3] ?? 0, deadzone);
    }

    if (ax.length >= 10) {
      const hat = ax[9];
      if (typeof hat === 'number' && hat >= -1.1 && hat <= 1.1) {
        const up = hat > -0.95 && hat < -0.05;
        const right = hat > -0.55 && hat < 0.05;
        const down = hat > 0.05 && hat < 0.55;
        const left = hat > 0.45 && hat < 0.95;
        const upLeft = hat > 0.9;
        if (up || hat < -0.9) snap.buttons[GP.DUP] = true;
        if (right) snap.buttons[GP.DRIGHT] = true;
        if (down) snap.buttons[GP.DDOWN] = true;
        if (left || upLeft) snap.buttons[GP.DLEFT] = true;
      }
    }
  }

  snap.leftX = Math.max(-1, Math.min(1, snap.leftX));
  snap.leftY = Math.max(-1, Math.min(1, snap.leftY));
  snap.rightX = Math.max(-1, Math.min(1, snap.rightX));
  snap.rightY = Math.max(-1, Math.min(1, snap.rightY));
  return snap;
}
