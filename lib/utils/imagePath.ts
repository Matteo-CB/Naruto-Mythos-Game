
export const IMAGE_VERSION = 7;

export function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (path.startsWith('/api/')) return path;
  return `${path}?v=${IMAGE_VERSION}`;
}

export function withImageVersion(path: string): string {
  return `${path}?v=${IMAGE_VERSION}`;
}
