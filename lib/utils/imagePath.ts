
export const IMAGE_VERSION = 15;

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

export function portraitImagePath(
  card: { card_type?: string | null; attach_to?: string | null; image_file?: string } | null | undefined,
): string | null {
  if (!card?.image_file) return null;
  const landscape = card.card_type === 'mission'
    || (card.card_type === 'attachment' && card.attach_to === 'mission');
  const file = landscape ? card.image_file.replace(/\.webp$/i, '-rot.webp') : card.image_file;
  return normalizeImagePath(file);
}
