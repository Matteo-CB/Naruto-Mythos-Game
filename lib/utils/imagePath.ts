/**
 * Normalize a card image_file path to a valid URL with cache-busting.
 * Bump IMAGE_VERSION when deploying new card images.
 */
const IMAGE_VERSION = 2;

export function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${path}?v=${IMAGE_VERSION}`;
}
