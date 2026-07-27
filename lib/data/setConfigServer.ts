import { prisma } from '@/lib/db/prisma';
import { applySetStatusOverrides, getSetStatusOverrides } from '@/lib/data/sets/registry';
import { applyVariantObtentionOverrides, getVariantObtentionOverrides } from '@/lib/variants/obtention';
import { clearVariantPoolCache } from '@/lib/variants/variantPool';

// Loads the admin-configured set-status overrides and variant-obtention config from the DB and
// applies them to the in-memory registry / obtention maps. Cached with a short TTL so admin
// changes propagate to the server (and, via the runtime card API, to clients) without a redeploy.

let loadedAt = 0;
let loading: Promise<void> | null = null;
const TTL_MS = 30_000;

let featuredMenuCardIds: string[] = [];

function apply(settings: { setStatusOverrides?: unknown; variantObtentionConfig?: unknown; featuredMenuCards?: unknown } | null): void {
  applySetStatusOverrides((settings?.setStatusOverrides ?? null) as Record<string, unknown> | null);
  applyVariantObtentionOverrides((settings?.variantObtentionConfig ?? null) as Record<string, unknown> | null);
  const featured = settings?.featuredMenuCards;
  featuredMenuCardIds = Array.isArray(featured) ? featured.filter((v): v is string => typeof v === 'string') : [];
  clearVariantPoolCache();
}

export function getFeaturedMenuCardIds(): string[] {
  return [...featuredMenuCardIds];
}

async function load(): Promise<void> {
  const settings = await prisma.siteSettings.findUnique({
    where: { key: 'global' },
    select: { setStatusOverrides: true, variantObtentionConfig: true, featuredMenuCards: true },
  });
  apply(settings);
  loadedAt = Date.now();
}

export async function ensureSetConfigLoaded(): Promise<void> {
  if (loadedAt > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (!loading) {
    loading = load()
      .catch(() => {})
      .finally(() => {
        loading = null;
      });
  }
  await loading;
}

export async function reloadSetConfig(): Promise<void> {
  loadedAt = 0;
  await ensureSetConfigLoaded();
}

export function getSetConfigSnapshot(): {
  setStatusOverrides: Record<string, string>;
  variantObtention: Record<string, string>;
} {
  return {
    setStatusOverrides: getSetStatusOverrides(),
    variantObtention: getVariantObtentionOverrides(),
  };
}
