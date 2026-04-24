
const IMAGE_VERSION = 2;

export function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${path}?v=${IMAGE_VERSION}`;
}
