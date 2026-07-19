export function isTouchPrimaryDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
