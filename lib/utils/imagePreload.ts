import { normalizeImagePath } from '@/lib/utils/imagePath';

const warmed = new Set<string>();

export function preloadCardImages(imageFiles: Array<string | undefined | null>): void {
  if (typeof window === 'undefined') return;
  for (const file of imageFiles) {
    if (!file) continue;
    const path = normalizeImagePath(file);
    if (!path || warmed.has(path)) continue;
    warmed.add(path);
    const img = new Image();
    img.decoding = 'async';
    img.src = path;
  }
}
